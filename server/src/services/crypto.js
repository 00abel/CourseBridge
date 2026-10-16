// crypto.js
// Encrypts tokens before they go into the database and decrypts them on the way out.
//
// Why: refresh tokens never expire on their own. If someone got a copy of the
// database file, plain-text tokens would give them access to every user's Canvas.
// With encryption, the database alone is useless without TOKEN_ENCRYPTION_KEY.
//
// Uses AES-256-GCM, which also detects if the stored value was tampered with.

import crypto from 'crypto'

const PREFIX = 'enc:v1:'

function getKey() {
  const hex = process.env.TOKEN_ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY must be set to 64 hex characters. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    )
  }
  return Buffer.from(hex, 'hex')
}

/**
 * Encrypts a string. Returns null for empty values so optional fields stay empty.
 */
export function encrypt(plainText) {
  if (!plainText) return null
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX + [iv, tag, encrypted].map(b => b.toString('base64')).join(':')
}

/**
 * Decrypts a value written by encrypt().
 * Values without the prefix are returned as-is, so tokens saved before
 * encryption was added keep working until the user saves their config again.
 */
export function decrypt(stored) {
  if (!stored) return null
  if (!stored.startsWith(PREFIX)) return stored

  const [iv, tag, data] = stored.slice(PREFIX.length).split(':').map(s => Buffer.from(s, 'base64'))
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}
