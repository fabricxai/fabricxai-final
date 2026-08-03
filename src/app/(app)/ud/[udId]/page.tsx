import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { desc, eq } from 'drizzle-orm'

import { compareDecimalStrings } from '@/lib/quantity'

import { Breadcrumbs } from '@/components/fx/data'
import { PageHeader } from '@/components/shell/page-shell'
import { getCtx } from '@/modules/core/session'
import { withTenantRead } from '@/modules/core/tenancy'
import { udReconciliations } from '@/modules/commercial/schema'
import { getUdBalance } from '@/modules/commercial/service'
import { udDraws } from '@/modules/commercial/ud-queries'

import { UdDetailClient } from './ud-detail-client'

/**
 * 2.2 UD workbench · one declaration (canvas P3).
 *
 * A Utilization Declaration is the customs undertaking that let this fabric into the country
 * duty-free. Everything on this screen exists because of one fact: the balance is a legal
 * position, not an inventory convenience. Drawing past it is duty owed plus a penalty, and
 * the factory finds out at an audit rather than at the moment it happens.
 *
 * So the screen does three things — shows the balance per authorised item, lets somebody
 * check an issue BEFORE the floor is blocked by it, and freezes a period into the statement
 * that goes to customs.
 */
export const dynamic = 'force-dynamic'

export default async function UdDetailPage({
  params,
}: {
  params: Promise<{ udId: string }>
}) {
  const ctx = await getCtx(await headers())
  if (!ctx) redirect('/login')

  const { udId } = await params

  const balance = await getUdBalance(ctx, udId).catch(() => null)
  if (!balance) notFound()

  const [draws, reconciliations] = await Promise.all([
    udDraws(ctx, udId),
    withTenantRead(ctx, (tx) =>
      tx
        .select({
          id: udReconciliations.id,
          period: udReconciliations.period,
          createdAt: udReconciliations.createdAt,
        })
        .from(udReconciliations)
        .where(eq(udReconciliations.udId, udId))
        .orderBy(desc(udReconciliations.period)),
    ),
  ])

  const overdrawn = balance.items.filter((i) => compareDecimalStrings(i.free, '0') < 0)

  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <Breadcrumbs
          trail={[{ label: 'UD workbench', href: '/ud' }, { label: balance.udNumber }]}
        />
      </div>

      <PageHeader
        eyebrow="Commercial · bonded warehouse"
        title={balance.udNumber}
        meta={
          balance.validUntil
            ? `${balance.status} · valid to ${balance.validUntil}`
            : String(balance.status)
        }
        ownsAmber
      />

      <UdDetailClient
        udId={udId}
        udNumber={balance.udNumber}
        status={String(balance.status)}
        validUntil={balance.validUntil}
        items={balance.items}
        overdrawn={overdrawn.length}
        draws={draws.map((d) => ({
          itemRef: d.itemRef,
          qty: d.qty,
          unit: d.unit,
          at: d.createdAt.toISOString(),
          wasOverride: d.overrideOf !== null,
        }))}
        reconciliations={reconciliations.map((r) => ({
          id: r.id,
          period: r.period,
          at: r.createdAt.toISOString(),
        }))}
      />
    </>
  )
}
