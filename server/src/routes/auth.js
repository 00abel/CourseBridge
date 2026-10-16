// routes/auth.js: register and login endpoints

import { Router } from 'express'
import prisma from '../db/db.js'
import { createToken, hashPassword, verifyPassword } from '../services/auth.js'

const router = Router()

/**
 * POST /api/auth/register
 * Creates a new user account.
 * Body: { email, password }
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body

    // Basic validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' })
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' })
    }

    // Check if email is already taken
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' })
    }

    // Hash the password and create the user
    const passwordHash = await hashPassword(password)
    const user = await prisma.user.create({
      data: { email, passwordHash },
    })

    // Return a token so they're immediately logged in
    const token = createToken(user.id)
    res.status(201).json({ token, user: { id: user.id, email: user.email } })
  } catch (err) {
    console.error('Register error:', err)
    res.status(500).json({ error: 'Registration failed. Please try again.' })
  }
})

/**
 * POST /api/auth/login
 * Logs in an existing user.
 * Body: { email, password }
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' })
    }

    // Find user by email
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      // Don't reveal whether the email exists
      return res.status(401).json({ error: 'Invalid email or password.' })
    }

    // Verify password
    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' })
    }

    const token = createToken(user.id)
    res.json({ token, user: { id: user.id, email: user.email } })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: 'Login failed. Please try again.' })
  }
})

/**
 * GET /api/auth/me
 * Returns the currently logged-in user's info.
 * Used by the frontend to check if a token is still valid.
 */
router.get('/me', async (req, res) => {
  // requireAuth middleware is NOT used here. We handle it manually
  // so we can return a friendly response instead of 401
  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: 'Not logged in.' })

  try {
    const { Router: _, ...jwt } = await import('jsonwebtoken')
    // Re-import to use in this scope
  } catch {}

  // Use the auth middleware approach inline
  const { default: jsonwebtoken } = await import('jsonwebtoken')
  try {
    const token = authHeader.split(' ')[1]
    const decoded = jsonwebtoken.verify(token, process.env.JWT_SECRET || 'change-this-in-production')
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, createdAt: true },
    })
    if (!user) return res.status(401).json({ error: 'User not found.' })
    res.json({ user })
  } catch {
    res.status(401).json({ error: 'Invalid token.' })
  }
})

export default router
