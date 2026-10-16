// routes/sync.js: trigger sync and view sync history

import { Router } from 'express'
import { requireAuth } from '../services/auth.js'
import { runSync } from '../services/syncEngine.js'
import prisma from '../db/db.js'

const router = Router()
router.use(requireAuth)

// Track in-progress syncs to prevent double-clicking
const activeSyncs = new Set()

/**
 * POST /api/sync
 * Triggers a full sync for the logged-in user.
 * Returns a summary of what was created/updated/failed.
 */
router.post('/', async (req, res) => {
  const { userId } = req

  // Prevent concurrent syncs for the same user
  if (activeSyncs.has(userId)) {
    return res.status(409).json({ error: 'A sync is already in progress.' })
  }

  activeSyncs.add(userId)
  try {
    const result = await runSync(userId)
    res.json({
      success: true,
      created: result.created,
      updated: result.updated,
      failed: result.failed,
      errors: result.errors,
    })
  } catch (err) {
    console.error('Sync error:', err)
    res.status(500).json({ error: err.message || 'Sync failed.' })
  } finally {
    activeSyncs.delete(userId)
  }
})

/**
 * GET /api/sync/logs
 * Returns the last 10 sync logs for the logged-in user.
 */
router.get('/logs', async (req, res) => {
  try {
    const logs = await prisma.syncLog.findMany({
      where: { userId: req.userId },
      orderBy: { syncedAt: 'desc' },
      take: 10,
    })
    res.json({ logs })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch logs.' })
  }
})

/**
 * GET /api/sync/stats
 * Returns summary stats for the dashboard.
 */
router.get('/stats', async (req, res) => {
  try {
    const [totalSynced, lastLog] = await Promise.all([
      prisma.syncMap.count({ where: { userId: req.userId } }),
      prisma.syncLog.findFirst({
        where: { userId: req.userId },
        orderBy: { syncedAt: 'desc' },
      }),
    ])

    res.json({
      totalAssignmentsSynced: totalSynced,
      lastSyncAt: lastLog?.syncedAt || null,
      lastSyncResult: lastLog
        ? { created: lastLog.created, updated: lastLog.updated, failed: lastLog.failed }
        : null,
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats.' })
  }
})

export default router
