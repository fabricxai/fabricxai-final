'use client'

import type { ReactNode } from 'react'

import { MarbimMark } from './mark'
import { Button } from './primitives'
import type { QueuedWrite } from '@/lib/offline/queue'

/**
 * Floor-density components.
 *
 * A floor screen is read at arm's length by somebody wearing gloves, on a
 * shared tablet, in a room where the network comes and goes. So: 56px rows,
 * ≥48px targets, larger type, and an honest account of what has not been sent.
 */

/** Wraps a floor screen and switches the density tokens for everything inside. */
export function FloorScreen({ children }: { children: ReactNode }) {
  return <div data-density="floor">{children}</div>
}

/**
 * The sync pill.
 *
 * Shows what is genuinely still unsent. A pill that reads "synced" while forty
 * entries are stuck on the device is worse than no pill, because the operator
 * stops checking.
 */
export function SyncPill({
  online,
  queued,
  syncing,
  onSync,
}: {
  online: boolean
  queued: number
  syncing: boolean
  onSync: () => void
}) {
  const tone = !online ? 'var(--fx-warning)' : queued > 0 ? 'var(--fx-info)' : 'var(--fx-success)'

  return (
    <button
      onClick={onSync}
      disabled={syncing || queued === 0}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        minHeight: 'var(--fx-tap-min)',
        padding: '10px 16px',
        borderRadius: 'var(--fx-radius-full)',
        border: `1px solid ${tone}`,
        background: 'var(--fx-bg-surface)',
        color: 'var(--fx-text-primary)',
        font: "500 14px/1 var(--fx-font-mono)",
        cursor: queued > 0 && !syncing ? 'pointer' : 'default',
      }}
    >
      <span
        aria-hidden="true"
        style={{ width: 9, height: 9, borderRadius: 'var(--fx-radius-full)', background: tone }}
      />
      {syncing ? (
        <>
          <MarbimMark state="streaming" size={20} label={null} />
          sending
        </>
      ) : !online ? (
        <>offline · {queued} saved here</>
      ) : queued > 0 ? (
        <>{queued} to send · tap to retry</>
      ) : (
        <>all sent</>
      )}
    </button>
  )
}

/**
 * A banner for writes the SERVER refused.
 *
 * Distinct from being offline, and deliberately loud: an offline entry will
 * send itself, a refused one never will. Somebody has to look at it.
 */
export function RejectedWrites({
  refused,
  onDismiss,
}: {
  refused: QueuedWrite[]
  onDismiss: (offlineKey: string) => void
}) {
  if (refused.length === 0) return null

  return (
    <div
      role="alert"
      style={{
        border: '1px solid var(--fx-danger)',
        borderRadius: 'var(--fx-radius-md)',
        background: 'var(--fx-bg-surface)',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ font: "600 16px/1.3 var(--fx-font-sans)", color: 'var(--fx-text-primary)' }}>
        {refused.length} {refused.length === 1 ? 'entry was' : 'entries were'} refused
      </div>
      {refused.map((entry) => (
        <div
          key={entry.offlineKey}
          style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
        >
          <span style={{ font: "400 14px/1.5 var(--fx-font-sans)", color: 'var(--fx-text-secondary)' }}>
            {entry.operation.replace(/_/g, ' ')} — {entry.rejection?.errorKey}
          </span>
          <Button variant="ghost" size="sm" onClick={() => onDismiss(entry.offlineKey)}>
            Dismiss
          </Button>
        </div>
      ))}
    </div>
  )
}

/**
 * Numeric entry sized for a gloved thumb.
 *
 * The value stays a STRING: a count typed on the floor goes into a decimal
 * column, and parsing it here would put a float between the operator and the
 * ledger.
 */
export function NumpadInput({
  label,
  value,
  onChange,
  unit,
  autoFocus,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  unit?: string
  autoFocus?: boolean
}) {
  return (
    // `minWidth: 0` on the label and the input, both deliberately.
    //
    // A text input's intrinsic min-width is about twenty characters, and neither a flex
    // item nor a grid track will shrink below that by default — so a row of four numpads
    // pushed the page wider than the screen and clipped the last one. On a desk browser it
    // looked fine; on the 1024 tablet the floor actually holds, the field a checker needs
    // was off the edge.
    <label style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <span style={{ font: "500 14px/1 var(--fx-font-sans)", color: 'var(--fx-text-secondary)' }}>
        {label}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <input
          value={value}
          inputMode="decimal"
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 56,
            background: 'var(--fx-bg-surface)',
            color: 'var(--fx-text-primary)',
            border: '1px solid var(--fx-border-default)',
            borderRadius: 'var(--fx-radius-sm)',
            padding: '12px 16px',
            font: "500 24px/1.2 var(--fx-font-mono)",
            textAlign: 'right',
          }}
        />
        {unit ? (
          <span style={{ font: "400 16px/1 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)', minWidth: 40 }}>
            {unit}
          </span>
        ) : null}
      </span>
    </label>
  )
}

/** A tall, high-contrast row for lists read standing up. */
export function FloorRow({
  primary,
  secondary,
  trailing,
  status,
  onClick,
}: {
  primary: ReactNode
  secondary?: ReactNode
  trailing?: ReactNode
  status?: 'on-track' | 'at-risk' | 'late' | 'done'
  onClick?: () => void
}) {
  return (
    <div
      className={status ? 'fx-selvage' : undefined}
      data-status={status}
      onClick={onClick}
      style={{
        background: 'var(--fx-bg-surface)',
        borderTop: '1px solid var(--fx-border-subtle)',
        cursor: onClick ? 'pointer' : undefined,
        display: status ? undefined : 'flex',
      }}
    >
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '14px 20px',
          minHeight: 'var(--fx-row-height)',
        }}
      >
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
          <span style={{ font: "600 17px/1.3 var(--fx-font-sans)", color: 'var(--fx-text-primary)' }}>
            {primary}
          </span>
          {secondary ? (
            <span style={{ font: "400 15px/1.4 var(--fx-font-sans)", color: 'var(--fx-text-secondary)' }}>
              {secondary}
            </span>
          ) : null}
        </span>
        {trailing}
      </div>
    </div>
  )
}
