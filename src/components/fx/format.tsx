import type { Money } from '@/lib/money'
import type { Quantity } from '@/lib/quantity'

/**
 * Display formatters.
 *
 * Two rules from the design system meet two rules from CLAUDE.md here:
 *
 *  - Every amount carries its currency, and money never goes through
 *    parseFloat/Number. These components render the decimal STRING as-is.
 *  - Bengali digits are on for dates, counts and durations inside Bengali
 *    prose, and OFF — always off — for identifiers, money, quantities in
 *    tables and anything in mono. PO-88203 never becomes পিও-৮৮২০৩, and
 *    scripts are never mixed inside one token.
 */

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯']

/** Only for counts, dates and durations inside Bengali prose. Never for money or IDs. */
export function toBengaliDigits(input: string): string {
  return input.replace(/\d/g, (d) => BN_DIGITS[Number(d)]!)
}

const SYMBOL: Record<string, string> = { USD: '$', BDT: '৳' }

/**
 * Money always renders its currency, in mono, with tabular figures so stacked
 * amounts align. Bengali digits are never applied.
 */
export function MoneyText({
  value,
  size = 14,
  tone = 'primary',
}: {
  value: Money
  size?: number
  tone?: 'primary' | 'secondary' | 'tertiary'
}) {
  const symbol = SYMBOL[value.currency]
  return (
    <span
      data-numeric
      data-mono
      title={`${value.amount} ${value.currency}`}
      style={{
        font: `400 ${size}px/1.3 var(--fx-font-mono)`,
        color: `var(--fx-text-${tone})`,
        whiteSpace: 'nowrap',
      }}
    >
      {symbol ? `${symbol}${value.amount}` : `${value.amount} ${value.currency}`}
      {symbol ? (
        <span style={{ color: 'var(--fx-text-tertiary)', marginLeft: 4, fontSize: size - 2 }}>
          {value.currency}
        </span>
      ) : null}
    </span>
  )
}

/** A quantity always renders its unit — 12 metres and 12 pieces are not the same row. */
export function QtyText({
  value,
  size = 14,
  tone = 'primary',
}: {
  value: Quantity
  size?: number
  tone?: 'primary' | 'secondary' | 'tertiary'
}) {
  return (
    <span
      data-numeric
      data-mono
      style={{
        font: `400 ${size}px/1.3 var(--fx-font-mono)`,
        color: `var(--fx-text-${tone})`,
        whiteSpace: 'nowrap',
      }}
    >
      {value.value}
      <span style={{ color: 'var(--fx-text-tertiary)', marginLeft: 4, fontSize: size - 2 }}>
        {value.unit}
      </span>
    </span>
  )
}

/** Identifiers — PO numbers, LC numbers, run ids. Latin mono in both languages. */
export function Ident({ children, size = 13 }: { children: string; size?: number }) {
  return (
    <span
      data-mono
      style={{
        font: `400 ${size}px/1.3 var(--fx-font-mono)`,
        color: 'var(--fx-text-primary)',
      }}
    >
      {children}
    </span>
  )
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Dates render as "04 Sep" in mono. In Bengali prose the digits may switch,
 * which is the one place `bengaliDigits` is correct.
 */
export function DateText({
  value,
  bengaliDigits = false,
  withYear = false,
}: {
  value: Date | string
  bengaliDigits?: boolean
  withYear?: boolean
}) {
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) {
    return <span style={{ color: 'var(--fx-text-tertiary)' }}>—</span>
  }

  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = MONTHS[d.getUTCMonth()]
  const text = withYear ? `${day} ${month} ${d.getUTCFullYear()}` : `${day} ${month}`

  return (
    <time
      dateTime={d.toISOString()}
      data-numeric
      data-mono
      style={{ font: "400 13px/1.3 var(--fx-font-mono)", color: 'var(--fx-text-secondary)' }}
    >
      {bengaliDigits ? toBengaliDigits(text) : text}
    </time>
  )
}

/**
 * A figure that may be genuinely unknown. The owner dashboard renders
 * `unavailable` rather than zero, because a zero that means "we don't know"
 * is a number somebody will act on.
 */
export function Figure({
  value,
  size = 34,
  unavailable,
}: {
  value?: string | number | null
  size?: number
  unavailable?: string
}) {
  const missing = value === null || value === undefined || value === ''

  if (missing) {
    return (
      <span
        style={{
          font: `500 ${Math.round(size * 0.45)}px/1.2 var(--fx-font-mono)`,
          color: 'var(--fx-text-tertiary)',
        }}
      >
        {unavailable ?? 'unavailable'}
      </span>
    )
  }

  return (
    <span
      data-numeric
      style={{
        font: `600 ${size}px/1.05 var(--fx-font-sans)`,
        letterSpacing: '-.02em',
        color: 'var(--fx-text-primary)',
      }}
    >
      {value}
    </span>
  )
}
