import { NextResponse } from 'next/server'

import { pingDatabase, pingRedis } from '@/modules/core/probes'

/**
 * Readiness — can this instance serve a request right now (plan 7.5, audit INFRA-M13)?
 *
 * Postgres and Redis, through the pooled path a real request takes. A green check that
 * bypassed PgBouncer would prove the database is up and say nothing about whether the app can
 * reach it, which is the question being asked.
 *
 * A load balancer takes an instance out of rotation on a 503 here and puts it back when it
 * recovers. That is the whole contract, and it is why a quiet SCHEDULER must not appear: a
 * nightly job that has not fired does not stop this instance serving a merchandiser, and
 * treating it as though it did takes a working app out of rotation for a problem in another
 * process. That question is `/api/health/jobs`.
 *
 * ## `ok` and a latency, never the exception
 *
 * A refused Postgres connection reports back with the connection string in it, and this
 * endpoint is public because a load balancer cannot hold a credential. The swallowing happens
 * in `probes.ts` rather than here, so no future caller can print it by accident.
 *
 * The latency is safe and worth having: "up but answering in four seconds" is the state that
 * precedes an outage, and it is invisible in a boolean.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const [postgres, redis] = await Promise.all([pingDatabase(), pingRedis()])
  const ready = postgres.ok && redis.ok

  return NextResponse.json(
    { status: ready ? 'ready' : 'not_ready', checks: { postgres, redis } },
    {
      status: ready ? 200 : 503,
      // Never cached. A readiness answer one second old is a lie a proxy will keep telling
      // for as long as it holds it.
      headers: { 'cache-control': 'no-store' },
    },
  )
}
