import { NextResponse } from 'next/server'
import { z } from 'zod'

import { isAppError } from '@/modules/core/errors'
import { MAX_BATCH_ROWS, syncBatch } from '@/modules/core/offline-sync'
import { getCtx } from '@/modules/core/session'

// Registered HERE, not only in instrumentation. The registry is a module-level
// Map, and the bundler gives a route handler its own module graph — so a
// registration that ran at boot is not necessarily the same Map this file sees.
// Importing the barrel is idempotent, and it is the only way to be certain the
// handlers exist in the graph that actually serves the request.
import '@/modules/registry'

/**
 * The offline batch endpoint — the ONE door every floor-facing write goes
 * through (CLAUDE.md rule 7): store, cutting, production, sampling, QC inline.
 *
 * A route rather than a server action on purpose. A tablet that lost the
 * network needs to replay a queue it saved to IndexedDB, possibly hours later
 * and possibly more than once; that is an ordinary HTTP POST it can retry, not
 * an RPC tied to a React render. The device also needs the per-row results back
 * to reconcile its own queue, which a fire-and-forget action would not give it.
 *
 * Idempotency is the server's job, not the device's: every row carries a
 * device-generated `offlineKey`, and a replay returns the ORIGINAL result.
 */
export const dynamic = 'force-dynamic'

const syncRow = z.object({
  offlineKey: z.string().min(1).max(200),
  moduleId: z.string().min(1).max(64),
  operation: z.string().min(1).max(64),
  payload: z.record(z.string(), z.unknown()),
  /** Device clock at capture. The server keeps its own timestamps but records this. */
  clientRecordedAt: z.string().datetime().optional(),
})

const syncRequest = z.object({
  rows: z.array(syncRow).min(1).max(MAX_BATCH_ROWS),
})

export async function POST(request: Request) {
  const ctx = await getCtx(request.headers)
  if (!ctx) {
    return NextResponse.json({ error: { code: 'unauthenticated' } }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: { code: 'invalid_json' } }, { status: 400 })
  }

  const parsed = syncRequest.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'validation_failed',
          // The device needs to know WHICH row it cannot send, or it will retry
          // the whole batch forever.
          issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      },
      { status: 400 },
    )
  }

  try {
    const results = await syncBatch(ctx, parsed.data.rows)

    // 200 even when individual rows were rejected: the BATCH was accepted, and
    // each row carries its own verdict. A non-2xx here would make the device
    // replay rows the server has already decided about.
    return NextResponse.json({ results })
  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json(
        { error: { code: error.code, messageKey: error.messageKey, details: error.details } },
        { status: error.code === 'validation_failed' ? 400 : 409 },
      )
    }
    throw error
  }
}
