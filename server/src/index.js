import express from 'express'
import cors from 'cors'
import 'dotenv/config'

import authRoutes from './routes/auth.js'
import configRoutes from './routes/config.js'
import syncRoutes from './routes/sync.js'
import { getJwtSecret } from './services/settings.js'
import { encrypt } from './services/crypto.js'

const app = express()
const PORT = process.env.PORT || 3001

app.disable('x-powered-by')
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', process.env.TRUST_PROXY.split(',').map(address => address.trim()))
}
app.use(express.json())

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}))

app.use('/api/auth', authRoutes)
app.use('/api/config', configRoutes)
app.use('/api/sync', syncRoutes)

// used to check if the server is running
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' })
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' })
  console.error('Unhandled error:', err.name)
  res.status(500).json({ error: 'Something went wrong on the server.' })
})

// check the secrets before starting the server
try {
  getJwtSecret()
  encrypt('startup-check')
} catch (err) {
  console.error(`✖ ${err.message}`)
  process.exit(1)
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`)
})
