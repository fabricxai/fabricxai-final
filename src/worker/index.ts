/**
 * BullMQ worker process — `pnpm worker:dev`.
 *
 * Runs outside the Next.js request lifecycle (dev-plan §1). Processors are registered
 * one file per job family under src/worker/processors/, and modules contribute their
 * own via `jobs.ts` + `register.ts`.
 *
 * Phase 0 scope: the process boots, validates env, connects, and shuts down cleanly.
 * Real processors (outbox relay first) land in Phase 0 session 3.
 */
// The worker runs outside Next, which is what loads .env for the app process.
// In production the container supplies the environment and this is a no-op.
import 'dotenv/config'

import { env } from '@/lib/env'
import { getRedis } from '@/lib/redis'

import { startOutboxRelay } from './processors/outbox-relay'
import { closeQueues } from './queues'

async function main() {
  console.log(`[worker] starting · NODE_ENV=${env.NODE_ENV} · concurrency=${env.WORKER_CONCURRENCY}`)

  // Fail loudly at boot if Redis is unreachable, rather than silently processing nothing.
  await getRedis().ping()
  console.log('[worker] redis ok')

  // The outbox relay is the only bridge from committed transactions to the queues, so it
  // starts first — module job families attach to queues it feeds.
  const relay = startOutboxRelay()
  console.log('[worker] outbox relay started')

  // TODO(phase 2+): module job families (extract, render-pdf, derive, schedule).

  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`[worker] ${signal} received, draining …`)
    relay.stop()
    await closeQueues()
    getRedis().disconnect()
    process.exit(0)
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((error: unknown) => {
  console.error('[worker] fatal:', error)
  process.exit(1)
})
