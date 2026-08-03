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
import { closeRedis, createQueueConnection, getRedis } from '@/lib/redis'
// Module registration is a side effect of importing the registry, and it only happens in
// processes that import it. The app gets it via instrumentation.ts; without this line the
// worker got NOTHING — no pending-change schemas, no MARBIM provider, no primers — so
// extraction skipped forever and, worse, would have terminally rejected every queued job
// the moment a provider appeared without this import appearing with it.
import { registeredSummary } from '@/modules/registry'

import { routeDeriveJob } from './derive-router'
import { runNotifyJob, type NotifyJobData } from './processors/notifier'
import { type EventJobData } from './processors/consumers'
import { startOutboxRelay } from './processors/outbox-relay'
import {
  fanOutScheduledTask,
  registerSchedules,
  type DeriveJobData,
  type ScheduledTask,
} from './processors/scheduler'
import { closeQueues, QUEUE } from './queues'

async function main() {
  console.log(`[worker] starting · NODE_ENV=${env.NODE_ENV} · concurrency=${env.WORKER_CONCURRENCY}`)

  // Fail loudly at boot if Redis is unreachable, rather than silently processing nothing.
  await getRedis().ping()
  console.log('[worker] redis ok')

  // Same principle for the module registry: a worker with zero registered modules would
  // run every schedule and understand none of the work.
  const registered = registeredSummary()
  if (registered.modules === 0) {
    throw new Error('[worker] module registry is empty — registration import is broken')
  }
  console.log(`[worker] ${registered.modules} modules registered`)

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
    //
    // Two kinds of job share this queue: the scheduler's per-company fan-out, and the
    // relay's cross-module event consumers. They share a queue deliberately, because both
    // are "derived work that must not block a request" and splitting them would double the
    // worker count for no isolation gain. Telling them apart — including the third case, an
    // event the relay routes here with no consumer yet — is `derive-router.ts`, kept in its
    // own file so the decision can be tested without importing this one, which starts a
    // worker process on import.
    new Worker<DeriveJobData | EventJobData>(QUEUE.derive, routeDeriveJob, {
      connection: createQueueConnection(),
      concurrency: env.WORKER_CONCURRENCY,
    }),
    // The relay's default route. Everything it does not send to `derive` lands here — the
    // events that are somebody being told something rather than another module writing.
    //
    // Until this worker existed the queue had no reader, so those events arrived and
    // stopped: a fabric roll rejected, a lot failing AQL, a shipment refused at the bank for
    // a missing EXP. All committed, all relayed, none of them reaching a person.
    //
    // Separate from `derive` on purpose. A notification is cheap and must not queue behind a
    // nightly derivation, and a derivation must never be delayed by a mail-shaped write.
    new Worker<NotifyJobData>(QUEUE.notify, runNotifyJob, {
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
    // closeRedis, not getRedis().disconnect(): the latter constructed a NEW
    // client and disconnected that, leaving the boot-ping connection open.
    await closeRedis()
    process.exit(0)
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((error: unknown) => {
  console.error('[worker] fatal:', error)
  process.exit(1)
})
