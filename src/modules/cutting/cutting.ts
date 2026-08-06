/**
 * Cutting arithmetic (brief 5.1 §Operations). Pure — no database, no clock.
 *
 * Cutting is where an order stops being reversible. Fabric cut to the wrong ratio cannot
 * be uncut, and a short cut surfaces in finishing six weeks later with no fabric left to
 * fix it. Two rules follow from that and shape everything here:
 *
 *  1. **Completion is judged on the grid, never the total.** 1,000 pieces cut against
 *     1,000 ordered is not a finished order if black is 200 short and white 200 over.
 *  2. **Over-cut and short-cut are reported separately.** Cutting extra burns fabric;
 *     cutting short burns the order. A single signed number reads as zero when both
 *     happen, which is exactly when somebody needs to know.
 */
import { compositeKey, splitKey } from '@/lib/keys'
import { fromMinor, multiplyDecimalStrings, roundToScale, toMinor } from '@/lib/quantity'

export class CuttingError extends Error {
  override readonly name = 'CuttingError'
}

const DECIMAL = /^\d+(\.\d+)?$/

export interface MarkerSpec {
  /** size → pieces of that size in one ply of the marker, e.g. { S: 1, M: 2, L: 1 }. */
  sizeRatio: Record<string, number>
  layLengthMeters: string
  fabricWidthInches?: string
}

export interface LayYield {
  perSize: Record<string, number>
  totalPieces: number
  /** Lay length × plies — the figure wastage is measured against. */
  plannedFabric: string
  consumptionPerPiece: string
}

function assertPositiveInt(value: number, what: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new CuttingError(`${what} must be a positive whole number, got ${value}`)
  }
  return value
}

function assertDecimal(value: string, what: string): string {
  if (!DECIMAL.test(value)) throw new CuttingError(`"${value}" is not a decimal ${what}`)
  return value
}

/** What a lay actually produces. */
export function layYield(marker: MarkerSpec, plies: number): LayYield {
  assertPositiveInt(plies, 'ply count')
  assertDecimal(marker.layLengthMeters, 'lay length')

  const piecesPerPly = Object.values(marker.sizeRatio).reduce((sum, n) => {
    if (!Number.isInteger(n) || n < 0) {
      throw new CuttingError(`size ratio entries must be whole numbers, got ${n}`)
    }
    return sum + n
  }, 0)

  if (piecesPerPly <= 0) {
    // A marker with nothing in it would divide the consumption by zero and report a
    // lay that costs fabric and yields nothing.
    throw new CuttingError('marker has no pieces in it')
  }

  const perSize: Record<string, number> = {}
  for (const [size, count] of Object.entries(marker.sizeRatio)) {
    if (count > 0) perSize[size] = count * plies
  }

  const plannedFabric = roundToScale(
    multiplyDecimalStrings(marker.layLengthMeters, String(plies)),
  )

  return {
    perSize,
    totalPieces: piecesPerPly * plies,
    plannedFabric,
    // Per garment, from the marker itself — independent of how many plies were laid.
    consumptionPerPiece: divideDecimal(marker.layLengthMeters, String(piecesPerPly)),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cut report vs the active breakdown revision
// ─────────────────────────────────────────────────────────────────────────────

export interface BreakdownCell {
  color: string
  size: string
  qty: number
}

export type CutCell = BreakdownCell

export type CellStatus = 'ok' | 'over' | 'short' | 'pending' | 'not_ordered'

export interface CutReportCell {
  color: string
  size: string
  orderedQty: number
  cutQty: number
  /** cut − ordered. Signed per cell; never summed across cells into one number. */
  variance: number
  allowance: number
  status: CellStatus
}

export interface CutReportValidation {
  cells: CutReportCell[]
  totalOrdered: number
  totalCut: number
  totalOver: number
  totalShort: number
  withinTolerance: boolean
}

const cellKey = (cell: { color: string; size: string }) => compositeKey(cell.color, cell.size)

/**
 * Compare a cut report against the ACTIVE breakdown revision.
 *
 * `pending` and `short` are deliberately different. Mid-cut is the normal state of a
 * cutting floor, and calling every uncut cell short would make every report in progress
 * look like a failure — which is how a real short cut gets ignored.
 */
export function validateCutReport(
  breakdown: readonly BreakdownCell[],
  cut: readonly CutCell[],
  options: { tolerancePct: string },
): CutReportValidation {
  assertDecimal(options.tolerancePct, 'tolerance percentage')

  const ordered = new Map<string, BreakdownCell>()
  for (const cell of breakdown) {
    assertPositiveInt(cell.qty, `ordered quantity for ${cell.color}/${cell.size}`)
    ordered.set(cellKey(cell), cell)
  }

  const cutByCell = new Map<string, number>()
  for (const cell of cut) {
    if (!Number.isInteger(cell.qty) || cell.qty < 0) {
      throw new CuttingError(`cut quantity for ${cell.color}/${cell.size} must be a whole number`)
    }
    cutByCell.set(cellKey(cell), (cutByCell.get(cellKey(cell)) ?? 0) + cell.qty)
  }

  const cells: CutReportCell[] = []
  let totalOrdered = 0
  let totalCut = 0
  let totalOver = 0
  let totalShort = 0

  for (const [key, cell] of ordered) {
    const cutQty = cutByCell.get(key) ?? 0
    // A fractional garment cannot be cut, so the allowance floors rather than flattering
    // the report: 2% of 101 pieces is 2 whole pieces, not 2.02. The product is exact and
    // never negative here, so its integer part IS the floor — no float ever appears.
    const [wholeAllowance = '0'] = multiplyDecimalStrings(
      String(cell.qty),
      divideBy100(options.tolerancePct),
    ).split('.')
    const allowance = Number(wholeAllowance)
    const variance = cutQty - cell.qty

    let status: CellStatus
    if (cutQty === 0) status = 'pending'
    else if (variance > allowance) status = 'over'
    else if (-variance > allowance) status = 'short'
    else status = 'ok'

    if (status === 'over') totalOver += variance
    if (status === 'short') totalShort += -variance

    totalOrdered += cell.qty
    totalCut += cutQty
    cells.push({ ...cell, orderedQty: cell.qty, cutQty, variance, allowance, status })
  }

  for (const [key, cutQty] of cutByCell) {
    if (ordered.has(key)) continue
    const [color = '', size = ''] = splitKey(key)
    // Cutting a colour the buyer never ordered is a different mistake from cutting too
    // many of one they did, and the fabric is gone either way.
    cells.push({
      color,
      size,
      orderedQty: 0,
      cutQty,
      variance: cutQty,
      allowance: 0,
      status: 'not_ordered',
    })
    totalCut += cutQty
  }

  return {
    cells,
    totalOrdered,
    totalCut,
    totalOver,
    totalShort,
    withinTolerance: cells.every((c) => c.status === 'ok' || c.status === 'pending'),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Completion
// ─────────────────────────────────────────────────────────────────────────────

export interface CutCompletion {
  /** Every ordered cell met. This is what auto-actualises the TNA cutting milestone. */
  complete: boolean
  /** Progress against the order, capped at 100 — an over-cut is not extra progress. */
  pct: string
  shortCells: { color: string; size: string; short: number }[]
}

/**
 * How far through cutting an order is.
 *
 * Judged cell by cell. A total-based figure lets an over-cut of one colour cover a short
 * of another, which is how an order reaches "100% cut" and still cannot be shipped.
 */
export function cutCompletion(
  breakdown: readonly BreakdownCell[],
  cut: readonly CutCell[],
): CutCompletion {
  const cutByCell = new Map<string, number>()
  for (const cell of cut) {
    cutByCell.set(cellKey(cell), (cutByCell.get(cellKey(cell)) ?? 0) + cell.qty)
  }

  let ordered = 0
  let counted = 0
  const shortCells: { color: string; size: string; short: number }[] = []

  for (const cell of breakdown) {
    const cutQty = cutByCell.get(cellKey(cell)) ?? 0
    ordered += cell.qty
    // Only up to what was ordered counts toward progress — see `pct` above.
    counted += Math.min(cutQty, cell.qty)
    if (cutQty < cell.qty) {
      shortCells.push({ color: cell.color, size: cell.size, short: cell.qty - cutQty })
    }
  }

  if (ordered === 0) throw new CuttingError('breakdown is empty — nothing to cut against')

  return {
    complete: shortCells.length === 0,
    pct: percentage(String(counted), String(ordered)),
    shortCells,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wastage
// ─────────────────────────────────────────────────────────────────────────────

export interface WastageResult {
  wastageQty: string
  wastagePct: string
}

/**
 * Fabric drawn against what the marker planned.
 *
 * Under-draw is reported as a negative, not clamped to zero: drawing less than planned
 * usually means the lay was short or a roll was mis-measured, which is the more
 * interesting problem of the two.
 */
export function wastageForOrder(input: {
  fabricDrawn: string
  markerConsumption: string
}): WastageResult {
  assertDecimal(input.fabricDrawn, 'fabric drawn')
  assertDecimal(input.markerConsumption, 'marker consumption')

  if (toMinor(input.markerConsumption) === 0n) {
    throw new CuttingError('marker consumption is zero — there is nothing to measure against')
  }

  const difference = fromMinor(toMinor(input.fabricDrawn) - toMinor(input.markerConsumption))

  return {
    wastageQty: difference,
    wastagePct: percentage(difference, input.markerConsumption, { allowNegative: true }),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bundles
// ─────────────────────────────────────────────────────────────────────────────

export interface Bundle {
  bundleNo: string
  color: string
  size: string
  qty: number
}

/**
 * Split a cut cell into bundles.
 *
 * Numbering is deterministic. A re-render must produce the same tickets as the first one,
 * because the originals are already stapled to bundles moving down the floor.
 */
export function bundlesForCell(cell: CutCell, bundleSize: number): Bundle[] {
  assertPositiveInt(bundleSize, 'bundle size')
  assertPositiveInt(cell.qty, `quantity for ${cell.color}/${cell.size}`)

  const bundles: Bundle[] = []
  let remaining = cell.qty
  let index = 1

  while (remaining > 0) {
    const qty = Math.min(bundleSize, remaining)
    bundles.push({
      bundleNo: `${cell.color}-${cell.size}-${String(index).padStart(2, '0')}`,
      color: cell.color,
      size: cell.size,
      qty,
    })
    remaining -= qty
    index += 1
  }

  return bundles
}

// ─────────────────────────────────────────────────────────────────────────────
// Exact decimal helpers — fabric is numeric(12,2) and never a float
// ─────────────────────────────────────────────────────────────────────────────

/** `2` → `0.02`, exactly. */
function divideBy100(pct: string): string {
  const [whole = '0', fraction = ''] = pct.split('.')
  const digits = (whole + fraction).padStart(fraction.length + 3, '0')
  const scale = fraction.length + 2
  return `${digits.slice(0, -scale) || '0'}.${digits.slice(-scale)}`
}

/** Exact division at the quantity scale — half-up on the last digit only. */
function divideDecimal(numerator: string, denominator: string): string {
  const den = toMinor(denominator)
  if (den === 0n) throw new CuttingError('division by zero')
  // Scale up by 10^3 so the rounding decision is made on a digit we actually computed.
  const scaled = (toMinor(numerator) * 1000n) / den
  return fromMinor((scaled + 5n) / 10n)
}

/** `part / whole` as a percentage at two decimals. */
function percentage(
  part: string,
  whole: string,
  options: { allowNegative?: boolean } = {},
): string {
  const wholeMinor = toMinor(whole)
  if (wholeMinor === 0n) throw new CuttingError('percentage of zero is undefined')

  const partMinor = toMinor(part)
  const negative = partMinor < 0n
  if (negative && !options.allowNegative) {
    throw new CuttingError('percentage cannot be negative here')
  }

  const scaled = ((negative ? -partMinor : partMinor) * 100000n) / wholeMinor
  const rounded = (scaled + 5n) / 10n
  return `${negative ? '-' : ''}${fromMinor(rounded)}`
}
