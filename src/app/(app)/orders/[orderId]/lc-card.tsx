import { InlineAlert } from '@/components/fx/feedback'
import { FactPair } from '@/components/fx/tna'
import type { LcDetail } from '@/modules/commercial/queries'

/**
 * 1.3 Order Desk — the credit behind the order, read-only.
 *
 * The merchandiser's own MARBIM primer warns about latest-shipment breaches and the
 * seeded test kit asks "what is the slack to the LC latest shipment" — yet `/lcs`
 * belongs to commercial and finance, so the person steering the ex-factory date could
 * not see the date the bank enforces. This card is the window, not a door: everything
 * on it is read through commercial's queries, and nothing on it writes. Amending the
 * credit stays commercial's act, which the card says in its own eyebrow.
 */
export function OrderLcCard({
  lc,
  orderId,
  seesPrices,
  shipmentDocs = null,
  expNumber = null,
}: {
  lc: LcDetail
  orderId: string
  seesPrices: boolean
  /** This order's submission rows from the shipment board; null = no shipment yet. */
  shipmentDocs?: { kind: string; status: string; hasFile: boolean }[] | null
  expNumber?: string | null
}) {
  const linked = lc.linkedOrders.find((o) => o.orderId === orderId)
  const float = linked?.floatDays ?? null
  const conflict = float !== null && float < 0

  /*
   * The bank-docs checklist: what the credit DEMANDS (docsRequired, transcribed off the
   * credit itself) against what the shipment HAS (the same doc rows the shipping desk
   * files). A required kind with no filed document is owed, not zero — and the EXP number
   * is called out by name because its absence is the one blocker with a legal deadline.
   */
  const requiredKinds = Object.entries(lc.docsRequired)
    .filter(([, v]) => v === true)
    .map(([k]) => k)
  const docState = (kind: string): 'filed' | 'started' | 'owed' => {
    if (!shipmentDocs) return 'owed'
    const rows = shipmentDocs.filter((d) => d.kind === kind)
    if (rows.some((d) => d.hasFile)) return 'filed'
    return rows.length > 0 ? 'started' : 'owed'
  }
  const expRequired = requiredKinds.includes('exp_form')

  // Whole percents are enough for a bar read at a glance; the exact figures sit
  // beside it as the stored decimal strings. BigInt throughout (rule 4).
  const limitMinor = BigInt(toMinor(lc.headroom.limit))
  const usedPct =
    seesPrices && limitMinor > 0n
      ? Math.min(100, Number((BigInt(toMinor(lc.headroom.used)) * 100n) / limitMinor))
      : null

  return (
    <div
      style={{
        background: 'var(--fx-bg-surface)',
        border: '1px solid var(--fx-border-subtle)',
        borderRadius: 'var(--fx-radius-md)',
        boxShadow: 'var(--fx-sh1)',
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
        <FactPair label="Letter of credit">
          <span data-mono>{lc.number}</span>
          <span style={{ color: 'var(--fx-text-tertiary)', fontWeight: 400 }}> · {lc.status}</span>
        </FactPair>
        <FactPair label="Latest shipment">
          <span data-numeric data-mono>
            {lc.latestShipmentDate ?? '—'}
          </span>
          {float !== null ? (
            <span
              style={{
                fontWeight: 400,
                color: conflict ? 'var(--fx-danger)' : 'var(--fx-text-tertiary)',
              }}
            >
              {' '}
              · {conflict ? `${-float} d after ex-factory` : `${float} d float`}
            </span>
          ) : null}
        </FactPair>
        <FactPair label="Expiry">
          <span data-numeric data-mono>
            {lc.expiryDate ?? '—'}
          </span>
        </FactPair>
        <FactPair label="BTB headroom">
          {!seesPrices ? (
            '•••'
          ) : (
            <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, minWidth: 180 }}>
              <span
                style={{
                  height: 8,
                  borderRadius: 4,
                  background: 'var(--fx-bg-sunken)',
                  overflow: 'hidden',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    width: `${usedPct ?? 0}%`,
                    height: '100%',
                    background:
                      usedPct !== null && usedPct >= 90 ? 'var(--fx-danger)' : usedPct !== null && usedPct >= 75 ? 'var(--fx-warning)' : 'var(--fx-text-primary)',
                  }}
                />
              </span>
              <span
                data-numeric
                data-mono
                style={{ font: '400 12px/1.4 var(--fx-font-mono)', color: 'var(--fx-text-tertiary)', fontWeight: 400 }}
              >
                {lc.headroom.used} of {lc.headroom.limit} {lc.currency} · limit {lc.headroom.limitPct}% of master
              </span>
            </span>
          )}
        </FactPair>
      </div>

      {requiredKinds.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span
            style={{
              font: '500 10.5px/1 var(--fx-font-mono)',
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              color: 'var(--fx-text-tertiary)',
            }}
          >
            bank documents the credit demands
          </span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {requiredKinds.map((kind) => {
              const state = docState(kind)
              return (
                <span
                  key={kind}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    borderRadius: 'var(--fx-radius-full)',
                    font: '500 12px/1.4 var(--fx-font-sans)',
                    border:
                      state === 'filed'
                        ? '1px solid var(--fx-border-subtle)'
                        : '1px dashed var(--fx-border-strong)',
                    color: state === 'filed' ? 'var(--fx-text-secondary)' : 'var(--fx-text-primary)',
                    background: state === 'filed' ? 'var(--fx-bg-sunken)' : 'transparent',
                  }}
                >
                  <span aria-hidden>{state === 'filed' ? '✓' : state === 'started' ? '…' : '○'}</span>
                  {kind.replace(/_/g, ' ')}
                  <span style={{ color: 'var(--fx-text-tertiary)', fontWeight: 400 }}>
                    {state === 'filed' ? 'filed' : state === 'started' ? 'drafted' : 'owed'}
                  </span>
                </span>
              )
            })}
          </div>
          {expRequired && !expNumber ? (
            <span style={{ font: '400 12.5px/1.5 var(--fx-font-sans)', color: 'var(--fx-warning)' }}>
              No EXP number on the shipment yet — the bank refuses the whole presentation
              without it. The shipping desk records it.
            </span>
          ) : expNumber ? (
            <span
              data-mono
              style={{ font: '400 12px/1.5 var(--fx-font-mono)', color: 'var(--fx-text-tertiary)' }}
            >
              EXP {expNumber}
            </span>
          ) : null}
        </div>
      ) : null}

      {conflict ? (
        <InlineAlert tone="danger">
          Ex-factory is {-float!} day{-float! === 1 ? '' : 's'} after the credit&rsquo;s latest
          shipment of {lc.latestShipmentDate}. Move the plan, or ask commercial for an amendment
          — bank documents will be refused as things stand.
        </InlineAlert>
      ) : null}
    </div>
  )
}

/** Decimal string → integer minor units, for a ratio that never touches floats (rule 4). */
function toMinor(decimal: string): string {
  const [whole = '0', frac = ''] = decimal.split('.')
  return `${whole}${frac.padEnd(2, '0').slice(0, 2)}`
}
