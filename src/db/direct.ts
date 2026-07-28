/**
 * Direct database client — bypasses PgBouncer via DIRECT_DATABASE_URL.
 *
 * For migrations, schema introspection and anything needing session-level state or
 * advisory locks. Never import this from a request path.
 */
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { env } from '@/lib/env'

import * as schema from './schema'

export function createDirectClient(max = 1) {
  return postgres(env.DIRECT_DATABASE_URL, { max, onnotice: () => {} })
}

export function createDirectDb(client = createDirectClient()) {
  return drizzle(client, { schema, casing: 'snake_case' })
}
