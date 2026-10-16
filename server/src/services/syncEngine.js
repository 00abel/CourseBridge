// syncEngine.js
// This is the heart of the app. It:
// 1. Fetches all assignments from Canvas
// 2. For each assignment, checks if a Notion page already exists
// 3. Creates or updates the Notion page accordingly
// 4. Saves the Canvas→Notion mapping to our DB (for future dedup)
// 5. Returns a summary of what happened

import pLimit from 'p-limit'
import { fetchAllAssignments } from './canvasService.js'
import { findExistingPage, createNotionPage, updateNotionPage } from './notionService.js'
import { getCanvasCredentials } from './canvasOAuth.js'
import { decrypt } from './crypto.js'
import prisma from '../db/db.js'

/**
 * Runs a full sync for one user.
 *
 * @param {string} userId - The user's ID in our database
 * @returns {object} - { created, updated, failed, errors }
 */
export async function runSync(userId) {
  // 1. Load this user's config (Canvas + Notion credentials)
  const config = await prisma.config.findUnique({ where: { userId } })
  if (!config) {
    throw new Error('No configuration found. Please set up your Canvas and Notion credentials first.')
  }

  // Works for both personal tokens and OAuth.
  // For OAuth this refreshes the 1-hour access token automatically when needed.
  const { baseUrl: canvasBaseUrl, token: canvasToken } = await getCanvasCredentials(config)

  const notionToken = decrypt(config.notionToken)
  const notionDbId = config.notionDbId
  if (!notionToken || !notionDbId) {
    throw new Error('Notion is not connected. Add your Notion details in Settings first.')
  }

  // 2. Fetch all assignments from Canvas
  let assignments
  try {
    assignments = await fetchAllAssignments(canvasBaseUrl, canvasToken)
  } catch (err) {
    throw new Error(`Failed to fetch from Canvas: ${err.message}`)
  }

  // 3. Sync each assignment to Notion
  // pLimit(3) means we run at most 3 Notion API calls simultaneously
  // Notion rate-limits to ~3 req/s, so this keeps us safe
  const limit = pLimit(3)
  const results = { created: 0, updated: 0, failed: 0, errors: [] }

  const syncTasks = assignments.map(assignment =>
    limit(async () => {
      try {
        await syncOneAssignment(userId, assignment, notionToken, notionDbId)
        // We'll count created vs updated inside syncOneAssignment
      } catch (err) {
        results.failed++
        results.errors.push({
          assignment: assignment.title,
          error: err.message,
        })
        console.error(`Failed to sync "${assignment.title}":`, err.message)
      }
    })
  )

  // Wait for all sync tasks to complete
  const syncResults = await Promise.allSettled(syncTasks)

  // Count results (we track created/updated separately in syncOneAssignment)
  // We pass results object by reference so it gets populated
  // Recount from syncMap changes
  const counters = await countSyncResults(userId, assignments)
  results.created = counters.created
  results.updated = counters.updated

  // 4. Save a log entry
  await prisma.syncLog.create({
    data: {
      userId,
      created: results.created,
      updated: results.updated,
      failed: results.failed,
      errors: results.errors.length > 0 ? JSON.stringify(results.errors) : null,
    },
  })

  return results
}

/**
 * Syncs a single assignment to Notion.
 * Decides whether to create a new page or update an existing one.
 */
async function syncOneAssignment(userId, assignment, notionToken, notionDbId) {
  // Check our local database first — fastest lookup
  const existingMap = await prisma.syncMap.findUnique({
    where: {
      userId_canvasId: { userId, canvasId: assignment.canvasId },
    },
  })

  if (existingMap) {
    // We've synced this assignment before — update the existing Notion page
    await updateNotionPage(notionToken, existingMap.notionPageId, assignment)

    // Update the lastSynced timestamp
    await prisma.syncMap.update({
      where: { id: existingMap.id },
      data: { lastSynced: new Date() },
    })
  } else {
    // First time seeing this assignment — check Notion too (in case local DB was wiped)
    const existingNotionPageId = await findExistingPage(notionToken, notionDbId, assignment.canvasId)

    if (existingNotionPageId) {
      // Found in Notion but not in our DB — update and re-record the mapping
      await updateNotionPage(notionToken, existingNotionPageId, assignment)
      await prisma.syncMap.create({
        data: {
          userId,
          canvasId: assignment.canvasId,
          notionPageId: existingNotionPageId,
          courseId: assignment.courseId,
        },
      })
    } else {
      // Truly new assignment — create it in Notion
      const newPageId = await createNotionPage(notionToken, notionDbId, assignment)
      await prisma.syncMap.create({
        data: {
          userId,
          canvasId: assignment.canvasId,
          notionPageId: newPageId,
          courseId: assignment.courseId,
        },
      })
    }
  }
}

/**
 * After sync, counts how many were new vs updated.
 * We determine "created" = assignments whose syncMap was just created in this run.
 */
async function countSyncResults(userId, assignments) {
  const canvasIds = assignments.map(a => a.canvasId)
  const maps = await prisma.syncMap.findMany({
    where: { userId, canvasId: { in: canvasIds } },
    select: { lastSynced: true },
    orderBy: { lastSynced: 'desc' },
  })

  // "Created" = maps with lastSynced within the last 30 seconds
  const thirtySecondsAgo = new Date(Date.now() - 30000)
  const recentlyCreated = maps.filter(m => m.lastSynced > thirtySecondsAgo).length

  return {
    created: recentlyCreated,
    updated: Math.max(0, maps.length - recentlyCreated),
  }
}
