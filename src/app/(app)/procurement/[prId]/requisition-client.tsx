'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { InlineAlert } from '@/components/fx/feedback'
import { actionErrorMessage } from '@/lib/action-error'
import { Badge, Button } from '@/components/fx/primitives'
import { SectionHeading } from '@/components/fx/signature'
import { issuePurchaseOrder } from '@/modules/procurement/actions'
import type { QuoteComparison } from '@/modules/procurement/procurement'

interface Supplier {
  id: string
  code: string
  name: string
  origin: string
  currency: string
}

interface Btb {
  id: string
  number: string
  value: string
  currency: string
  masterNumber: string
}

interface Line {
  itemId: string
  itemName: string
  qty: string
  unit: string
  comparison: QuoteComparison | null
  /** Why the comparison could not be computed, when it could not. */
  problem: string | null
}

/**
 * Choosing a supplier, and issuing the PO.
 *
 * **Cheapest is highlighted, never pre-selected.** The canvas is explicit about this and it
 * is worth honouring literally: the ranking knows landed cost, and nothing else. It does not
 * know that the mill two rows down has never sent a short roll, or that the cheapest one
 * disputed a claim last season. Pre-selecting would turn a judgement into a default, and
 * defaults are what people accept when they are busy.
 *
 * **Infeasible quotes are listed apart, greyed, unselectable.** A quote arriving after the
 * fabric is needed is not a worse option — ranking it last is how it eventually gets picked.
 */
export function RequisitionClient({
  prId,
  prNo,
  lines,
  rate,
  suppliers,
  btbs,
}: {
  prId: string
  prNo: string
  lines: readonly Line[]
  rate: string | null
  suppliers: readonly Supplier[]
  btbs: readonly Btb[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [chosen, setChosen] = useState<Record<string, string>>({})
  const [btbId, setBtbId] = useState(btbs[0]?.id ?? '')
  const [poNumber, setPoNumber] = useState(`PO-${prNo.replace(/^PR-/, '')}`)
  const [fxRate, setFxRate] = useState(rate ?? '0.0083')
  const [noted, setNoted] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const supplierOf = (id: string) => suppliers.find((s) => s.id === id) ?? null

  // Every line must be answered before a PO exists — a PO missing a line is a second PO
  // somebody has to remember to raise.
  const answered = lines.every((l) => chosen[l.itemId])
  const firstChoice = lines[0] ? chosen[lines[0].itemId] : undefined
  const supplier = firstChoice ? supplierOf(firstChoice) : null
  const needsBtb = supplier?.origin === 'import'

  function issue() {
    if (!supplier || !answered) return
    setFailure(null)

    startTransition(async () => {
      try {
        const result = await issuePurchaseOrder({
          supplierId: supplier.id,
          purchaseRequisitionId: prId,
          poNumber: poNumber.trim(),
          currency: supplier.currency,
          ...(needsBtb && btbId ? { btbLcId: btbId } : {}),
          lines: lines.map((l) => {
            const ranked = l.comparison?.ranked.find(
              (r) => r.supplierId === chosen[l.itemId],
            )
            return {
              itemId: l.itemId,
              qty: ranked?.chargedQty ?? l.qty,
              unit: l.unit,
              // The quoted landed unit cost, not the headline price — it is what the
              // comparison ranked on and what the PO commits to.
              unitPrice: ranked?.landedUnitCost ?? '0.00',
            }
          }),
        })
        setNoted(
          `PO ${poNumber.trim()} issued — ${result.totalValue} ${result.currency} to ${supplier.name}.`,
        )
        router.refresh()
      } catch (error) {
        setFailure(actionErrorMessage(error, 'The PO was not issued.'))
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
      {noted ? <InlineAlert tone="success">{noted}</InlineAlert> : null}
      {failure ? <InlineAlert tone="danger">{failure}</InlineAlert> : null}

      {/* ── Comparison per line ──────────────────────────────────────────── */}
      {lines.map((line) => (
        <section key={line.itemId}>
          <SectionHeading eyebrow={`${line.qty} ${line.unit} · ranked on landed cost`}>
            {line.itemName}
          </SectionHeading>

          {line.problem ? (
            <InlineAlert tone="warning">
              {line.problem} — quotes come in the currency each supplier works in, and a
              comparison across two of them is only a decision once somebody states the rate
              it was made at.
            </InlineAlert>
          ) : !line.comparison || line.comparison.ranked.length === 0 ? (
            <InlineAlert tone="info">
              No usable quote for this item yet. Record one before a PO can be raised.
            </InlineAlert>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {line.comparison.ranked.map((quote, index) => {
                const s = supplierOf(quote.supplierId)
                const picked = chosen[line.itemId] === quote.supplierId
                const cheapest = index === 0
                return (
                  <button
                    className="fx-stack-tablet"
                    key={quote.quoteId}
                    onClick={() =>
                      setChosen((c) => ({ ...c, [line.itemId]: quote.supplierId }))
                    }
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) 130px 120px 130px 110px',
                      gap: 14,
                      alignItems: 'center',
                      textAlign: 'left',
                      padding: '13px 16px',
                      background: 'var(--fx-bg-surface)',
                      border: `1px solid ${picked ? 'var(--fx-text-primary)' : 'var(--fx-border-subtle)'}`,
                      // Highlighted, not chosen — see the file note.
                      borderLeft: cheapest ? '3px solid var(--fx-accent)' : undefined,
                      cursor: 'pointer',
                      color: 'var(--fx-text-primary)',
                    }}
                  >
                    <span style={{ minWidth: 0 }}>
                      <span style={{ font: "600 14px/1.2 var(--fx-font-sans)" }}>
                        {s?.name ?? quote.supplierId.slice(0, 8)}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          marginTop: 3,
                          font: "400 11.5px/1.3 var(--fx-font-mono)",
                          color: 'var(--fx-text-tertiary)',
                        }}
                      >
                        {s?.origin === 'import' ? 'import · needs a BTB' : 'local'} · arrives{' '}
                        {quote.arrivesOn}
                      </span>
                    </span>

                    <span style={cell}>
                      {quote.landedUnitCost} {quote.currency}
                      <span style={sub}>landed / {line.unit}</span>
                    </span>
                    <span style={cell}>
                      {quote.dutyValue}
                      <span style={sub}>duty</span>
                    </span>
                    <span style={cell}>
                      {quote.landedTotal}
                      <span style={sub}>landed total</span>
                    </span>
                    <span style={{ textAlign: 'right' }}>
                      {cheapest ? <Badge tone="warning">cheapest landed</Badge> : null}
                      {picked ? <Badge tone="success">chosen</Badge> : null}
                    </span>
                  </button>
                )
              })}

              {line.comparison.infeasible.length > 0 ? (
                <div
                  style={{
                    marginTop: 10,
                    padding: '12px 16px',
                    border: '1px dashed var(--fx-border-default)',
                    background: 'transparent',
                  }}
                >
                  <div
                    style={{
                      font: "400 10.5px/1 var(--fx-font-mono)",
                      letterSpacing: '.06em',
                      textTransform: 'uppercase',
                      color: 'var(--fx-text-tertiary)',
                      marginBottom: 8,
                    }}
                  >
                    Cannot arrive in time
                  </div>
                  {line.comparison.infeasible.map((q) => (
                    <div
                      key={q.quoteId}
                      style={{
                        font: "400 12.5px/1.6 var(--fx-font-mono)",
                        color: 'var(--fx-text-tertiary)',
                      }}
                    >
                      arrives {q.arrivesOn} — after it is needed. Not ranked, because a list
                      that puts it last is a list somebody picks from the bottom.
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </section>
      ))}

      {/* ── The rate the comparison was made at ──────────────────────────── */}
      <section>
        <SectionHeading eyebrow="stated, never fetched silently">
          Exchange rate · BDT to USD
        </SectionHeading>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '0 1 180px' }}>
            <span style={fieldLabel}>1 BDT in USD</span>
            <input
              inputMode="decimal"
              value={fxRate}
              onChange={(e) => setFxRate(e.target.value)}
              style={control}
            />
          </label>
          <Button
            variant="secondary"
            disabled={!fxRate.trim()}
            onClick={() => router.push(`/procurement/${prId}?rate=${encodeURIComponent(fxRate.trim())}`)}
          >
            Compare at this rate
          </Button>
          <span
            style={{
              font: "400 12px/1.6 var(--fx-font-mono)",
              color: 'var(--fx-text-tertiary)',
              flex: '1 1 260px',
            }}
          >
            The rate travels with the comparison so the decision can be reconstructed later.
            A rate fetched at render time makes last month&rsquo;s choice unexplainable.
          </span>
        </div>
      </section>

      {/* ── Issue ────────────────────────────────────────────────────────── */}
      <section>
        <SectionHeading eyebrow="lines from the selected quote">Issue the PO</SectionHeading>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '0 1 220px' }}>
            <span style={fieldLabel}>PO number</span>
            <input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} style={control} />
          </label>

          {needsBtb ? (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 280px' }}>
              <span style={fieldLabel}>Back-to-back credit</span>
              <select value={btbId} onChange={(e) => setBtbId(e.target.value)} style={control}>
                {btbs.length === 0 ? <option value="">no active BTB</option> : null}
                {btbs.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.number} · {b.value} {b.currency} · under {b.masterNumber}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <Button variant="primary" size="lg" disabled={!answered || pending} onClick={issue}>
            {pending ? 'Issuing…' : 'Issue the purchase order'}
          </Button>
        </div>

        <p
          style={{
            marginTop: 12,
            marginBottom: 0,
            font: "400 12px/1.6 var(--fx-font-mono)",
            color: 'var(--fx-text-tertiary)',
          }}
        >
          {!answered
            ? 'choose a supplier for every line — a PO missing a line is a second PO somebody has to remember'
            : needsBtb
              ? btbs.length === 0
                ? 'this supplier is an import mill and there is no active back-to-back credit — the gate will refuse, and nothing will be written'
                : 'an import PO is funded from the back-to-back credit; the gate checks the headroom before anything is written'
              : 'a local supplier is paid in BDT — no back-to-back credit is involved'}
        </p>
      </section>
    </div>
  )
}

const cell: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  textAlign: 'right',
  font: "500 13.5px/1.3 var(--fx-font-mono)",
}

const sub: React.CSSProperties = {
  marginTop: 2,
  font: "400 10.5px/1 var(--fx-font-mono)",
  color: 'var(--fx-text-tertiary)',
}

const fieldLabel: React.CSSProperties = { font: "500 13px/1.3 var(--fx-font-sans)" }

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
