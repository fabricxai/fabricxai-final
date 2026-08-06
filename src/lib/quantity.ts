/**
 * Quantities — metres, kilograms, pieces, dozens.
 *
 * The same discipline as `lib/money` and for the same reason: quantities are
 * `numeric(12,2)` decimal strings, and a float is how a bonded ledger stops reconciling
 * or a cutting floor over-issues by a roll. Scaled BigInt throughout; there is no float
 * path in this file.
 *
 * Separate from Money on purpose. A quantity has a UNIT, not a currency, and the two must
 * never be added — 12 metres plus 12 US dollars is a bug the type system should catch,
 * not a number. Mixing units throws for the same reason mixing currencies does: there is
 * no honest conversion without a factor somebody has to supply.
 */

/** Matches numeric(12,2). */
export const QUANTITY_SCALE = 2

export class QuantityError extends Error {
  override readonly name = 'QuantityError'
}

export interface Quantity {
  /** Decimal string, normalised to QUANTITY_SCALE places. */
  readonly value: string
  /** 'M', 'KG', 'PCS', 'DZN' — whatever the item's UoM says. */
  readonly unit: string
}

const DECIMAL = /^-?\d+(\.\d+)?$/

export function toMinor(value: string, what = 'quantity'): bigint {
  const trimmed = value.trim()
  if (!DECIMAL.test(trimmed)) throw new QuantityError(`"${value}" is not a decimal ${what}`)

  const negative = trimmed.startsWith('-')
  const [whole = '0', fraction = ''] = trimmed.replace('-', '').split('.')

  // Silently dropping a digit is how a 0.005 discrepancy per roll becomes a stock count
  // nobody can explain. Make the caller round.
  if (fraction.length > QUANTITY_SCALE && /[1-9]/.test(fraction.slice(QUANTITY_SCALE))) {
    throw new QuantityError(
      `"${value}" has more than ${QUANTITY_SCALE} decimal places — round explicitly`,
    )
  }

  const minor = BigInt(whole + fraction.padEnd(QUANTITY_SCALE, '0').slice(0, QUANTITY_SCALE))
  return negative ? -minor : minor
}

/**
 * The same conversion at a scale the caller names.
 *
 * `toMinor` is fixed at `QUANTITY_SCALE` (2), which is right for a stock figure and wrong for
 * a CONSUMPTION. `bom_lines.consumption` is `numeric(12, 4)` — the schema decided four
 * decimals — and a trims line of `0.0083` kg per piece is an ordinary figure, not an edge
 * case: it is thread.
 *
 * Read at scale 2 it truncates to `0.00`, so that line costs nothing in the quote and nothing
 * in the realised margin. Silently, and it had for the whole life of the module (plan 2.9,
 * found by swapping a local copy for this one; the local copy did not validate, so it zeroed
 * the value where this refuses it).
 *
 * Here rather than in the two modules that need it, because two private scale-4 converters is
 * how this debt started.
 */
export function toMinorAtScale(value: string, scale: number, what = 'quantity'): bigint {
  if (!Number.isInteger(scale) || scale < 0 || scale > 12) {
    throw new QuantityError(`scale ${scale} is not a usable number of decimal places`)
  }

  const trimmed = value.trim()
  if (!DECIMAL.test(trimmed)) throw new QuantityError(`"${value}" is not a decimal ${what}`)

  const negative = trimmed.startsWith('-')
  const [whole = '0', fraction = ''] = trimmed.replace('-', '').split('.')

  // Same refusal as `toMinor`, at the caller's scale. Silently dropping a digit is how a
  // per-piece consumption becomes a cost of zero.
  if (fraction.length > scale && /[1-9]/.test(fraction.slice(scale))) {
    throw new QuantityError(`"${value}" has more than ${scale} decimal places — round explicitly`)
  }

  const minor = BigInt(whole + fraction.padEnd(scale, '0').slice(0, scale))
  return negative ? -minor : minor
}

export function fromMinor(minor: bigint): string {
  const negative = minor < 0n
  const digits = (negative ? -minor : minor).toString().padStart(QUANTITY_SCALE + 1, '0')
  return `${negative ? '-' : ''}${digits.slice(0, -QUANTITY_SCALE)}.${digits.slice(-QUANTITY_SCALE)}`
}

export const quantity = (value: string | number, unit: string): Quantity => ({
  value: fromMinor(toMinor(String(value))),
  unit,
})

export const zeroQty = (unit: string): Quantity => ({ value: fromMinor(0n), unit })

function assertSameUnit(a: Quantity, b: Quantity): void {
  if (a.unit !== b.unit) {
    throw new QuantityError(
      `cannot combine ${a.unit} and ${b.unit} — units are never converted implicitly`,
    )
  }
}

export function addQty(a: Quantity, b: Quantity): Quantity {
  assertSameUnit(a, b)
  return { value: fromMinor(toMinor(a.value) + toMinor(b.value)), unit: a.unit }
}

export function subtractQty(a: Quantity, b: Quantity): Quantity {
  assertSameUnit(a, b)
  return { value: fromMinor(toMinor(a.value) - toMinor(b.value)), unit: a.unit }
}

export function sumQty(values: readonly Quantity[], unit?: string): Quantity {
  const first = values[0]
  if (!first) {
    if (!unit) throw new QuantityError('sum of an empty list needs an explicit unit')
    return zeroQty(unit)
  }
  return values.reduce(addQty, zeroQty(first.unit))
}

/** Multiply by a plain factor — consumption per piece × order quantity, or × (1 + wastage). */
export function multiplyQty(value: Quantity, factor: string | number): Quantity {
  const text = String(factor).trim()
  if (!DECIMAL.test(text)) throw new QuantityError(`"${factor}" is not a decimal factor`)

  const negative = text.startsWith('-')
  const [whole = '0', fraction = ''] = text.replace('-', '').split('.')
  const factorMinor = BigInt(whole + fraction) * (negative ? -1n : 1n)

  const scaled = toMinor(value.value) * factorMinor
  return { value: fromMinor(divideRoundHalfUp(scaled, 10n ** BigInt(fraction.length))), unit: value.unit }
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
 * Multiply two decimal strings EXACTLY, keeping every digit.
 *
 * Needed wherever an input is more precise than the output. BOM consumption is quoted to
 * four places (1.4523 m per garment is a real figure) while stock quantities are two, so
 * `consumption × qty × wastage` has to stay exact until the end. Rounding the consumption
 * to 1.45 first loses 2.3 metres per thousand garments — enough to stop a line.
 *
 * Shared rather than reimplemented: this is the third place the same folding was needed
 * (payroll overtime, cost-sheet materials, requisition sizing) and each earlier copy was
 * written only after the round-twice bug had already been shipped into a test.
 */
export function multiplyDecimalStrings(a: string, b: string): string {
  const split = (value: string) => {
    if (!DECIMAL.test(value)) throw new QuantityError(`"${value}" is not a decimal`)
    const [whole = '0', fraction = ''] = value.replace('-', '').split('.')
    return { digits: BigInt(whole + fraction), scale: fraction.length }
  }

  const left = split(a)
  const right = split(b)
  const negative = a.startsWith('-') !== b.startsWith('-')

  const product = left.digits * right.digits
  const scale = left.scale + right.scale
  if (scale === 0) return `${negative ? '-' : ''}${product}`

  const padded = product.toString().padStart(scale + 1, '0')
  return `${negative ? '-' : ''}${padded.slice(0, -scale)}.${padded.slice(-scale)}`
}

/**
 * Subtract two decimal strings exactly, keeping the finer of the two scales.
 * `a − b`; the result carries its sign ("-2.35").
 */
export function subtractDecimalStrings(a: string, b: string): string {
  const split = (value: string) => {
    if (!DECIMAL.test(value)) throw new QuantityError(`"${value}" is not a decimal`)
    const [whole = '0', fraction = ''] = value.replace('-', '').split('.')
    return { digits: BigInt(whole + fraction), scale: fraction.length, negative: value.startsWith('-') }
  }

  const left = split(a)
  const right = split(b)
  const scale = Math.max(left.scale, right.scale)
  const l = left.digits * 10n ** BigInt(scale - left.scale) * (left.negative ? -1n : 1n)
  const r = right.digits * 10n ** BigInt(scale - right.scale) * (right.negative ? -1n : 1n)
  const diff = l - r

  if (scale === 0) return diff.toString()
  const negative = diff < 0n
  const abs = (negative ? -diff : diff).toString().padStart(scale + 1, '0')
  return `${negative ? '-' : ''}${abs.slice(0, -scale)}.${abs.slice(-scale)}`
}

/**
 * Compare two decimal strings exactly, at any scale. -1 / 0 / 1 like Array.sort wants.
 *
 * The float spelling (`Number.parseFloat(a) > Number.parseFloat(b)`) is what this
 * replaces: fine until the day two 15-digit UD balances differ in the 16th, and the
 * comparison that gates a bonded issue answers from the rounding instead of the numbers.
 */
export function compareDecimalStrings(a: string, b: string): -1 | 0 | 1 {
  const split = (value: string) => {
    if (!DECIMAL.test(value)) throw new QuantityError(`"${value}" is not a decimal`)
    const [whole = '0', fraction = ''] = value.replace('-', '').split('.')
    return { digits: BigInt(whole + fraction), scale: fraction.length, negative: value.startsWith('-') }
  }

  const left = split(a)
  const right = split(b)
  const scale = Math.max(left.scale, right.scale)
  const l = left.digits * 10n ** BigInt(scale - left.scale) * (left.negative ? -1n : 1n)
  const r = right.digits * 10n ** BigInt(scale - right.scale) * (right.negative ? -1n : 1n)
  return l < r ? -1 : l > r ? 1 : 0
}

/**
 * `part` as a percentage of `whole`, exactly, rounded half-up ONCE to `decimals` places.
 * Null when the whole is zero — "no denominator" is an answer, 0% or ∞% are lies.
 *
 * This is the BTB-headroom and UD-utilisation figure, i.e. a number a bank or a customs
 * officer may later dispute; it must not be a float that happened to print nicely.
 */
export function ratioAsPercent(part: string, whole: string, decimals = 1): string | null {
  const split = (value: string) => {
    if (!DECIMAL.test(value)) throw new QuantityError(`"${value}" is not a decimal`)
    const [w = '0', fraction = ''] = value.replace('-', '').split('.')
    return { digits: BigInt(w + fraction), scale: fraction.length, negative: value.startsWith('-') }
  }

  const p = split(part)
  const w = split(whole)
  if (w.digits === 0n) return null

  // part×100×10^decimals ÷ whole, on a common scale, rounded half-up once.
  // Sign handled here: divideRoundHalfUp expects a positive denominator.
  const scale = Math.max(p.scale, w.scale)
  const numerator =
    p.digits * 10n ** BigInt(scale - p.scale) * 100n * 10n ** BigInt(decimals)
  const denominator = w.digits * 10n ** BigInt(scale - w.scale)
  const magnitude = divideRoundHalfUp(numerator, denominator)
  const rounded = p.negative !== w.negative ? -magnitude : magnitude

  if (decimals === 0) return rounded.toString()
  const negative = rounded < 0n
  const abs = (negative ? -rounded : rounded).toString().padStart(decimals + 1, '0')
  return `${negative ? '-' : ''}${abs.slice(0, -decimals)}.${abs.slice(-decimals)}`
}

/** Round a decimal string to `scale` places, half-up. The single rounding at the end. */
export function roundToScale(value: string, scale = QUANTITY_SCALE): string {
  if (!DECIMAL.test(value)) throw new QuantityError(`"${value}" is not a decimal`)

  const negative = value.startsWith('-')
  const [whole = '0', fraction = ''] = value.replace('-', '').split('.')
  if (fraction.length <= scale) {
    return `${negative ? '-' : ''}${whole}.${fraction.padEnd(scale, '0')}`
  }

  const keep = BigInt(whole + fraction.slice(0, scale))
  const nextDigit = Number(fraction[scale])
  const rounded = nextDigit >= 5 ? keep + 1n : keep

  const digits = rounded.toString().padStart(scale + 1, '0')
  return `${negative ? '-' : ''}${digits.slice(0, -scale)}.${digits.slice(-scale)}`
}

export function compareQty(a: Quantity, b: Quantity): -1 | 0 | 1 {
  assertSameUnit(a, b)
  const left = toMinor(a.value)
  const right = toMinor(b.value)
  return left < right ? -1 : left > right ? 1 : 0
}

export const isZeroQty = (value: Quantity): boolean => toMinor(value.value) === 0n
export const isNegativeQty = (value: Quantity): boolean => toMinor(value.value) < 0n
