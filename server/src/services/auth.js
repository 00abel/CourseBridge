import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

import { getJwtSecret } from './settings.js'
const JWT_EXPIRES_IN = '7d'

export function createToken(userId) {
  return jwt.sign({ userId }, getJwtSecret(), { expiresIn: JWT_EXPIRES_IN })
}

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided. Please log in.' })
  }

  const token = authHeader.split(' ')[1]

  try {
    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] })
    if (typeof decoded.userId !== 'string' || !decoded.userId || decoded.purpose !== undefined) throw new Error('Invalid session')
    req.userId = decoded.userId
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token. Please log in again.' })
  }
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash)
}
