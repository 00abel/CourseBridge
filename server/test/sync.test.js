import test from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSyncEngine } from '../src/services/syncEngine.js'

const assignment = { canvasId: '42', courseId: '7', title: 'Problem set' }

test('sync counts and mappings stay right across repeat runs', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'coursebridge-'))
  writeFileSync(join(dir, 'test.db'), '')
  const url = `file:${join(dir, 'test.db')}`
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--schema=src/db/schema.prisma', '--skip-generate'], {
    env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe',
  })
  const db = new PrismaClient({ datasources: { db: { url } } })
  const pages = new Map()
  const writes = []
  let fail = false
  let school = 'https://first.example.edu'
  const run = createSyncEngine({
    db, credentials: async () => ({ baseUrl: school, token: 'mock' }),
    decryptToken: token => token,
    fetchAssignments: async () => [assignment],
    findPage: async (_token, databaseId, id, baseUrl) => pages.get(`${baseUrl}:${databaseId}:${id}`),
    createPage: async (_token, databaseId, a) => {
      if (fail) throw new Error('Notion unavailable')
      const pageId = `page-${databaseId}-${a.canvasId}`
      pages.set(`${school}:${databaseId}:${a.canvasId}`, pageId)
      writes.push(pageId)
      return pageId
    },
    updatePage: async (_token, pageId) => {
      if (fail) throw new Error('Notion unavailable')
      writes.push(pageId)
      return pageId
    },
  })
  try {
    const { id } = await db.user.create({ data: { email: 'test@example.com', passwordHash: 'unused' } })
    await db.config.create({ data: { userId: id, notionToken: 'mock', notionDbId: 'first' } })
    assert.deepEqual(await run(id), { created: 1, updated: 0, failed: 0, errors: [] })
    assert.deepEqual(await run(id), { created: 0, updated: 1, failed: 0, errors: [] })
    assert.equal(pages.size, 1)
    await db.syncMap.deleteMany()
    assert.deepEqual(await run(id), { created: 0, updated: 1, failed: 0, errors: [] })
    assert.equal(pages.size, 1)
    // check older mappings against the selected database too
    await db.syncMap.updateMany({ data: { notionDbId: null } })
    assert.equal((await run(id)).updated, 1)
    await db.config.update({ where: { userId: id }, data: { notionDbId: 'second' } })
    assert.equal((await run(id)).created, 1)
    assert.equal(writes.at(-1), 'page-second-42')
    await db.config.update({ where: { userId: id }, data: { notionDbId: 'first' } })
    assert.equal((await run(id)).updated, 1)
    assert.equal(writes.at(-1), 'page-first-42')
    await db.syncMap.deleteMany()
    const saveMapping = db.syncMap.upsert.bind(db.syncMap)
    db.syncMap.upsert = async () => { throw new Error('Mapping save failed') }
    assert.equal((await run(id)).failed, 1)
    db.syncMap.upsert = saveMapping
    assert.equal((await run(id)).updated, 1)
    assert.equal(pages.size, 2)
    school = 'https://second.example.edu'
    assert.equal((await run(id)).created, 1)
    assert.equal((await run(id)).updated, 1)
    school = 'https://first.example.edu'
    assert.equal((await run(id)).updated, 1)
    fail = true
    const failed = await run(id)
    assert.deepEqual([failed.created, failed.updated, failed.failed], [0, 0, 1])
    assert.equal(failed.errors[0].error, 'Notion unavailable')
    const log = await db.syncLog.findFirst({ orderBy: { syncedAt: 'desc' } })
    assert.deepEqual([log.created, log.updated, log.failed], [0, 0, 1])
  } finally {
    await db.$disconnect()
    rmSync(dir, { recursive: true, force: true })
  }
})
