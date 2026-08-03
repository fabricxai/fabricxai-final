'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { InlineAlert } from '@/components/fx/feedback'
import { NumpadInput, SyncPill } from '@/components/fx/floor'
import { Button } from '@/components/fx/primitives'
import { SectionHeading } from '@/components/fx/signature'
import { useOfflineQueue } from '@/lib/offline/use-offline-queue'

interface LineCount {
  lineId: string
  code: string
  name: string
  checked: number | null
  passed: number | null
  defective: number | null
  defects: number | null
  rework: number | null
  lastWrittenAt: string | null
}

type Draft = { checked: string; defective: string; defects: string; rework: string }

const EMPTY: Draft = { checked: '', defective: '', defects: '', rework: '' }

/** "14:12" in the reader's own clock — a floor screen is read at a glance, not parsed. */
function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * Endline counts, one line at a time.
 *
 * **`passed` is derived, not entered.** A checker counts what they inspected and what was
 * wrong; asking them for passed as well is asking for a third number that must equal the
 * first minus the second, and the service rejects the count when it does not. Deriving it
 * removes an entire class of refusal from a screen somebody uses forty times a day.
 *
 * **Defects can exceed defective garments**, and the screen says so, because one shirt with
 * a skipped stitch and a broken button is two defects on one garment. DHU counts defects;
 * pass rate counts garments. Conflating them is how a line reports 3% DHU and 3% failure
 * and nobody notices the numbers cannot both be right.
 */
export function EndlineClient({
  countedOn,
  lines,
}: {
  countedOn: string
  lines: readonly LineCount[]
}) {
  const router = useRouter()
  const { capture, online, queued, syncing, refused, sync, clear } = useOfflineQueue()

  const [active, setActive] = useState(lines[0]?.lineId ?? '')
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [saved, setSaved] = useState<string | null>(null)

  const line = lines.find((l) => l.lineId === active)

  const checked = Number.parseInt(draft.checked, 10) || 0
  const defective = Number.parseInt(draft.defective, 10) || 0
  const defects = Number.parseInt(draft.defects, 10) || 0
  const rework = Number.parseInt(draft.rework, 10) || 0
  const passed = Math.max(0, checked - defective)

  // Both derived on the fly, never stored — see the file note.
  const dhu = checked > 0 ? ((defects * 100) / checked).toFixed(2) : null
  const passRate = checked > 0 ? ((passed * 100) / checked).toFixed(2) : null

  const tooManyDefective = defective > checked
  const valid = checked > 0 && !tooManyDefective

  async function save() {
    if (!line || !valid) return

    await capture({
      moduleId: 'production',
      operation: 'record_endline_count',
      payload: {
        lineId: line.lineId,
        countedOn,
        checked,
        passed,
        defective,
        defects,
        rework,
      },
    })

    setSaved(`${line.code} · ${checked} checked · DHU ${dhu ?? '—'}`)
    setDraft(EMPTY)
    if (online) await sync()
    router.refresh()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <SyncPill online={online} queued={queued} syncing={syncing} onSync={() => void sync()} />

      {refused.length > 0 ? (
        <InlineAlert tone="danger">
          {refused.length} count{refused.length === 1 ? '' : 's'} the server refused.
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

      {saved ? (
        <InlineAlert tone="success">
          Saved {saved}. {online ? 'Sent.' : 'Held on this tablet until you are back online.'}
        </InlineAlert>
      ) : null}

      {/* ── Which line ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {lines.map((l) => {
          const on = l.lineId === active
          return (
            <button
              key={l.lineId}
              onClick={() => {
                setActive(l.lineId)
                setDraft(EMPTY)
              }}
              style={{
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 2,
                minHeight: 44,
                padding: '8px 14px',
                borderRadius: 'var(--fx-radius-md)',
                border: `1px solid ${on ? 'var(--fx-text-primary)' : 'var(--fx-border-default)'}`,
                background: on ? 'var(--fx-text-primary)' : 'transparent',
                color: on ? 'var(--fx-text-inverse)' : 'var(--fx-text-secondary)',
                cursor: 'pointer',
                font: "500 13px/1.2 var(--fx-font-sans)",
              }}
            >
              {l.code}
              <span style={{ font: "400 10.5px/1.2 var(--fx-font-mono)", opacity: 0.8 }}>
                {l.checked === null ? 'not counted' : `${l.checked} checked`}
              </span>
            </button>
          )
        })}
      </div>

      {line ? (
        <>
          <SectionHeading
            eyebrow={
              line.lastWrittenAt
                ? `QC last wrote ${clockTime(line.lastWrittenAt)}`
                : 'nothing counted yet today'
            }
          >
            {line.code} · {line.name}
          </SectionHeading>

          {/* auto-fit, not `repeat(4, 1fr)`. A grid track sized `1fr` still refuses to go
              below its content's min-width, and a number input's intrinsic width is about
              twenty characters — so four of them overflowed the page and clipped the last
              field. The canvas targets a 1024 tablet, which is narrower than the desk
              browser this was first looked at on. */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 14,
            }}
          >
            <NumpadInput
              label="Checked"
              value={draft.checked}
              onChange={(v) => setDraft((d) => ({ ...d, checked: v }))}
            />
            <NumpadInput
              label="Defective garments"
              value={draft.defective}
              onChange={(v) => setDraft((d) => ({ ...d, defective: v }))}
            />
            <NumpadInput
              label="Defects found"
              value={draft.defects}
              onChange={(v) => setDraft((d) => ({ ...d, defects: v }))}
            />
            <NumpadInput
              label="Sent to rework"
              value={draft.rework}
              onChange={(v) => setDraft((d) => ({ ...d, rework: v }))}
            />
          </div>

          <span style={{ font: "400 12px/1.4 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
            one garment can carry several defects — defects is not the same count as
            defective garments
          </span>

          {tooManyDefective ? (
            <InlineAlert tone="danger">
              {defective} defective out of {checked} checked. A count where more garments
              failed than were inspected cannot be filed.
            </InlineAlert>
          ) : null}

          {/* ── Derived ──────────────────────────────────────────────────── */}
          <SectionHeading eyebrow="derived, never stored">What that means</SectionHeading>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 1,
              background: 'var(--fx-border-subtle)',
              border: '1px solid var(--fx-border-subtle)',
            }}
          >
            {[
              { label: 'DHU', value: dhu ?? '—', note: 'defects per hundred units' },
              { label: 'Pass rate', value: passRate ? `${passRate}%` : '—', note: 'garments through first time' },
              { label: 'Rework queue', value: rework > 0 ? String(rework) : '—', note: 'back to the line' },
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
                <div style={{ marginTop: 6, font: "600 24px/1.1 var(--fx-font-sans)" }}>
                  {cell.value}
                </div>
                <div
                  style={{
                    marginTop: 4,
                    font: "400 12px/1.4 var(--fx-font-sans)",
                    color: 'var(--fx-text-tertiary)',
                  }}
                >
                  {cell.note}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{ font: "400 12px/1.4 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}
            >
              passed is {checked > 0 ? passed : '—'} — checked minus defective, not typed
            </span>
            <span style={{ marginLeft: 'auto' }}>
              <Button variant="primary" size="lg" disabled={!valid} onClick={() => void save()}>
                Save count
              </Button>
            </span>
          </div>
        </>
      ) : null}
    </div>
  )
}
