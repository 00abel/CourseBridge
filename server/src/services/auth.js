// auth.js: JWT based authentication helpers.
// When a user logs in, we give them a JWT token.
// They include this token in every API request.
// We verify it here before allowing access to protected routes.

import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production'
const JWT_EXPIRES_IN = '7d'  // Tokens last 7 days

/**
 * Creates a JWT token for a user.
 * The token contains the user's ID, which we use to look them up later.
 */
export function createToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

/**
 * Middleware: verifies the JWT token on protected routes.
 *
 * Usage: router.get('/protected', requireAuth, handler)
 *
 * The token should be sent in the Authorization header:
 * Authorization: Bearer <token>
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided. Please log in.' })
  }

  const token = authHeader.split(' ')[1]

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.userId = decoded.userId  // Attach userId to request for use in route handlers
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token. Please log in again.' })
  }
}

/**
 * Hashes a password before storing it.
 * Never store plain-text passwords!
 */
export async function hashPassword(password) {
  return bcrypt.hash(password, 12)  // 12 = work factor (higher = slower = more secure)
}

/**
 * Compares a plain-text password against a stored hash.
 */
export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash)
}
