'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { compareDecimalStrings, roundToScale, subtractDecimalStrings } from '@/lib/quantity'
import { InlineAlert } from '@/components/fx/feedback'
import { actionErrorMessage } from '@/lib/action-error'
import { Badge, Button } from '@/components/fx/primitives'
import { SectionHeading } from '@/components/fx/signature'
import { UdBlockCard, type UdBlock } from '@/components/fx/ud-block'
import { checkUdDraw, generateUdReconciliation } from '@/modules/commercial/actions'

interface ItemBalance {
  itemRef: string
  unit: string
  authorized: string
  consumed: string
  free: string
}

interface Draw {
  itemRef: string
  qty: string
  unit: string
  at: string
  wasOverride: boolean
}

interface Reconciliation {
  id: string
  period: string
  at: string
}

function monthOf(iso: string): string {
  return iso.slice(0, 7)
}

/**
 * One UD, from the commercial side.
 *
 * The trial draw is the part worth explaining. A storekeeper discovers a UD is short when
 * the floor is already waiting for cloth — the gate fires, nothing is written, and the day
 * stops. Letting commercial ask the same question a day earlier turns that into a
 * conversation instead of an outage, and it renders the SAME card the store will show, so
 * nobody has to translate between two descriptions of one refusal.
 *
 * It is explicitly not a reservation, and the copy says so. A check that quietly held
 * balance would be a second ledger nobody reconciles.
 */
export function UdDetailClient({
  udId,
  udNumber,
  status,
  validUntil,
  items,
  overdrawn,
  draws,
  reconciliations,
}: {
  udId: string
  udNumber: string
  status: string
  validUntil: string | null
  items: readonly ItemBalance[]
  overdrawn: number
  draws: readonly Draw[]
  reconciliations: readonly Reconciliation[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [itemRef, setItemRef] = useState(items[0]?.itemRef ?? '')
  const [qty, setQty] = useState('')
  const [block, setBlock] = useState<UdBlock | null>(null)
  const [clear, setClear] = useState<string | null>(null)
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7))
  const [noted, setNoted] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const item = items.find((i) => i.itemRef === itemRef)

  function check() {
    if (!item || !qty.trim()) return
    setBlock(null)
    setClear(null)
    setFailure(null)

    startTransition(async () => {
      try {
        const decision = await checkUdDraw({
          udId,
          itemRef,
          qty: qty.trim(),
          unit: item.unit,
        })

        if (decision.allowed) {
          setClear(
            `${qty} ${item.unit} of ${itemRef} would clear — ${decision.remainingAfter} ${item.unit} left afterwards.`,
          )
          return
        }

        setBlock({
          udId,
          udNumber,
          itemRef,
          unit: item.unit,
          qty: qty.trim(),
          authorized: decision.authorized,
          consumed: decision.consumed,
          free: decision.free,
          shortfall: decision.shortfall ?? null,
          reasonKey: decision.reasonKey ?? null,
        })
      } catch (error) {
        setFailure(actionErrorMessage(error, 'The check could not be run.'))
      }
    })
  }

  function generate() {
    setFailure(null)
    startTransition(async () => {
      try {
        await generateUdReconciliation({ udId, period })
        setNoted(`Statement frozen for ${period}.`)
        router.refresh()
      } catch (error) {
        setFailure(actionErrorMessage(error, 'The statement was not generated.'))
      }
    })
  }

  // Exact string sum — this is bonded balance, the number customs disputes. Addition is
  // spelled as a − (−b) because lib/quantity deliberately exports no unit-less add.
  const totalHeld = items.reduce(
    (sum, i) => subtractDecimalStrings(sum, i.free.startsWith('-') ? i.free.slice(1) : `-${i.free}`),
    '0.00',
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
      {overdrawn > 0 ? (
        <InlineAlert tone="danger">
          {overdrawn} authorised {overdrawn === 1 ? 'item is' : 'items are'} overdrawn. That is
          duty owed and a penalty exposure — it does not resolve itself, and customs will find
          it at reconciliation.
        </InlineAlert>
      ) : null}

      {validUntil && status === 'active' && compareDecimalStrings(totalHeld, '0') > 0 ? (
        <InlineAlert tone="info">
          Validity ends {validUntil} with {roundToScale(totalHeld)} still unused. Balance left on a
          lapsed UD is duty-free material the factory can no longer legally issue.
        </InlineAlert>
      ) : null}

      {/* ── Balances ─────────────────────────────────────────────────────── */}
      <section>
        <SectionHeading eyebrow="authorised · consumed · balance">
          What this declaration covers
        </SectionHeading>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
            <thead>
              <tr>
                {['Item · HS code', 'Authorised', 'Released', 'Balance'].map((h) => (
                  <th key={h} style={{ ...headCell, textAlign: h.startsWith('Item') ? 'left' : 'right' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const overdrawnItem = compareDecimalStrings(i.free, '0') < 0
                return (
                  <tr key={i.itemRef}>
                    <td style={{ ...bodyCell, font: "400 13.5px/1.3 var(--fx-font-sans)" }}>
                      {i.itemRef}
                    </td>
                    <td style={{ ...bodyCell, textAlign: 'right' }}>
                      {i.authorized} {i.unit}
                    </td>
                    <td style={{ ...bodyCell, textAlign: 'right' }}>
                      {i.consumed} {i.unit}
                    </td>
                    <td
                      style={{
                        ...bodyCell,
                        textAlign: 'right',
                        color: overdrawnItem ? 'var(--fx-danger)' : 'var(--fx-text-primary)',
                        fontWeight: 600,
                      }}
                    >
                      {i.free} {i.unit}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Trial draw ───────────────────────────────────────────────────── */}
      <section>
        <SectionHeading eyebrow="before the floor is waiting on it">
          Would this issue clear?
        </SectionHeading>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: '1 1 220px' }}>
            <span style={{ font: "500 13px/1.3 var(--fx-font-sans)" }}>Item</span>
            <select
              value={itemRef}
              onChange={(e) => setItemRef(e.target.value)}
              style={control}
            >
              {items.map((i) => (
                <option key={i.itemRef} value={i.itemRef}>
                  {i.itemRef}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: '0 1 180px' }}>
            <span style={{ font: "500 13px/1.3 var(--fx-font-sans)" }}>
              Quantity {item ? `(${item.unit})` : ''}
            </span>
            <input
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              style={control}
            />
          </label>

          <Button variant="secondary" disabled={!qty.trim() || pending} onClick={check}>
            {pending ? 'Checking…' : 'Check'}
          </Button>
        </div>

        <p
          style={{
            marginTop: 10,
            marginBottom: 0,
            font: "400 12px/1.6 var(--fx-font-mono)",
            color: 'var(--fx-text-tertiary)',
          }}
        >
          A check holds nothing. The gate runs again inside the issue itself, so two people
          can both be told yes and the second still be refused — the balance is only real at
          the moment of the draw.
        </p>

        {clear ? (
          <div style={{ marginTop: 14 }}>
            <InlineAlert tone="success">{clear}</InlineAlert>
          </div>
        ) : null}

        {block ? (
          <div style={{ marginTop: 14 }}>
            <UdBlockCard block={block} onRequested={() => router.refresh()} />
          </div>
        ) : null}
      </section>

      {/* ── Reconciliation ───────────────────────────────────────────────── */}
      <section>
        <SectionHeading eyebrow="frozen, so it reproduces a year later">
          Reconciliation statement
        </SectionHeading>

        {noted ? <InlineAlert tone="success">{noted}</InlineAlert> : null}
        {failure ? <InlineAlert tone="danger">{failure}</InlineAlert> : null}

        <div
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            marginBottom: 14,
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '0 1 200px' }}>
            <span style={{ font: "500 13px/1.3 var(--fx-font-sans)" }}>Period</span>
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              style={control}
            />
          </label>
          <Button variant="primary" disabled={pending} onClick={generate}>
            Generate the statement
          </Button>
          <span
            style={{
              font: "400 12px/1.5 var(--fx-font-mono)",
              color: 'var(--fx-text-tertiary)',
              flex: '1 1 240px',
            }}
          >
            total balance held in bond ·{' '}
            <span data-numeric>{roundToScale(totalHeld)}</span>
          </span>
        </div>

        {reconciliations.length === 0 ? (
          <span
            style={{ font: "400 12.5px/1.4 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}
          >
            no statement has been frozen for this declaration yet
          </span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {reconciliations.map((r) => (
              <div
                key={r.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '10px 16px',
                  background: 'var(--fx-bg-surface)',
                  border: '1px solid var(--fx-border-subtle)',
                  font: "400 13px/1.4 var(--fx-font-sans)",
                }}
              >
                <span style={{ font: "600 13.5px/1 var(--fx-font-mono)" }}>{r.period}</span>
                <span
                  style={{
                    font: "400 12px/1 var(--fx-font-mono)",
                    color: 'var(--fx-text-tertiary)',
                  }}
                >
                  frozen {monthOf(r.at)}
                </span>
                <Badge tone="neutral">snapshot</Badge>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Draws ────────────────────────────────────────────────────────── */}
      {draws.length > 0 ? (
        <section>
          <SectionHeading eyebrow={`${draws.length} against this declaration`}>
            What has been released
          </SectionHeading>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {draws.slice(0, 12).map((d, i) => (
              <div
                key={`${d.itemRef}-${d.at}-${i}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  flexWrap: 'wrap',
                  padding: '10px 16px',
                  background: 'var(--fx-bg-surface)',
                  border: '1px solid var(--fx-border-subtle)',
                  borderLeft: d.wasOverride ? '3px solid var(--fx-warning)' : undefined,
                  font: "400 13px/1.4 var(--fx-font-sans)",
                }}
              >
                <span style={{ font: "400 12px/1 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
                  {d.at.slice(0, 10)}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>{d.itemRef}</span>
                <span data-numeric data-mono>
                  {d.qty} {d.unit}
                </span>
                {d.wasOverride ? <Badge tone="warning">approved overdraw</Badge> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

const headCell: React.CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid var(--fx-border-default)',
  font: "400 10.5px/1 var(--fx-font-mono)",
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  color: 'var(--fx-text-tertiary)',
  whiteSpace: 'nowrap',
}

const bodyCell: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid var(--fx-border-subtle)',
  font: "400 13px/1.3 var(--fx-font-mono)",
  whiteSpace: 'nowrap',
}

const control: React.CSSProperties = {
  minHeight: 44,
  minWidth: 0,
  padding: '10px 12px',
  border: '1px solid var(--fx-border-default)',
  borderRadius: 'var(--fx-radius-sm)',
  background: 'var(--fx-bg-surface)',
  color: 'var(--fx-text-primary)',
  font: "400 14px/1.4 var(--fx-font-sans)",
}
