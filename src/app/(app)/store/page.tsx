import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { EmptyState, InlineAlert } from '@/components/fx/feedback'
import { FloorScreen } from '@/components/fx/floor'
import { Badge } from '@/components/fx/primitives'
import { SectionHeading } from '@/components/fx/signature'
import { Ident } from '@/components/fx/format'
import { PageHeader } from '@/components/shell/page-shell'
import { getCtx } from '@/modules/core/session'
import { recentGrns, stockOnHand } from '@/modules/store/queries'

/**
 * 3.1 Store.
 *
 * A floor screen, and the one place the difference between ON HAND and FREE
 * matters most: on-hand includes stock already promised to another order, and
 * issuing against it is how two cutting tables are sent the same roll.
 */
export const dynamic = 'force-dynamic'

export default async function StorePage() {
  const ctx = await getCtx(await headers())
  if (!ctx) redirect('/login')

  const [stock, grns] = await Promise.all([stockOnHand(ctx), recentGrns(ctx)])

  const overReserved = stock.filter((s) => s.overReserved)
  const bondedWithoutUd = grns.filter((g) => g.bonded && !g.udId)

  return (
    <FloorScreen>
      <PageHeader
        eyebrow="Store"
        title={stock.length === 0 ? 'Nothing in stock' : `${stock.length} items in stock`}
        meta={overReserved.length > 0 ? `${overReserved.length} over-reserved` : undefined}
        ownsAmber
      />

      {/* The store is four screens, not one: the count, the rolls behind it, what the
          floor is owed, and what arrived. A storekeeper moves between them all shift. */}
      <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(
          [
            { href: '/store/rolls', label: 'Rolls & lots' },
            { href: '/store/issue', label: 'Issue to production' },
            { href: '/store/receive', label: 'Receive goods' },
          ] as const
        ).map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: 44,
              padding: '10px 14px',
              borderRadius: 'var(--fx-radius-md)',
              border: '1px solid var(--fx-border-default)',
              font: "500 13px/1 var(--fx-font-sans)",
              color: 'var(--fx-text-secondary)',
              textDecoration: 'none',
            }}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        {/* A bonded receipt without a UD is legal exposure, not a data quality
            nit — the schema requires the pairing, so this should be empty. */}
        {bondedWithoutUd.length > 0 ? (
          <InlineAlert tone="danger">
            {bondedWithoutUd.length} bonded {bondedWithoutUd.length === 1 ? 'receipt has' : 'receipts have'}{' '}
            no UD against them. Duty-free fabric must be drawn against a declaration.
          </InlineAlert>
        ) : null}

        {overReserved.length > 0 ? (
          <InlineAlert tone="warning">
            {overReserved.length} {overReserved.length === 1 ? 'item is' : 'items are'} promised to
            more orders than exist in the store. The shortage is real — better found here than at
            the cutting table.
          </InlineAlert>
        ) : null}

        <section>
          <SectionHeading>Stock</SectionHeading>

          {stock.length === 0 ? (
            <EmptyState
              title="The store is empty"
              body="Stock arrives as a GRN against a supplier challan. Bonded fabric is received against a UD, and the two are recorded together."
            />
          ) : (
            <div
              style={{
                background: 'var(--fx-bg-surface)',
                border: '1px solid var(--fx-border-subtle)',
                borderRadius: 'var(--fx-radius-md)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 2fr .8fr .9fr .9fr .9fr',
                  gap: 12,
                  padding: '12px 20px',
                  background: 'var(--fx-bg-sunken)',
                  font: "500 12px/1 var(--fx-font-mono)",
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  color: 'var(--fx-text-tertiary)',
                }}
              >
                <div>Code</div>
                <div>Item</div>
                <div>Rolls</div>
                <div style={{ textAlign: 'right' }}>On hand</div>
                <div style={{ textAlign: 'right' }}>Reserved</div>
                <div style={{ textAlign: 'right' }}>Free</div>
              </div>

              {stock.map((row) => (
                <div
                  key={row.itemId}
                  className={row.overReserved ? 'fx-selvage' : undefined}
                  data-status={row.overReserved ? 'late' : undefined}
                  style={{ borderTop: '1px solid var(--fx-border-subtle)' }}
                >
                  <div
                    style={{
                      flex: 1,
                      display: 'grid',
                      gridTemplateColumns: '1fr 2fr .8fr .9fr .9fr .9fr',
                      gap: 12,
                      padding: '14px 20px',
                      alignItems: 'center',
                      minHeight: 'var(--fx-row-height)',
                    }}
                  >
                    <Ident size={14}>{row.code}</Ident>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                      <span style={{ font: "500 16px/1.3 var(--fx-font-sans)" }}>{row.name}</span>
                      <span
                        style={{ font: "400 13px/1.3 var(--fx-font-sans)", color: 'var(--fx-text-tertiary)' }}
                      >
                        {row.spec ?? row.kind}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span data-numeric style={{ font: "400 15px/1.2 var(--fx-font-mono)" }}>
                        {row.rollCount}
                      </span>
                      {/* Dye lots are not interchangeable — two shade groups in
                          one item is a decision somebody has to make, not a total. */}
                      {row.shadeGroups.length > 1 ? (
                        <span
                          style={{ font: "400 12px/1.3 var(--fx-font-mono)", color: 'var(--fx-warning)' }}
                        >
                          {row.shadeGroups.length} shades
                        </span>
                      ) : null}
                    </div>

                    <Qty value={row.onHand} unit={row.unit} tone="secondary" />
                    <Qty value={row.reserved} unit={row.unit} tone="tertiary" />
                    <Qty
                      value={row.free}
                      unit={row.unit}
                      tone={row.overReserved ? 'danger' : 'primary'}
                      strong
                    />
                  </div>
                </div>
              ))}

              <div
                style={{
                  padding: '12px 20px',
                  borderTop: '1px solid var(--fx-border-subtle)',
                  font: "400 13px/1.4 var(--fx-font-mono)",
                  color: 'var(--fx-text-tertiary)',
                }}
              >
                free = on hand − reserved · issue against free, never against on hand
              </div>
            </div>
          )}
        </section>

        <section>
          <SectionHeading eyebrow={`${grns.length} recent`}>Goods received</SectionHeading>

          {grns.length === 0 ? (
            <div
              style={{
                background: 'var(--fx-bg-surface)',
                border: '1px solid var(--fx-border-subtle)',
                borderRadius: 'var(--fx-radius-md)',
                padding: 24,
                font: "400 15px/1.55 var(--fx-font-sans)",
                color: 'var(--fx-text-secondary)',
              }}
            >
              No receipts yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {grns.map((g) => (
                <div
                  key={g.id}
                  style={{
                    background: 'var(--fx-bg-surface)',
                    border: '1px solid var(--fx-border-subtle)',
                    borderRadius: 'var(--fx-radius-md)',
                    padding: '14px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    flexWrap: 'wrap',
                    minHeight: 'var(--fx-row-height)',
                  }}
                >
                  <Ident size={14}>{g.challanNo}</Ident>
                  <span
                    data-numeric
                    style={{ font: "400 14px/1.3 var(--fx-font-mono)", color: 'var(--fx-text-secondary)' }}
                  >
                    {g.receivedAt}
                  </span>
                  {g.bonded ? (
                    <Badge tone={g.udId ? 'info' : 'danger'}>
                      {g.udId ? 'bonded · UD drawn' : 'bonded · NO UD'}
                    </Badge>
                  ) : (
                    <Badge>general</Badge>
                  )}
                  <Badge tone={g.inspectionStatus === 'passed' ? 'success' : 'neutral'}>
                    {g.inspectionStatus}
                  </Badge>
                  {/* Shows the storekeeper their tablet's record actually landed. */}
                  {g.offlineKey ? (
                    <span
                      style={{
                        marginLeft: 'auto',
                        font: "400 12px/1.3 var(--fx-font-mono)",
                        color: 'var(--fx-text-tertiary)',
                      }}
                    >
                      entered on a device
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </FloorScreen>
  )
}

function Qty({
  value,
  unit,
  tone,
  strong,
}: {
  value: string
  unit: string
  tone: 'primary' | 'secondary' | 'tertiary' | 'danger'
  strong?: boolean
}) {
  return (
    <span
      data-numeric
      data-mono
      style={{
        font: `${strong ? 600 : 400} ${strong ? 17 : 15}px/1.2 var(--fx-font-mono)`,
        color: tone === 'danger' ? 'var(--fx-danger)' : `var(--fx-text-${tone})`,
        textAlign: 'right',
      }}
    >
      {value}
      <span style={{ color: 'var(--fx-text-tertiary)', fontSize: 12, marginLeft: 4 }}>{unit}</span>
    </span>
  )
}
