'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { InlineAlert } from '@/components/fx/feedback'
import { Ident } from '@/components/fx/format'
import { SyncPill } from '@/components/fx/floor'
import { Badge, Button } from '@/components/fx/primitives'
import { SectionHeading } from '@/components/fx/signature'
import { useOfflineQueue } from '@/lib/offline/use-offline-queue'
import { addQty, multiplyQty, quantity, zeroQty } from '@/lib/quantity'
import type { IssuedRoll } from '@/modules/cutting/queries'

interface MarkerOption {
  id: string
  code: string
  sizeRatio: Record<string, number>
  layLengthMeters: string
  efficiencyPct: string | null
  fabricWidthInches: string | null
}

interface OrderOption {
  orderId: string
  orderStyleId: string
  poNumber: string | null
  styleCode: string
}

const field: React.CSSProperties = {
  minHeight: 44,
  padding: '10px 12px',
  border: '1px solid var(--fx-border-default)',
  borderRadius: 'var(--fx-radius-sm)',
  background: 'var(--fx-bg-surface)',
  color: 'var(--fx-text-primary)',
  font: "400 14px/1.4 var(--fx-font-sans)",
  width: '100%',
}

/**
 * Spreading a lay.
 *
 * The screen's job is to make three things impossible to get wrong, because each is
 * expensive and none is recoverable once the knife has been through the stack:
 *
 *  - **Rolls come only from what the store issued to THIS order.** The service gate refuses
 *    anything else; offering a wider list would mean a cutter discovers that after picking.
 *  - **Mixing shade groups is shown before the spread, not after.** Two dye lots in one lay
 *    is a garment that leaves with two different navies in it.
 *  - **What the lay makes is computed from the marker, live.** plies × the marker's ratio is
 *    the yield, and a cutter who has to work it out on paper is a cutter who gets it wrong
 *    on the lay that matters.
 */
export function LayClient({
  orders,
  target,
  markers,
  rolls,
  blocked,
}: {
  orders: readonly OrderOption[]
  target: OrderOption
  markers: readonly MarkerOption[]
  rolls: readonly IssuedRoll[]
  blocked: boolean
}) {
  const router = useRouter()
  const { capture, online, queued, syncing, refused, sync, clear } = useOfflineQueue()

  const [markerId, setMarkerId] = useState(markers[0]?.id ?? '')
  const [layNo, setLayNo] = useState('')
  const [colour, setColour] = useState('')
  const [plies, setPlies] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [spread, setSpread] = useState<string[]>([])

  const marker = markers.find((m) => m.id === markerId)
  // eslint-disable-next-line fabricxai/no-float-money -- floor keypad ply count, pieces not money; NaN is rejected by the validPlies check on the next line
  const plyCount = Number.parseInt(plies, 10)
  const validPlies = Number.isInteger(plyCount) && plyCount > 0

  const available = rolls.filter((r) => r.usedByLay === null)
  const pickedRolls = available.filter((r) => picked.has(r.rollId))

  // Fabric on the picked rolls, in exact decimal — this is metres, not a piece count.
  const drawn = pickedRolls.reduce(
    (total, roll) => addQty(total, quantity(roll.qty, roll.unit || 'm')),
    zeroQty(rolls[0]?.unit || 'm'),
  )

  // What the marker says this spread consumes: lay length × plies.
  const planned = useMemo(() => {
    if (!marker || !validPlies) return null
    return multiplyQty(quantity(marker.layLengthMeters, 'm'), plyCount)
  }, [marker, validPlies, plyCount])

  /** plies × the marker's ratio — the pieces this lay yields, per size. */
  const yieldBySize = useMemo(() => {
    if (!marker || !validPlies) return []
    return Object.entries(marker.sizeRatio).map(([size, perPly]) => ({
      size,
      pieces: perPly * plyCount,
    }))
  }, [marker, validPlies, plyCount])

  const totalPieces = yieldBySize.reduce((n, cell) => n + cell.pieces, 0)

  const shadeGroups = [...new Set(pickedRolls.map((r) => r.shadeGroup).filter(Boolean))]
  const mixingShades = shadeGroups.length > 1

  const complete =
    !blocked && Boolean(marker) && validPlies && layNo.trim() !== '' && colour.trim() !== '' &&
    pickedRolls.length > 0

  async function createLay() {
    if (!complete || !marker) return

    await capture({
      moduleId: 'cutting',
      operation: 'create_lay',
      payload: {
        orderId: target.orderId,
        orderStyleId: target.orderStyleId,
        markerId: marker.id,
        layNo: layNo.trim(),
        color: colour.trim(),
        plies: plyCount,
        layLengthMeters: marker.layLengthMeters,
        rollsDrawn: pickedRolls.map((r) => r.rollId),
        // Deliberately NOT the picked rolls' total.
        //
        // A cutter draws whole rolls — 3,000 m of cloth may come to the table for a lay
        // that consumes 256 — and the remainder stays on the roll. Sending the roll total
        // as "fabric drawn" made a 40-ply lay report 1,071% wastage. Omitting it lets
        // `createLay` default to the marker plan (lay length × plies), which is what the
        // lay actually consumes. A measured draw belongs here when somebody has measured
        // it; a roll total is not that measurement.
      },
    })

    setSpread((done) => [...done, `${layNo.trim()} · ${plyCount} plies · ${totalPieces} pcs`])
    setLayNo('')
    setPlies('')
    setPicked(new Set())
    router.refresh()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
      <SyncPill online={online} queued={queued} syncing={syncing} onSync={() => void sync()} />

      {refused.length > 0 ? (
        <InlineAlert tone="danger">
          {refused.length} lay{refused.length === 1 ? '' : 's'} the server refused — most
          likely a gate. Nothing was spread.
          {refused.map((r) => (
            <button
              key={r.offlineKey}
              onClick={() => void clear(r.offlineKey)}
              style={{
                marginLeft: 8,
                background: 'transparent',
                border: 'none',
                textDecoration: 'underline',
                cursor: 'pointer',
                font: 'inherit',
              }}
            >
              dismiss
            </button>
          ))}
        </InlineAlert>
      ) : null}

      {spread.length > 0 ? (
        <InlineAlert tone="success">
          Spread {spread.join(' · ')}.{' '}
          {online ? 'Sent.' : 'Held on this device until you are back online.'}
        </InlineAlert>
      ) : null}

      {orders.length > 1 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {orders.map((o) => (
            <button
              key={o.orderId}
              onClick={() => router.push(`/cutting/lay?order=${o.orderId}`)}
              style={{
                minHeight: 44,
                padding: '10px 14px',
                borderRadius: 'var(--fx-radius-full)',
                border: `1px solid ${o.orderId === target.orderId ? 'var(--fx-text-primary)' : 'var(--fx-border-default)'}`,
                background: o.orderId === target.orderId ? 'var(--fx-text-primary)' : 'transparent',
                color: o.orderId === target.orderId ? 'var(--fx-text-inverse)' : 'var(--fx-text-secondary)',
                cursor: 'pointer',
                font: "500 12.5px/1 var(--fx-font-sans)",
              }}
            >
              {o.poNumber ?? 'order'} · {o.styleCode}
            </button>
          ))}
        </div>
      ) : null}

      {/* ── The marker ───────────────────────────────────────────────────── */}
      <SectionHeading eyebrow={`${markers.length} released for this style`}>
        Pick the marker
      </SectionHeading>

      {markers.length === 0 ? (
        <InlineAlert tone="warning">
          No marker exists for {target.styleCode}. A lay is spread under a marker — the
          arrangement of pattern pieces that decides what each ply yields — and CAD releases
          it before cutting can start.
        </InlineAlert>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ font: "500 12.5px/1.3 var(--fx-font-sans)" }}>Marker</span>
            <select value={markerId} onChange={(e) => setMarkerId(e.target.value)} style={field}>
              {markers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code} · {Object.entries(m.sizeRatio).map(([s, n]) => `${s}:${n}`).join(' ')}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ font: "500 12.5px/1.3 var(--fx-font-sans)" }}>Lay no</span>
            <input
              value={layNo}
              onChange={(e) => setLayNo(e.target.value)}
              placeholder="LAY-0044"
              style={{ ...field, font: "400 14px/1.4 var(--fx-font-mono)" }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ font: "500 12.5px/1.3 var(--fx-font-sans)" }}>Colour</span>
            <input
              value={colour}
              onChange={(e) => setColour(e.target.value)}
              placeholder="Navy"
              style={field}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ font: "500 12.5px/1.3 var(--fx-font-sans)" }}>Plies</span>
            <input
              inputMode="numeric"
              value={plies}
              onChange={(e) => setPlies(e.target.value)}
              placeholder="60"
              style={{ ...field, font: "400 14px/1.4 var(--fx-font-mono)" }}
            />
          </label>
        </div>
      )}

      {/* ── What that makes ──────────────────────────────────────────────── */}
      {yieldBySize.length > 0 ? (
        <>
          <SectionHeading eyebrow={`${totalPieces} pieces`}>What that makes</SectionHeading>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${yieldBySize.length + 1}, 1fr)`,
              gap: 1,
              background: 'var(--fx-border-subtle)',
              border: '1px solid var(--fx-border-subtle)',
            }}
          >
            {yieldBySize.map((cell) => (
              <div key={cell.size} style={{ background: 'var(--fx-bg-surface)', padding: '14px 16px' }}>
                <div
                  style={{
                    font: "400 11px/1 var(--fx-font-mono)",
                    letterSpacing: '.06em',
                    textTransform: 'uppercase',
                    color: 'var(--fx-text-tertiary)',
                  }}
                >
                  {cell.size}
                </div>
                <div style={{ marginTop: 6, font: "600 20px/1.1 var(--fx-font-sans)" }}>
                  {cell.pieces}
                </div>
              </div>
            ))}
            <div style={{ background: 'var(--fx-bg-sunken)', padding: '14px 16px' }}>
              <div
                style={{
                  font: "400 11px/1 var(--fx-font-mono)",
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  color: 'var(--fx-text-tertiary)',
                }}
              >
                Total
              </div>
              <div style={{ marginTop: 6, font: "600 20px/1.1 var(--fx-font-sans)" }}>
                {totalPieces}
              </div>
            </div>
          </div>
          {planned ? (
            <span style={{ font: "400 12px/1.4 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
              marker plan {planned.value} m · picked {drawn.value} m
            </span>
          ) : null}
        </>
      ) : null}

      {/* ── Rolls ────────────────────────────────────────────────────────── */}
      <SectionHeading eyebrow={`${available.length} issued to this order`}>
        Rolls drawn from store
      </SectionHeading>

      {mixingShades ? (
        <InlineAlert tone="warning">
          You are spreading shade groups {shadeGroups.join(' and ')} in one lay. Two dye lots
          in a stack is a garment that leaves with two different navies in it.
        </InlineAlert>
      ) : null}

      {available.length === 0 ? (
        <InlineAlert tone="warning">
          The store has not issued any fabric against this order — or every issued roll is
          already on a table. A lay may only draw rolls issued to its own order, so cutting
          waits on the store.
        </InlineAlert>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {available.map((roll) => {
            const on = picked.has(roll.rollId)
            return (
              <button
                key={roll.rollId}
                onClick={() =>
                  setPicked((current) => {
                    const next = new Set(current)
                    if (next.has(roll.rollId)) next.delete(roll.rollId)
                    else next.add(roll.rollId)
                    return next
                  })
                }
                style={{
                  display: 'grid',
                  gridTemplateColumns: '28px 1.1fr 1fr 130px 110px',
                  gap: 12,
                  alignItems: 'center',
                  textAlign: 'left',
                  padding: '12px 16px',
                  minHeight: 56,
                  border: '1px solid var(--fx-border-subtle)',
                  background: on ? 'var(--fx-bg-selected)' : 'var(--fx-bg-surface)',
                  cursor: 'pointer',
                  font: "400 14px/1.3 var(--fx-font-sans)",
                  color: 'var(--fx-text-primary)',
                }}
              >
                <span aria-hidden style={{ font: "600 15px/1 var(--fx-font-sans)" }}>
                  {on ? '✓' : ''}
                </span>
                <Ident>{roll.rollNo}</Ident>
                <span style={{ font: "400 12.5px/1.3 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
                  {roll.itemCode}
                </span>
                <span style={{ font: "400 13px/1.3 var(--fx-font-mono)", textAlign: 'right' }}>
                  {roll.qty} {roll.unit}
                </span>
                <span style={{ textAlign: 'right' }}>
                  {roll.shadeGroup ? <Badge>shade {roll.shadeGroup}</Badge> : null}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ font: "400 12px/1.4 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
          {pickedRolls.length} roll{pickedRolls.length === 1 ? '' : 's'} · {drawn.value} m on
          the table{planned ? `, ${planned.value} m consumed by the lay` : ''}
          {blocked ? ' · blocked by the PP gate' : ''}
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <Button variant="primary" size="lg" disabled={!complete} onClick={() => void createLay()}>
            {blocked ? 'Blocked — PP approval first' : 'Create the lay'}
          </Button>
        </span>
      </div>
    </div>
  )
}
