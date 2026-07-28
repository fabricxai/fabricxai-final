/**
 * BullMQ worker process — `pnpm worker:dev`.
 *
 * Runs outside the Next.js request lifecycle (dev-plan §1): every model call, every PDF
 * render and every digest assembly happens here, so the app process never blocks on any
 * of them.
 *
 * Two things start here — the outbox relay (the only bridge from committed transactions
 * to the queues) and the scheduler (nightly derivations, fanned out per company).
 */
// The worker runs outside Next, which is what loads .env for the app process.
// In production the container supplies the environment and this is a no-op.
import 'dotenv/config'

import { Worker } from 'bullmq'

import { env } from '@/lib/env'
import { createQueueConnection, getRedis } from '@/lib/redis'

import { startOutboxRelay } from './processors/outbox-relay'
import {
  fanOutScheduledTask,
  registerSchedules,
  runDeriveTask,
  type DeriveJobData,
  type ScheduledTask,
} from './processors/scheduler'
import { closeQueues, QUEUE } from './queues'

async function main() {
  console.log(`[worker] starting · NODE_ENV=${env.NODE_ENV} · concurrency=${env.WORKER_CONCURRENCY}`)

  // Fail loudly at boot if Redis is unreachable, rather than silently processing nothing.
  await getRedis().ping()
  console.log('[worker] redis ok')

  // The outbox relay is the only bridge from committed transactions to the queues, so it
  // starts first — module job families attach to queues it feeds.
  const relay = startOutboxRelay()
  console.log('[worker] outbox relay started')

  await registerSchedules()

  const workers = [
    // Cron fan-out only: fast, and one at a time so two workers cannot both fan out.
    new Worker<{ task: ScheduledTask }>(QUEUE.schedule, fanOutScheduledTask, {
      connection: createQueueConnection(),
      concurrency: 1,
    }),
    // The real work, one job per company. Concurrency here is what decides how fast a
    // fleet of tenants gets through its nightly derivations.
    new Worker<DeriveJobData>(QUEUE.derive, runDeriveTask, {
      connection: createQueueConnection(),
      concurrency: env.WORKER_CONCURRENCY,
    }),
  ]

  for (const worker of workers) {
    worker.on('failed', (job, error) => {
      // A silent nightly failure is a report nobody notices is missing.
      console.error(`[worker] ${worker.name} job ${job?.id ?? '?'} failed:`, error.message)
    })
  }

  console.log(`[worker] ${workers.length} queue worker(s) listening`)

  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`[worker] ${signal} received, draining …`)

    relay.stop()
    // Close workers before queues: a worker still holding a job would otherwise lose its
    // connection mid-flight and the job would look failed rather than interrupted.
    await Promise.all(workers.map((worker) => worker.close()))
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
