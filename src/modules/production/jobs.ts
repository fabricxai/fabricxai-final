/**
 * Scheduled work for 6.1 (brief §Jobs).
 *
 * The partition roll-forward is the one that matters most and is easiest to forget: the
 * migration seeded twelve months ahead, and twelve months from now that window closes.
 * Rows would still land — the DEFAULT partition catches them, deliberately, because a
 * refused insert on a floor tablet is a lost hour of production — but they would stop
 * being pruned, and the board read would degrade quietly rather than break loudly.
 */
import { sql } from 'drizzle-orm'

import type { SystemCtx } from '../core/ctx'
import { notify } from '../core/notifications'
import { withTenantRead, withTenantTx } from '../core/tenancy'

import { closeDay } from './service'

/** Months kept ahead of today. A scheduler outage has to be survivable. */
const PARTITION_LOOKAHEAD_MONTHS = 12

/**
 * Keep the monthly window open.
 *
 * Company-agnostic — partitions are physical storage, not tenant data — but it runs under
 * a scoped ctx like every other job, and the function it calls is the narrow
 * SECURITY DEFINER one from migration 0019 that also applies RLS to each new partition.
 */
export async function ensureOutputPartitions(
  ctx: SystemCtx,
  input: { monthsAhead?: number } = {},
): Promise<{ ensured: number; inDefault: number }> {
  const months = input.monthsAhead ?? PARTITION_LOOKAHEAD_MONTHS

  return withTenantTx(ctx, async (tx) => {
    for (let i = 0; i <= months; i += 1) {
      await tx.execute(
        sql`select app.ensure_hourly_output_partition((date_trunc('month', now()) + (${i} || ' month')::interval)::date)`,
      )
    }

    // Rows in DEFAULT mean the window ran out at some point. Not a correctness problem —
    // the data is safe and queryable — but it stops being pruned, so it is worth saying.
    const result = await tx.execute<{ n: string }>(
      sql`select count(*)::text as n from only hourly_outputs_default`,
    )
    const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
    const inDefault = Number((rows[0] as { n: string } | undefined)?.n ?? 0)

    if (inDefault > 0) {
      await notify(ctx, {
        role: 'admin',
        kind: 'production.partitions.default_in_use',
        severity: 'warning',
        titleKey: 'production.notifications.partition_default.title',
        params: { rows: inDefault },
        moduleId: 'production',
        dedupeKey: `production.partition_default:${new Date().toISOString().slice(0, 7)}`,
      })
    }

    return { ensured: months + 1, inDefault }
  })
}

/** Day-close efficiency for yesterday, plus the owner digest trigger. */
export async function runDayClose(
  ctx: SystemCtx,
  input: { forDate?: string } = {},
): Promise<{ lines: number; forDate: string }> {
  const forDate =
    input.forDate ??
    new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)

  const result = await closeDay(ctx, { forDate })
  return { ...result, forDate }
}

/** Hourly WIP snapshot per order — cut / sewn / finished (brief §Jobs). */
export async function snapshotWip(ctx: SystemCtx): Promise<{ orders: number }> {
  return withTenantTx(ctx, async (tx) => {
    // Sewn comes from this module. Cut and finished belong to 5.1 and 8.1, which do not
    // exist yet — recorded as zero rather than guessed, so the gap is visible on the
    // dashboard instead of being papered over with a plausible number.
    const result = await tx.execute<{ n: string }>(sql`
      insert into wip_snapshots (company_id, order_id, taken_at, cut, sewn, finished)
      select h.company_id, h.order_id, now(), 0, sum(h.actual)::int, 0
      from hourly_outputs h
      where h.order_id is not null
      group by h.company_id, h.order_id
      returning 1`)

    const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
    return { orders: rows.length }
  })
}

export async function countOpenLines(ctx: SystemCtx): Promise<number> {
  const rows = await withTenantRead(ctx, (tx) =>
    tx.execute<{ n: string }>(sql`select count(*)::text as n from lines where is_active`),
  )
  const list = Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? [])
  return Number((list[0] as { n: string } | undefined)?.n ?? 0)
}
