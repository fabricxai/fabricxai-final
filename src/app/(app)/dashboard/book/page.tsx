import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { EmptyState } from '@/components/fx/feedback'
import { FigureTile } from '@/components/fx/figures'
import { Ident } from '@/components/fx/format'
import { StatusChip } from '@/components/fx/status-chip'
import { RouteHeader } from '@/components/shell/route-header'
import { getCtx } from '@/modules/core/session'
import { orderList, type OrderHealth } from '@/modules/orders/queries'
import { money, sum } from '@/lib/money'
import { requestLocale } from '@/lib/ui-locale'
import { milestoneLabel } from '@/components/fx/tna'

/**
 * Oversight — the book at the owner's altitude.
 *
 * The same data as the merchandiser's order desk, told differently: biggest
 * exposure first, the value in large type, and one plain sentence on why a row is
 * not fine. No editing anywhere — this screen only tells. The figures are the
 * merchandiser's own, unchanged; an owner's view that recomputed anything would
 * eventually disagree with the desk, and then two people argue about dashboards
 * instead of orders.
 */
export const dynamic = 'force-dynamic'

const SELVAGE: Record<OrderHealth, 'on-track' | 'at-risk' | 'late' | 'done'> = {
  ok: 'on-track',
  risk: 'at-risk',
  late: 'late',
  done: 'done',
}

const WORD: Record<OrderHealth, string> = {
  ok: 'on track',
  risk: 'at risk',
  late: 'late',
  done: 'closed',
}

export default async function OwnerBookPage() {
  const ctx = await getCtx(await headers())
  if (!ctx) redirect('/login')

  const locale = await requestLocale()
  const rows = await orderList(ctx, { now: new Date() })
  const open = rows.filter((r) => r.health !== 'done')

  /*
   * Money summed per currency with lib/money (rule 4); the biggest bucket leads.
   * A mixed book never adds currencies — the basis says what was excluded.
   */
  const byCurrency = new Map<string, { total: ReturnType<typeof money>; count: number }>()
  const atRiskByCurrency = new Map<string, ReturnType<typeof money>>()
  for (const row of open) {
    if (!row.totalValue) continue
    const value = money(row.totalValue, row.currency)
    const held = byCurrency.get(row.currency)
    byCurrency.set(row.currency, {
      total: held ? sum([held.total, value]) : value,
      count: (held?.count ?? 0) + 1,
    })
    if (row.health === 'late' || row.health === 'risk') {
      const heldRisk = atRiskByCurrency.get(row.currency)
      atRiskByCurrency.set(row.currency, heldRisk ? sum([heldRisk, value]) : value)
    }
  }
  const lead = [...byCurrency.entries()].sort((a, b) => b[1].count - a[1].count)[0] ?? null
  const leadRisk = lead ? atRiskByCurrency.get(lead[0]) : undefined

  const sorted = [...open].sort((a, b) => {
    const av = a.totalValue && a.currency === (lead?.[0] ?? a.currency) ? a.totalValue : '0'
    const bv = b.totalValue && b.currency === (lead?.[0] ?? b.currency) ? b.totalValue : '0'
    // Decimal strings of equal scale compare numerically by padded length + lexicographic.
    return bv.length !== av.length ? bv.length - av.length : bv.localeCompare(av)
  })

  const why = (row: (typeof rows)[number]): string => {
    if (row.health === 'ok') return ''
    if (row.headline) {
      return `${row.health === 'late' ? 'Late' : 'At risk'} — ${milestoneLabel(row.headline, locale)}.`
    }
    return row.health === 'late' ? 'A milestone is late.' : 'A milestone is at risk.'
  }

  return (
    <>
      <RouteHeader
        path="/dashboard/book"
        locale={locale}
        eyebrow="Oversight · read-only"
        title="Where the money is"
        meta={`${open.length} open order${open.length === 1 ? '' : 's'} · at order value`}
        ownsAmber
      />

      {open.length === 0 ? (
        <EmptyState title="The book is empty" body="Orders appear here the moment the desk books them." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 14,
            }}
          >
            <FigureTile
              label="Open book"
              figure={lead ? { value: lead[1].total.amount } : { unavailable: 'no order carries a value' }}
              unit={lead?.[0]}
              basis={
                lead && byCurrency.size > 1
                  ? `${lead[1].count} orders in ${lead[0]} — others excluded`
                  : `${open.length} open order${open.length === 1 ? '' : 's'}`
              }
            />
            <FigureTile
              label="At risk or late"
              figure={
                leadRisk
                  ? { value: leadRisk.amount }
                  : { value: '0.00' }
              }
              unit={lead?.[0]}
              basis={`${open.filter((r) => r.health !== 'ok').length} of ${open.length} orders`}
              tone={leadRisk ? 'danger' : 'neutral'}
            />
          </div>

          <div
            style={{
              background: 'var(--fx-bg-surface)',
              border: '1px solid var(--fx-border-subtle)',
              borderRadius: 'var(--fx-radius-md)',
              overflow: 'hidden',
            }}
          >
            {sorted.map((row, i) => (
              <div
                key={row.id}
                className="fx-selvage"
                data-status={SELVAGE[row.health]}
                style={{ borderTop: i === 0 ? undefined : '1px solid var(--fx-border-subtle)' }}
              >
                <div
                  style={{
                    flex: 1,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1.6fr 1fr 1.6fr',
                    gap: 16,
                    alignItems: 'center',
                    padding: '18px 18px 18px 15px',
                  }}
                >
                  <Ident>{row.poNumbers[0] ?? row.id.slice(0, 8)}</Ident>
                  <span style={{ font: '500 15px/1.2 var(--fx-font-sans)' }}>
                    {row.buyerName ?? '—'}
                  </span>
                  <div>
                    <div
                      data-numeric
                      style={{
                        font: '600 22px/1.1 var(--fx-font-sans)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {row.totalValue ?? '—'}
                      {row.totalValue ? (
                        <span
                          style={{
                            font: '400 13px/1 var(--fx-font-mono)',
                            color: 'var(--fx-text-tertiary)',
                            marginLeft: 6,
                          }}
                        >
                          {row.currency}
                        </span>
                      ) : null}
                    </div>
                    <div
                      style={{
                        font: '400 12px/1.4 var(--fx-font-mono)',
                        color: 'var(--fx-text-tertiary)',
                      }}
                    >
                      {row.styleCode ?? ''} {row.plannedExFactoryDate ? `· ex-factory ${row.plannedExFactoryDate}` : ''}
                    </div>
                  </div>
                  <div>
                    <StatusChip status={SELVAGE[row.health]}>{WORD[row.health]}</StatusChip>
                  </div>
                  <span
                    style={{
                      font: '400 13.5px/1.45 var(--fx-font-sans)',
                      color: 'var(--fx-text-secondary)',
                    }}
                  >
                    {why(row)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <span style={{ font: '400 12px/1.5 var(--fx-font-mono)', color: 'var(--fx-text-tertiary)' }}>
            the same data the desk works from, told at the height an owner reads from — nothing
            here edits
          </span>
        </div>
      )}
    </>
  )
}
