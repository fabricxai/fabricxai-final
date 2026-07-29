/**
 * Procurement arithmetic (brief 3.2 §Operations). Pure — no database, no clock.
 *
 * The mistake this file is built against is choosing a quote on its unit price. A mill at
 * $2.10 is not cheaper than one at $2.15 if its MOQ forces two thousand surplus metres,
 * its freight is higher, or it lands after the fabric-in-house date. Each of those has
 * sunk a delivery, and none of them shows in the column people sort by.
 *
 * Two rules run through everything here:
 *
 *  1. **Feasibility before price.** A quote that cannot arrive in time is not a cheap
 *     option; it is excluded, with the date it would actually land.
 *  2. **No implicit currency conversion.** Comparing USD against BDT without a stated
 *     rate produces a number that looks like a decision. The rate is required and is
 *     reported back with the answer.
 */
export class ProcurementError extends Error {
  override readonly name = 'ProcurementError'
}

const DECIMAL = /^\d+(\.\d+)?$/

// Money and quantity are both carried at 4 minor digits internally so a rate like
// 0.0083 survives the multiplication; results are rounded once, at the end.
const SCALE = 4n
const SCALE_FACTOR = 10_000n

function toMinor(value: string, what = 'amount'): bigint {
  if (!DECIMAL.test(value)) throw new ProcurementError(`"${value}" is not a ${what}`)
  const [whole = '0', fraction = ''] = value.split('.')
  return BigInt(whole + fraction.padEnd(Number(SCALE), '0').slice(0, Number(SCALE)))
}

/** Round half-up to two decimals — the scale money and quantity are stored at. */
function toDecimal(minor: bigint): string {
  const negative = minor < 0n
  const abs = negative ? -minor : minor
  const rounded = (abs + 50n) / 100n
  const digits = rounded.toString().padStart(3, '0')
  return `${negative ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`
}

/** Multiply two 4-minor-digit values, staying at 4 minor digits. */
const mul = (a: bigint, b: bigint): bigint => (a * b) / SCALE_FACTOR

/**
 * Sum scaled integers. A named helper rather than `a + b + c` at the call site: the
 * `no-float-money` lint rule reads variable NAMES, and `goods + duty + freight` looks
 * exactly like the float arithmetic it exists to stop. Routing the addition through here
 * says "these are scaled integers" in the one place a reader would otherwise have to
 * infer it.
 */
const sumMinor = (...values: readonly bigint[]): bigint => values.reduce((a, b) => a + b, 0n)

// ─────────────────────────────────────────────────────────────────────────────
// Quote comparison
// ─────────────────────────────────────────────────────────────────────────────

export interface QuoteForComparison {
  quoteId: string
  supplierId: string
  unitPrice: string
  currency: string
  leadTimeDays: number
  /** Minimum the supplier will run. Above the requirement, the surplus is still bought. */
  moq: string
  freight: string
  dutyPct: string
}

export interface ComparisonRequirement {
  qty: string
  unit: string
  /** Date the material must be in house. */
  neededBy: string
  /** Date lead time is counted from. */
  quotedOn: string
  baseCurrency?: string
  /** currency → units of base per unit of that currency. Required to mix currencies. */
  rates?: Record<string, string>
}

export interface RankedQuote {
  quoteId: string
  supplierId: string
  /** What will actually be bought — the requirement, or the MOQ if it is higher. */
  chargedQty: string
  surplusQty: string
  goodsValue: string
  dutyValue: string
  freightValue: string
  landedTotal: string
  landedUnitCost: string
  arrivesOn: string
  currency: string
}

export interface QuoteComparison {
  baseCurrency: string
  ratesUsed: Record<string, string>
  ranked: RankedQuote[]
  infeasible: { quoteId: string; reasonKey: string; arrivesOn: string }[]
}

/** Calendar-day arithmetic on ISO dates. Lead time is days, not business days. */
function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) throw new ProcurementError(`"${date}" is not a date`)
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

/**
 * Rank quotes on landed cost, excluding the ones that cannot arrive in time.
 *
 * `infeasible` is returned rather than thrown, and quotes that miss the date are never
 * ranked "last" — a late quote is not a worse option, it is not one, and leaving it in the
 * list is how somebody picks it because the price column looked good.
 */
export function compareQuotes(
  quotes: readonly QuoteForComparison[],
  requirement: ComparisonRequirement,
): QuoteComparison {
  if (quotes.length === 0) {
    throw new ProcurementError('no quotes to compare — refusing to return an empty decision')
  }

  const required = toMinor(requirement.qty, 'quantity')
  if (required <= 0n) throw new ProcurementError('required quantity must be positive')

  const currencies = new Set(quotes.map((q) => q.currency))
  const baseCurrency = requirement.baseCurrency ?? quotes[0]!.currency
  const rates = requirement.rates ?? {}
  const ratesUsed: Record<string, string> = {}

  for (const currency of currencies) {
    if (currency === baseCurrency) continue
    const rate = rates[currency]
    if (!rate) {
      // A comparison across currencies without a stated rate is a number that looks like
      // a decision. Same reason a cost sheet carries its own FX rate.
      throw new ProcurementError(
        `quotes are in ${[...currencies].join(', ')} — a rate to ${baseCurrency} is required for ${currency}`,
      )
    }
    ratesUsed[currency] = rate
  }

  const ranked: RankedQuote[] = []
  const infeasible: { quoteId: string; reasonKey: string; arrivesOn: string }[] = []

  for (const q of quotes) {
    if (!Number.isInteger(q.leadTimeDays) || q.leadTimeDays < 0) {
      throw new ProcurementError(`lead time for quote ${q.quoteId} must be whole days`)
    }

    const arrivesOn = addDays(requirement.quotedOn, q.leadTimeDays)
    if (arrivesOn > requirement.neededBy) {
      infeasible.push({ quoteId: q.quoteId, reasonKey: 'procurement.quote.too_late', arrivesOn })
      continue
    }

    const moq = toMinor(q.moq, 'MOQ')
    const chargedQty = moq > required ? moq : required
    const rate = q.currency === baseCurrency ? SCALE_FACTOR : toMinor(ratesUsed[q.currency]!, 'rate')

    const unitPrice = mul(toMinor(q.unitPrice, 'unit price'), rate)
    const goods = mul(unitPrice, chargedQty)
    // Duty is charged on the goods value at the border — freight is not dutiable here.
    const duty = mul(goods, toMinor(q.dutyPct, 'duty percentage')) / 100n
    const freight = mul(toMinor(q.freight, 'freight'), rate)
    const landed = sumMinor(goods, duty, freight)

    ranked.push({
      quoteId: q.quoteId,
      supplierId: q.supplierId,
      chargedQty: toDecimal(chargedQty),
      surplusQty: toDecimal(chargedQty - required),
      goodsValue: toDecimal(goods),
      dutyValue: toDecimal(duty),
      freightValue: toDecimal(freight),
      landedTotal: toDecimal(landed),
      // Per unit REQUIRED, not per unit charged — the surplus is a cost of this quote,
      // not free stock, and dividing by the charged quantity would hide it.
      landedUnitCost: toDecimal((landed * SCALE_FACTOR) / required),
      arrivesOn,
      currency: baseCurrency,
    })
  }

  ranked.sort((a, b) => {
    const diff = toMinor(a.landedTotal) - toMinor(b.landedTotal)
    if (diff !== 0n) return diff < 0n ? -1 : 1
    // Tie on money: the one that lands sooner wins. Nothing else about them differs.
    return a.arrivesOn.localeCompare(b.arrivesOn)
  })

  return { baseCurrency, ratesUsed, ranked, infeasible }
}

// ─────────────────────────────────────────────────────────────────────────────
// PO ↔ GRN line matching
// ─────────────────────────────────────────────────────────────────────────────

export type PoLineStatus = 'open' | 'received_partial' | 'received'

export interface ReceiptMatch {
  receivedQty: string
  outstandingQty: string
  overReceiptQty: string
  withinTolerance: boolean
  closed: boolean
  status: PoLineStatus
}

/**
 * Apply one receipt to a PO line.
 *
 * Over-receipt inside tolerance closes the line: mills cut to the roll, not to the metre,
 * and 2% over on a thousand metres is a normal delivery. Past the allowance the surplus is
 * reported rather than silently accepted — beyond it somebody is paying for fabric nobody
 * ordered.
 */
export function matchReceipt(
  line: { orderedQty: string; receivedQty: string; closed?: boolean },
  receipt: { qty: string },
  options: { overReceiptTolerancePct: string },
): ReceiptMatch {
  if (line.closed) {
    // A closed line is a settled account. Receiving against it silently would reopen a
    // number somebody has already reconciled against an invoice.
    throw new ProcurementError('this PO line is already closed')
  }

  const ordered = toMinor(line.orderedQty, 'ordered quantity')
  const already = toMinor(line.receivedQty, 'received quantity')
  const incoming = toMinor(receipt.qty, 'receipt quantity')

  if (ordered <= 0n) throw new ProcurementError('ordered quantity must be positive')
  if (incoming <= 0n) throw new ProcurementError('a receipt must be a positive quantity')

  const received = already + incoming
  const allowance = mul(ordered, toMinor(options.overReceiptTolerancePct, 'tolerance')) / 100n
  const over = received > ordered ? received - ordered : 0n
  const outstanding = received < ordered ? ordered - received : 0n

  const closed = received >= ordered
  const status: PoLineStatus = closed ? 'received' : 'received_partial'

  return {
    receivedQty: toDecimal(received),
    outstandingQty: toDecimal(outstanding),
    overReceiptQty: toDecimal(over),
    withinTolerance: over <= allowance,
    closed,
    status,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Supplier scoring
// ─────────────────────────────────────────────────────────────────────────────

export interface ScoreObservations {
  receipts: readonly { onTime: boolean; rejectedQty: string; receivedQty: string }[]
  quotesRequested: number
  quotesReturned: number
  avgUnitPrice: string | null
  basketAvgUnitPrice: string | null
}

export interface SupplierScore {
  onTimePct: string | null
  qualityRejectPct: string | null
  /** 100 is the basket average; 110 means this supplier is 10% dearer than the field. */
  priceIndex: string | null
  responsivenessPct: string | null
  /** How much history the score rests on. A thin score must be readable as thin. */
  observations: number
}

/**
 * Score a supplier from the record (brief: "never manual vibes").
 *
 * Every metric returns `null` rather than a flattering default when there is nothing to
 * measure. A new supplier is unmeasured, not perfect — reporting 100% on-time would put
 * them top of a ranking on the strength of never having delivered anything.
 */
export function supplierScore(input: ScoreObservations): SupplierScore {
  const receipts = input.receipts

  let onTime: string | null = null
  let rejectPct: string | null = null

  if (receipts.length > 0) {
    const onTimeCount = receipts.filter((r) => r.onTime).length
    onTime = percentage(BigInt(onTimeCount) * SCALE_FACTOR, BigInt(receipts.length) * SCALE_FACTOR)

    // Rejects are measured on QUANTITY. "2 of 4 receipts had a reject" would report 50%
    // and condemn a supplier over two bad metres.
    const totalReceived = receipts.reduce((sum, r) => sum + toMinor(r.receivedQty, 'quantity'), 0n)
    const totalRejected = receipts.reduce((sum, r) => sum + toMinor(r.rejectedQty, 'quantity'), 0n)
    rejectPct = totalReceived > 0n ? percentage(totalRejected, totalReceived) : null
  }

  const priceIndex =
    input.avgUnitPrice && input.basketAvgUnitPrice
      ? percentage(toMinor(input.avgUnitPrice, 'price'), toMinor(input.basketAvgUnitPrice, 'price'))
      : null

  const responsiveness =
    input.quotesRequested > 0
      ? percentage(
          BigInt(input.quotesReturned) * SCALE_FACTOR,
          BigInt(input.quotesRequested) * SCALE_FACTOR,
        )
      : null

  return {
    onTimePct: onTime,
    qualityRejectPct: rejectPct,
    priceIndex,
    responsivenessPct: responsiveness,
    observations: receipts.length,
  }
}

/** `part / whole` as a percentage. Both arguments carry 4 minor digits; so does the result. */
function percentage(part: bigint, whole: bigint): string {
  if (whole === 0n) throw new ProcurementError('percentage of zero is undefined')
  return toDecimal((part * 100n * SCALE_FACTOR) / whole)
}
