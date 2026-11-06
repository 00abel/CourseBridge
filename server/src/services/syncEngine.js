import pLimit from 'p-limit'
import { fetchAllAssignments } from './canvasService.js'
import { findExistingPage, createNotionPage, updateNotionPage } from './notionService.js'
import { getCanvasCredentials } from './canvasCredentials.js'
import { decrypt } from './crypto.js'
import prisma from '../db/db.js'

export function createSyncEngine({
  db = prisma, fetchAssignments = fetchAllAssignments,
  findPage = findExistingPage, createPage = createNotionPage, updatePage = updateNotionPage,
  credentials = getCanvasCredentials, decryptToken = decrypt,
} = {}) {
  async function syncOne(userId, assignment, token, databaseId, baseUrl) {
    const where = { userId_canvasId: { userId, canvasId: assignment.canvasId } }
    const mapping = await db.syncMap.findUnique({ where })
    // older mappings do not have a database id, so check the selected database
    // before using the saved page
    const pageId = mapping?.notionDbId === databaseId && mapping.canvasBaseUrl === baseUrl
      ? mapping.notionPageId
      : await findPage(token, databaseId, assignment.canvasId, baseUrl)
    const outcome = pageId ? 'updated' : 'created'
    const notionPageId = pageId
      ? await updatePage(token, pageId, assignment, databaseId)
      : await createPage(token, databaseId, assignment)
    const data = {
      notionPageId, notionDbId: databaseId, canvasBaseUrl: baseUrl, courseId: assignment.courseId,
      lastSynced: new Date(),
    }
    await db.syncMap.upsert({
      where,
      create: { userId, canvasId: assignment.canvasId, ...data },
      update: data,
    })
    return outcome
  }

  return async function runSync(userId) {
    const config = await db.config.findUnique({ where: { userId } })
    if (!config) throw new Error('No configuration found. Connect Canvas and Notion in Settings first.')
    const { baseUrl, token } = await credentials(config)
    const notionToken = decryptToken(config.notionToken)
    if (!notionToken || !config.notionDbId) {
      throw new Error('Notion is not connected. Add your Notion details in Settings first.')
    }
    const assignments = await fetchAssignments(baseUrl, token)
    // work on up to three assignments at a time. notion requests are paced separately
    const limit = pLimit(3)
    const results = { created: 0, updated: 0, failed: 0, errors: [] }
    await Promise.all(assignments.map(assignment => limit(async () => {
      try {
        const outcome = await syncOne(userId, assignment, notionToken, config.notionDbId, baseUrl)
        results[outcome]++
      } catch (err) {
        results.failed++
        results.errors.push({ assignment: assignment.title, error: err.message })
      }
    })))
    await db.syncLog.create({ data: {
      userId, notionDbId: config.notionDbId, canvasBaseUrl: baseUrl,
      created: results.created, updated: results.updated, failed: results.failed,
      errors: results.errors.length ? JSON.stringify(results.errors) : null,
    } })
    return results
  }
}

export const runSync = createSyncEngine()
