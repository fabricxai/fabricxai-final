/**
 * Application database client — goes through PgBouncer in transaction mode.
 *
 * Two things follow from transaction pooling and both are non-negotiable:
 *  1. `prepare: false` — server-side prepared statements do not survive a transaction
 *     pooler; leaving this on produces "prepared statement already exists" under load.
 *  2. Session state is per-transaction only. That is exactly why the tenancy second
 *     wall uses `SET LOCAL app.company_id` inside each transaction rather than a
 *     connection-level SET (architecture §1.2).
 *
 * DDL, advisory locks and migrations use `src/db/direct.ts` instead.
 */
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { env } from '@/lib/env'

import * as schema from './schema'

const globalForDb = globalThis as unknown as {
  __fabricxaiSql?: ReturnType<typeof postgres>
}

let client: ReturnType<typeof postgres> | undefined
let instance: ReturnType<typeof drizzle<typeof schema>> | undefined

/**
 * The pool is created on first use, not at import.
 *
 * `next build` imports every route module to collect page data. Connecting at import
 * time would mean a build needs a reachable database — and in a Docker build there isn't
 * one. Lazy also means a request path that never touches Postgres never opens a socket.
 */
function connect() {
  if (instance) return instance

  // Next dev reloads modules on every edit; without this the pool count climbs until
  // PgBouncer starts refusing clients.
  client =
    globalForDb.__fabricxaiSql ??
    postgres(env.DATABASE_URL, {
      prepare: false,
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      // Money is numeric(14,2) and must never round-trip through a JS float.
      types: {
        numeric: {
          to: 1700,
          from: [1700],
          serialize: (x: string | number) => String(x),
          parse: (x: string) => x,
        },
      },
    })

  if (env.NODE_ENV !== 'production') globalForDb.__fabricxaiSql = client

  instance = drizzle(client, { schema, casing: 'snake_case' })
  return instance
}

export type Db = ReturnType<typeof connect>

/** Behaves exactly like the Drizzle instance; connects on the first property access. */
export const db: Db = new Proxy({} as Db, {
  get(_target, property) {
    const real = connect()
    const value = Reflect.get(real as object, property, real)
    return typeof value === 'function' ? value.bind(real) : value
  },
})

export function getSqlClient() {
  connect()
  if (!client) throw new Error('postgres client was not initialised')
  return client
}
