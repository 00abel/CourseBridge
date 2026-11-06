import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import express from 'express'

test('login and /me work after register', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'coursebridge-auth-'))
  writeFileSync(join(dir, 'test.db'), '')
  process.env.DATABASE_URL = `file:${join(dir, 'test.db')}`
  process.env.JWT_SECRET = 'test-only-session-secret-at-least-32-characters'
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--schema=src/db/schema.prisma', '--skip-generate'], {
    env: process.env, stdio: 'pipe',
  })
  const { default: router } = await import('../src/routes/auth.js')
  const { default: db } = await import('../src/db/db.js')
  const app = express()
  app.use(express.json())
  app.use('/auth', router)
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}/auth`
  const post = (path, body) => fetch(`${base}/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  try {
    const account = { email: 'student@example.com', password: 'test-password-123' }
    const registered = await post('register', account)
    assert.equal(registered.status, 201)
    const { token } = await registered.json()
    const me = await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${token}` } })
    assert.equal(me.status, 200)
    const { user } = await me.json()
    assert.equal(user.email, account.email)
    assert.equal(user.passwordHash, undefined)
    assert.equal((await post('login', account)).status, 200)
    assert.equal((await post('login', { ...account, password: 'wrong' })).status, 401)
    assert.equal((await post('login', { ...account, email: ' Student@Example.com ' })).status, 200)
    assert.equal((await post('register', { ...account, email: ' STUDENT@example.com ' })).status, 409)
    assert.equal((await post('register', { ...account, email: 'not-an-email' })).status, 400)
    assert.equal((await post('register', { ...account, password: 'a'.repeat(73) })).status, 400)
    assert.equal((await post('register', { email: {}, password: 123 })).status, 400)
    assert.equal((await post('login', { email: [], password: {} })).status, 400)
    assert.equal((await fetch(`${base}/me`)).status, 401)
    assert.equal((await fetch(`${base}/me`, { headers: { Authorization: 'Bearer invalid' } })).status, 401)
    let limited
    for (let i = 0; i < 31; i++) limited = await post('login', {})
    assert.equal(limited.status, 429)
  } finally {
    await new Promise(resolve => server.close(resolve))
    await db.$disconnect()
    rmSync(dir, { recursive: true, force: true })
  }
})
