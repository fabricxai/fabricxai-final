/**
 * Money. Amounts are decimal STRINGS backed by `numeric(14,2)` in Postgres, and every
 * amount carries its currency (USD buyer-facing, BDT local — CLAUDE.md rule 4).
 *
 * All arithmetic here runs on scaled BigInt. There is no float path in this file and
 * there must be none anywhere else: `parseFloat`/`Number()` on a money value is
 * lint-banned, because 0.1 + 0.2 on a factory's margin is a real invoice being wrong.
 *
 * Mixed-currency arithmetic throws rather than guessing at a rate. Conversion exists
 * (`convert`) but only as a rate-CARRYING operation: the caller must supply the rate and
 * say where it came from. There is no ambient exchange rate anywhere in this system,
 * because an FOB quoted in January at 110 BDT/USD is a different quote from the same
 * figure at 120, and a system that silently picks one is a system that reprices history.
 */

/** Minor units kept. 2 matches numeric(14,2). */
export const MONEY_SCALE = 2

export type Currency = string & { readonly __iso4217?: unique symbol }

export interface Money {
  /** Decimal string, always normalised to MONEY_SCALE places, e.g. "1250.00". */
  readonly amount: string
  /** ISO-4217 code, e.g. "USD", "BDT". */
  readonly currency: Currency
}

export class MoneyError extends Error {
  override readonly name = 'MoneyError'
}

const DECIMAL_RE = /^-?\d+(\.\d+)?$/

function toMinor(amount: string): bigint {
  const trimmed = amount.trim()
  if (!DECIMAL_RE.test(trimmed)) {
    throw new MoneyError(`"${amount}" is not a decimal amount`)
  }

  const negative = trimmed.startsWith('-')
  const [whole = '0', fraction = ''] = trimmed.replace('-', '').split('.')

  // Truncation here would silently lose money; require the caller to round first.
  if (fraction.length > MONEY_SCALE && /[1-9]/.test(fraction.slice(MONEY_SCALE))) {
    throw new MoneyError(
      `"${amount}" has more than ${MONEY_SCALE} decimal places — round explicitly before constructing Money`,
    )
  }

  const padded = fraction.padEnd(MONEY_SCALE, '0').slice(0, MONEY_SCALE)
  const minor = BigInt(whole + padded)
  return negative ? -minor : minor
}

function fromMinor(minor: bigint, currency: Currency): Money {
  const negative = minor < 0n
  const digits = (negative ? -minor : minor).toString().padStart(MONEY_SCALE + 1, '0')
  const whole = digits.slice(0, -MONEY_SCALE)
  const fraction = digits.slice(-MONEY_SCALE)
  return { amount: `${negative ? '-' : ''}${whole}.${fraction}`, currency }
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new MoneyError(
      `cannot combine ${a.currency} and ${b.currency} — convert explicitly with a rate`,
    )
  }
}

export function money(amount: string | number | bigint, currency: string): Money {
  return fromMinor(toMinor(String(amount)), currency as Currency)
}

export function zero(currency: string): Money {
  return fromMinor(0n, currency as Currency)
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b)
  return fromMinor(toMinor(a.amount) + toMinor(b.amount), a.currency)
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b)
  return fromMinor(toMinor(a.amount) - toMinor(b.amount), a.currency)
}

export function sum(values: readonly Money[], currency?: string): Money {
  const first = values[0]
  if (!first) {
    if (!currency) throw new MoneyError('sum of an empty list needs an explicit currency')
    return zero(currency)
  }
  return values.reduce(add, zero(first.currency))
}

/**
 * Multiply by a plain quantity or rate (unit price × pieces, amount × 0.15 VAT).
 * `factor` is a decimal string so a rate can be carried without float drift; the
 * result is rounded half-up, the convention every invoice in this domain uses.
 */
export function multiply(value: Money, factor: string | number | bigint): Money {
  const factorText = String(factor).trim()
  if (!DECIMAL_RE.test(factorText)) throw new MoneyError(`"${factor}" is not a decimal factor`)

  const [whole = '0', fraction = ''] = factorText.replace('-', '').split('.')
  const factorScale = fraction.length
  const factorMinor = BigInt(whole + fraction) * (factorText.startsWith('-') ? -1n : 1n)

  const scaled = toMinor(value.amount) * factorMinor
  const divisor = 10n ** BigInt(factorScale)
  return fromMinor(divideRoundHalfUp(scaled, divisor), value.currency)
}

/**
 * Multiply then divide, rounding ONCE at the end.
 *
 * This exists for wage arithmetic. Overtime is `hours × 2 × basic / 208`, and computing
 * it as `divide(basic, 208)` first rounds an hourly rate to two decimals before it is
 * multiplied by the hours — an error of up to half a paisa per hour, times every hour of
 * overtime, times 2,400 workers, every month. Doing the whole thing in one scaled
 * division keeps it exact until the final rounding.
 *
 * Half-up, the convention every payslip in this domain uses.
 */
export function mulDiv(
  value: Money,
  numerator: string | number | bigint,
  denominator: string | number | bigint,
): Money {
  const num = toScaledFactor(numerator, 'numerator')
  const den = toScaledFactor(denominator, 'denominator')
  if (den.value === 0n) throw new MoneyError('division by zero')

  // (amount × num/10^numScale) ÷ (den/10^denScale)
  //   = amount × num × 10^denScale ÷ (den × 10^numScale)
  const scaledNumerator = toMinor(value.amount) * num.value * 10n ** BigInt(den.scale)
  const scaledDenominator = den.value * 10n ** BigInt(num.scale)

  return fromMinor(divideRoundHalfUp(scaledNumerator, scaledDenominator), value.currency)
}

/** Exact division, rounded half-up once. */
export function divide(value: Money, divisor: string | number | bigint): Money {
  return mulDiv(value, 1, divisor)
}

/** Parse a decimal factor into an integer and the power of ten it was scaled by. */
function toScaledFactor(
  input: string | number | bigint,
  what: string,
): { value: bigint; scale: number } {
  const text = String(input).trim()
  if (!DECIMAL_RE.test(text)) throw new MoneyError(`"${input}" is not a decimal ${what}`)

  const negative = text.startsWith('-')
  const [whole = '0', fraction = ''] = text.replace('-', '').split('.')
  const value = BigInt(whole + fraction) * (negative ? -1n : 1n)

  return { value, scale: fraction.length }
}

function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n
  const abs = negative ? -numerator : numerator
  const quotient = abs / denominator
  const remainder = abs % denominator
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient
  return negative ? -rounded : rounded
}

/**
 * Convert at an EXPLICIT rate. There is no default and no lookup — the rate is an input,
 * and whoever supplies it is responsible for recording where it came from.
 *
 * `rate` is units of `to` per one unit of `value.currency`: converting 1,000 BDT to USD
 * at 0.0091 gives 9.10 USD. Costing snapshots the rate onto the sheet, so re-opening a
 * quote a year later reproduces the price that was actually given.
 */
export function convert(value: Money, params: { to: string; rate: string | number }): Money {
  const rate = String(params.rate).trim()
  if (!DECIMAL_RE.test(rate) || Number.parseFloat(rate) <= 0) {
    throw new MoneyError(`"${params.rate}" is not a positive exchange rate`)
  }
  if (params.to === value.currency) return value

  const [whole = '0', fraction = ''] = rate.split('.')
  const scaled = toMinor(value.amount) * BigInt(whole + fraction)
  return fromMinor(
    divideRoundHalfUp(scaled, 10n ** BigInt(fraction.length)),
    params.to as Currency,
  )
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b)
  const left = toMinor(a.amount)
  const right = toMinor(b.amount)
  return left < right ? -1 : left > right ? 1 : 0
}

export const isZero = (value: Money): boolean => toMinor(value.amount) === 0n
export const isNegative = (value: Money): boolean => toMinor(value.amount) < 0n
export const negate = (value: Money): Money => fromMinor(-toMinor(value.amount), value.currency)

/** Display only. Never feed the result back into arithmetic. */
export function format(value: Money, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: value.currency,
    minimumFractionDigits: MONEY_SCALE,
  }).format(Number(value.amount))
}
