/**
 * Migration runner — `pnpm db:migrate`.
 * Always uses DIRECT_DATABASE_URL: DDL and the migration advisory lock cannot go
 * through a transaction pooler.
 *
 * Forward-fix only. Never edit an applied migration file (PLAYBOOK §5).
 */
import 'dotenv/config'

import { migrate } from 'drizzle-orm/postgres-js/migrator'

import { createDirectClient, createDirectDb } from './direct'

async function main() {
  const client = createDirectClient()
  const db = createDirectDb(client)

  const startedAt = Date.now()
  console.log('[migrate] applying migrations from src/db/migrations …')

  await migrate(db, { migrationsFolder: 'src/db/migrations' })

  console.log(`[migrate] done in ${Date.now() - startedAt}ms`)
  await client.end()
}

main().catch((error: unknown) => {
  console.error('[migrate] failed:', error)
  process.exit(1)
})
