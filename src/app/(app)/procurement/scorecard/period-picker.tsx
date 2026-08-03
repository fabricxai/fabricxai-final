'use client'

import { useRouter } from 'next/navigation'

/**
 * Which month is being read.
 *
 * Only periods that have actually been scored are offered. A free month picker would let
 * somebody land on a month nobody computed and read the resulting blank table as "these
 * suppliers did nothing", which is the one misreading this whole screen is built to avoid.
 */
export function PeriodPicker({
  periods,
  current,
}: {
  periods: readonly string[]
  current: string
}) {
  const router = useRouter()

  if (periods.length <= 1) return null

  return (
    <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <span
        style={{
          font: '500 12px/1.3 var(--fx-font-mono)',
          textTransform: 'uppercase',
          letterSpacing: '.06em',
          color: 'var(--fx-text-tertiary)',
        }}
      >
        Period
      </span>
      <select
        value={current}
        onChange={(e) => router.push(`/procurement/scorecard?period=${e.target.value}`)}
        style={{
          padding: '8px 12px',
          border: '1px solid var(--fx-border-default)',
          borderRadius: 'var(--fx-radius-sm)',
          background: 'var(--fx-bg-surface)',
          color: 'var(--fx-text-primary)',
          font: '400 13px/1.4 var(--fx-font-sans)',
        }}
      >
        {periods.map((period) => (
          <option key={period} value={period}>
            {period}
          </option>
        ))}
      </select>
    </label>
  )
}
