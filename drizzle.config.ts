import 'dotenv/config'

import { defineConfig } from 'drizzle-kit'

// drizzle-kit performs DDL and holds advisory locks — always the direct connection,
// never the PgBouncer one.
const url = process.env.DIRECT_DATABASE_URL
if (!url) throw new Error('DIRECT_DATABASE_URL is not set — copy .env.example to .env')

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  casing: 'snake_case',
  dbCredentials: { url },
  verbose: true,
  strict: true,
})
