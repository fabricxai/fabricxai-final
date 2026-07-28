/**
 * BullMQ queue definitions (architecture §5).
 *
 * The worker is a separate process on purpose: every model call, every PDF render and
 * every digest assembly happens here, so the app process never blocks on any of them.
 *
 * Queues are isolated from each other so that a burst of extraction work cannot starve
 * notifications or the outbox relay — which is also the pre-planned answer to
 * "extraction throughput" in the scaling ladder (architecture §8.4).
 */
import { Queue } from 'bullmq'

import { createQueueConnection } from '@/lib/redis'

export const QUEUE = {
  /** AI extraction. Rate-limited per company; the highest-volume queue. */
  extract: 'extract',
  /** HTML→PDF via a Playwright chromium pool: PO, payslip, packing list, QC pack, UD recon. */
  renderPdf: 'render-pdf',
  notify: 'notify',
  /** Derived tables: WIP snapshots, efficiency day-close, supplier scores, DHU. */
  derive: 'derive',
  /** Schedulers: TNA risk scan, LC countdowns, PM due dates, certificate ladder. */
  schedule: 'schedule',
  /** The only bridge from committed transactions to the queues. */
  outboxRelay: 'outbox-relay',
  email: 'email',
  export: 'export',
} as const

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE]

const queues = new Map<QueueName, Queue>()

export function getQueue(name: QueueName): Queue {
  const existing = queues.get(name)
  if (existing) return existing

  const queue = new Queue(name, {
    connection: createQueueConnection(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 2_000 },
      // Keep a window of history for the admin runbook screen, not everything forever.
      removeOnComplete: { age: 24 * 3600, count: 1_000 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  })
  queues.set(name, queue)
  return queue
}

export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((queue) => queue.close()))
  queues.clear()
}
