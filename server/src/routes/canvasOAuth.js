// routes/canvasOAuth.js
// Endpoints for "Connect with Canvas".
//
//   GET    /api/canvas/oauth/status    -> is OAuth available on this server?
//   GET    /api/canvas/oauth/start     -> returns the Canvas login URL (logged-in users only)
//   GET    /api/canvas/oauth/callback  -> Canvas sends the browser here after "Authorize"
//   DELETE /api/canvas/oauth           -> disconnect Canvas

import { Router } from 'express'
import { requireAuth } from '../services/auth.js'
import {
  isOAuthEnabled,
  buildAuthorizeUrl,
  verifyState,
  exchangeCode,
  saveOAuthConnection,
  disconnectCanvas,
} from '../services/canvasOAuth.js'

const router = Router()
const FRONTEND_URL = () => (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '')

/**
 * Lets the frontend decide whether to show the "Connect with Canvas" button.
 */
router.get('/status', (req, res) => {
  res.json({ enabled: isOAuthEnabled() })
})

/**
 * Returns the URL to send the user to.
 * We return the URL instead of redirecting because the frontend sends our login
 * token in a header, which a plain browser redirect cannot include.
 */
router.get('/start', requireAuth, (req, res) => {
  if (!isOAuthEnabled()) {
    return res.status(503).json({ error: 'Canvas OAuth is not set up on this server yet.' })
  }
  res.json({ url: buildAuthorizeUrl(req.userId) })
})

/**
 * Canvas redirects here with ?code=...&state=... (or ?error=... if the user clicked Cancel).
 * This is a browser navigation, not an API call, so we always finish by
 * redirecting back to the frontend Settings page with a result flag.
 */
router.get('/callback', async (req, res) => {
  const back = (result, reason) => {
    const params = new URLSearchParams({ canvas: result })
    if (reason) params.set('reason', reason)
    res.redirect(`${FRONTEND_URL()}/config?${params.toString()}`)
  }

  const { code, state, error } = req.query

  if (error) return back('error', error === 'access_denied' ? 'denied' : 'canvas_error')
  if (!code || !state) return back('error', 'missing_code')

  let userId
  try {
    userId = verifyState(state)
  } catch {
    return back('error', 'invalid_state')
  }

  try {
    const tokens = await exchangeCode(code)
    await saveOAuthConnection(userId, tokens)
    return back('connected')
  } catch (err) {
    console.error('Canvas OAuth token exchange failed:', err.response?.data || err.message)
    return back('error', 'exchange_failed')
  }
})

router.delete('/', requireAuth, async (req, res) => {
  try {
    await disconnectCanvas(req.userId)
    res.json({ success: true })
  } catch (err) {
    console.error('Canvas disconnect failed:', err)
    res.status(500).json({ error: 'Failed to disconnect Canvas.' })
  }
})

export default router
