/**
 * Offline batch sync (architecture §3, dev-plan §2.2.6).
 *
 * ONE endpoint for every floor-facing write — store, cutting, production, sampling, QC
 * inline. A tablet on a bad network queues locally and replays the whole batch when it
 * reconnects, sometimes more than once. Each logical write carries a device-generated
 * `offlineKey`; the unique index on `offline_keys` turns a replay into a no-op that
 * returns the ORIGINAL result, so the device reconciles against what actually landed.
 *
 * Two decisions worth stating:
 *
 * 1. **Rows succeed or fail independently.** One bad row in a batch of fifty must not
 *    discard the other forty-nine — the operator has gone home and the data is on a
 *    device that may not come back. Each row gets its own transaction and its own result.
 *
 * 2. **A rejected row is remembered as rejected.** Replaying it returns the same
 *    rejection rather than trying again, so a permanently-invalid row cannot loop
 *    forever, and the device can show the operator exactly what was refused.
 */
import { and, eq } from 'drizzle-orm'

import { offlineKeys } from '@/db/schema/core'

import type { AnyCtx } from './ctx'
import { AppError, isAppError } from './errors'
import { withTenantTx } from './tenancy'

export interface SyncRow {
  /** Device-generated idempotency key. Stable across replays of the same logical write. */
  offlineKey: string
  moduleId: string
  operation: string
  payload: Record<string, unknown>
  /** Device clock at capture; the server keeps its own timestamps but records this. */
  clientRecordedAt?: string
}

export type SyncRowResult =
  | { offlineKey: string; status: 'applied'; rowId: string }
  | { offlineKey: string; status: 'duplicate'; rowId: string | null }
  | {
      offlineKey: string
      status: 'rejected'
      errorKey: string
      details?: Record<string, unknown>
    }

/**
 * A module's handler for one offline operation. Receives the caller's already-scoped
 * transaction so its write, the `offline_keys` row, and any outbox event all commit
 * together — that atomicity is what makes the idempotency claim true.
 *
 * It gets the whole ROW, not just the payload: the `offlineKey` and the device's own
 * timestamp belong on the business record too. A storekeeper reconciling a tablet against
 * the system looks at the issue, not at an internal ledger table, so the key has to be
 * visible where they are looking.
 */
export type SyncHandler = (
  ctx: AnyCtx,
  tx: Parameters<Parameters<typeof withTenantTx>[1]>[0],
  row: SyncRow,
) => Promise<{ rowId: string }>

const handlers = new Map<string, SyncHandler>()

const handlerKey = (moduleId: string, operation: string) => `${moduleId}:${operation}`

/** Registered from each module's `register.ts`. Nothing else is syncable. */
export function registerSyncHandler(
  moduleId: string,
  operation: string,
  handler: SyncHandler,
): void {
  const key = handlerKey(moduleId, operation)
  if (handlers.has(key)) throw new Error(`sync handler "${key}" is already registered`)
  handlers.set(key, handler)
}

export const listSyncHandlers = (): readonly string[] => [...handlers.keys()]
/** Test-only: the map is module-global, so suites must be able to reset it. */
export const __resetSyncHandlers = (): void => handlers.clear()

/** Bounded so one device cannot post an unbounded batch. Fifty lines is a real shift. */
export const MAX_BATCH_ROWS = 200

export async function syncBatch(
  ctx: AnyCtx,
  rows: readonly SyncRow[],
): Promise<SyncRowResult[]> {
  if (rows.length > MAX_BATCH_ROWS) {
    throw new AppError('validation_failed', 'errors.sync_batch_too_large', {
      rows: rows.length,
      max: MAX_BATCH_ROWS,
    })
  }

  const results: SyncRowResult[] = []
  for (const row of rows) {
    results.push(await applyRow(ctx, row))
  }
  return results
}

async function applyRow(ctx: AnyCtx, row: SyncRow): Promise<SyncRowResult> {
  const handler = handlers.get(handlerKey(row.moduleId, row.operation))

  if (!handler) {
    return {
      offlineKey: row.offlineKey,
      status: 'rejected',
      errorKey: 'errors.sync_operation_unknown',
      details: { moduleId: row.moduleId, operation: row.operation },
    }
  }

  try {
    return await withTenantTx(ctx, async (tx): Promise<SyncRowResult> => {
      // Claim the key FIRST. If this insert conflicts, the write already happened — on a
      // previous request, or on a concurrent one from the same device holding the row
      // lock. Either way we must not run the handler again.
      const claimed = await tx
        .insert(offlineKeys)
        .values({
          companyId: ctx.companyId,
          offlineKey: row.offlineKey,
          moduleId: row.moduleId,
          operation: row.operation,
          status: 'applied',
          clientRecordedAt: row.clientRecordedAt ? new Date(row.clientRecordedAt) : null,
        })
        .onConflictDoNothing()
        .returning({ id: offlineKeys.id })

      if (claimed.length === 0) {
        const [existing] = await tx
          .select()
          .from(offlineKeys)
          .where(
            and(
              eq(offlineKeys.companyId, ctx.companyId),
              eq(offlineKeys.offlineKey, row.offlineKey),
            ),
          )

        // A previously rejected row stays rejected — replaying it must not retry it.
        if (existing?.status === 'rejected') {
          return {
            offlineKey: row.offlineKey,
            status: 'rejected',
            errorKey: String(existing.error?.messageKey ?? 'errors.sync_rejected'),
            details: existing.error ?? undefined,
          }
        }

        return {
          offlineKey: row.offlineKey,
          status: 'duplicate',
          rowId: existing?.resultRowId ?? null,
        }
      }

      const { rowId } = await handler(ctx, tx, row)

      await tx
        .update(offlineKeys)
        .set({ resultRowId: rowId })
        .where(eq(offlineKeys.id, claimed[0]!.id))

      return { offlineKey: row.offlineKey, status: 'applied', rowId }
    })
  } catch (error) {
    // The handler threw, so its transaction rolled back — including the key claim. Record
    // the rejection in its OWN transaction so the device gets a stable answer on replay
    // instead of retrying a write that will never succeed.
    const appError = isAppError(error)
      ? error
      : new AppError('internal', 'errors.sync_failed', {}, String(error))

    await withTenantTx(ctx, (tx) =>
      tx
        .insert(offlineKeys)
        .values({
          companyId: ctx.companyId,
          offlineKey: row.offlineKey,
          moduleId: row.moduleId,
          operation: row.operation,
          status: 'rejected',
          error: appError.toJSON(),
          clientRecordedAt: row.clientRecordedAt ? new Date(row.clientRecordedAt) : null,
        })
        .onConflictDoNothing(),
    )

    return {
      offlineKey: row.offlineKey,
      status: 'rejected',
      errorKey: appError.messageKey,
      details: appError.details,
    }
  }
}
