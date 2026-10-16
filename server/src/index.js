// index.js — The main server file. Sets up Express and mounts all routes.

import express from 'express'
import cors from 'cors'
import 'dotenv/config'

import authRoutes from './routes/auth.js'
import configRoutes from './routes/config.js'
import syncRoutes from './routes/sync.js'
import canvasOAuthRoutes from './routes/canvasOAuth.js'
import { encrypt } from './services/crypto.js'
import { isOAuthEnabled } from './services/canvasOAuth.js'

const app = express()
const PORT = process.env.PORT || 3001

// ── Middleware ─────────────────────────────────────────────────────────────

// Parse JSON request bodies
app.use(express.json())

// Allow requests from our frontend
// In production, replace the origin with your actual frontend URL
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}))

// ── Routes ─────────────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes)
app.use('/api/config', configRoutes)
app.use('/api/sync', syncRoutes)
app.use('/api/canvas/oauth', canvasOAuthRoutes)

// Health check endpoint — useful for deployment platforms
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ── Error handler ─────────────────────────────────────────────────────────

// Catches any unhandled errors and returns a clean JSON response
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Something went wrong on the server.' })
})

// ── Start ──────────────────────────────────────────────────────────────────

// Fail fast if the encryption key is missing, instead of failing on the first save
try {
  encrypt('startup-check')
} catch (err) {
  console.error(`✖ ${err.message}`)
  process.exit(1)
}

app.listen(PORT, () => {
  console.log(`✓ Server running on http://localhost:${PORT}`)
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log(`  Canvas OAuth: ${isOAuthEnabled() ? 'enabled' : 'off (no developer key configured)'}`)
})
