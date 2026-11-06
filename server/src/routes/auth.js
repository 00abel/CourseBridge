import { Router } from 'express'
import prisma from '../db/db.js'
import { rateLimit } from 'express-rate-limit'
import { createToken, hashPassword, verifyPassword, requireAuth } from '../services/auth.js'

const router = Router()
const limitLoginAttempts = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
})

router.post('/register', limitLoginAttempts, async (req, res) => {
  try {
    const { email: rawEmail, password } = req.body || {}

    if (typeof rawEmail !== 'string' || typeof password !== 'string' || !rawEmail.trim() || !password) {
      return res.status(400).json({ error: 'Email and password are required.' })
    }
    const email = rawEmail.trim().toLowerCase()
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address.' })
    }
    if (Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json({ error: 'Password must be no more than 72 bytes.' })
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' })
    }

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' })
    }

    const passwordHash = await hashPassword(password)
    const user = await prisma.user.create({
      data: { email, passwordHash },
    })

    const token = createToken(user.id)
    res.status(201).json({ token, user: { id: user.id, email: user.email } })
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'An account with this email already exists.' })
    }
    console.error('Register error:', err.code || err.name)
    res.status(500).json({ error: 'Registration failed. Please try again.' })
  }
})

router.post('/login', limitLoginAttempts, async (req, res) => {
  try {
    const { email: rawEmail, password } = req.body || {}

    if (typeof rawEmail !== 'string' || typeof password !== 'string' || !rawEmail.trim() || !password) {
      return res.status(400).json({ error: 'Email and password are required.' })
    }

    const email = rawEmail.trim().toLowerCase()
    if (email.length > 254 || Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json({ error: 'Email or password is too long.' })
    }
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      // don't reveal whether the email exists
      return res.status(401).json({ error: 'Invalid email or password.' })
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' })
    }

    const token = createToken(user.id)
    res.json({ token, user: { id: user.id, email: user.email } })
  } catch (err) {
    console.error('Login error:', err.code || err.name)
    res.status(500).json({ error: 'Login failed. Please try again.' })
  }
})

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, createdAt: true },
    })
    if (!user) return res.status(401).json({ error: 'User not found.' })
    res.json({ user })
  } catch (err) {
    console.error('User lookup failed:', err.code || err.name)
    res.status(500).json({ error: 'Could not load your account.' })
  }
})

export default router
