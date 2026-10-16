// scripts/mockCanvas.js
// A tiny fake Canvas server for testing "Connect with Canvas" locally.
//
// Real Canvas OAuth needs a Developer Key from a school admin. This mock
// behaves like Canvas's OAuth endpoints so you can test the full flow today:
// consent page -> code -> tokens -> refresh -> API calls -> revoke.
//
// Run:   npm run mock:canvas     (listens on http://localhost:4000)
// Then set these in server/.env and restart the server:
//   CANVAS_CLIENT_ID="mock-client-id"
//   CANVAS_CLIENT_SECRET="mock-client-secret"
//   CANVAS_OAUTH_BASE_URL="http://localhost:4000"
//   CANVAS_REDIRECT_URI="http://localhost:3001/api/canvas/oauth/callback"
//
// Optional: MOCK_EXPIRES_IN=30 makes access tokens expire after 30 seconds,
// so you can watch the refresh logic kick in.

import express from 'express'
import crypto from 'crypto'

const PORT = process.env.MOCK_CANVAS_PORT || 4000
const CLIENT_ID = 'mock-client-id'
const CLIENT_SECRET = 'mock-client-secret'
const EXPIRES_IN = Number(process.env.MOCK_EXPIRES_IN || 3600)

const codes = new Map()          // code -> { redirectUri, expires }
const accessTokens = new Map()   // token -> expires
const refreshTokens = new Set()

const app = express()
app.use(express.urlencoded({ extended: false }))
app.use(express.json())

const randomToken = () => crypto.randomBytes(24).toString('hex')

function issueAccessToken() {
  const token = randomToken()
  accessTokens.set(token, Date.now() + EXPIRES_IN * 1000)
  return token
}

// ── OAuth: consent page ────────────────────────────────────────────────────
app.get('/login/oauth2/auth', (req, res) => {
  const { client_id, redirect_uri, response_type, state } = req.query
  if (client_id !== CLIENT_ID) return res.status(400).send('Unknown client_id')
  if (response_type !== 'code') return res.status(400).send('response_type must be code')
  if (!redirect_uri) return res.status(400).send('Missing redirect_uri')

  const code = randomToken()
  codes.set(code, { redirectUri: redirect_uri, expires: Date.now() + 5 * 60 * 1000 })

  const ok = `${redirect_uri}?${new URLSearchParams({ code, state: state || '' })}`
  const cancel = `${redirect_uri}?${new URLSearchParams({ error: 'access_denied', state: state || '' })}`

  res.send(`<!doctype html><html><body style="font-family:sans-serif;max-width:420px;margin:80px auto">
    <h2>Mock Canvas</h2>
    <p><b>CourseBridge</b> is requesting access to your account.</p>
    <p>This is a local test server, not real Canvas.</p>
    <a href="${ok}" style="padding:10px 18px;background:#2d3b45;color:#fff;text-decoration:none;border-radius:4px">Authorize</a>
    &nbsp;<a href="${cancel}">Cancel</a>
  </body></html>`)
})

// ── OAuth: token endpoint (code exchange + refresh) ────────────────────────
app.post('/login/oauth2/token', (req, res) => {
  const { grant_type, client_id, client_secret } = req.body
  if (client_id !== CLIENT_ID || client_secret !== CLIENT_SECRET) {
    return res.status(401).json({ error: 'invalid_client' })
  }

  if (grant_type === 'authorization_code') {
    const entry = codes.get(req.body.code)
    codes.delete(req.body.code) // codes are single use, like real Canvas
    if (!entry || entry.expires < Date.now() || entry.redirectUri !== req.body.redirect_uri) {
      return res.status(400).json({ error: 'invalid_grant' })
    }
    const refresh = randomToken()
    refreshTokens.add(refresh)
    return res.json({
      access_token: issueAccessToken(),
      token_type: 'Bearer',
      refresh_token: refresh,
      expires_in: EXPIRES_IN,
      user: { id: 42, name: 'Demo Student' },
    })
  }

  if (grant_type === 'refresh_token') {
    if (!refreshTokens.has(req.body.refresh_token)) {
      return res.status(400).json({ error: 'invalid_grant' })
    }
    console.log('  ↻ refreshed an access token')
    // Like real Canvas: new access token, no new refresh token
    return res.json({
      access_token: issueAccessToken(),
      token_type: 'Bearer',
      expires_in: EXPIRES_IN,
      user: { id: 42, name: 'Demo Student' },
    })
  }

  res.status(400).json({ error: 'unsupported_grant_type' })
})

// ── OAuth: revoke ──────────────────────────────────────────────────────────
app.delete('/login/oauth2/token', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  accessTokens.delete(token)
  refreshTokens.clear() // one demo user, so revoke everything
  console.log('  ✖ token revoked')
  res.json({})
})

// ── API: require a valid, unexpired access token ───────────────────────────
function requireToken(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  const expires = accessTokens.get(token)
  if (!expires || expires < Date.now()) {
    return res.status(401).json({ errors: [{ message: 'Invalid access token.' }] })
  }
  next()
}

const courses = [
  { id: 101, name: 'Calculus II', course_code: 'MATH 202' },
  { id: 102, name: 'Introduction to Computer Science', course_code: 'CS 101' },
]

const inDays = d => new Date(Date.now() + d * 86400000).toISOString()

const assignments = {
  101: [
    { id: 5001, name: 'Problem Set 3', points_possible: 100, due_at: inDays(5), submission_types: ['online_upload'] },
    { id: 5002, name: 'Quiz 4: Integration', points_possible: 50, due_at: inDays(3), submission_types: ['online_quiz'] },
  ],
  102: [
    { id: 6001, name: 'Lab 2: Variables and Loops', points_possible: 50, due_at: inDays(4), submission_types: ['online_upload'] },
  ],
}

app.get('/api/v1/courses', requireToken, (req, res) => res.json(courses))

app.get('/api/v1/courses/:id/assignments', requireToken, (req, res) => {
  const list = (assignments[req.params.id] || []).map(a => ({
    ...a,
    description: `<p>${a.name} for the mock course.</p>`,
    html_url: `http://localhost:${PORT}/courses/${req.params.id}/assignments/${a.id}`,
    has_submitted_submissions: false,
    updated_at: new Date().toISOString(),
  }))
  res.json(list)
})

app.listen(PORT, () => {
  console.log(`Mock Canvas running on http://localhost:${PORT}`)
  console.log(`  client_id: ${CLIENT_ID}   access tokens last ${EXPIRES_IN}s`)
})
