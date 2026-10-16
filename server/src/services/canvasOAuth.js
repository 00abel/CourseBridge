// canvasOAuth.js
// "Connect with Canvas" using OAuth2, the same pattern as "Sign in with Google".
//
// The flow:
//   1. We send the user to Canvas's own login + consent page (buildAuthorizeUrl).
//   2. They click "Authorize". Canvas sends their browser back to our callback
//      with a one-time code.
//   3. Our server trades that code for an access token + refresh token (exchangeCode).
//   4. Access tokens expire after 1 hour. Before each sync we quietly get a new
//      one using the refresh token (getCanvasCredentials -> refreshAccessToken).
//
// Requirement: a Canvas admin at the school must create a "Developer Key" for
// this app. That gives us CANVAS_CLIENT_ID and CANVAS_CLIENT_SECRET.
// Without it, Canvas rejects step 1. That is the approval step.
//
// Docs: https://canvas.instructure.com/doc/api/file.oauth.html

import axios from 'axios'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import prisma from '../db/db.js'
import { encrypt, decrypt } from './crypto.js'

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production'

// Refresh a little early so a token never expires halfway through a sync
const REFRESH_MARGIN_MS = 5 * 60 * 1000

// ── Settings ───────────────────────────────────────────────────────────────

export function getOAuthSettings() {
  return {
    clientId: process.env.CANVAS_CLIENT_ID,
    clientSecret: process.env.CANVAS_CLIENT_SECRET,
    redirectUri: process.env.CANVAS_REDIRECT_URI,
    // The Canvas instance where the developer key was created (one school per key)
    baseUrl: (process.env.CANVAS_OAUTH_BASE_URL || '').replace(/\/$/, ''),
    // Optional. Space-separated scopes, only if the developer key enforces them.
    scopes: process.env.CANVAS_SCOPES || '',
  }
}

/**
 * OAuth is only offered when every required setting exists.
 * Until a school approves the app, this is false and the UI hides the button.
 */
export function isOAuthEnabled() {
  const s = getOAuthSettings()
  return Boolean(s.clientId && s.clientSecret && s.redirectUri && s.baseUrl)
}

// ── State parameter (protects the callback) ────────────────────────────────
// The "state" value travels to Canvas and back. We sign it so we know:
//   - which logged-in user started the flow
//   - that it was created by us, recently, and has not been used before

const usedNonces = new Map() // nonce -> expiry time

function rememberNonce(nonce) {
  const now = Date.now()
  for (const [n, exp] of usedNonces) if (exp < now) usedNonces.delete(n)
  usedNonces.set(nonce, now + 10 * 60 * 1000)
}

export function createState(userId) {
  const nonce = crypto.randomBytes(16).toString('hex')
  return jwt.sign({ userId, nonce, purpose: 'canvas_oauth' }, JWT_SECRET, { expiresIn: '10m' })
}

export function verifyState(state) {
  const payload = jwt.verify(state, JWT_SECRET) // throws if forged or expired
  if (payload.purpose !== 'canvas_oauth') throw new Error('Wrong state purpose')
  if (usedNonces.has(payload.nonce)) throw new Error('State already used')
  rememberNonce(payload.nonce)
  return payload.userId
}

// ── Step 1: where to send the user ─────────────────────────────────────────

export function buildAuthorizeUrl(userId) {
  const s = getOAuthSettings()
  const params = new URLSearchParams({
    client_id: s.clientId,
    response_type: 'code',
    redirect_uri: s.redirectUri,
    state: createState(userId),
  })
  if (s.scopes) params.set('scope', s.scopes)
  return `${s.baseUrl}/login/oauth2/auth?${params.toString()}`
}

// ── Step 3: trade the one-time code for tokens ─────────────────────────────

export async function exchangeCode(code) {
  const s = getOAuthSettings()
  const { data } = await axios.post(
    `${s.baseUrl}/login/oauth2/token`,
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: s.clientId,
      client_secret: s.clientSecret,
      redirect_uri: s.redirectUri,
      code,
    })
  )
  return data // { access_token, refresh_token, expires_in, user: { id, name } }
}

/**
 * Saves a fresh OAuth connection for a user.
 * Keeps any Notion settings they already entered.
 */
export async function saveOAuthConnection(userId, tokenResponse) {
  const s = getOAuthSettings()
  const canvasFields = {
    canvasAuthType: 'oauth',
    canvasBaseUrl: s.baseUrl,
    canvasToken: encrypt(tokenResponse.access_token),
    canvasRefreshToken: encrypt(tokenResponse.refresh_token),
    canvasTokenExpiresAt: expiryFrom(tokenResponse.expires_in),
    canvasUserName: tokenResponse.user?.name || null,
  }

  await prisma.config.upsert({
    where: { userId },
    create: { userId, ...canvasFields },
    update: canvasFields,
  })
}

// ── Step 4: keep the access token fresh ────────────────────────────────────

async function refreshAccessToken(config) {
  const s = getOAuthSettings()
  try {
    const { data } = await axios.post(
      `${config.canvasBaseUrl}/login/oauth2/token`,
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: s.clientId,
        client_secret: s.clientSecret,
        refresh_token: decrypt(config.canvasRefreshToken),
      })
    )

    // Canvas keeps the same refresh token, only the access token changes
    await prisma.config.update({
      where: { userId: config.userId },
      data: {
        canvasToken: encrypt(data.access_token),
        canvasTokenExpiresAt: expiryFrom(data.expires_in),
      },
    })
    return data.access_token
  } catch (err) {
    // 400/401 means the user revoked access in Canvas, or an admin removed the key
    const status = err.response?.status
    if (status === 400 || status === 401) {
      await clearCanvasConnection(config.userId)
      throw new Error('Your Canvas connection expired or was revoked. Please reconnect Canvas in Settings.')
    }
    throw new Error(`Could not refresh Canvas access: ${err.message}`)
  }
}

/**
 * The one function the rest of the app calls to get Canvas credentials.
 * Works for both pasted personal tokens and OAuth connections.
 * Returns { baseUrl, token }.
 */
export async function getCanvasCredentials(config) {
  if (!config?.canvasToken || !config?.canvasBaseUrl) {
    throw new Error('Canvas is not connected. Connect Canvas in Settings first.')
  }

  if (config.canvasAuthType !== 'oauth') {
    return { baseUrl: config.canvasBaseUrl, token: decrypt(config.canvasToken) }
  }

  const expiresAt = config.canvasTokenExpiresAt ? new Date(config.canvasTokenExpiresAt).getTime() : 0
  const stillValid = expiresAt - Date.now() > REFRESH_MARGIN_MS
  const token = stillValid ? decrypt(config.canvasToken) : await refreshAccessToken(config)

  return { baseUrl: config.canvasBaseUrl, token }
}

// ── Disconnect ─────────────────────────────────────────────────────────────

/**
 * Tells Canvas to delete the token (so the app disappears from the user's
 * Canvas "Approved Integrations" list), then forgets it locally.
 * Local cleanup happens even if Canvas is unreachable.
 */
export async function disconnectCanvas(userId) {
  const config = await prisma.config.findUnique({ where: { userId } })
  if (config?.canvasAuthType === 'oauth' && config.canvasToken) {
    try {
      const { token } = await getCanvasCredentials(config)
      await axios.delete(`${config.canvasBaseUrl}/login/oauth2/token`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch (err) {
      console.warn('Canvas token revoke failed, clearing locally anyway:', err.message)
    }
  }
  await clearCanvasConnection(userId)
}

async function clearCanvasConnection(userId) {
  await prisma.config.updateMany({
    where: { userId },
    data: {
      canvasAuthType: null,
      canvasToken: null,
      canvasRefreshToken: null,
      canvasTokenExpiresAt: null,
      canvasUserName: null,
    },
  })
}

// ── Helpers ────────────────────────────────────────────────────────────────

function expiryFrom(expiresInSeconds) {
  // Canvas currently issues 1-hour tokens. Fall back to that if it is missing.
  return new Date(Date.now() + (expiresInSeconds || 3600) * 1000)
}
