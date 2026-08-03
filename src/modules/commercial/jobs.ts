/**
 * Scheduled work for module 2 (brief 2.2 §Jobs: balance/expiry alerts, monthly
 * reconciliation reminder).
 *
 * Company-scoped and idempotent, like every derived job: the scheduler fans out per
 * tenant and each run is safe to repeat.
 */
import { eq, sql } from 'drizzle-orm'

import { compareDecimalStrings, multiplyDecimalStrings } from '@/lib/quantity'

import type { SystemCtx } from '../core/ctx'
import { notify } from '../core/notifications'
import { withTenantRead } from '../core/tenancy'

import { uds } from './schema'
import { expireLapsedUds } from './service'
import { computeUdBalance } from './ud'
import { udAuthorizedItems } from './zod'

/** Days ahead at which a UD's validity date starts being someone's problem. */
const EXPIRY_WARNING_DAYS = [30, 14, 7] as const

/** Warn when less than this share of an item's authorisation is left. */
const LOW_BALANCE_THRESHOLD = 0.1

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Expire lapsed declarations, then warn on the ones about to lapse and the ones running
 * out of balance.
 *
 * Expiry runs first: a UD that lapsed last night should be reported as expired, not
 * warned about as "7 days remaining".
 */
export async function runUdAlerts(
  ctx: SystemCtx,
  input: { today?: string } = {},
): Promise<{ expired: number; expiringSoon: number; lowBalance: number }> {
  const today =
    input.today ??
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Dhaka',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())

  const { expired } = await expireLapsedUds(ctx, { today })

  const live = await withTenantRead(ctx, (tx) =>
    tx.select().from(uds).where(eq(uds.status, 'active')),
  )

  let expiringSoon = 0
  let lowBalance = 0

  for (const ud of live) {
    if (ud.validUntil) {
      // The tightest threshold still ahead — three simultaneous warnings for one date is
      // noise, and the nearest one is the actionable number.
      const threshold = EXPIRY_WARNING_DAYS.find(
        (days) => ud.validUntil! <= addDays(today, days) && ud.validUntil! >= today,
      )

      if (threshold !== undefined) {
        expiringSoon += 1
        await notify(ctx, {
          role: 'commercial',
          kind: 'commercial.ud.expiring',
          severity: threshold <= 7 ? 'critical' : 'warning',
          titleKey: 'commercial.notifications.ud_expiring.title',
          params: { udNumber: ud.number, validUntil: ud.validUntil, daysLeft: threshold },
          moduleId: 'commercial',
          entityTable: 'uds',
          entityId: ud.id,
          // Threshold in the key: crossing 14 → 7 is a new alert, not a duplicate.
          dedupeKey: `ud.expiring:${ud.id}:${threshold}`,
        })
      }
    }

    const parsed = udAuthorizedItems.safeParse(ud.authorizedItems)
    if (!parsed.success) continue

    const consumptions = await withTenantRead(ctx, async (tx) => {
      const rows = await tx.execute<{ item_ref: string; qty: string; unit: string }>(
        sql`select item_ref, qty, unit from ud_consumptions where ud_id = ${ud.id}`,
      )
      const list = Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? [])
      return (list as { item_ref: string; qty: string; unit: string }[]).map((r) => ({
        itemRef: r.item_ref,
        qty: r.qty,
        unit: r.unit,
      }))
    })

    const balance = computeUdBalance({ authorizedItems: parsed.data, consumptions })

    for (const item of balance.values()) {
      // Same exact arithmetic as the gate: warn when free ≤ authorized × threshold.
      // A float ratio here would let two 15-digit balances answer from the rounding.
      if (
        compareDecimalStrings(item.authorized, '0') <= 0 ||
        compareDecimalStrings(
          item.free,
          multiplyDecimalStrings(item.authorized, String(LOW_BALANCE_THRESHOLD)),
        ) > 0
      )
        continue

      lowBalance += 1
      await notify(ctx, {
        role: 'store',
        kind: 'commercial.ud.low_balance',
        severity: 'warning',
        titleKey: 'commercial.notifications.ud_low_balance.title',
        params: { udNumber: ud.number, itemRef: item.itemRef, free: item.free, unit: item.unit },
        moduleId: 'commercial',
        entityTable: 'uds',
        entityId: ud.id,
        dedupeKey: `ud.low_balance:${ud.id}:${item.itemRef}`,
      })
    }
  }

  return { expired, expiringSoon, lowBalance }
}

/** Monthly nudge to file the customs reconciliation for the period just closed. */
export async function runReconciliationReminder(
  ctx: SystemCtx,
  input: { period: string },
): Promise<{ reminded: number }> {
  const live = await withTenantRead(ctx, (tx) =>
    tx.select().from(uds).where(eq(uds.status, 'active')),
  )

  for (const ud of live) {
    await notify(ctx, {
      role: 'commercial',
      kind: 'commercial.ud.reconciliation_due',
      severity: 'info',
      titleKey: 'commercial.notifications.ud_reconciliation_due.title',
      params: { udNumber: ud.number, period: input.period },
      moduleId: 'commercial',
      entityTable: 'uds',
      entityId: ud.id,
      dedupeKey: `ud.reconciliation:${ud.id}:${input.period}`,
    })
  }

  return { reminded: live.length }
}
