/**
 * Shipment arithmetic (brief 8.1 §Operations). Pure — no database, no clock.
 *
 * The last module before goods leave the country, so every mistake here is one nothing
 * downstream can fix. Four rules shape the file:
 *
 *  1. **Over-pack is refused with CELL detail.** A carton holding garments finishing never
 *     produced holds garments that do not exist. "The order is 10 over" is useless to
 *     somebody standing at a carton; they need the colour and the size.
 *  2. **The mismatch report compares against the ORDERED grid.** Totals matching while the
 *     grid does not is a claim waiting to happen.
 *  3. **LC tolerance is a BAND.** 5% permits 95–105%. A bank can refuse documents on a
 *     short shipment exactly as on an over-shipment, and a check that only looks upward
 *     misses half of them.
 *  4. **Chargeable freight is the greater of actual and volumetric.** A carton of t-shirts
 *     is charged on its volume; quoting on gross kilos understates every light carton.
 */
export class ShipmentError extends Error {
  override readonly name = 'ShipmentError'
  /** Per-cell detail for an over-pack. Empty for every other failure. */
  readonly cells: { cell: string; finished: number; packed: number; over: number }[]

  constructor(
    message: string,
    cells: { cell: string; finished: number; packed: number; over: number }[] = [],
  ) {
    super(message)
    this.cells = cells
  }
}

/** `"Colour|Size" → quantity`. The pipe is the one character a colour name never has. */
export type CellMap = Record<string, number>

const DECIMAL = /^\d+(\.\d+)?$/

function assertWholeNonNegative(value: number, what: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new ShipmentError(`${what} must be a whole number of zero or more, got ${value}`)
  }
  return value
}

function assertDecimal(value: string, what: string): string {
  if (!DECIMAL.test(value)) throw new ShipmentError(`"${value}" is not a decimal ${what}`)
  return value
}

// ─────────────────────────────────────────────────────────────────────────────
// Packing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What is still available to pack: finished minus already packed, per cell.
 *
 * Fully-packed cells drop out rather than sitting at zero, so the result reads as a
 * worklist. `allowOverPack` exists for the report view — it returns the negatives instead
 * of throwing, so a supervisor can see how bad it is before deciding what to do.
 */
export function remainingToPack(
  finished: CellMap,
  packed: CellMap,
  options: { allowOverPack?: boolean } = {},
): CellMap {
  for (const [cell, qty] of Object.entries(finished)) {
    assertWholeNonNegative(qty, `finished quantity for ${cell}`)
  }

  const over: { cell: string; finished: number; packed: number; over: number }[] = []
  const remaining: CellMap = {}

  // Every cell either side, so packing something nobody finished is visible rather than
  // silently creating a new cell.
  const cells = new Set([...Object.keys(finished), ...Object.keys(packed)])

  for (const cell of [...cells].sort()) {
    const finishedQty = finished[cell] ?? 0
    const packedQty = assertWholeNonNegative(packed[cell] ?? 0, `packed quantity for ${cell}`)
    const left = finishedQty - packedQty

    if (left < 0) over.push({ cell, finished: finishedQty, packed: packedQty, over: -left })
    if (left !== 0) remaining[cell] = left
  }

  if (over.length > 0 && !options.allowOverPack) {
    throw new ShipmentError(
      `over-pack on ${over.length} cell(s): ${over.map((o) => `${o.cell} +${o.over}`).join(', ')}`,
      over,
    )
  }

  return remaining
}

export interface PackingMismatch {
  cell: string
  ordered: number
  packed: number
  /** packed − ordered. Signed per cell; never summed into one number. */
  variance: number
}

export interface PackingMismatchReport {
  matches: boolean
  totalOrdered: number
  totalPacked: number
  mismatches: PackingMismatch[]
}

/**
 * Compare what is packed against what the buyer ordered.
 *
 * Cell by cell. A total-based comparison passes a shipment that is 50 pieces of one size
 * short and 50 of another over, which is the shipment that generates a claim.
 */
export function packingMismatches(ordered: CellMap, packed: CellMap): PackingMismatchReport {
  const cells = [...new Set([...Object.keys(ordered), ...Object.keys(packed)])].sort()
  const mismatches: PackingMismatch[] = []
  let totalOrdered = 0
  let totalPacked = 0

  for (const cell of cells) {
    const orderedQty = assertWholeNonNegative(ordered[cell] ?? 0, `ordered quantity for ${cell}`)
    const packedQty = assertWholeNonNegative(packed[cell] ?? 0, `packed quantity for ${cell}`)

    totalOrdered += orderedQty
    totalPacked += packedQty

    if (orderedQty !== packedQty) {
      mismatches.push({ cell, ordered: orderedQty, packed: packedQty, variance: packedQty - orderedQty })
    }
  }

  return { matches: mismatches.length === 0, totalOrdered, totalPacked, mismatches }
}

// ─────────────────────────────────────────────────────────────────────────────
// LC tolerance
// ─────────────────────────────────────────────────────────────────────────────

export interface ToleranceResult {
  withinTolerance: boolean
  minQty: number
  maxQty: number
  direction: 'over' | 'short' | 'within'
  /** How far outside the band, in pieces. Zero when inside. */
  varianceQty: number
  tolerancePct: string
}

/**
 * Is the shipped quantity inside the LC's tolerance band?
 *
 * Both edges are inclusive, and the band never GROWS by rounding: the ceiling floors and
 * the floor ceils. Half a garment cannot ship, and rounding outward would invent
 * permission the LC did not give.
 */
export function lcToleranceCheck(input: {
  lcQty: number
  shippedQty: number
  tolerancePct: string
}): ToleranceResult {
  if (!Number.isInteger(input.lcQty) || input.lcQty <= 0) {
    throw new ShipmentError(`LC quantity must be a positive whole number, got ${input.lcQty}`)
  }
  assertWholeNonNegative(input.shippedQty, 'shipped quantity')
  assertDecimal(input.tolerancePct, 'tolerance percentage')

  const allowance = (BigInt(input.lcQty) * toMinor(input.tolerancePct)) / 10_000n
  const maxQty = input.lcQty + Number(allowance)
  const minQty = input.lcQty - Number(allowance)

  let direction: 'over' | 'short' | 'within' = 'within'
  let varianceQty = 0

  if (input.shippedQty > maxQty) {
    direction = 'over'
    varianceQty = input.shippedQty - maxQty
  } else if (input.shippedQty < minQty) {
    // The half everyone forgets. A bank can refuse documents on a short shipment exactly
    // as on an over-shipment.
    direction = 'short'
    varianceQty = minQty - input.shippedQty
  }

  return {
    withinTolerance: direction === 'within',
    minQty,
    maxQty,
    direction,
    varianceQty,
    tolerancePct: input.tolerancePct,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Carton volume and freight
// ─────────────────────────────────────────────────────────────────────────────

/** Cubic metres from centimetre dimensions, at six decimals. */
export function cartonCbm(input: {
  lengthCm: string
  widthCm: string
  heightCm: string
}): string {
  const l = toMinor(assertDecimal(input.lengthCm, 'length'))
  const w = toMinor(assertDecimal(input.widthCm, 'width'))
  const h = toMinor(assertDecimal(input.heightCm, 'height'))

  if (l === 0n || w === 0n || h === 0n) {
    throw new ShipmentError('a carton with a zero dimension has no volume')
  }

  // Each dimension carries 2 minor digits, so the product is cm³ × 10^6. Dividing by
  // 10^6 leaves cm³, which IS the CBM figure at six decimals — 72,000 cm³ → 0.072000.
  return fromMinorScaled((l * w * h) / 1_000_000n, 6)
}

export interface ChargeableWeight {
  basis: 'actual' | 'volumetric'
  chargeableUnits: string
  unit: 'kg' | 'revenue_tonne'
}

/** IATA volumetric divisor: 6,000 cm³ per chargeable kilo. */
const AIR_DIVISOR_CM3_PER_KG = 6000n

/**
 * Chargeable freight units — the greater of actual and volumetric.
 *
 * Sea is quoted per revenue tonne: 1 CBM against 1,000 kg, whichever is larger. Air uses
 * the IATA divisor. Either way a carton of t-shirts is charged on the space it occupies,
 * and quoting on gross weight understates the bill on every light carton.
 */
export function chargeableWeightKg(input: {
  mode: 'sea' | 'air'
  grossKg: string
  cbm: string
}): ChargeableWeight {
  assertDecimal(input.grossKg, 'gross weight')
  assertDecimal(input.cbm, 'CBM')

  if (input.mode === 'sea') {
    // Revenue tonne: CBM vs weight in tonnes, both at six decimals.
    const volumetric = toMinorScaled(input.cbm, 6)
    const actual = toMinorScaled(input.grossKg, 6) / 1000n

    return volumetric >= actual
      ? { basis: 'volumetric', chargeableUnits: fromMinorScaled(volumetric, 6), unit: 'revenue_tonne' }
      : { basis: 'actual', chargeableUnits: fromMinorScaled(actual, 6), unit: 'revenue_tonne' }
  }

  // cm³ = CBM × 1,000,000; volumetric kg = cm³ / 6,000.
  const cm3 = toMinorScaled(input.cbm, 6) // already CBM × 10^6, i.e. cm³
  const volumetricKg = (cm3 * 100n) / AIR_DIVISOR_CM3_PER_KG
  const actualKg = toMinor(input.grossKg)

  return volumetricKg >= actualKg
    ? { basis: 'volumetric', chargeableUnits: fromMinor(volumetricKg), unit: 'kg' }
    : { basis: 'actual', chargeableUnits: fromMinor(actualKg), unit: 'kg' }
}

// ─────────────────────────────────────────────────────────────────────────────
// The LC latest-shipment countdown (brief §Jobs)
// ─────────────────────────────────────────────────────────────────────────────

export interface CountdownResult {
  /** False when there is nothing to count down — no balance, or no date on the LC. */
  relevant: boolean
  daysRemaining: number | null
  breached: boolean
  unshippedQty: number
  reasonKey?: string
}

/**
 * Days until the LC's latest-shipment date, on the UNSHIPPED balance.
 *
 * Goes quiet once the balance is zero: a countdown that keeps firing on a fully-shipped
 * order trains people to ignore it, and this is the alert that must not be ignored.
 *
 * An LC with no latest-shipment date is reported as un-countable rather than as having no
 * deadline — treating a missing date as "no limit" is how a balance sits past a date
 * somebody forgot to type.
 */
export function latestShipmentCountdown(input: {
  latestShipmentDate: string | null
  today: string
  unshippedQty: number
}): CountdownResult {
  assertWholeNonNegative(input.unshippedQty, 'unshipped quantity')

  if (input.unshippedQty === 0) {
    return { relevant: false, daysRemaining: null, breached: false, unshippedQty: 0 }
  }

  if (!input.latestShipmentDate) {
    return {
      relevant: false,
      daysRemaining: null,
      breached: false,
      unshippedQty: input.unshippedQty,
      reasonKey: 'shipment.countdown.no_latest_shipment_date',
    }
  }

  const daysRemaining = dayGap(input.today, input.latestShipmentDate)

  return {
    relevant: true,
    daysRemaining,
    breached: daysRemaining < 0,
    unshippedQty: input.unshippedQty,
  }
}

function dayGap(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) {
    throw new ShipmentError(`"${from}" or "${to}" is not a date`)
  }
  return Math.round((b - a) / 86_400_000)
}

// ─────────────────────────────────────────────────────────────────────────────
// Exact decimal helpers — weights and volumes are numeric and never floats
// ─────────────────────────────────────────────────────────────────────────────

function toMinorScaled(value: string, scale: number): bigint {
  const [whole = '0', fraction = ''] = value.split('.')
  return BigInt(whole + fraction.padEnd(scale, '0').slice(0, scale))
}

function fromMinorScaled(minor: bigint, scale: number): string {
  const digits = minor.toString().padStart(scale + 1, '0')
  return `${digits.slice(0, -scale)}.${digits.slice(-scale)}`
}

const toMinor = (value: string): bigint => toMinorScaled(value, 2)
const fromMinor = (minor: bigint): string => fromMinorScaled(minor, 2)
