// routes/config.js: save and retrieve a user's Canvas + Notion settings.
//
// Canvas can be connected two ways:
//   - "Connect with Canvas" (OAuth), handled in routes/canvasOAuth.js
//   - Pasting a personal access token, handled here
// Notion is always saved here.

import { Router } from 'express'
import { requireAuth } from '../services/auth.js'
import { verifyDatabase } from '../services/notionService.js'
import { fetchCourses } from '../services/canvasService.js'
import { encrypt, decrypt } from '../services/crypto.js'
import { getCanvasCredentials, isOAuthEnabled } from '../services/canvasOAuth.js'
import prisma from '../db/db.js'

const router = Router()
router.use(requireAuth)

/**
 * GET /api/config
 * Returns connection status. Never sends tokens back to the browser.
 */
router.get('/', async (req, res) => {
  try {
    const config = await prisma.config.findUnique({ where: { userId: req.userId } })

    const canvasConnected = Boolean(config?.canvasToken && config?.canvasBaseUrl)
    const notionConnected = Boolean(config?.notionToken && config?.notionDbId)

    res.json({
      // "configured" means ready to sync. The dashboard uses this.
      configured: canvasConnected && notionConnected,
      oauthAvailable: isOAuthEnabled(),
      canvas: {
        connected: canvasConnected,
        authType: config?.canvasAuthType || null,
        baseUrl: config?.canvasBaseUrl || '',
        userName: config?.canvasUserName || null,
      },
      notion: {
        connected: notionConnected,
        dbId: config?.notionDbId || '',
      },
    })
  } catch (err) {
    console.error('Config load error:', err)
    res.status(500).json({ error: 'Failed to load config.' })
  }
})

/**
 * POST /api/config
 * Body (all optional, blank fields keep the saved value):
 *   { canvasBaseUrl, canvasToken, notionToken, notionDbId }
 *
 * Sending canvasToken switches Canvas to personal-token mode.
 * Leaving it blank keeps the current Canvas connection (including OAuth).
 */
router.post('/', async (req, res) => {
  try {
    const { canvasBaseUrl, canvasToken, notionToken, notionDbId } = req.body
    const existing = await prisma.config.findUnique({ where: { userId: req.userId } })
    const data = {}

    // ── Canvas (personal token) ──
    if (canvasToken) {
      if (!canvasBaseUrl) {
        return res.status(400).json({ error: 'Canvas URL is required with a personal token.' })
      }
      const cleanUrl = canvasBaseUrl.trim().replace(/\/$/, '')
      try {
        await fetchCourses(cleanUrl, canvasToken.trim())
      } catch (err) {
        return res.status(400).json({ error: 'Could not connect to Canvas. Check your token and URL.' })
      }
      Object.assign(data, {
        canvasAuthType: 'token',
        canvasBaseUrl: cleanUrl,
        canvasToken: encrypt(canvasToken.trim()),
        canvasRefreshToken: null,
        canvasTokenExpiresAt: null,
        canvasUserName: null,
      })
    } else if (!existing?.canvasToken) {
      return res.status(400).json({
        error: 'Connect Canvas first, either with "Connect with Canvas" or a personal token.',
      })
    }

    // ── Notion ──
    const finalNotionToken = notionToken?.trim() || decrypt(existing?.notionToken)
    const finalNotionDbId = notionDbId?.trim() || existing?.notionDbId

    if (!finalNotionToken || !finalNotionDbId) {
      return res.status(400).json({ error: 'Notion integration token and database ID are required.' })
    }

    const notionCheck = await verifyDatabase(finalNotionToken, finalNotionDbId)
    if (!notionCheck.ok) {
      return res.status(400).json({ error: notionCheck.error })
    }

    data.notionToken = encrypt(finalNotionToken)
    data.notionDbId = finalNotionDbId

    // Re-check an existing OAuth connection still works (this also refreshes it if needed)
    if (!canvasToken && existing?.canvasAuthType === 'oauth') {
      try {
        const creds = await getCanvasCredentials(existing)
        await fetchCourses(creds.baseUrl, creds.token)
      } catch (err) {
        return res.status(400).json({ error: err.message })
      }
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
    console.error('Config save error:', err)
    res.status(500).json({ error: 'Failed to save config.' })
  }
})

export default router
