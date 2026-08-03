import Redis, { type RedisOptions } from 'ioredis'

import { env } from './env'

const globalForRedis = globalThis as unknown as { __fabricxaiRedis?: Redis }

// Module-level singleton for every environment. The globalThis slot exists only
// so dev HMR (which re-evaluates this module) finds the old client instead of
// leaking one per reload; in production the module is evaluated once, so the
// local variable alone is the cache. Caching in dev-only was the bug: every
// production getRedis() call opened a socket that nothing ever closed, and the
// 30s health-check poll alone exhausted Redis maxclients within days.
let client: Redis | undefined

/** Shared connection for rate limits, cached aggregates and health checks. */
export function getRedis(): Redis {
  client ??= globalForRedis.__fabricxaiRedis ??= new Redis(env.REDIS_URL, {
    lazyConnect: false,
  })
  return client
}

/** Close the shared connection (worker shutdown). Safe to call twice. */
export async function closeRedis(): Promise<void> {
  const open = client ?? globalForRedis.__fabricxaiRedis
  client = undefined
  globalForRedis.__fabricxaiRedis = undefined
  if (open) await open.quit().catch(() => open.disconnect())
}

/**
 * BullMQ needs its OWN connection with `maxRetriesPerRequest: null` — blocking
 * commands (BRPOPLPUSH) must not be aborted by the retry policy, and sharing the
 * app's connection would stall it. Never reuse getRedis() for a queue or worker.
 */
export function createQueueConnection(overrides: RedisOptions = {}): Redis {
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...overrides,
  })
}
