import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { db } from '@/db/client'
import { env } from '@/lib/env'
import { getRedis } from '@/lib/redis'

/**
 * Liveness + dependency check. Uptime Kuma polls this (dev-plan §8).
 * Deliberately exercises the real pooled path (PgBouncer) rather than a direct
 * connection — a green health check that bypasses the pooler proves nothing.
 */
export const dynamic = 'force-dynamic'

type Check = { ok: true; latencyMs: number } | { ok: false; error: string }

async function timed(fn: () => Promise<unknown>): Promise<Check> {
  const startedAt = Date.now()
  try {
    await fn()
    return { ok: true, latencyMs: Date.now() - startedAt }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function GET() {
  const [postgres, redis] = await Promise.all([
    timed(() => db.execute(sql`select 1`)),
    timed(async () => getRedis().ping()),
  ])

  const healthy = postgres.ok && redis.ok

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      env: env.NODE_ENV,
      checks: { postgres, redis },
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  )
}
