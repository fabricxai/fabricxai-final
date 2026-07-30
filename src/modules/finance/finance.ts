/**
 * Finance arithmetic (brief 11.1 §Operations). Pure — no database, no clock.
 *
 * The brief's explicit non-goal is worth repeating: **no general ledger here.** This module
 * answers two questions an owner actually asks — when does cash arrive and leave, and did we
 * make money on that order — and both have a well-known way of lying:
 *
 *  1. **The cash timeline must not count money twice.** A receivable that has already
 *     realized is cash in the bank, not cash arriving next week. Including it inflates every
 *     forecast, and the forecast is what somebody decides to buy fabric on.
 *  2. **A variance waterfall must ADD UP.** If the per-component variances do not sum to the
 *     total, the waterfall is decoration. That invariant is the whole point of the shape.
 *  3. **Margin basis travels with the number.** Costing quotes margin on price or on cost;
 *     comparing an actual computed one way against a quote computed the other produces a
 *     variance made entirely of arithmetic.
 */
export class FinanceError extends Error {
  override readonly name = 'FinanceError'
}

const MONEY = /^-?\d+(\.\d{1,2})?$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function assertMoney(value: string, what: string): string {
  if (!MONEY.test(value)) throw new FinanceError(`"${value}" is not a ${what}`)
  return value
}

function assertDate(value: string, what: string): string {
  if (!ISO_DATE.test(value)) throw new FinanceError(`"${value}" is not a ${what}`)
  return value
}

// ─────────────────────────────────────────────────────────────────────────────
// Expected realization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * When the bank is likely to credit this presentation.
 *
 * Built on the buyer's own median lag (2.1 computes it). With no history the caller must
 * supply a default — assuming zero would forecast cash arriving the day documents are
 * lodged, the most optimistic possible lie for a cash timeline to tell.
 */
export function expectedRealizationDate(input: {
  submittedAt: string
  medianLagDays: number | null
  fallbackDays?: number
}): string {
  assertDate(input.submittedAt, 'date')

  const days = input.medianLagDays ?? input.fallbackDays
  if (days === undefined || days === null) {
    throw new FinanceError(
      'no realization lag for this buyer and no default supplied — refusing to assume zero',
    )
  }
  if (!Number.isInteger(days) || days < 0) {
    throw new FinanceError(`realization lag must be a whole number of days, got ${days}`)
  }

  return addDays(input.submittedAt, days)
}

// ─────────────────────────────────────────────────────────────────────────────
// The cash timeline
// ─────────────────────────────────────────────────────────────────────────────

export interface TimelineReceivable {
  expectedAt: string
  amount: string
  /** Non-null means the money is already in. It is not future cash. */
  realizedAt: string | null
  currency?: string
}

export interface TimelinePayable {
  dueAt: string
  amount: string
  paidAt: string | null
  currency?: string
}

export interface CashBucket {
  weekStart: string
  inflow: string
  outflow: string
  net: string
  closingBalance: string
}

export interface CashTimeline {
  currency: string
  buckets: CashBucket[]
  totalInflow: string
  totalOutflow: string
  /** The week the running balance first goes below zero. The most useful cell on the screen. */
  firstNegativeWeek: string | null
  /** Items dated outside the window. Reported so the total is explainable. */
  excludedOutsideWindow: number
}

/**
 * Eight weeks of cash in and out (brief: "cash timeline query (8-week in/out)").
 *
 * Settled items are excluded, not netted: a realized receivable is cash the factory already
 * has, and counting it as arriving again is how a forecast ends up promising money twice.
 *
 * Items outside the window are counted and reported rather than folded into the first
 * bucket. A payable due in six months is not this quarter's problem, and putting it in week
 * one would make every timeline look like a crisis.
 */
export function cashTimeline(input: {
  from: string
  weeks: number
  currency: string
  openingBalance?: string
  receivables: readonly TimelineReceivable[]
  payables: readonly TimelinePayable[]
}): CashTimeline {
  assertDate(input.from, 'date')
  if (!Number.isInteger(input.weeks) || input.weeks <= 0) {
    throw new FinanceError(`weeks must be a positive whole number, got ${input.weeks}`)
  }

  for (const item of [...input.receivables, ...input.payables]) {
    if (item.currency && item.currency !== input.currency) {
      // Adding taka to dollars needs a rate nobody stated. Same rule as everywhere else in
      // this system: no ambient conversion.
      throw new FinanceError(
        `cash timeline is in ${input.currency} but an item is in ${item.currency} — a rate is required`,
      )
    }
  }

  const starts = Array.from({ length: input.weeks }, (_, i) => addDays(input.from, i * 7))
  const end = addDays(input.from, input.weeks * 7)

  const inflow = new Map<string, bigint>()
  const outflow = new Map<string, bigint>()
  let excluded = 0

  const bucketFor = (date: string): string | null => {
    if (date < input.from || date >= end) return null
    const offsetWeeks = Math.floor(dayGap(input.from, date) / 7)
    return starts[offsetWeeks] ?? null
  }

  for (const receivable of input.receivables) {
    if (receivable.realizedAt) continue
    assertMoney(receivable.amount, 'money amount')
    const bucket = bucketFor(assertDate(receivable.expectedAt, 'date'))
    if (!bucket) {
      excluded += 1
      continue
    }
    inflow.set(bucket, (inflow.get(bucket) ?? 0n) + toMinor(receivable.amount))
  }

  for (const payable of input.payables) {
    if (payable.paidAt) continue
    assertMoney(payable.amount, 'money amount')
    const bucket = bucketFor(assertDate(payable.dueAt, 'date'))
    if (!bucket) {
      excluded += 1
      continue
    }
    outflow.set(bucket, (outflow.get(bucket) ?? 0n) + toMinor(payable.amount))
  }

  let running = toMinor(assertMoney(input.openingBalance ?? '0.00', 'money amount'))
  let inSoFar = 0n
  let outSoFar = 0n
  let firstNegativeWeek: string | null = null

  const buckets: CashBucket[] = starts.map((weekStart) => {
    const inn = inflow.get(weekStart) ?? 0n
    const out = outflow.get(weekStart) ?? 0n
    inSoFar = sumMinor(inSoFar, inn)
    outSoFar = sumMinor(outSoFar, out)
    running = sumMinor(running, inn, -out)

    if (running < 0n && firstNegativeWeek === null) firstNegativeWeek = weekStart

    return {
      weekStart,
      inflow: fromMinor(inn),
      outflow: fromMinor(out),
      net: fromMinor(sumMinor(inn, -out)),
      closingBalance: fromMinor(running),
    }
  })

  return {
    currency: input.currency,
    buckets,
    totalInflow: fromMinor(inSoFar),
    totalOutflow: fromMinor(outSoFar),
    firstNegativeWeek,
    excludedOutsideWindow: excluded,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The variance waterfall
// ─────────────────────────────────────────────────────────────────────────────

/** Per-piece cost by component. Keys are the module's vocabulary, not a fixed enum. */
export type CostComponents = Record<string, string>

export interface VarianceStep {
  component: string
  quoted: string
  actual: string
  /** actual − quoted. Positive is an overrun. */
  variance: string
}

export interface VarianceWaterfall {
  steps: VarianceStep[]
  quotedTotal: string
  actualTotal: string
  totalVariance: string
}

/**
 * Quoted against actual, component by component.
 *
 * The steps ALWAYS sum to `totalVariance` — that is the invariant the shape exists for, and
 * it is why a component present on one side and absent on the other is reported as zero on
 * the missing side rather than skipped. Skipping it would make the total unreachable from
 * the steps, which is exactly when somebody stops trusting the chart.
 *
 * Components are ordered by the quoted total, largest first — the biggest line is the one
 * worth arguing about — with a stable tiebreak so the same inputs always render the same.
 */
export function varianceWaterfall(
  quoted: CostComponents,
  actual: CostComponents,
): VarianceWaterfall {
  const components = [...new Set([...Object.keys(quoted), ...Object.keys(actual)])]

  let quotedMinor = 0n
  let actualMinor = 0n

  const steps: VarianceStep[] = components.map((component) => {
    const q = toMinor(assertMoney(quoted[component] ?? '0.00', `quoted ${component}`))
    const a = toMinor(assertMoney(actual[component] ?? '0.00', `actual ${component}`))
    quotedMinor = sumMinor(quotedMinor, q)
    actualMinor = sumMinor(actualMinor, a)

    return {
      component,
      quoted: fromMinor(q),
      actual: fromMinor(a),
      variance: fromMinor(sumMinor(a, -q)),
    }
  })

  steps.sort((x, y) => {
    const diff = toMinor(y.quoted) - toMinor(x.quoted)
    if (diff !== 0n) return diff < 0n ? -1 : 1
    return x.component.localeCompare(y.component)
  })

  return {
    steps,
    quotedTotal: fromMinor(quotedMinor),
    actualTotal: fromMinor(actualMinor),
    totalVariance: fromMinor(sumMinor(actualMinor, -quotedMinor)),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Order profitability
// ─────────────────────────────────────────────────────────────────────────────

export interface ProfitabilityResult {
  actualCost: string
  fobPrice: string
  actualProfit: string
  actualMarginPct: string
  quotedMarginPct: string
  /** actual − quoted, in percentage points. */
  marginVariancePct: string
  marginBasis: 'price' | 'cost'
  lossMaking: boolean
}

/**
 * Did the order make money?
 *
 * `marginBasis` is required and is echoed back. Margin on price and margin on cost are
 * different numbers — 0.34 on a 5.00 price is 6.80%, the same 0.34 on a 4.66 cost is 7.30% —
 * and comparing an actual computed one way against a quote computed the other produces a
 * variance made entirely of arithmetic. Costing already carries the basis on the sheet; this
 * function refuses to pick one for you.
 */
export function orderProfitability(input: {
  fobPrice: string
  quotedMarginPct: string
  marginBasis: 'price' | 'cost'
  actual: CostComponents
}): ProfitabilityResult {
  assertMoney(input.fobPrice, 'money amount')
  const fob = toMinor(input.fobPrice)
  if (fob <= 0n) throw new FinanceError('an order with no FOB price has no margin to compute')

  const componentCount = Object.keys(input.actual).length
  if (componentCount === 0) {
    // Zero cost would report a 100% margin, the most flattering possible lie.
    throw new FinanceError('no actual costs recorded — refusing to report a margin')
  }

  let spentMinor = 0n
  for (const [component, amount] of Object.entries(input.actual)) {
    spentMinor = sumMinor(spentMinor, toMinor(assertMoney(amount, `actual ${component}`)))
  }

  const profit = sumMinor(fob, -spentMinor)
  const denominator = input.marginBasis === 'price' ? fob : spentMinor

  if (denominator === 0n) {
    throw new FinanceError('cannot compute a margin on a zero cost basis')
  }

  const actualMarginPct = percentage(profit, denominator)

  return {
    actualCost: fromMinor(spentMinor),
    fobPrice: input.fobPrice,
    actualProfit: fromMinor(profit),
    actualMarginPct,
    quotedMarginPct: input.quotedMarginPct,
    marginVariancePct: fromMinor(
      sumMinor(toMinor(actualMarginPct), -toMinor(input.quotedMarginPct)),
    ),
    marginBasis: input.marginBasis,
    lossMaking: profit < 0n,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exact decimal helpers — money is numeric(14,2) and never a float
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sum scaled integers. The same named helper procurement and shipment use, and for the same
 * reason: the `no-float-money` rule reads variable NAMES, and `balance + inflow - outflow`
 * looks exactly like the float arithmetic it exists to stop. Routing it through here says
 * "these are scaled integers" once, where a reader can see it.
 */
function sumMinor(...values: readonly bigint[]): bigint {
  return values.reduce((carried, next) => carried + next, 0n)
}

function toMinor(value: string): bigint {
  const negative = value.startsWith('-')
  const [whole = '0', fraction = ''] = value.replace('-', '').split('.')
  const minor = BigInt(whole + fraction.padEnd(2, '0').slice(0, 2))
  return negative ? -minor : minor
}

function fromMinor(minor: bigint): string {
  const negative = minor < 0n
  const digits = (negative ? -minor : minor).toString().padStart(3, '0')
  return `${negative ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`
}

/** `part / whole` as a signed percentage at two decimals, rounded half-up once. */
function percentage(part: bigint, whole: bigint): string {
  if (whole === 0n) throw new FinanceError('percentage of zero is undefined')
  const negative = part < 0n
  const scaled = ((negative ? -part : part) * 100n * 1000n) / whole
  const rounded = (scaled + 5n) / 10n
  return `${negative ? '-' : ''}${fromMinor(rounded)}`
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

function dayGap(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  )
}
