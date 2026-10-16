// db.js: creates a single shared Prisma client instance.
// We import this everywhere we need to touch the database.

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default prisma
