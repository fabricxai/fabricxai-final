/**
 * RFQ & quotation logic (brief 1.2 §Operations). Pure — no database, no clock.
 *
 * Three rules, each because of a way quoting goes wrong:
 *
 *  1. **A quote SNAPSHOTS a cost sheet.** The sheet gets repriced; the quote the buyer
 *     holds does not change. A breakdown that recomputes from today's sheet is a quote
 *     nobody can reproduce when the buyer asks why the price moved.
 *  2. **The breakdown must reconcile.** A buyer negotiates it line by line, so components
 *     that do not sum to the total make the whole thing decoration — and a sheet whose
 *     stored total disagrees with its own components is reported, not quietly corrected.
 *  3. **Won means an order.** The payload has to carry everything 1.3 needs to create one,
 *     including a size breakdown that adds up — a piece dropped in the ratio is a piece
 *     short at final inspection.
 */
import { fromMinor, toMinor } from '@/lib/quantity'
import { defineStateMachine } from '../core/state-machine'

export class RfqError extends Error {
  override readonly name = 'RfqError'
}

const MONEY = /^\d+(\.\d{1,4})?$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** What 1.5 Costing hands over. Everything the quote needs, frozen. */
export interface CostSheetSnapshot {
  costSheetId: string
  version: number
  currency: string
  fobPrice: string
  totalCost: string
  marginPct: string
  marginBasis: 'price' | 'cost'
  /** Per-piece cost by component, in the sheet's currency. */
  components: Record<string, string>
  /** CM in the local currency — what the factory actually argues about. */
  cmLocalPerPiece?: string
  localCurrency?: string
}

export interface FobBreakdown {
  costSheetId: string
  costSheetVersion: number
  currency: string
  components: Record<string, string>
  /** The components added up. Compared against `totalCost`, never substituted for it. */
  componentsTotal: string
  totalCost: string
  fobPrice: string
  marginPct: string
  marginBasis: 'price' | 'cost'
  /** What the numbers actually give, as opposed to what the sheet claims. */
  achievedMarginPct: string
  /** False when the stored total and the components disagree. */
  reconciles: boolean
  cmLocalPerPiece?: string
  localCurrency?: string
}

function assertMoney(value: string, what: string): string {
  if (!MONEY.test(value)) throw new RfqError(`"${value}" is not a ${what}`)
  return value
}

/**
 * Freeze a cost sheet into a quote's breakdown.
 *
 * `componentsTotal` is computed and reported ALONGSIDE the sheet's stored `totalCost`
 * rather than replacing it. A disagreement means the sheet was tampered with or written by
 * older code, and quoting from it would put a number in front of a buyer the factory cannot
 * rebuild — so it is surfaced rather than silently corrected in either direction.
 */
export function buildFobBreakdown(sheet: CostSheetSnapshot): FobBreakdown {
  const componentNames = Object.keys(sheet.components)
  if (componentNames.length === 0) {
    throw new RfqError('a cost sheet with no components cannot be quoted from')
  }

  assertMoney(sheet.totalCost, 'money amount')
  assertMoney(sheet.fobPrice, 'money amount')

  const fob = toMinor(sheet.fobPrice)
  if (fob <= 0n) throw new RfqError('a quote needs a price')

  let componentsMinor = 0n
  for (const [name, amount] of Object.entries(sheet.components)) {
    componentsMinor = sumMinor(componentsMinor, toMinor(assertMoney(amount, `${name} cost`)))
  }

  const stored = toMinor(sheet.totalCost)
  const achieved = percentage(
    sumMinor(fob, -stored),
    sheet.marginBasis === 'price' ? fob : stored,
  )

  return {
    costSheetId: sheet.costSheetId,
    costSheetVersion: sheet.version,
    currency: sheet.currency,
    components: { ...sheet.components },
    componentsTotal: fromMinor(componentsMinor),
    totalCost: sheet.totalCost,
    fobPrice: sheet.fobPrice,
    marginPct: sheet.marginPct,
    marginBasis: sheet.marginBasis,
    achievedMarginPct: achieved,
    reconciles: componentsMinor === stored,
    cmLocalPerPiece: sheet.cmLocalPerPiece,
    localCurrency: sheet.localCurrency,
  }
}

/**
 * Is this quote past its validity date?
 *
 * The validity date itself is still valid — a quote good "until 30 July" is good on 30
 * July, and expiring a day early loses orders. A quote with no date never expires on its
 * own; absent a stated date, withdrawing it is a commercial decision rather than an
 * arithmetic one.
 */
export function isQuoteExpired(input: { validityDate: string | null; today: string }): boolean {
  if (!input.validityDate) return false
  if (!ISO_DATE.test(input.validityDate) || !ISO_DATE.test(input.today)) {
    throw new RfqError('quote validity needs YYYY-MM-DD dates')
  }
  return input.today > input.validityDate
}

// ─────────────────────────────────────────────────────────────────────────────
// Winning
// ─────────────────────────────────────────────────────────────────────────────

export interface WonInput {
  rfqId: string
  buyerId: string
  styleCode: string
  quantity: number
  unit: string
  sizeRatio: Record<string, number>
  fobPrice: string
  currency: string
  requestedShipDate: string | null
}

export interface WonPayload extends Omit<WonInput, 'requestedShipDate'> {
  requestedShipDate: string
  /** The ratio applied to the quantity. Always sums to `quantity`. */
  sizeBreakdown: Record<string, number>
}

/**
 * What 1.3 needs to create an order (brief: "emits `rfq.won` with order-creation payload").
 *
 * Every refusal here is a thing an order cannot be created without. A win missing the size
 * ratio produces an order nobody can cut — "12,000 pieces" is not a cutting instruction,
 * 5.1 needs pieces per size. A win missing the requested ship date produces an order with
 * no TNA, because the whole plan is generated backwards from that date.
 *
 * The remainder goes on the LARGEST size rather than being dropped: a piece lost in the
 * ratio is a piece short at final inspection, discovered when there is no fabric left.
 */
export function wonPayload(input: WonInput): WonPayload {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new RfqError(`quantity must be a positive whole number, got ${input.quantity}`)
  }
  if (!input.requestedShipDate) {
    throw new RfqError('an order needs a requested ship date — the TNA is built backwards from it')
  }

  const sizes = Object.entries(input.sizeRatio).filter(([, parts]) => parts > 0)
  if (sizes.length === 0) {
    throw new RfqError('an order with no size ratio cannot be cut')
  }

  for (const [size, parts] of sizes) {
    if (!Number.isInteger(parts) || parts < 0) {
      throw new RfqError(`size ratio for ${size} must be a whole number, got ${parts}`)
    }
  }

  const ratioSum = sizes.reduce((sum, [, parts]) => sum + parts, 0)
  const sizeBreakdown: Record<string, number> = {}
  let allocated = 0

  for (const [size, parts] of sizes) {
    const share = Math.floor((input.quantity * parts) / ratioSum)
    sizeBreakdown[size] = share
    allocated += share
  }

  // Whatever the division dropped goes to the size with the most parts — the one where a
  // few extra pieces are least likely to be noticed as a ratio distortion.
  if (allocated < input.quantity) {
    const largest = sizes.reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0]
    sizeBreakdown[largest] = (sizeBreakdown[largest] ?? 0) + (input.quantity - allocated)
  }

  return {
    rfqId: input.rfqId,
    buyerId: input.buyerId,
    styleCode: input.styleCode,
    quantity: input.quantity,
    unit: input.unit,
    sizeRatio: input.sizeRatio,
    fobPrice: input.fobPrice,
    currency: input.currency,
    requestedShipDate: input.requestedShipDate,
    sizeBreakdown,
  }
}

/**
 * open → clarifying → quoted → won | lost.
 *
 * `quoted → clarifying` exists because buyers ask questions AFTER seeing a price, which is
 * when they ask the most pointed ones. `won` is terminal: it is an order now.
 *
 * `open → won` is refused. Winning without a quote means there is no price, and the order
 * it creates would have none.
 */
export const rfqStatusMachine = defineStateMachine({
  field: 'status',
  initial: 'open',
  transitions: {
    open: ['clarifying', 'quoted', 'lost', 'cancelled'],
    clarifying: ['quoted', 'lost', 'cancelled'],
    // `quoted → quoted` is a RE-QUOTE, and it is the most ordinary thing that happens to
    // an RFQ: the buyer pushes back on price and a new version supersedes the old one.
    // Forbidding it would force a merchandiser to move the RFQ backwards to re-price it.
    quoted: ['quoted', 'clarifying', 'won', 'lost', 'cancelled'],
    won: [],
    lost: [],
    cancelled: [],
  },
})

export type RfqStatus = (typeof rfqStatusMachine.states)[number]

// ─────────────────────────────────────────────────────────────────────────────
// Exact decimal helpers — money is numeric and never a float
// ─────────────────────────────────────────────────────────────────────────────

function sumMinor(...values: readonly bigint[]): bigint {
  return values.reduce((carried, next) => carried + next, 0n)
}

/** `part / whole` as a signed percentage at two decimals, rounded half-up once. */
function percentage(part: bigint, whole: bigint): string {
  if (whole === 0n) throw new RfqError('percentage of zero is undefined')
  const negative = part < 0n
  const scaled = ((negative ? -part : part) * 100n * 1000n) / whole
  return `${negative ? '-' : ''}${fromMinor((scaled + 5n) / 10n)}`
}
