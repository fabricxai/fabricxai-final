/**
 * Cost-sheet computation (brief 1.5 §Operations). Pure — no database, no clock.
 *
 * This decides whether an order makes money, so every figure runs through `lib/money`
 * (CLAUDE.md rule 4) and every ambiguity is an explicit field rather than a convention.
 *
 * ── Two decisions worth reading before changing anything ────────────────────
 *
 * **Margin basis is explicit.** A 12% margin on a $4.38 cost is $4.98 if margin means a
 * share of the selling price and $4.91 if it means a markup on cost. Garment costing
 * usually means the former; plenty of spreadsheets mean the latter. Seven cents a piece
 * on 100,000 pieces is $7,000, and nobody would ever spot it — so `marginBasis` is
 * required rather than assumed.
 *
 * **The FX rate is snapshotted on the sheet, not looked up.** CM is quoted in BDT (a
 * labour rate per minute) and FOB in USD (what the buyer pays). An FOB quoted in January
 * at one rate is a different quote from the same figure in June, so the rate is an input
 * that gets stored with the version. There is no ambient exchange rate in this system.
 */
import {
  add,
  compare,
  convert,
  isNegative,
  isZero,
  type Money,
  money,
  mulDiv,
  multiply,
  subtract,
  sum,
} from '@/lib/money'
import {
  compareDecimalStrings,
  multiplyDecimalStrings,
  subtractDecimalStrings,
} from '@/lib/quantity'

export class CostingError extends Error {
  override readonly name = 'CostingError'
}

const DECIMAL = /^-?\d+(\.\d+)?$/

export interface MaterialLine {
  ref: string
  /** Per garment, before wastage. */
  consumption: string
  uom: string
  ratePerUom: string
  wastagePct: string
}

export interface EmbellishmentLine {
  description: string
  costPerPiece: string
}

/** Commission, freight, inspection — either a share of cost or a flat per-piece charge. */
export interface CommercialLine {
  description: string
  kind: 'pct_of_cost' | 'per_piece'
  value: string
}

export type CmInput =
  | {
      method: 'smv'
      smv?: string
      efficiencyPct?: string
      /** Local currency per minute of line time. */
      labourRatePerMinuteLocal?: string
    }
  | { method: 'per_dozen'; perDozenRateLocal?: string }

export interface CostSheetInput {
  /** Buyer-facing currency — what FOB is quoted in. */
  currency: string
  /** Where labour is priced. */
  localCurrency: string
  /** Units of `currency` per one unit of `localCurrency`. Snapshotted, never looked up. */
  fxRateLocalToBase: string
  fabric: readonly MaterialLine[]
  trims: readonly MaterialLine[]
  embellishment: readonly EmbellishmentLine[]
  cm: CmInput
  commercial: readonly CommercialLine[]
  marginPct: string
  /** `price` = share of the selling price · `cost` = markup on cost. Never assumed. */
  marginBasis: 'price' | 'cost'
}

export interface SectionTotal {
  total: string
  lines: { ref: string; amount: string }[]
  /** Set for CM, which is computed in the local currency before conversion. */
  localAmount?: string
}

export interface CostSheetFlag {
  code: string
  messageKey: string
  facts: Record<string, string>
}

export interface CostSheetResult {
  currency: string
  sections: {
    fabric: SectionTotal
    trims: SectionTotal
    embellishment: SectionTotal
    cm: SectionTotal
    commercial: SectionTotal
  }
  materialCost: string
  /** Everything before margin. */
  totalCost: string
  fobPrice: string
  /** What the price actually yields — the number a manager checks against the floor. */
  achievedMarginPct: string
  belowMarginFloor: boolean
  flags: CostSheetFlag[]
}

export interface CostSheetPolicy {
  /** Below this, approval routes to the owner rather than a manager (brief §Roles). */
  marginFloorPct?: string
}

function assertDecimal(value: string, what: string): string {
  if (!DECIMAL.test(value)) throw new CostingError(`"${value}" is not a decimal ${what}`)
  return value
}

function assertNonNegative(value: string, what: string): string {
  assertDecimal(value, what)
  if (value.startsWith('-')) throw new CostingError(`${what} must not be negative, got "${value}"`)
  return value
}

/** `3.50` → `350`, exactly — a numerator for mulDiv, so the division rounds once. */
function scaleBy100(value: string): string {
  assertNonNegative(value, 'rate')
  const [whole = '0', fraction = ''] = value.split('.')
  if (fraction.length <= 2) return String(BigInt(whole + fraction.padEnd(2, '0')))
  return `${whole}${fraction.slice(0, 2)}.${fraction.slice(2)}`
}

/** `5` → `1.05`, exactly. */
function wastageFactor(pct: string): string {
  assertNonNegative(pct, 'wastage percentage')
  const [whole = '0', fraction = ''] = pct.split('.')
  const scaled = BigInt('100' + '0'.repeat(fraction.length)) + BigInt(whole + fraction)
  const scale = fraction.length + 2
  const digits = scaled.toString().padStart(scale + 1, '0')
  return `${digits.slice(0, -scale)}.${digits.slice(-scale)}`
}

function materialSection(lines: readonly MaterialLine[], currency: string): SectionTotal {
  const priced = lines.map((line) => {
    assertNonNegative(line.consumption, 'consumption')
    assertNonNegative(line.ratePerUom, 'rate')

    // Wastage and rate folded into ONE factor, so the rounding happens once at the end.
    // Costing the cloth you actually buy, not the cloth that ends up in the garment.
    const factor = multiplyDecimalStrings(wastageFactor(line.wastagePct), line.ratePerUom)
    const amount = multiply(money(line.consumption, currency), factor)

    return { ref: line.ref, amount: amount.amount, money: amount }
  })

  return {
    total: sum(
      priced.map((line) => line.money),
      currency,
    ).amount,
    lines: priced.map(({ ref, amount }) => ({ ref, amount })),
  }
}

/**
 * Cost of making, per piece.
 *
 * SMV method: the standard minutes a garment needs, divided by the line's efficiency —
 * a line at 60% takes 20.8 minutes of paid time to earn 12.5 standard minutes. That
 * division is the whole point; quoting CM at 100% efficiency is how a factory quotes
 * itself out of a margin.
 */
function cmSection(cm: CmInput, input: CostSheetInput): SectionTotal {
  const local = input.localCurrency

  let localAmount: Money

  if (cm.method === 'smv') {
    if (!cm.smv || !cm.efficiencyPct || !cm.labourRatePerMinuteLocal) {
      throw new CostingError(
        'an SMV cost sheet needs smv, efficiencyPct and labourRatePerMinuteLocal',
      )
    }
    assertNonNegative(cm.smv, 'SMV')
    assertNonNegative(cm.efficiencyPct, 'efficiency')

    if (compareDecimalStrings(cm.efficiencyPct, '0') <= 0) {
      // A line at 0% produces nothing; there is no CM to quote, and dividing would give
      // an infinite one.
      throw new CostingError('efficiency must be greater than zero to quote CM')
    }

    // smv ÷ (efficiency/100) × rate  =  smv × (100 × rate) ÷ efficiency, rounded ONCE.
    //
    // Deriving paid minutes first and multiplying after rounds twice: at 60% efficiency
    // that is 20.83 minutes instead of 20.8333, and the CM comes out a paisa light on
    // every garment. The vectors caught exactly this.
    localAmount = mulDiv(
      money(cm.smv, local),
      scaleBy100(cm.labourRatePerMinuteLocal),
      cm.efficiencyPct,
    )
  } else {
    if (cm.perDozenRateLocal === undefined) {
      throw new CostingError('a per-dozen cost sheet needs perDozenRateLocal')
    }
    assertNonNegative(cm.perDozenRateLocal, 'per-dozen rate')
    localAmount = mulDiv(money(cm.perDozenRateLocal, local), 1, 12)
  }

  const converted = convert(localAmount, {
    to: input.currency,
    rate: input.fxRateLocalToBase,
  })

  return {
    total: converted.amount,
    localAmount: localAmount.amount,
    lines: [{ ref: cm.method === 'smv' ? 'CM (SMV)' : 'CM (per dozen)', amount: converted.amount }],
  }
}

export function computeCostSheet(
  input: CostSheetInput,
  policy: CostSheetPolicy = {},
): CostSheetResult {
  const currency = input.currency

  const fabric = materialSection(input.fabric, currency)
  const trims = materialSection(input.trims, currency)

  const embellishmentLines = input.embellishment.map((line) => ({
    ref: line.description,
    money: money(assertNonNegative(line.costPerPiece, 'embellishment cost'), currency),
  }))
  const embellishment: SectionTotal = {
    total: sum(
      embellishmentLines.map((line) => line.money),
      currency,
    ).amount,
    lines: embellishmentLines.map((line) => ({ ref: line.ref, amount: line.money.amount })),
  }

  const cm = cmSection(input.cm, input)

  const materialCost = sum(
    [
      money(fabric.total, currency),
      money(trims.total, currency),
      money(embellishment.total, currency),
    ],
    currency,
  )
  const costBeforeCommercial = add(materialCost, money(cm.total, currency))

  // Percentage commercial charges apply to the cost BEFORE commercial charges — a
  // commission on a commission is not a thing anyone quotes.
  const commercialLines = input.commercial.map((line) => {
    assertNonNegative(line.value, 'commercial value')
    const amount =
      line.kind === 'pct_of_cost'
        ? mulDiv(costBeforeCommercial, line.value, 100)
        : money(line.value, currency)
    return { ref: line.description, money: amount }
  })

  const commercial: SectionTotal = {
    total: sum(
      commercialLines.map((line) => line.money),
      currency,
    ).amount,
    lines: commercialLines.map((line) => ({ ref: line.ref, amount: line.money.amount })),
  }

  const totalCost = add(costBeforeCommercial, money(commercial.total, currency))
  const fobPrice = applyMargin(totalCost, input.marginPct, input.marginBasis)

  return finalise({ fabric, trims, embellishment, cm, commercial }, materialCost, totalCost, fobPrice, policy)
}

/** cost → price, by whichever basis the sheet declares. */
function applyMargin(totalCost: Money, marginPct: string, basis: 'price' | 'cost'): Money {
  assertNonNegative(marginPct, 'margin')

  if (basis === 'cost') return multiply(totalCost, wastageFactor(marginPct))

  if (compareDecimalStrings(marginPct, '100') >= 0) {
    // price = cost ÷ (1 − margin). At 100% that is a division by zero, and above it the
    // price goes negative — both are somebody having typed the wrong basis.
    throw new CostingError(
      `a price-basis margin must be below 100%, got ${marginPct}% — did you mean marginBasis: 'cost'?`,
    )
  }

  // cost ÷ (1 − pct/100)  =  cost × 100 ÷ (100 − pct), the divisor computed exactly —
  // this is the FOB price; a float divisor here was the audit's sharpest money finding.
  const headroom = subtractDecimalStrings('100', marginPct)
  return mulDiv(totalCost, 100, headroom)
}

function finalise(
  sections: CostSheetResult['sections'],
  materialCost: Money,
  totalCost: Money,
  fobPrice: Money,
  policy: CostSheetPolicy,
  extraFlags: CostSheetFlag[] = [],
): CostSheetResult {
  const currency = totalCost.currency
  const flags = [...extraFlags]

  // Achieved margin as a share of the price actually being charged — the number a
  // manager checks, and the only one comparable across sheets with different bases.
  const profit = subtract(fobPrice, totalCost)
  const achieved =
    !isZero(fobPrice) && !isNegative(fobPrice)
      ? mulDiv(profit, 100, fobPrice.amount).amount
      : '0.00'

  let belowFloor = false
  if (policy.marginFloorPct !== undefined) {
    belowFloor = compare(money(achieved, currency), money(policy.marginFloorPct, currency)) < 0
    if (belowFloor) {
      flags.push({
        code: 'below_margin_floor',
        messageKey: 'costing.flags.below_margin_floor',
        facts: { achievedMarginPct: achieved, floorPct: policy.marginFloorPct },
      })
    }
  }

  return {
    currency,
    sections,
    materialCost: materialCost.amount,
    totalCost: totalCost.amount,
    fobPrice: fobPrice.amount,
    achievedMarginPct: achieved,
    belowMarginFloor: belowFloor,
    flags,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios
// ─────────────────────────────────────────────────────────────────────────────

export interface ScenarioOverrides {
  /** Fabric prices move; everything downstream follows. */
  fabricRateMultiplier?: string
  /** What the line would actually run at. */
  efficiencyPct?: string
  /** "The buyer says $4.50" — reports the margin that price would yield. */
  targetFobPrice?: string
}

/**
 * The sliders. Pure and non-mutating: a merchandiser drags efficiency back and forth
 * before committing to anything, and a scenario that changed the sheet would make the
 * cancel button a lie.
 */
export function computeScenario(
  input: CostSheetInput,
  overrides: ScenarioOverrides,
  policy: CostSheetPolicy = {},
): CostSheetResult {
  // Build a NEW input; never touch the caller's.
  const adjusted: CostSheetInput = {
    ...input,
    fabric: overrides.fabricRateMultiplier
      ? input.fabric.map((line) => ({
          ...line,
          ratePerUom: multiply(
            money(line.ratePerUom, input.currency),
            overrides.fabricRateMultiplier!,
          ).amount,
        }))
      : input.fabric,
    cm:
      overrides.efficiencyPct && input.cm.method === 'smv'
        ? { ...input.cm, efficiencyPct: overrides.efficiencyPct }
        : input.cm,
  }

  const computed = computeCostSheet(adjusted, policy)
  if (!overrides.targetFobPrice) return computed

  // A target price replaces the derived one; the margin becomes an output rather than an
  // input, which is the question the buyer's number actually poses.
  const target = money(assertNonNegative(overrides.targetFobPrice, 'target price'), input.currency)
  const totalCost = money(computed.totalCost, input.currency)

  const flags: CostSheetFlag[] = []
  if (compare(target, totalCost) <= 0) {
    flags.push({
      code: 'target_price_below_cost',
      messageKey: 'costing.flags.target_price_below_cost',
      facts: { targetPrice: target.amount, totalCost: computed.totalCost },
    })
  }

  const result = finalise(
    computed.sections,
    money(computed.materialCost, input.currency),
    totalCost,
    target,
    policy,
    flags,
  )

  if (compare(money(result.achievedMarginPct, input.currency), money(input.marginPct, input.currency)) < 0) {
    result.flags.push({
      code: 'target_price_below_margin',
      messageKey: 'costing.flags.target_price_below_margin',
      facts: { achievedMarginPct: result.achievedMarginPct, quotedMarginPct: input.marginPct },
    })
  }

  return result
}
