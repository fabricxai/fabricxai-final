'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { InlineAlert } from '@/components/fx/feedback'
import { SyncPill } from '@/components/fx/floor'
import { Button } from '@/components/fx/primitives'
import { SectionHeading } from '@/components/fx/signature'
import { useOfflineQueue } from '@/lib/offline/use-offline-queue'
import type { LayForReport } from '@/modules/cutting/queries'

/**
 * Cut against plan.
 *
 * The grid starts pre-filled with what the marker says the lay yields, because that is what
 * a cutter is confirming nine times out of ten — and typing four numbers that are already
 * known is how a wrong one gets typed. Every cell is editable; the difference from expected
 * is shown as it changes, not after saving.
 *
 * **Over tolerance does not block.** The service records the report either way and stores
 * the variance for the manager, which is right: the pieces are already cut, and refusing to
 * write down what happened does not un-cut them. What the screen owes is that nobody can
 * file an out-of-tolerance report without having seen that it is out of tolerance.
 */
export function ReportClient({
  lay,
  openLays,
  tolerancePct,
}: {
  lay: LayForReport
  openLays: readonly { id: string; layNo: string; color: string }[]
  tolerancePct: string
}) {
  const router = useRouter()
  const { capture, online, queued, syncing, refused, sync, clear } = useOfflineQueue()

  const [actual, setActual] = useState<Record<string, string>>(() =>
    Object.fromEntries(lay.cells.map((cell) => [cell.size, String(cell.expected)])),
  )
  const [filed, setFiled] = useState<string | null>(null)

  const tolerance = Number(tolerancePct)

  const rows = lay.cells.map((cell) => {
    const entered = Number(actual[cell.size] ?? '')
    const cut = Number.isFinite(entered) ? entered : 0
    const variance = cut - cell.expected
    // Against what this LAY should have produced, not against the order — a lay is judged
    // on its own marker, and the order's completion is a separate question.
    const variancePct = cell.expected > 0 ? Math.abs(variance / cell.expected) * 100 : 0
    return { ...cell, cut, variance, outside: variancePct > tolerance && variance !== 0 }
  })

  const totalExpected = rows.reduce((n, r) => n + r.expected, 0)
  const totalCut = rows.reduce((n, r) => n + r.cut, 0)
  // Garments are an integer count, not money — the lint rule matches on the name. Summing
  // pieces is exact; there is no decimal to lose.
  // eslint-disable-next-line fabricxai/no-float-money
  const totalDifference = totalCut - totalExpected
  const outside = rows.filter((r) => r.outside)
  const valid = rows.every((r) => Number.isFinite(r.cut) && r.cut >= 0) && totalCut > 0

  async function file() {
    if (!valid) return

    await capture({
      moduleId: 'cutting',
      operation: 'record_cut_report',
      payload: {
        layId: lay.layId,
        // "Colour|Size" — the only key shape `cutting/zod.ts` accepts.
        cells: Object.fromEntries(rows.map((r) => [`${lay.color}|${r.size}`, r.cut])),
      },
    })

    setFiled(`${lay.layNo} · ${totalCut} pieces`)
    router.refresh()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <SyncPill online={online} queued={queued} syncing={syncing} onSync={() => void sync()} />

      {refused.length > 0 ? (
        <InlineAlert tone="danger">
          {refused.length} report{refused.length === 1 ? '' : 's'} the server refused.
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

      {filed ? (
        <InlineAlert tone="success">
          Filed {filed}. {online ? 'Sent.' : 'Held on this device until you are back online.'} The
          lay is now cut; changing this number later is a correction a manager approves.
        </InlineAlert>
      ) : null}

      {openLays.length > 1 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {openLays.map((l) => (
            <button
              key={l.id}
              onClick={() => router.push(`/cutting/report?lay=${l.id}`)}
              style={{
                minHeight: 44,
                padding: '10px 14px',
                borderRadius: 'var(--fx-radius-full)',
                border: `1px solid ${l.id === lay.layId ? 'var(--fx-text-primary)' : 'var(--fx-border-default)'}`,
                background: l.id === lay.layId ? 'var(--fx-text-primary)' : 'transparent',
                color: l.id === lay.layId ? 'var(--fx-text-inverse)' : 'var(--fx-text-secondary)',
                cursor: 'pointer',
                font: "500 12.5px/1 var(--fx-font-mono)",
              }}
            >
              {l.layNo} · {l.color}
            </button>
          ))}
        </div>
      ) : null}

      <SectionHeading eyebrow="tap a cell to correct it">Cut against plan</SectionHeading>

      <div
        style={{
          background: 'var(--fx-bg-surface)',
          border: '1px solid var(--fx-border-subtle)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '90px 1fr 1fr 1fr 1fr',
            gap: 12,
            padding: '12px 18px',
            background: 'var(--fx-bg-sunken)',
            font: "500 12px/1 var(--fx-font-mono)",
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: 'var(--fx-text-tertiary)',
          }}
        >
          <div>Size</div>
          <div style={{ textAlign: 'right' }}>Marker says</div>
          <div style={{ textAlign: 'right' }}>Cut</div>
          <div style={{ textAlign: 'right' }}>Difference</div>
          <div style={{ textAlign: 'right' }}>Order needs</div>
        </div>

        {rows.map((row) => (
          <div
            key={row.size}
            style={{
              display: 'grid',
              gridTemplateColumns: '90px 1fr 1fr 1fr 1fr',
              gap: 12,
              alignItems: 'center',
              padding: '10px 18px',
              minHeight: 56,
              borderTop: '1px solid var(--fx-border-subtle)',
              borderLeft: `3px solid ${row.outside ? 'var(--fx-danger)' : 'transparent'}`,
            }}
          >
            <div style={{ font: "600 15px/1.2 var(--fx-font-sans)" }}>{row.size}</div>
            <div
              style={{
                textAlign: 'right',
                font: "400 14px/1.3 var(--fx-font-mono)",
                color: 'var(--fx-text-tertiary)',
              }}
            >
              {row.expected}
            </div>
            <div style={{ textAlign: 'right' }}>
              <input
                inputMode="numeric"
                aria-label={`Cut ${row.size}`}
                value={actual[row.size] ?? ''}
                onChange={(e) => setActual((a) => ({ ...a, [row.size]: e.target.value }))}
                style={{
                  width: '100%',
                  minHeight: 44,
                  padding: '8px 10px',
                  textAlign: 'right',
                  border: '1px solid var(--fx-border-default)',
                  borderRadius: 'var(--fx-radius-sm)',
                  background: 'var(--fx-bg-surface)',
                  color: 'var(--fx-text-primary)',
                  font: "500 15px/1.2 var(--fx-font-mono)",
                }}
              />
            </div>
            <div
              style={{
                textAlign: 'right',
                font: "500 14px/1.3 var(--fx-font-mono)",
                color: row.variance === 0
                  ? 'var(--fx-text-tertiary)'
                  : row.outside
                    ? 'var(--fx-danger)'
                    : 'var(--fx-warning)',
              }}
            >
              {row.variance > 0 ? '+' : ''}
              {row.variance}
            </div>
            <div
              style={{
                textAlign: 'right',
                font: "400 13px/1.3 var(--fx-font-mono)",
                color: 'var(--fx-text-tertiary)',
              }}
            >
              {row.ordered > 0 ? `${row.alreadyCut + row.cut} / ${row.ordered}` : '—'}
            </div>
          </div>
        ))}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '90px 1fr 1fr 1fr 1fr',
            gap: 12,
            padding: '12px 18px',
            borderTop: '1px solid var(--fx-border-default)',
            background: 'var(--fx-bg-sunken)',
            font: "600 14px/1.3 var(--fx-font-mono)",
          }}
        >
          <div>Total</div>
          <div style={{ textAlign: 'right', color: 'var(--fx-text-tertiary)' }}>{totalExpected}</div>
          <div style={{ textAlign: 'right' }}>{totalCut}</div>
          <div
            style={{
              textAlign: 'right',
              color: totalDifference === 0 ? 'var(--fx-text-tertiary)' : 'var(--fx-warning)',
            }}
          >
            {totalDifference > 0 ? '+' : ''}
            {totalDifference}
          </div>
          <div />
        </div>
      </div>

      {outside.length > 0 ? (
        <InlineAlert tone="danger">
          {outside.map((r) => `${r.size} ${r.variance > 0 ? '+' : ''}${r.variance}`).join(', ')} —
          outside the {tolerancePct}% tolerance. You can still file this; the variance is
          recorded against the report and the manager sees it. The pieces are already cut,
          and refusing to write down what happened does not un-cut them.
        </InlineAlert>
      ) : null}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ font: "400 12px/1.4 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
          filing closes {lay.layNo} · bundles are generated from this report
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <Button variant="primary" size="lg" disabled={!valid} onClick={() => void file()}>
            Save the cut report
          </Button>
        </span>
      </div>
    </div>
  )
}
