/**
 * Direct database client — bypasses PgBouncer via DIRECT_DATABASE_URL.
 *
 * For migrations, schema introspection and anything needing session-level state or
 * advisory locks. Never import this from a request path.
 *
 * **Deliberately does NOT import `@/lib/env`.** Applying a migration or restoring a
 * database must not require the application's S3 bucket, auth secret and model provider
 * keys — an ops person recovering a backup at 3am should need a connection string and
 * nothing else. So this validates the one variable it actually uses and leaves the rest
 * to the processes that genuinely need them (`instrumentation.ts`, the worker entry).
 */
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

function directUrl(): string {
  const url = process.env.DIRECT_DATABASE_URL

  if (!url || !url.startsWith('postgres')) {
    throw new Error(
      'DIRECT_DATABASE_URL is missing or malformed.\n' +
        'It must point straight at Postgres, NOT at PgBouncer — DDL and the migration ' +
        'advisory lock do not survive transaction pooling.\n' +
        'Copy .env.example to .env; the dev value there matches docker-compose.dev.yml.',
    )
  }

  return url
}

export function createDirectClient(max = 1) {
  return postgres(directUrl(), { max, onnotice: () => {} })
}

export function createDirectDb(client = createDirectClient()) {
  return drizzle(client, { schema, casing: 'snake_case' })
}
