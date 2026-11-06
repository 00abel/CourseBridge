import { Router } from 'express'
import { requireAuth } from '../services/auth.js'
import { verifyDatabase } from '../services/notionService.js'
import { fetchCourses } from '../services/canvasService.js'
import { encrypt, decrypt } from '../services/crypto.js'
import { getCanvasCredentials } from '../services/canvasCredentials.js'
import prisma from '../db/db.js'
import { getCanvasUrl } from '../services/canvasUrl.js'

const router = Router()
router.use(requireAuth)

router.get('/', async (req, res) => {
  try {
    const config = await prisma.config.findUnique({ where: { userId: req.userId } })

    const canvasConnected = Boolean(config?.canvasToken && config?.canvasBaseUrl && (!config.canvasAuthType || config.canvasAuthType === 'token'))
    const notionConnected = Boolean(config?.notionToken && config?.notionDbId)

    res.json({
      // saved connections can still expire or lose access
      configured: canvasConnected && notionConnected,
      canvas: {
        connected: canvasConnected,
        baseUrl: config?.canvasBaseUrl || '',
      },
      notion: {
        connected: notionConnected,
        dbId: config?.notionDbId || '',
      },
    })
  } catch (err) {
    console.error('Config load error:', err.code || err.name)
    res.status(500).json({ error: 'Failed to load config.' })
  }
})

router.post('/', async (req, res) => {
  try {
    const { canvasBaseUrl, canvasToken, notionToken, notionDbId } = req.body || {}
    if ([canvasBaseUrl, canvasToken, notionToken, notionDbId].some(value => value !== undefined && typeof value !== 'string')) {
      return res.status(400).json({ error: 'Connection details must be text.' })
    }
    const existing = await prisma.config.findUnique({ where: { userId: req.userId } })
    const data = {}

    const newCanvasToken = canvasToken?.trim()
    const urlChanged = canvasBaseUrl?.trim() && canvasBaseUrl.trim().replace(/\/$/, '') !== existing?.canvasBaseUrl
    if (newCanvasToken || urlChanged) {
      if (!canvasBaseUrl?.trim()) {
        return res.status(400).json({ error: 'Canvas URL is required with a personal token.' })
      }
      if (urlChanged && !newCanvasToken) {
        return res.status(400).json({ error: 'Enter a personal token when changing the Canvas URL.' })
      }
      let cleanUrl
      try {
        cleanUrl = getCanvasUrl(canvasBaseUrl.trim())
        await fetchCourses(cleanUrl, newCanvasToken)
      } catch (err) {
        return res.status(400).json({ error: err.message })
      }
      Object.assign(data, {
        canvasAuthType: 'token',
        canvasBaseUrl: cleanUrl,
        canvasToken: encrypt(newCanvasToken),
      })
    } else if (!existing?.canvasToken || (existing.canvasAuthType && existing.canvasAuthType !== 'token')) {
      return res.status(400).json({
        error: 'Add a Canvas personal access token before saving.',
      })
    }

    const finalNotionToken = notionToken?.trim() || decrypt(existing?.notionToken)
    const finalNotionDbId = (notionDbId?.trim() || existing?.notionDbId || '').replace(/-/g, '').toLowerCase()

    if (!finalNotionToken || !finalNotionDbId) {
      return res.status(400).json({ error: 'Notion integration token and database ID are required.' })
    }
    if (!/^[a-f0-9]{32}$/.test(finalNotionDbId)) {
      return res.status(400).json({ error: 'Enter a valid Notion database ID.' })
    }

    const notionCheck = await verifyDatabase(finalNotionToken, finalNotionDbId)
    if (!notionCheck.ok) {
      return res.status(400).json({ error: notionCheck.error })
    }

    data.notionToken = encrypt(finalNotionToken)
    data.notionDbId = finalNotionDbId

    if (!newCanvasToken) {
      const creds = getCanvasCredentials(existing)
      data.canvasToken = encrypt(creds.token)
      data.canvasAuthType = 'token'
    }

    await prisma.config.upsert({
      where: { userId: req.userId },
      create: { userId: req.userId, ...data },
      update: data,
    })

    res.json({
      success: true,
      message: `Saved. Canvas connected and Notion database "${notionCheck.dbTitle}" found.`,
    })
  } catch (err) {
    console.error('Config save error:', err.code || err.name)
    res.status(500).json({ error: 'Failed to save config.' })
  }
})

router.delete('/canvas', async (req, res) => {
  try {
    await prisma.config.updateMany({
      where: { userId: req.userId },
      data: { canvasToken: null, canvasBaseUrl: null, canvasAuthType: null },
    })
    res.json({ success: true })
  } catch (err) {
    console.error('Canvas disconnect failed:', err.code || err.name)
    res.status(500).json({ error: 'Failed to disconnect Canvas.' })
  }
})

export default router
