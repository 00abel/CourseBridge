import crypto from 'crypto'

const PREFIX = 'enc:v1:'

function getKey() {
  const hex = process.env.TOKEN_ENCRYPTION_KEY
  if (!hex || !/^[a-f0-9]{64}$/i.test(hex)) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY must be set to 64 hex characters. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    )
  }
  return Buffer.from(hex, 'hex')
}

export function encrypt(plainText) {
  if (!plainText) return null
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX + [iv, tag, encrypted].map(b => b.toString('base64')).join(':')
}

export function decrypt(stored) {
  if (!stored) return null
  // older tokens get encrypted when the settings are saved again
  if (!stored.startsWith(PREFIX)) return stored

  const [iv, tag, data] = stored.slice(PREFIX.length).split(':').map(s => Buffer.from(s, 'base64'))
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}
