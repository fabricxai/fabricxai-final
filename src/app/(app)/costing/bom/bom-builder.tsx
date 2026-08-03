'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { InlineAlert } from '@/components/fx/feedback'
import { actionErrorMessage } from '@/lib/action-error'
import { Button } from '@/components/fx/primitives'
import { SectionHeading } from '@/components/fx/signature'
import { saveBom } from '@/modules/costing/actions'

type Group = 'fabric' | 'trims' | 'packing' | 'embellishment'

interface Line {
  key: number
  lineGroup: Group
  itemRef: string
  spec: string
  consumption: string
  uom: string
  wastagePct: string
}

const GROUPS: readonly { id: Group; label: string; uom: string }[] = [
  { id: 'fabric', label: 'Fabric', uom: 'm' },
  { id: 'trims', label: 'Trims', uom: 'pcs' },
  { id: 'embellishment', label: 'Embellishment', uom: 'pcs' },
  { id: 'packing', label: 'Packing', uom: 'pcs' },
]

let nextKey = 1
const blankLine = (lineGroup: Group = 'fabric'): Line => ({
  key: nextKey++,
  lineGroup,
  itemRef: '',
  spec: '',
  consumption: '',
  uom: GROUPS.find((g) => g.id === lineGroup)?.uom ?? '',
  wastagePct: '',
})

/**
 * Build a bill of materials by hand.
 *
 * **Consumption is per garment, and the field says so.** The single most expensive mistake
 * available here is entering the fabric for a whole order into a per-piece field: a 12,000
 * piece order quoted at 2.4 metres a shirt costs the same as one quoted at 28,800 metres a
 * shirt, and only one of those gets noticed. The unit sits next to the number rather than
 * in a header three rows up.
 *
 * **Wastage is separate from consumption, never folded in.** A merchandiser who adds 5%
 * themselves and then types 5% into the wastage column has quoted 10%, and the sheet will
 * agree with them. Keeping the columns apart is what makes that visible.
 *
 * **No basis selector.** Everything typed here is an estimate — see the page's note.
 */
export function BomBuilder() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [open, setOpen] = useState(false)
  const [styleCode, setStyleCode] = useState('')
  const [lines, setLines] = useState<Line[]>([blankLine()])
  const [failure, setFailure] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  function update(key: number, patch: Partial<Line>) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line
        const next = { ...line, ...patch }
        // Changing the group swaps the default unit, but only while the field is untouched
        // — retyping "yd" and having it reset to "m" is worse than a wrong default.
        if (patch.lineGroup && line.uom === (GROUPS.find((g) => g.id === line.lineGroup)?.uom ?? '')) {
          next.uom = GROUPS.find((g) => g.id === patch.lineGroup)?.uom ?? next.uom
        }
        return next
      }),
    )
  }

  const usable = lines.filter(
    (l) => l.consumption.trim() !== '' && (l.itemRef.trim() !== '' || l.spec.trim() !== ''),
  )
  const ready = styleCode.trim() !== '' && usable.length > 0

  function save() {
    if (!ready) return
    setFailure(null)

    startTransition(async () => {
      try {
        const result = await saveBom({
          styleCode: styleCode.trim(),
          lines: usable.map((line) => ({
            lineGroup: line.lineGroup,
            // Empty strings become undefined rather than travelling as "" — the schema
            // wants one of the two present, and "" would satisfy it while naming nothing.
            ...(line.itemRef.trim() ? { itemRef: line.itemRef.trim() } : {}),
            ...(line.spec.trim() ? { spec: line.spec.trim() } : {}),
            consumption: line.consumption.trim(),
            uom: line.uom.trim(),
            wastagePct: line.wastagePct.trim() === '' ? '0' : line.wastagePct.trim(),
          })),
        })

        setSaved(`${styleCode.trim()} · ${result.lineCount} lines`)
        setStyleCode('')
        setLines([blankLine()])
        setOpen(false)
        router.refresh()
      } catch (error) {
        setFailure(actionErrorMessage(error, 'The bill of materials was not saved.'))
      }
    })
  }

  if (!open) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {saved ? (
          <InlineAlert tone="success">
            Saved {saved}. Consumption on it is recorded as estimated — it becomes measured
            only when a real order is issued against the style.
          </InlineAlert>
        ) : null}
        <div>
          <Button variant="primary" onClick={() => setOpen(true)}>
            Build one by hand
          </Button>
        </div>
      </div>
    )
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionHeading eyebrow="per garment — not per order">A new bill of materials</SectionHeading>

      {failure ? <InlineAlert tone="danger">{failure}</InlineAlert> : null}

      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 320 }}>
        <span style={labelStyle}>Style code</span>
        <input
          value={styleCode}
          onChange={(e) => setStyleCode(e.target.value)}
          placeholder="SHRT-4410"
          style={control}
        />
      </label>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ ...labelStyle, flex: '1 1 130px' }}>Group</span>
          <span style={{ ...labelStyle, flex: '1 1 150px' }}>Item code</span>
          <span style={{ ...labelStyle, flex: '1 1 190px' }}>or written spec</span>
          <span style={{ ...labelStyle, flex: '0 0 130px' }}>Per garment</span>
          <span style={{ ...labelStyle, flex: '0 0 80px' }}>Unit</span>
          <span style={{ ...labelStyle, flex: '0 0 100px' }}>Wastage %</span>
          <span style={{ flex: '0 0 32px' }} />
        </div>

        {lines.map((line) => (
          <div key={line.key} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <select
              value={line.lineGroup}
              onChange={(e) => update(line.key, { lineGroup: e.target.value as Group })}
              style={{ ...control, flex: '1 1 130px' }}
            >
              {GROUPS.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>

            <input
              value={line.itemRef}
              onChange={(e) => update(line.key, { itemRef: e.target.value })}
              placeholder="FAB-POP-40S"
              style={{ ...control, flex: '1 1 150px' }}
            />
            <input
              value={line.spec}
              onChange={(e) => update(line.key, { spec: e.target.value })}
              placeholder="40s poplin, 120 gsm"
              style={{ ...control, flex: '1 1 190px' }}
            />
            <input
              value={line.consumption}
              onChange={(e) => update(line.key, { consumption: e.target.value })}
              placeholder="2.4000"
              inputMode="decimal"
              style={{ ...control, flex: '0 0 130px', textAlign: 'right' }}
            />
            <input
              value={line.uom}
              onChange={(e) => update(line.key, { uom: e.target.value })}
              style={{ ...control, flex: '0 0 80px' }}
            />
            <input
              value={line.wastagePct}
              onChange={(e) => update(line.key, { wastagePct: e.target.value })}
              placeholder="0"
              inputMode="decimal"
              style={{ ...control, flex: '0 0 100px', textAlign: 'right' }}
            />

            <button
              onClick={() => setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.key !== line.key)))}
              disabled={lines.length === 1}
              aria-label="Remove this line"
              style={{
                flex: '0 0 32px',
                border: '1px solid var(--fx-border-default)',
                borderRadius: 'var(--fx-radius-sm)',
                background: 'transparent',
                color: 'var(--fx-text-tertiary)',
                cursor: lines.length === 1 ? 'default' : 'pointer',
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button
          variant="secondary"
          onClick={() => setLines((prev) => [...prev, blankLine(prev[prev.length - 1]?.lineGroup)])}
        >
          Add a line
        </Button>
        <Button variant="primary" disabled={!ready || pending} onClick={save}>
          {pending ? 'Saving…' : `Save ${usable.length || ''} ${usable.length === 1 ? 'line' : 'lines'}`}
        </Button>
        <button
          onClick={() => {
            setOpen(false)
            setFailure(null)
          }}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            font: "400 13px/1.4 var(--fx-font-sans)",
            color: 'var(--fx-text-tertiary)',
            textDecoration: 'underline',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>

      <p style={{ margin: 0, font: "400 12px/1.6 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
        {/* Both halves are stated because both are guessed at. Blank lines are dropped
            silently otherwise, and somebody counts eight rows and saves six. */}
        Lines with no consumption, or naming neither an item nor a spec, are left out — {usable.length} of{' '}
        {lines.length} will be saved. Wastage is added by the cost sheet on top of consumption, so do
        not build it into the figure as well.
      </p>
    </section>
  )
}

const labelStyle: React.CSSProperties = {
  font: "500 11px/1.3 var(--fx-font-mono)",
  textTransform: 'uppercase',
  letterSpacing: '.06em',
  color: 'var(--fx-text-tertiary)',
}

const control: React.CSSProperties = {
  minWidth: 0,
  padding: '9px 11px',
  border: '1px solid var(--fx-border-default)',
  borderRadius: 'var(--fx-radius-sm)',
  background: 'var(--fx-bg-surface)',
  color: 'var(--fx-text-primary)',
  font: "400 13.5px/1.4 var(--fx-font-sans)",
}
