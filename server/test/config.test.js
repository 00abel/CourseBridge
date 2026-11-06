import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import express from 'express'

test('personal token settings save and disconnect', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'coursebridge-config-'))
  writeFileSync(join(dir, 'test.db'), '')
  process.env.DATABASE_URL = `file:${join(dir, 'test.db')}`
  process.env.JWT_SECRET = 'test-only-session-secret-at-least-32-characters'
  process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64)
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--schema=src/db/schema.prisma', '--skip-generate'], { env: process.env, stdio: 'pipe' })
  const { default: router } = await import('../src/routes/config.js')
  const { default: syncRouter } = await import('../src/routes/sync.js')
  const { default: db } = await import('../src/db/db.js')
  const { createToken } = await import('../src/services/auth.js')
  const { decrypt } = await import('../src/services/crypto.js')
  const { REQUIRED_PROPERTIES } = await import('../src/services/notionService.js')
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('https://api.notion.com/')) {
      return new Response(JSON.stringify({
        properties: Object.fromEntries(Object.entries(REQUIRED_PROPERTIES).map(([name, type]) => [name, { type }])),
        title: [{ plain_text: 'Assignments' }],
      }), { status: 200 })
    }
    return originalFetch(url, options)
  }
  const app = express()
  app.use(express.json())
  app.get('/api/v1/courses', (req, res) => {
    if (req.headers.authorization !== 'Bearer personal-secret') return res.sendStatus(401)
    res.json([{ id: 1, name: 'Test course' }])
  })
  app.use('/api/config', router)
  app.use('/api/sync', syncRouter)
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    const user = await db.user.create({ data: { email: 'student@example.com', passwordHash: 'unused' } })
    const headers = { Authorization: `Bearer ${createToken(user.id)}`, 'Content-Type': 'application/json' }
    const request = (method = 'GET', body) => fetch(`${base}/api/config`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) })
    await db.config.create({ data: { userId: user.id, canvasAuthType: 'retired', canvasToken: 'old-token', canvasBaseUrl: base, notionToken: 'notion-secret', notionDbId: '1'.repeat(32) } })
    assert.equal((await (await request()).json()).configured, false)
    assert.equal((await request('POST', {})).status, 400)
    const saved = await request('POST', { canvasBaseUrl: base, canvasToken: 'personal-secret', notionToken: 'notion-secret', notionDbId: '1'.repeat(32) })
    assert.equal(saved.status, 200)
    assert.equal((await request('POST', { canvasBaseUrl: 'https://other.example.edu' })).status, 400)
    assert.equal((await request('POST', { canvasToken: {} })).status, 400)
    assert.equal((await request('POST', { notionDbId: 'invalid' })).status, 400)
    assert.equal((await db.config.findUnique({ where: { userId: user.id } })).canvasBaseUrl, base)
    const stored = await db.config.findUnique({ where: { userId: user.id } })
    assert.ok(stored.canvasToken.startsWith('enc:v1:'))
    assert.equal(decrypt(stored.canvasToken), 'personal-secret')
    assert.equal((await request('POST', {})).status, 200)
    const publicConfig = await (await request()).json()
    assert.equal(publicConfig.configured, true)
    assert.equal(JSON.stringify(publicConfig).includes('secret'), false)
    await db.syncMap.createMany({ data: [
      { userId: user.id, canvasId: '1', notionPageId: 'page-1', courseId: '1', notionDbId: '1'.repeat(32), canvasBaseUrl: base },
      { userId: user.id, canvasId: '2', notionPageId: 'page-2', courseId: '1', notionDbId: '2'.repeat(32), canvasBaseUrl: base },
      { userId: user.id, canvasId: '3', notionPageId: 'page-3', courseId: '1', notionDbId: '1'.repeat(32), canvasBaseUrl: 'https://other.example.edu' },
    ] })
    const stats = await (await fetch(`${base}/api/sync/stats`, { headers })).json()
    assert.equal(stats.totalAssignmentsSynced, 1)
    const disconnected = await fetch(`${base}/api/config/canvas`, { method: 'DELETE', headers })
    assert.equal(disconnected.status, 200)
    const after = await db.config.findUnique({ where: { userId: user.id } })
    assert.equal(after.canvasToken, null)
    assert.equal(after.canvasBaseUrl, null)
    assert.equal(decrypt(after.notionToken), 'notion-secret')
    assert.equal((await (await request()).json()).configured, false)
    assert.equal((await fetch(`${base}/api/config/canvas`, { method: 'DELETE' })).status, 401)
  } finally {
    globalThis.fetch = originalFetch
    await new Promise(resolve => server.close(resolve))
    await db.$disconnect()
    rmSync(dir, { recursive: true, force: true })
  }
})
