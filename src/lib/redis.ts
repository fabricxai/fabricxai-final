import Redis, { type RedisOptions } from 'ioredis'

import { env } from './env'

const globalForRedis = globalThis as unknown as { __fabricxaiRedis?: Redis }

/** Shared connection for rate limits, cached aggregates and health checks. */
export function getRedis(): Redis {
  const existing = globalForRedis.__fabricxaiRedis
  if (existing) return existing

  const client = new Redis(env.REDIS_URL, { lazyConnect: false })
  if (env.NODE_ENV !== 'production') globalForRedis.__fabricxaiRedis = client
  return client
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
