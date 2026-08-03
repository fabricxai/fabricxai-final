'use client'

import { useMemo, useState } from 'react'

import { InlineAlert } from '@/components/fx/feedback'
import { SyncPill } from '@/components/fx/floor'
import { Badge, Button } from '@/components/fx/primitives'
import { SectionHeading } from '@/components/fx/signature'
import { Ident } from '@/components/fx/format'
import { useOfflineQueue } from '@/lib/offline/use-offline-queue'
import type { OutstandingLine, RollRow } from '@/modules/store/queries'

/**
 * Picking rolls for one requisition line.
 *
 * The write goes through the offline queue, not a server action: this is a floor screen on
 * a shared tablet that loses the network in a lift shaft, and rule 7 says every floor-facing
 * write carries a device-generated `offline_key` so a replay is the same issue, not a second
 * one. `capture()` owns that key — a screen cannot post without one.
 *
 * Two guards live here because only the picker can see them:
 *
 *  - **Shade mixing** warns rather than blocks. Cutting two dye lots in one lay is
 *    sometimes the right call — a QC signature makes it deliberate — so the screen says
 *    what is about to happen and lets a person decide.
 *  - **Over-issue against free** blocks. There is no version of issuing cloth that is not
 *    there which turns out fine.
 */
export function IssueClient({
  lines,
  rollsByItem,
  freeByItem,
  onHandByItem,
}: {
  lines: readonly OutstandingLine[]
  rollsByItem: Record<string, RollRow[]>
  freeByItem: Record<string, string>
  onHandByItem: Record<string, string>
}) {
  const { capture, online, queued, syncing, refused, sync, clear } = useOfflineQueue()
  const [activeLineId, setActiveLineId] = useState(lines[0]?.requisitionLineId ?? null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [issued, setIssued] = useState<string[]>([])

  const line = lines.find((l) => l.requisitionLineId === activeLineId) ?? null

  // Memoised so the picked-roll derivation below has a stable input; a fresh array every
  // render would recompute it whenever anything else in the tree changes.
  const rolls = useMemo(
    () => (line ? (rollsByItem[line.itemId] ?? []) : []),
    [line, rollsByItem],
  )

  const pickedRolls = useMemo(() => rolls.filter((roll) => picked.has(roll.id)), [rolls, picked])

  const issuing = pickedRolls.reduce((sum, roll) => sum + Number(roll.qty), 0)
  const required = line ? Number(line.outstandingQty) : 0
  const free = line ? Number(freeByItem[line.itemId] ?? '0') : 0
  const onHand = line ? Number(onHandByItem[line.itemId] ?? '0') : 0
  const difference = issuing - required

  /**
   * What this issue may actually draw on.
   *
   * NOT `free`. Free subtracts every open reservation INCLUDING this line's own, and this
   * issue is what satisfies that reservation rather than competing with it — counting it
   * twice blocked every issue against an over-reserved item, which is precisely the item
   * somebody is standing at the shelf trying to issue. So this line's own outstanding is
   * added back, leaving on-hand minus what OTHER orders are still owed.
   *
   * It can still be less than what cutting asked for. That is the honest answer: the cloth
   * is not there, and the difference is a conversation with merchandising, not a rounding.
   */
  const available = line ? Math.min(onHand, free + required) : 0

  // Distinct shade groups among the picked rolls. Ungrouped rolls do not count as a group
  // of their own — a trim with no dye lot cannot clash with anything.
  const shadeGroups = [...new Set(pickedRolls.map((r) => r.shadeGroup).filter(Boolean))]
  const mixingShades = shadeGroups.length > 1
  const overFree = issuing > available
  const bonded = pickedRolls.some((roll) => roll.locationKind === 'bonded')

  function toggle(rollId: string) {
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(rollId)) next.delete(rollId)
      else next.add(rollId)
      return next
    })
  }

  async function issue() {
    if (!line || pickedRolls.length === 0 || overFree) return

    await capture({
      moduleId: 'store',
      operation: 'issue_stock',
      payload: {
        orderId: line.orderId,
        requisitionId: line.requisitionId,
        lines: pickedRolls.map((roll) => ({
          itemId: line.itemId,
          rollId: roll.id,
          qty: roll.qty,
          unit: roll.unit,
        })),
      },
    })

    setIssued((done) => [...done, `${issuing.toFixed(2)} ${line.unit} · ${line.itemCode}`])
    setPicked(new Set())
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <SyncPill
        online={online}
        queued={queued}
        syncing={syncing}
        onSync={() => void sync()}
      />

      {refused.length > 0 ? (
        <InlineAlert tone="danger">
          {refused.length} write{refused.length === 1 ? '' : 's'} the server refused.
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

      {issued.length > 0 ? (
        <InlineAlert tone="success">
          Issued {issued.join(' · ')}. {online ? 'Sent.' : 'Held on this device until you are back online.'}
        </InlineAlert>
      ) : null}

      {/* ── What the floor asked for ─────────────────────────────────────── */}
      <SectionHeading eyebrow="Outstanding">Cutting is waiting on</SectionHeading>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {lines.map((l) => {
          const active = l.requisitionLineId === activeLineId
          return (
            <button
              key={l.requisitionLineId}
              onClick={() => {
                setActiveLineId(l.requisitionLineId)
                setPicked(new Set())
              }}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.6fr 1fr 120px 120px',
                gap: 14,
                alignItems: 'center',
                textAlign: 'left',
                padding: '14px 18px',
                minHeight: 56,
                border: '1px solid var(--fx-border-subtle)',
                borderLeft: `3px solid ${active ? 'var(--fx-accent)' : 'transparent'}`,
                background: active ? 'var(--fx-bg-selected)' : 'var(--fx-bg-surface)',
                cursor: 'pointer',
                font: "400 14px/1.3 var(--fx-font-sans)",
                color: 'var(--fx-text-primary)',
              }}
            >
              <span>
                <Ident>{l.itemCode}</Ident>
                <span style={{ marginLeft: 10, color: 'var(--fx-text-secondary)' }}>{l.itemName}</span>
              </span>
              <span style={{ font: "400 13px/1.3 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
                {l.poNumbers.join(', ')}
              </span>
              <span style={{ font: "400 13px/1.3 var(--fx-font-mono)", textAlign: 'right' }}>
                {l.outstandingQty} {l.unit}
              </span>
              <span
                style={{
                  font: "400 12px/1.3 var(--fx-font-mono)",
                  textAlign: 'right',
                  color:
                    Number(freeByItem[l.itemId] ?? '0') < Number(l.outstandingQty)
                      ? 'var(--fx-danger)'
                      : 'var(--fx-text-tertiary)',
                }}
              >
                {freeByItem[l.itemId] ?? '0'} free
              </span>
            </button>
          )
        })}
      </div>

      {line ? (
        <>
          {/* ── The running total ───────────────────────────────────────── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 1,
              background: 'var(--fx-border-subtle)',
              border: '1px solid var(--fx-border-subtle)',
            }}
          >
            {[
              { label: 'Required', value: `${line.outstandingQty} ${line.unit}`, tone: 'plain' },
              { label: 'Issuing', value: `${issuing.toFixed(2)} ${line.unit}`, tone: 'plain' },
              {
                label: 'Difference',
                value: `${difference > 0 ? '+' : ''}${difference.toFixed(2)} ${line.unit}`,
                tone: difference === 0 ? 'ok' : 'warn',
              },
            ].map((cell) => (
              <div key={cell.label} style={{ background: 'var(--fx-bg-surface)', padding: '16px 18px' }}>
                <div
                  style={{
                    font: "400 11px/1 var(--fx-font-mono)",
                    letterSpacing: '.06em',
                    textTransform: 'uppercase',
                    color: 'var(--fx-text-tertiary)',
                  }}
                >
                  {cell.label}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    font: "600 22px/1.1 var(--fx-font-sans)",
                    color:
                      cell.tone === 'warn'
                        ? 'var(--fx-warning)'
                        : cell.tone === 'ok'
                          ? 'var(--fx-success)'
                          : 'var(--fx-text-primary)',
                  }}
                >
                  {cell.value}
                </div>
              </div>
            ))}
          </div>

          {overFree ? (
            <InlineAlert tone="danger">
              This issue is blocked — {issuing.toFixed(2)} {line.unit} is more than the{' '}
              {available.toFixed(2)} {line.unit} this order may draw. {onHand.toFixed(2)}{' '}
              {line.unit} is on hand, and the rest is already promised to other orders.
              Nothing has been written.
            </InlineAlert>
          ) : null}

          {!overFree && available < required ? (
            // Not a block: you can issue what is there and hold the rest of the lay. The
            // shortfall is a conversation with merchandising, and hiding it until the
            // cutting table runs dry is how it becomes an emergency instead.
            <InlineAlert tone="warning">
              Only {available.toFixed(2)} {line.unit} of the {required.toFixed(2)} {line.unit}{' '}
              asked for can be drawn. Issue what is here and hold the lay, or have
              merchandising re-size the order.
            </InlineAlert>
          ) : null}

          {mixingShades ? (
            <InlineAlert tone="warning">
              You are mixing shade groups {shadeGroups.join(' and ')} in one lay. Split the lay
              by shade, or have QC sign the mix — a two-shade garment is found by the buyer.
            </InlineAlert>
          ) : null}

          {bonded ? (
            <InlineAlert tone="info">
              Bonded rolls are picked — this issue draws on a customs declaration. The UD
              balance check lands with module 2.2; until then the draw is recorded but not
              validated against a UD.
            </InlineAlert>
          ) : null}

          {/* ── Pick rolls, grouped by shade ────────────────────────────── */}
          <SectionHeading eyebrow={`${rolls.length} in stock`}>Pick rolls · grouped by shade</SectionHeading>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {groupByShade(rolls).map(([group, groupRolls]) => (
              <div key={group ?? 'ungrouped'} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    font: "400 11px/1 var(--fx-font-mono)",
                    letterSpacing: '.06em',
                    textTransform: 'uppercase',
                    color: 'var(--fx-text-tertiary)',
                    padding: '4px 2px',
                  }}
                >
                  {group ? `shade ${group}` : 'no shade group'}
                  <span style={{ textTransform: 'none', letterSpacing: 0 }}>
                    {groupRolls.length} roll{groupRolls.length === 1 ? '' : 's'}
                  </span>
                </div>
                {groupRolls.map((roll) => {
                  const on = picked.has(roll.id)
                  return (
                    <button
                      key={roll.id}
                      onClick={() => toggle(roll.id)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '28px 1.2fr 1fr 120px 110px',
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
                        {roll.dyeLot ? `dye ${roll.dyeLot}` : roll.lot ? `lot ${roll.lot}` : '—'}
                      </span>
                      <span style={{ font: "400 13px/1.3 var(--fx-font-mono)", textAlign: 'right' }}>
                        {roll.qty} {roll.unit}
                      </span>
                      <span style={{ textAlign: 'right' }}>
                        <Badge tone={roll.locationKind === 'bonded' ? 'warning' : 'neutral'}>
                          {roll.locationCode}
                        </Badge>
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ font: "400 12px/1.4 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
              {pickedRolls.length} roll{pickedRolls.length === 1 ? '' : 's'} picked
              {overFree ? ' · blocked' : ''}
            </span>
            <span style={{ marginLeft: 'auto' }}>
              <Button
                variant="primary"
                size="lg"
                disabled={pickedRolls.length === 0 || overFree}
                onClick={() => void issue()}
              >
                {overFree
                  ? 'Blocked — over free stock'
                  : `Issue ${issuing.toFixed(2)} ${line.unit}`}
              </Button>
            </span>
          </div>
        </>
      ) : null}
    </div>
  )
}

/** Shade groups in pick order, ungrouped last. */
function groupByShade(rolls: readonly RollRow[]): [string | null, RollRow[]][] {
  const groups = new Map<string | null, RollRow[]>()
  for (const roll of rolls) {
    const key = roll.shadeGroup ?? null
    const list = groups.get(key)
    if (list) list.push(roll)
    else groups.set(key, [roll])
  }
  return [...groups.entries()].sort((a, b) => {
    if (a[0] === null) return 1
    if (b[0] === null) return -1
    return a[0].localeCompare(b[0])
  })
}
