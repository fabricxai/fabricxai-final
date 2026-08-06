import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { compareDecimalStrings } from '@/lib/quantity'
import { EmptyState, InlineAlert, LockedState } from '@/components/fx/feedback'
import { FloorScreen } from '@/components/fx/floor'
import { Badge } from '@/components/fx/primitives'
import { SectionHeading } from '@/components/fx/signature'
import { Ident } from '@/components/fx/format'
import { PageHeader } from '@/components/shell/page-shell'
import { canSee, canWrite, NAV } from '@/components/shell/nav'
import { getCtx } from '@/modules/core/session'
import { udRegister, type UdCard } from '@/modules/commercial/ud-queries'
import { companyProfile } from '@/modules/settings/service'

import { NewUdButton } from './new-ud'

/**
 * 2.2 UD Workbench [WOVEN].
 *
 * A Utilization Declaration is the customs document that lets a factory import
 * fabric duty-free against a specific export order. Overdrawing one is legal
 * exposure rather than an inventory discrepancy, which is why the issue gate
 * hard-blocks — and why this screen's job is to make the remaining balance
 * visible before anybody reaches that gate.
 *
 * Woven units only: knit units buy fabric outright, and a composite unit draws
 * against yarn in kilos rather than fabric in yards.
 */
export const dynamic = 'force-dynamic'

export default async function UdPage() {
  const ctx = await getCtx(await headers())
  if (!ctx) redirect('/login')

  const profile = await companyProfile(ctx)
  const factoryType = profile?.factoryType ?? 'woven'
  const item = NAV.find((n) => n.id === 'ud')!

  if (!canSee(item, ctx.roles, factoryType)) {
    return <LockedState what="the UD workbench" />
  }

  const cards = await udRegister(ctx, { now: new Date() })

  const expiringSoon = cards.filter(
    (c) => c.status === 'active' && c.daysToExpiry !== null && c.daysToExpiry <= 30,
  )
  const incomplete = cards.filter((c) => c.unreadableItems > 0)
  const mayWrite = canWrite(item, ctx.roles, factoryType)

  return (
    <FloorScreen>
      <PageHeader
        eyebrow="UD workbench"
        title={cards.length === 0 ? 'No declarations' : `${cards.length} declarations`}
        meta={expiringSoon.length > 0 ? `${expiringSoon.length} expiring` : undefined}
        ownsAmber
        actions={mayWrite ? <NewUdButton /> : undefined}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {/* A dropped authorised line leaves draws against an item the ledger no
            longer authorises, which `computeUdBalance` refuses outright — so the
            declaration reports no balance at all rather than a wrong one. */}
        {incomplete.length > 0 ? (
          <InlineAlert tone="danger">
            {incomplete.length} {incomplete.length === 1 ? 'declaration has' : 'declarations have'}{' '}
            authorised lines that could not be read. Treat their remaining quantities as unknown
            rather than as what is shown.
          </InlineAlert>
        ) : null}

        {cards.length === 0 ? (
          <EmptyState
            title="No declarations on file"
            body="A UD authorises specific quantities of specific items to come in duty-free against an export order. Bonded receipts and issues both draw against one."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {cards.map((ud) => (
              <UdPanel key={ud.id} ud={ud} />
            ))}
          </div>
        )}

        <SectionHeading eyebrow="why this blocks rather than warns">The rule</SectionHeading>
        <div
          style={{
            background: 'var(--fx-bg-surface)',
            border: '1px solid var(--fx-border-subtle)',
            borderRadius: 'var(--fx-radius-md)',
            padding: '18px 22px',
            font: "400 15px/1.6 var(--fx-font-sans)",
            color: 'var(--fx-text-secondary)',
            textWrap: 'pretty',
          }}
        >
          Issuing more of an item than its declaration authorised is a customs matter, not a
          stock adjustment. The gate re-checks under a lock at the moment of issue, so the
          balance on this screen is a guide — it can be stale by the time somebody presses
          save, and the lock is what actually decides.
        </div>
      </div>
    </FloorScreen>
  )
}

function UdPanel({ ud }: { ud: UdCard }) {
  const expiring = ud.status === 'active' && ud.daysToExpiry !== null && ud.daysToExpiry <= 30
  const expired = ud.daysToExpiry !== null && ud.daysToExpiry < 0

  return (
    <div
      className="fx-selvage"
      data-status={expired ? 'late' : expiring ? 'at-risk' : ud.status === 'active' ? 'on-track' : 'done'}
      data-critical={expired || undefined}
      style={{
        background: 'var(--fx-bg-surface)',
        border: '1px solid var(--fx-border-subtle)',
        borderRadius: 'var(--fx-radius-md)',
        boxShadow: 'var(--fx-sh1)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            padding: '16px 22px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flexWrap: 'wrap',
            borderBottom: '1px solid var(--fx-border-subtle)',
          }}
        >
          <Link
            href={`/ud/${ud.id}`}
            style={{ textDecoration: 'none', color: 'inherit' }}
            aria-label={`Open ${ud.number}`}
          >
            <Ident size={15}>{ud.number}</Ident>
          </Link>
          <Badge tone={ud.status === 'active' ? 'success' : 'neutral'}>{ud.status}</Badge>
          {ud.exhaustedItems > 0 ? (
            <Badge tone="warning">{ud.exhaustedItems} exhausted</Badge>
          ) : null}
          <span
            data-numeric
            data-mono
            style={{
              marginLeft: 'auto',
              font: "400 13px/1.3 var(--fx-font-mono)",
              color: expired ? 'var(--fx-danger)' : expiring ? 'var(--fx-warning)' : 'var(--fx-text-tertiary)',
            }}
          >
            {ud.validUntil
              ? expired
                ? `expired ${Math.abs(ud.daysToExpiry!)} d ago`
                : `valid to ${ud.validUntil} · ${ud.daysToExpiry} d`
              : 'no validity date'}
          </span>
        </div>

        {ud.balanceError ? (
          <div
            style={{
              padding: '16px 22px',
              font: "400 14px/1.55 var(--fx-font-sans)",
              color: 'var(--fx-danger)',
              textWrap: 'pretty',
            }}
          >
            This declaration&rsquo;s balance could not be computed — {ud.balanceError}. Treat the
            remaining quantity as unknown; the issue gate still checks it under a lock.
          </div>
        ) : ud.items.length === 0 ? (
          <div
            style={{
              padding: '16px 22px',
              font: "400 14px/1.5 var(--fx-font-sans)",
              color: 'var(--fx-text-tertiary)',
            }}
          >
            No authorised items could be read on this declaration.
          </div>
        ) : (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr 1fr',
                gap: 12,
                padding: '10px 22px',
                background: 'var(--fx-bg-sunken)',
                font: "500 12px/1 var(--fx-font-mono)",
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                color: 'var(--fx-text-tertiary)',
              }}
            >
              <div>Item</div>
              <div style={{ textAlign: 'right' }}>Authorised</div>
              <div style={{ textAlign: 'right' }}>Drawn</div>
              <div style={{ textAlign: 'right' }}>Left</div>
            </div>

            {ud.items.map((item) => {
              const none = compareDecimalStrings(item.free, '0') <= 0

              return (
                <div
                  key={item.itemRef}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 1fr 1fr',
                    gap: 12,
                    padding: '13px 22px',
                    borderTop: '1px solid var(--fx-border-subtle)',
                    alignItems: 'center',
                    minHeight: 'var(--fx-row-height)',
                  }}
                >
                  <span style={{ font: "500 15px/1.3 var(--fx-font-sans)" }}>{item.itemRef}</span>
                  <Num value={item.authorized} unit={item.unit} tone="secondary" />
                  <Num value={item.consumed} unit={item.unit} tone="tertiary" />
                  <Num
                    value={item.free}
                    unit={item.unit}
                    tone={none ? 'danger' : 'primary'}
                    strong
                  />
                </div>
              )
            })}
          </>
        )}

        {ud.unreadableItems > 0 ? (
          <div
            style={{
              padding: '11px 22px',
              borderTop: '1px solid var(--fx-border-subtle)',
              font: "400 13px/1.4 var(--fx-font-mono)",
              color: 'var(--fx-danger)',
            }}
          >
            {ud.unreadableItems} authorised{' '}
            {ud.unreadableItems === 1 ? 'line' : 'lines'} could not be read — this balance is
            incomplete
          </div>
        ) : null}
      </div>
    </div>
  )
}

function Num({
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
        font: `${strong ? 600 : 400} ${strong ? 16 : 14}px/1.2 var(--fx-font-mono)`,
        color: tone === 'danger' ? 'var(--fx-danger)' : `var(--fx-text-${tone})`,
        textAlign: 'right',
      }}
    >
      {value}
      <span style={{ color: 'var(--fx-text-tertiary)', fontSize: 12, marginLeft: 4 }}>{unit}</span>
    </span>
  )
}
