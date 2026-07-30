/**
 * The exceptions-feed refresher (11.2).
 *
 * This lives in the worker rather than in `modules/analytics`, and that is not an accident
 * of layout. CLAUDE.md rule 9 makes the analytics module read-only and the
 * `analytics-no-writes` lint rule enforces it; the brief nonetheless wants the feed
 * "materialized, refreshed by jobs". Putting the derivation here — beside the outbox relay
 * and the other derivations — satisfies both, and keeps the guarantee that nothing which
 * READS across every module's data is also able to write to any of it.
 *
 * ## What the refresh has to get right
 *
 * **`since` survives.** It is the whole reason the feed is persisted. An LC conflict open for
 * nine days is a different problem from one that appeared this morning, and recomputing the
 * timestamp on every run would erase that distinction every five minutes.
 *
 * **Something that clears is RESOLVED, not deleted.** The row stays with `resolved_at` set.
 * A feed that forgets cannot answer "how long was that open", which is the question asked
 * after it goes wrong.
 *
 * **Only the kinds actually scanned are touched.** `runrate_miss` and `payroll_anomaly` have
 * no source wired yet (docs/STUBS.md, and `FEED_COVERAGE` says so on every read). If this
 * job resolved every row it did not see, it would silently clear kinds it never looked at —
 * so it resolves within the scanned kinds only.
 */
import { and, eq, inArray, isNull, lte, notInArray, sql } from 'drizzle-orm'

import { pendingChanges } from '@/db/schema/core'
import { FEED_COVERAGE } from '@/modules/analytics/queries'
import { exceptionsFeed } from '@/modules/analytics/schema'
import { exceptionSeverity, type ExceptionKind } from '@/modules/analytics/analytics'
import { lcs } from '@/modules/commercial/schema'
import { caps, findings } from '@/modules/compliance/schema'
import type { AnyCtx } from '@/modules/core/ctx'
import { withTenantTx } from '@/modules/core/tenancy'
import { tnaMilestones } from '@/modules/orders/schema'

/** One thing that is currently wrong. */
interface Sighting {
  kind: ExceptionKind
  ref: string
  detail: Record<string, unknown>
}

const SCANNED_KINDS = (Object.keys(FEED_COVERAGE) as ExceptionKind[]).filter(
  (kind) => FEED_COVERAGE[kind],
)

export interface RefreshResult {
  seen: number
  opened: number
  resolved: number
  kinds: ExceptionKind[]
}

/**
 * Rebuild one company's exceptions feed.
 *
 * Runs in a single transaction so a dashboard never reads a half-refreshed feed — which
 * would show an exception as resolved a moment before the same run re-opened it.
 */
export async function refreshExceptionsFeed(ctx: AnyCtx, today: string): Promise<RefreshResult> {
  return withTenantTx(ctx, async (tx) => {
    const sightings: Sighting[] = []

    // ── lc_conflict: the LC can no longer be shipped against ──
    const lapsedLcs = await tx
      .select({ id: lcs.id, number: lcs.number, latestShipmentDate: lcs.latestShipmentDate })
      .from(lcs)
      .where(
        and(
          eq(lcs.status, 'active'),
          sql`${lcs.latestShipmentDate} is not null`,
          lte(lcs.latestShipmentDate, today),
        ),
      )

    for (const lc of lapsedLcs) {
      sightings.push({
        kind: 'lc_conflict',
        ref: lc.id,
        detail: { lcNumber: lc.number, latestShipmentDate: lc.latestShipmentDate },
      })
    }

    // ── tna_risk: a milestone the nightly scan already marked ──
    const slipping = await tx
      .select({
        id: tnaMilestones.id,
        orderId: tnaMilestones.orderId,
        name: tnaMilestones.name,
        plannedDate: tnaMilestones.plannedDate,
        status: tnaMilestones.status,
      })
      .from(tnaMilestones)
      .where(inArray(tnaMilestones.status, ['at_risk', 'late']))

    for (const milestone of slipping) {
      sightings.push({
        kind: 'tna_risk',
        ref: milestone.id,
        detail: {
          orderId: milestone.orderId,
          milestone: milestone.name,
          plannedDate: milestone.plannedDate,
          status: milestone.status,
        },
      })
    }

    // ── cap_critical: a critical finding not yet closed ──
    const criticalCaps = await tx
      .select({ id: caps.id, findingId: caps.findingId, deadline: caps.deadline, status: caps.status })
      .from(caps)
      .innerJoin(findings, eq(findings.id, caps.findingId))
      .where(and(eq(findings.severity, 'critical'), sql`${caps.status} <> 'closed'`))

    for (const cap of criticalCaps) {
      sightings.push({
        kind: 'cap_critical',
        ref: cap.id,
        detail: { findingId: cap.findingId, deadline: cap.deadline, status: cap.status },
      })
    }

    // ── approval_waiting: a draft nobody has looked at ──
    const waiting = await tx
      .select({ id: pendingChanges.id, moduleId: pendingChanges.moduleId, targetTable: pendingChanges.targetTable })
      .from(pendingChanges)
      .where(eq(pendingChanges.status, 'pending'))

    for (const draft of waiting) {
      sightings.push({
        kind: 'approval_waiting',
        ref: draft.id,
        detail: { moduleId: draft.moduleId, targetTable: draft.targetTable },
      })
    }

    // ── write ──
    const now = new Date()
    let opened = 0

    for (const sighting of sightings) {
      const [existing] = await tx
        .select({ id: exceptionsFeed.id, since: exceptionsFeed.since })
        .from(exceptionsFeed)
        .where(and(eq(exceptionsFeed.kind, sighting.kind), eq(exceptionsFeed.ref, sighting.ref)))

      // Age is measured from when it was FIRST seen, not from this run.
      const since = existing?.since ?? now
      const ageDays = Math.floor((now.getTime() - since.getTime()) / 86_400_000)
      const severity = exceptionSeverity({ kind: sighting.kind, ageDays })

      if (existing) {
        await tx
          .update(exceptionsFeed)
          .set({
            detail: sighting.detail,
            severity,
            lastSeenAt: now,
            // It is back, or it never left. Either way it is open again.
            resolvedAt: null,
          })
          .where(eq(exceptionsFeed.id, existing.id))
      } else {
        opened += 1
        await tx.insert(exceptionsFeed).values({
          companyId: ctx.companyId,
          kind: sighting.kind,
          ref: sighting.ref,
          detail: sighting.detail,
          since: now,
          severity,
          lastSeenAt: now,
        })
      }
    }

    // ── resolve what cleared, WITHIN the kinds actually scanned ──
    //
    // Scoping to `SCANNED_KINDS` is what stops this job quietly clearing the two kinds it
    // has no source for. A blanket "resolve everything not seen" would report a payroll
    // anomaly as fixed on the strength of never having looked.
    const seenRefs = sightings.map((sighting) => sighting.ref)

    const cleared = await tx
      .update(exceptionsFeed)
      .set({ resolvedAt: now })
      .where(
        and(
          inArray(exceptionsFeed.kind, SCANNED_KINDS),
          isNull(exceptionsFeed.resolvedAt),
          seenRefs.length > 0 ? notInArray(exceptionsFeed.ref, seenRefs) : sql`true`,
        ),
      )
      .returning({ id: exceptionsFeed.id })

    return {
      seen: sightings.length,
      opened,
      resolved: cleared.length,
      kinds: SCANNED_KINDS,
    }
  })
}
