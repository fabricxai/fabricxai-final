/**
 * 2.2 Bonded Warehouse & UD — service layer (brief §Operations).
 *
 * This module owns the UD balance gate, one of the five named server-side gates
 * (CLAUDE.md rule 8). Module 3.1 Store calls `drawUd` from inside its own issue
 * transaction; nothing else writes `ud_consumptions`.
 *
 * The concurrency requirement is explicit in architecture §9: "UD/BTB concurrent overdraw
 * attempt → row-lock inside the gate check transaction; second writer blocks then fails
 * the gate." Two storekeepers issuing the last of a bonded roll at the same moment must
 * not both succeed, and a check that reads the balance outside a lock would let them.
 */
import { and, eq, sql } from 'drizzle-orm'

import { recordChange, registerAuditedTables } from '../core/audit'
import type { AnyCtx, RequestCtx } from '../core/ctx'
import { AppError, notFound } from '../core/errors'
import { emit } from '../core/outbox'
import { type TenantDb, withTenantRead, withTenantTx } from '../core/tenancy'

import { COMMERCIAL_EVENTS } from './events'
import { udConsumptions, udReconciliations, uds } from './schema'
import {
  checkUdDraw,
  computeUdBalance,
  type UdAuthorizedItem,
  type UdDrawDecision,
  type UdItemBalance,
  type UdStatus,
  UdError,
} from './ud'
import { udAuthorizedItems } from './zod'

/** ⚖ — compliance-bearing; a customs inspector may ask who drew what, and when. */
registerAuditedTables('uds', 'ud_consumptions')

/** The factory's today. UD validity is a calendar question, in the factory's timezone. */
function todayInFactoryTz(timeZone = 'Asia/Dhaka'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Load a UD and its consumption ledger, optionally locking the UD row. */
async function loadUd(
  tx: TenantDb,
  udId: string,
  lock: boolean,
): Promise<{
  ud: { id: string; number: string; status: UdStatus; validUntil: string | null; authorizedItems: UdAuthorizedItem[] }
  consumptions: { itemRef: string; qty: string; unit: string }[]
}> {
  const query = tx.select().from(uds).where(eq(uds.id, udId))
  const [row] = lock ? await query.for('update') : await query

  if (!row) throw notFound('commercial.errors.ud_not_found', { udId })

  const parsed = udAuthorizedItems.safeParse(row.authorizedItems)
  if (!parsed.success) {
    // A declaration transcribed before a schema tightening, or hand-edited. Refuse rather
    // than compute a balance from data we cannot vouch for.
    throw new AppError('validation_failed', 'commercial.errors.ud_items_invalid', {
      udId,
      issues: parsed.error.issues.map((i) => i.message),
    })
  }

  const ledger = await tx
    .select({ itemRef: udConsumptions.itemRef, qty: udConsumptions.qty, unit: udConsumptions.unit })
    .from(udConsumptions)
    .where(eq(udConsumptions.udId, udId))

  return {
    ud: {
      id: row.id,
      number: row.number,
      status: row.status,
      validUntil: row.validUntil,
      authorizedItems: parsed.data,
    },
    consumptions: ledger,
  }
}

/**
 * Read-only preview of the gate — "could this issue go through?".
 *
 * The storekeeper's screen calls this to show the free balance before they commit to a
 * quantity. It takes NO lock, so its answer can be stale by the time they press save;
 * that is fine, because `drawUd` re-checks under a lock and is the only thing that
 * decides. A preview that locked would hold a row open for as long as someone stared at
 * a screen.
 */
export async function checkUdBalance(
  ctx: AnyCtx,
  input: { udId: string; itemRef: string; qty: string; unit: string; today?: string },
): Promise<UdDrawDecision> {
  return withTenantRead(ctx, async (tx) => {
    const { ud, consumptions } = await loadUd(tx, input.udId, false)
    return checkUdDraw({
      ud,
      consumptions,
      itemRef: input.itemRef,
      qty: input.qty,
      unit: input.unit,
      today: input.today ?? todayInFactoryTz(),
    })
  })
}

/** The whole ledger for one UD — the reconciliation and the balance screen both read it. */
export async function getUdBalance(
  ctx: AnyCtx,
  udId: string,
): Promise<{ udNumber: string; status: UdStatus; validUntil: string | null; items: UdItemBalance[] }> {
  return withTenantRead(ctx, async (tx) => {
    const { ud, consumptions } = await loadUd(tx, udId, false)
    const balance = computeUdBalance({ authorizedItems: ud.authorizedItems, consumptions })
    return {
      udNumber: ud.number,
      status: ud.status,
      validUntil: ud.validUntil,
      items: [...balance.values()],
    }
  })
}

export interface UdDrawInput {
  udId: string
  itemRef: string
  qty: string
  unit: string
  /** The issue this draw belongs to. Set by module 3.1. */
  storeIssueId?: string
  today?: string
  /**
   * Set ONLY by the approve path, when an owner has approved a deliberate overdraw
   * through pending_changes. Never settable from a request.
   */
  approvedOverride?: boolean
}

/**
 * Draw against a UD, inside the caller's transaction.
 *
 * Takes a `tx` rather than opening one: module 3.1 calls this from inside its store-issue
 * transaction, so the issue and the consumption commit together. A draw recorded without
 * its issue — or an issue without its draw — is a reconciliation that will not balance,
 * which is the one thing customs actually checks.
 *
 * `FOR UPDATE` on the UD row is the concurrency answer (architecture §9). Two
 * storekeepers issuing the last of a roll at the same moment serialise here: the second
 * blocks, then re-reads a ledger that already includes the first, and fails the gate.
 */
export async function drawUd(
  ctx: AnyCtx,
  tx: TenantDb,
  input: UdDrawInput,
): Promise<{ consumptionId: string; decision: UdDrawDecision }> {
  const { ud, consumptions } = await loadUd(tx, input.udId, true)

  const decision = checkUdDraw({
    ud,
    consumptions,
    itemRef: input.itemRef,
    qty: input.qty,
    unit: input.unit,
    today: input.today ?? todayInFactoryTz(),
  })

  if (!decision.allowed && !input.approvedOverride) {
    // Hard block. Overdrawing a UD is legal exposure, not a warning — the storekeeper
    // gets the numbers and, if the factory really means it, an owner approves an override
    // through pending_changes.
    throw new AppError('gate_blocked', decision.reasonKey ?? 'commercial.ud.blocked', {
      gate: 'ud_balance',
      ...decision.facts,
    })
  }

  const [row] = await tx
    .insert(udConsumptions)
    .values({
      companyId: ctx.companyId,
      udId: input.udId,
      storeIssueId: input.storeIssueId ?? null,
      itemRef: input.itemRef,
      qty: input.qty,
      unit: input.unit,
      overrideOf: input.approvedOverride && !decision.allowed ? input.udId : null,
      createdBy: ctx.userId,
    })
    .returning({ id: udConsumptions.id })

  if (!row) throw new Error('ud_consumptions insert returned nothing')

  await recordChange(ctx, tx, {
    action: 'insert',
    targetTable: 'ud_consumptions',
    targetId: row.id,
    after: {
      udNumber: ud.number,
      itemRef: input.itemRef,
      qty: input.qty,
      unit: input.unit,
      override: Boolean(input.approvedOverride && !decision.allowed),
    },
  })

  if (input.approvedOverride && !decision.allowed) {
    // An approved overdraw is the single most audit-worthy event in this module. It gets
    // its own event so the owner digest and the compliance file both see it.
    await emit(ctx, tx, {
      eventName: COMMERCIAL_EVENTS.udOverdrawn,
      payload: {
        udId: input.udId,
        udNumber: ud.number,
        itemRef: input.itemRef,
        qty: input.qty,
        shortfall: decision.shortfall ?? null,
        approvedBy: ctx.userId,
      },
      aggregateTable: 'uds',
      aggregateId: input.udId,
    })
  }

  // Exhausted is a real state: it stops the gate wasting a lock on a UD with nothing left.
  const remaining = computeUdBalance({
    authorizedItems: ud.authorizedItems,
    consumptions: [...consumptions, { itemRef: input.itemRef, qty: input.qty, unit: input.unit }],
  })
  const anyFree = [...remaining.values()].some((item) => Number.parseFloat(item.free) > 0)

  if (!anyFree && ud.status === 'active') {
    await tx.update(uds).set({ status: 'exhausted', updatedAt: new Date() }).where(eq(uds.id, ud.id))
    await emit(ctx, tx, {
      eventName: COMMERCIAL_EVENTS.udExhausted,
      payload: { udId: ud.id, udNumber: ud.number },
      aggregateTable: 'uds',
      aggregateId: ud.id,
    })
  }

  return { consumptionId: row.id, decision }
}

/** Convenience wrapper for callers that are not already inside a transaction. */
export async function drawUdStandalone(
  ctx: RequestCtx,
  input: UdDrawInput,
): Promise<{ consumptionId: string; decision: UdDrawDecision }> {
  return withTenantTx(ctx, (tx) => drawUd(ctx, tx, input))
}

/**
 * Freeze a period's balances and store the snapshot the customs PDF is rendered from.
 *
 * Snapshotted rather than recomputed at render time: a reconciliation submitted to
 * customs must produce the same figures if it is regenerated a year later, and a live
 * query would drift as the ledger grows.
 */
export async function snapshotReconciliation(
  ctx: RequestCtx,
  input: { udId: string; period: string },
): Promise<{ reconciliationId: string; items: UdItemBalance[] }> {
  if (!/^\d{4}-\d{2}$/.test(input.period)) {
    throw new AppError('validation_failed', 'commercial.errors.invalid_period', {
      period: input.period,
    })
  }

  return withTenantTx(ctx, async (tx) => {
    const { ud, consumptions } = await loadUd(tx, input.udId, true)
    const items = [...computeUdBalance({ authorizedItems: ud.authorizedItems, consumptions }).values()]

    const [row] = await tx
      .insert(udReconciliations)
      .values({
        companyId: ctx.companyId,
        udId: input.udId,
        period: input.period,
        snapshot: { udNumber: ud.number, generatedAt: new Date().toISOString(), items },
        createdBy: ctx.userId,
      })
      .onConflictDoNothing()
      .returning({ id: udReconciliations.id })

    if (!row) {
      throw new AppError('conflict', 'commercial.errors.reconciliation_exists', {
        udId: input.udId,
        period: input.period,
      })
    }

    return { reconciliationId: row.id, items }
  })
}

/** Mark UDs past their validity date. Used by the nightly job. */
export async function expireLapsedUds(
  ctx: AnyCtx,
  input: { today?: string } = {},
): Promise<{ expired: number }> {
  const today = input.today ?? todayInFactoryTz()

  return withTenantTx(ctx, async (tx) => {
    const lapsed = await tx
      .update(uds)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(and(eq(uds.status, 'active'), sql`${uds.validUntil} < ${today}`))
      .returning({ id: uds.id, number: uds.number })

    for (const ud of lapsed) {
      await emit(ctx, tx, {
        eventName: COMMERCIAL_EVENTS.udExpired,
        payload: { udId: ud.id, udNumber: ud.number, expiredOn: today },
        aggregateTable: 'uds',
        aggregateId: ud.id,
      })
    }

    return { expired: lapsed.length }
  })
}

export { UdError }
