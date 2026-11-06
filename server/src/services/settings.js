import 'dotenv/config'

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.trim().length < 32) {
    throw new Error('JWT_SECRET must be set to at least 32 characters.')
  }
  return secret
}
