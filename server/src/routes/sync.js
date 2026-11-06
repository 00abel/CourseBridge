import { Router } from 'express'
import { requireAuth } from '../services/auth.js'
import { runSync } from '../services/syncEngine.js'
import prisma from '../db/db.js'

const router = Router()
router.use(requireAuth)

// keep track of syncs so clicking twice does not start another one
const activeSyncs = new Set()

router.post('/', async (req, res) => {
  const { userId } = req

  // only run one sync per user at a time
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
    console.error('Sync error:', err.code || err.name)
    res.status(500).json({ error: err.message || 'Sync failed.' })
  } finally {
    activeSyncs.delete(userId)
  }
})

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

router.get('/stats', async (req, res) => {
  try {
    const config = await prisma.config.findUnique({ where: { userId: req.userId } })
    const where = {
      userId: req.userId,
      notionDbId: config?.notionDbId || null,
      canvasBaseUrl: config?.canvasBaseUrl || null,
    }
    const [totalSynced, lastLog] = await Promise.all([
      prisma.syncMap.count({ where }),
      prisma.syncLog.findFirst({
        where,
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
