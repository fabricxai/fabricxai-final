/**
 * Read models for the UD Workbench.
 *
 * A Utilization Declaration is the customs document that lets a factory import
 * fabric duty-free against a specific export order. Every bonded issue draws
 * down a UD, and drawing more than was authorised is not an inventory error —
 * it is legal exposure, which is why the gate hard-blocks rather than warns.
 *
 * So this screen exists to answer one question before anybody gets there:
 * how much is genuinely left, per item, on each live declaration.
 */
import { desc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'

import type { AnyCtx } from '@/modules/core/ctx'
import { readJsonbArray } from '@/modules/core/jsonb'
import { withTenantRead } from '@/modules/core/tenancy'

import { udConsumptions, uds } from './schema'
import { computeUdBalance } from './ud'
import type { UdItemBalance } from './ud'

/**
 * `uds.authorized_items` — what customs actually permitted, per item.
 *
 * Parsed at the boundary because a declaration written by an older extractor
 * version is the realistic case, and a line that silently vanished would show
 * MORE free balance than customs allowed. That failure direction is the one
 * that matters.
 */
const authorizedItem = z.object({
  itemRef: z.string().min(1),
  qty: z.union([z.string(), z.number()]).transform(String),
  unit: z.string().min(1),
})

export type UdStatus = 'active' | 'exhausted' | 'expired' | 'closed'

export interface UdCard {
  id: string
  number: string
  status: UdStatus
  issueDate: string | null
  validUntil: string | null
  /** Null when there is no validity date on the declaration. */
  daysToExpiry: number | null
  items: UdItemBalance[]
  /** Authorised lines that would not parse — the balances below are incomplete. */
  unreadableItems: number
  /**
   * Set when the balance could not be computed at all.
   *
   * `computeUdBalance` refuses a ledger where a draw exists against an item the
   * declaration does not authorise — correctly, because that is a real
   * inconsistency. Dropping an unparseable authorised line CREATES exactly that
   * shape, so a single drifted line would otherwise take the whole workbench
   * down. The declaration is reported as unreadable instead; the issue gate
   * still hard-blocks under its own lock, which is the protection that matters.
   */
  balanceError: string | null
  /** Items with nothing left. Not an error, but nothing more can be issued against them. */
  exhaustedItems: number
}

function daysUntil(dateIso: string, now: Date): number {
  const target = new Date(`${dateIso}T00:00:00Z`).getTime()
  const today = new Date(now.toISOString().slice(0, 10) + 'T00:00:00Z').getTime()
  return Math.round((target - today) / 86_400_000)
}

export async function udRegister(ctx: AnyCtx, input: { now: Date }): Promise<UdCard[]> {
  return withTenantRead(ctx, async (tx) => {
    const rows = await tx.select().from(uds).orderBy(desc(uds.issueDate)).limit(100)
    if (rows.length === 0) return []

    const draws = await tx
      .select()
      .from(udConsumptions)
      .where(
        inArray(
          udConsumptions.udId,
          rows.map((r) => r.id),
        ),
      )

    return rows.map((ud): UdCard => {
      const authorized = readJsonbArray(authorizedItem, ud.authorizedItems, 'uds.authorized_items')
      const mine = draws.filter((d) => d.udId === ud.id)

      // The same computation the gate uses — a workbench that computed its own
      // balance would eventually disagree with the thing that blocks the issue.
      let items: UdItemBalance[] = []
      let balanceError: string | null = null
      try {
        items = [...computeUdBalance({ authorizedItems: authorized.items, consumptions: mine }).values()]
      } catch (error) {
        balanceError = error instanceof Error ? error.message : 'balance could not be computed'
      }

      return {
        balanceError,
        id: ud.id,
        number: ud.number,
        status: ud.status as UdStatus,
        issueDate: ud.issueDate,
        validUntil: ud.validUntil,
        daysToExpiry: ud.validUntil ? daysUntil(ud.validUntil, input.now) : null,
        items,
        unreadableItems: authorized.unreadable,
        exhaustedItems: items.filter((i) => Number.parseFloat(i.free) <= 0).length,
      }
    })
  })
}

/** Draws against one declaration, newest first — the audit trail customs asks for. */
export async function udDraws(
  ctx: AnyCtx,
  udId: string,
): Promise<{ itemRef: string; qty: string; unit: string; createdAt: Date; overrideOf: string | null }[]> {
  return withTenantRead(ctx, (tx) =>
    tx
      .select({
        itemRef: udConsumptions.itemRef,
        qty: udConsumptions.qty,
        unit: udConsumptions.unit,
        createdAt: udConsumptions.createdAt,
        overrideOf: udConsumptions.overrideOf,
      })
      .from(udConsumptions)
      .where(eq(udConsumptions.udId, udId))
      .orderBy(desc(udConsumptions.createdAt))
      .limit(200),
  )
}
