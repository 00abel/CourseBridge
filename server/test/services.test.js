import test from 'node:test'
import assert from 'node:assert/strict'
import { assignmentToNotionProperties, validateDatabaseProperties, REQUIRED_PROPERTIES, updateNotionPage, findExistingPage } from '../src/services/notionService.js'
import { createRequestPacer, createNotionFetch } from '../src/services/requestPacer.js'
import { getJwtSecret } from '../src/services/settings.js'
import { createToken, requireAuth } from '../src/services/auth.js'
import jwt from 'jsonwebtoken'
import { getCanvasCredentials } from '../src/services/canvasCredentials.js'
import { encrypt, decrypt } from '../src/services/crypto.js'

test('removed dates and descriptions get cleared in notion', () => {
  const props = assignmentToNotionProperties({ title: 'Essay', courseName: 'Writing', assignmentType: 'Assignment', status: 'Not Started', pointsPossible: 10, canvasId: '1' })
  assert.deepEqual(props['Due Date'], { date: null })
  assert.deepEqual(props.Description, { rich_text: [] })
})

test('settings check every notion property and its type', () => {
  const properties = Object.fromEntries(Object.entries(REQUIRED_PROPERTIES).map(([name, type]) => [name, { type }]))
  assert.equal(validateDatabaseProperties(properties).ok, true)
  delete properties.Points
  properties.Status.type = 'status'
  const result = validateDatabaseProperties(properties)
  assert.equal(result.ok, false)
  assert.match(result.error, /Points is missing/)
  assert.match(result.error, /Status must be select/)
})

test('pacer spaces out requests and keeps going after a failure', async () => {
  const pace = createRequestPacer(25)
  const starts = []
  const results = await Promise.allSettled([0, 1, 2].map(n => pace(() => {
    starts.push(Date.now())
    if (n === 1) throw new Error('request failed')
    return n
  })))
  assert.deepEqual(results.map(r => r.status), ['fulfilled', 'rejected', 'fulfilled'])
  assert.ok(starts[1] - starts[0] >= 20)
  assert.ok(starts[2] - starts[1] >= 20)
})

test('login tokens need a secret and other jwt types get rejected', () => {
  const previous = process.env.JWT_SECRET
  try {
    delete process.env.JWT_SECRET
    assert.throws(getJwtSecret, /JWT_SECRET/)
    process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters'
    const verify = token => {
      const response = { status(code) { this.code = code; return this }, json(body) { this.body = body } }
      const request = { headers: { authorization: `Bearer ${token}` } }
      let passed = false
      requireAuth(request, response, () => { passed = true })
      return { passed, request, response }
    }
    assert.equal(verify(createToken('student')).request.userId, 'student')
    assert.equal(verify(createToken('student')).passed, true)
    assert.equal(verify(jwt.sign({ userId: 'student', purpose: 'other' }, process.env.JWT_SECRET)).response.code, 401)
    assert.equal(verify(jwt.sign({ userId: 'student', purpose: '' }, process.env.JWT_SECRET)).response.code, 401)
    assert.equal(verify(createToken('')).response.code, 401)
    assert.equal(verify(jwt.sign({ userId: 'student' }, process.env.JWT_SECRET, { algorithm: 'HS384' })).response.code, 401)
    assert.equal(verify(jwt.sign({ userId: 'student' }, process.env.JWT_SECRET, { expiresIn: -1 })).response.code, 401)
    assert.equal(verify('invalid').response.code, 401)
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = previous
  }
})

test('encryption catches bad keys and tampering', () => {
  const previous = process.env.TOKEN_ENCRYPTION_KEY
  try {
    process.env.TOKEN_ENCRYPTION_KEY = 'z'.repeat(64)
    assert.throws(() => encrypt('token'), /64 hex/)
    process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64)
    const stored = encrypt('private-token')
    assert.equal(decrypt(stored), 'private-token')
    const parts = stored.split(':')
    const data = Buffer.from(parts.at(-1), 'base64')
    data[0] ^= 1
    parts[parts.length - 1] = data.toString('base64')
    assert.throws(() => decrypt(parts.join(':')))
  } finally {
    if (previous === undefined) delete process.env.TOKEN_ENCRYPTION_KEY
    else process.env.TOKEN_ENCRYPTION_KEY = previous
  }
})

test('retries on 429 but not on unclear failures', async () => {
  const delays = []
  let calls = 0
  const request = createNotionFetch({
    pace: operation => operation(), wait: async ms => delays.push(ms),
    fetch: async () => {
      calls++
      return calls === 1
        ? new Response('{}', { status: 429, headers: { 'retry-after': '2' } })
        : new Response('{}', { status: 200 })
    },
  })
  assert.equal((await request('mock')).status, 200)
  assert.equal(calls, 2)
  assert.deepEqual(delays, [2000])
  calls = 0
  const limited = createNotionFetch({
    pace: operation => operation(), wait: async () => {},
    fetch: async () => { calls++; return new Response('{}', { status: 429 }) },
  })
  assert.equal((await limited('mock')).status, 429)
  assert.equal(calls, 3)
  calls = 0
  const failure = createNotionFetch({
    pace: operation => operation(),
    fetch: async () => { calls++; throw new Error('connection lost') },
  })
  await assert.rejects(failure('mock'), /connection lost/)
  assert.equal(calls, 1)
})

test('canvas only accepts personal tokens', () => {
  const config = { canvasBaseUrl: 'https://canvas.example.edu', canvasToken: 'legacy-personal-token', canvasAuthType: 'token' }
  assert.deepEqual(getCanvasCredentials(config), { baseUrl: config.canvasBaseUrl, token: config.canvasToken })
  assert.equal(getCanvasCredentials({ ...config, canvasAuthType: null }).token, config.canvasToken)
  assert.throws(() => getCanvasCredentials({ ...config, canvasAuthType: 'retired' }), /personal access token/)
  assert.throws(() => getCanvasCredentials({ ...config, canvasToken: null }), /personal access token/)
})

test('notion recovery checks the school and moved pages are not updated', async () => {
  const originalFetch = globalThis.fetch
  const databaseId = '1'.repeat(32)
  let parentId = '2'.repeat(32)
  let writes = 0
  globalThis.fetch = async (url, options) => {
    if (options.method === 'POST') {
      const body = JSON.parse(options.body)
      assert.deepEqual(body.filter.and[1], {
        property: 'Canvas URL', url: { starts_with: 'https://canvas.example.edu/' },
      })
      return new Response(JSON.stringify({ results: [{ id: 'existing-page' }] }))
    }
    if (options.method === 'PATCH') writes++
    return new Response(JSON.stringify({ id: 'existing-page', parent: { database_id: parentId } }))
  }
  try {
    assert.equal(await findExistingPage('test-token', databaseId, '42', 'https://canvas.example.edu'), 'existing-page')
    const assignment = { title: 'Essay', courseName: 'Writing, section 1', assignmentType: 'Assignment', status: 'Not Started', pointsPossible: 10, canvasId: '42' }
    await assert.rejects(updateNotionPage('test-token', 'existing-page', assignment, databaseId), /moved or deleted/)
    assert.equal(writes, 0)
    parentId = databaseId
    await updateNotionPage('test-token', 'existing-page', assignment, databaseId)
    assert.equal(writes, 1)
    const props = assignmentToNotionProperties({ ...assignment, title: 'x'.repeat(2001) })
    assert.equal(props.Name.title[0].text.content.length, 2000)
    assert.equal(props.Course.select.name, 'Writing / section 1')
  } finally {
    globalThis.fetch = originalFetch
  }
})
