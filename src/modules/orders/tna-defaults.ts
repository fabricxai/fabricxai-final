/**
 * Default TNA templates, one per product type.
 *
 * A starting point a factory customises in Settings, not a standard — unlike the AQL tables,
 * these are somebody's judgement about lead times and every factory's differ. They exist
 * because without a template an order has no calendar, and without a calendar nothing
 * downstream has a date to be late against.
 *
 * ## The names are a contract
 *
 * Three milestone names are read by OTHER modules, by name, and a template that spells them
 * differently produces a schedule those modules silently cannot see:
 *
 *  - `ex_factory` — 1.3's own ripple anchor (`EX_FACTORY_MILESTONE`), and what 8.1's
 *    departure consumer actualises.
 *  - `cutting` — what 1.4's PP-blocking escalation counts down to, and what 5.1's
 *    completion consumer actualises.
 *  - `final_inspection` — what 7.1's pre-final readiness check looks for.
 *
 * `NAMES_OTHER_MODULES_READ` below is asserted against every template in the tests, so
 * adding a product type cannot quietly break the cross-module jobs.
 *
 * ## Why the offsets differ so much
 *
 * Fabric lead time is the whole story. A knit t-shirt runs on yarn a mill already has:
 * fabric lands six weeks before shipment. A woven shirt needs the fabric woven, dyed and
 * finished to order — two months. Outerwear adds an interlining and a hardware trim chain
 * with its own lead times, and a sweater is knitted panel by panel rather than cut from
 * cloth, which is why it has no `cutting` milestone in the usual sense — it still carries
 * one, because the gate that reads it is about approval-before-production, not about a
 * cutting table.
 */

/** The names other modules query by. Changing one breaks a cross-module job. */
export const NAMES_OTHER_MODULES_READ = ['cutting', 'final_inspection', 'ex_factory'] as const

export interface DefaultTemplateMilestone {
  name: string
  offsetDaysBeforeExFactory: number
  dependsOn: (string | { name: string; gapDays: number })[]
  critical: boolean
  ownerRole?: string
}

export interface DefaultTemplate {
  productType: string
  name: string
  milestones: DefaultTemplateMilestone[]
}

/**
 * A knit tee or polo. ~90 days, and the shortest chain the factory runs.
 *
 * The `pp_approval → cutting` gap is 4 days rather than the bare spacing: that is real
 * slack, because a buyer sitting on a PP sample for an extra three days must not
 * automatically push the ship date.
 */
const KNIT: DefaultTemplate = {
  productType: 'knit',
  name: 'Knit — 90 day',
  milestones: [
    {
      name: 'order_confirmed',
      offsetDaysBeforeExFactory: 90,
      dependsOn: [],
      critical: true,
      ownerRole: 'merchandiser',
    },
    {
      name: 'fabric_booking',
      offsetDaysBeforeExFactory: 85,
      dependsOn: ['order_confirmed'],
      critical: true,
      ownerRole: 'procurement',
    },
    {
      name: 'lab_dip_approval',
      offsetDaysBeforeExFactory: 75,
      dependsOn: ['fabric_booking'],
      critical: false,
      ownerRole: 'merchandiser',
    },
    {
      name: 'fabric_in_house',
      offsetDaysBeforeExFactory: 45,
      dependsOn: ['lab_dip_approval'],
      critical: true,
      ownerRole: 'store',
    },
    {
      name: 'trims_in_house',
      offsetDaysBeforeExFactory: 42,
      dependsOn: ['fabric_booking'],
      critical: true,
      ownerRole: 'store',
    },
    {
      name: 'pp_sample_submit',
      offsetDaysBeforeExFactory: 40,
      dependsOn: ['fabric_in_house'],
      critical: true,
      ownerRole: 'merchandiser',
    },
    {
      name: 'pp_approval',
      offsetDaysBeforeExFactory: 32,
      dependsOn: ['pp_sample_submit'],
      critical: true,
      ownerRole: 'merchandiser',
    },
    {
      name: 'cutting',
      offsetDaysBeforeExFactory: 28,
      // Deliberate slack: a buyer taking four extra days over the PP sample should not
      // move the ship date on its own.
      dependsOn: [{ name: 'pp_approval', gapDays: 4 }, 'trims_in_house'],
      critical: true,
      ownerRole: 'cutting',
    },
    {
      name: 'sewing_start',
      offsetDaysBeforeExFactory: 25,
      dependsOn: ['cutting'],
      critical: true,
      ownerRole: 'production',
    },
    {
      name: 'sewing_end',
      offsetDaysBeforeExFactory: 10,
      dependsOn: ['sewing_start'],
      critical: true,
      ownerRole: 'production',
    },
    {
      name: 'finishing',
      offsetDaysBeforeExFactory: 7,
      dependsOn: ['sewing_end'],
      critical: true,
      ownerRole: 'shipment',
    },
    {
      name: 'final_inspection',
      offsetDaysBeforeExFactory: 4,
      dependsOn: ['finishing'],
      critical: true,
      ownerRole: 'quality',
    },
    {
      name: 'ex_factory',
      offsetDaysBeforeExFactory: 0,
      dependsOn: ['final_inspection'],
      critical: true,
      ownerRole: 'shipment',
    },
  ],
}

/**
 * A woven shirt or trouser. ~120 days.
 *
 * The difference from knit is almost entirely fabric: woven cloth is woven, dyed and
 * finished to order, so `fabric_in_house` sits two months out rather than six weeks.
 */
const WOVEN: DefaultTemplate = {
  productType: 'woven',
  name: 'Woven — 120 day',
  milestones: [
    { name: 'order_confirmed', offsetDaysBeforeExFactory: 120, dependsOn: [], critical: true, ownerRole: 'merchandiser' },
    { name: 'fabric_booking', offsetDaysBeforeExFactory: 113, dependsOn: ['order_confirmed'], critical: true, ownerRole: 'procurement' },
    { name: 'lab_dip_approval', offsetDaysBeforeExFactory: 100, dependsOn: ['fabric_booking'], critical: false, ownerRole: 'merchandiser' },
    { name: 'fabric_in_house', offsetDaysBeforeExFactory: 60, dependsOn: ['lab_dip_approval'], critical: true, ownerRole: 'store' },
    { name: 'trims_in_house', offsetDaysBeforeExFactory: 55, dependsOn: ['fabric_booking'], critical: true, ownerRole: 'store' },
    { name: 'pp_sample_submit', offsetDaysBeforeExFactory: 52, dependsOn: ['fabric_in_house'], critical: true, ownerRole: 'merchandiser' },
    { name: 'pp_approval', offsetDaysBeforeExFactory: 42, dependsOn: ['pp_sample_submit'], critical: true, ownerRole: 'merchandiser' },
    {
      name: 'cutting',
      offsetDaysBeforeExFactory: 36,
      dependsOn: [{ name: 'pp_approval', gapDays: 6 }, 'trims_in_house'],
      critical: true,
      ownerRole: 'cutting',
    },
    { name: 'sewing_start', offsetDaysBeforeExFactory: 32, dependsOn: ['cutting'], critical: true, ownerRole: 'production' },
    { name: 'sewing_end', offsetDaysBeforeExFactory: 12, dependsOn: ['sewing_start'], critical: true, ownerRole: 'production' },
    { name: 'finishing', offsetDaysBeforeExFactory: 8, dependsOn: ['sewing_end'], critical: true, ownerRole: 'shipment' },
    { name: 'final_inspection', offsetDaysBeforeExFactory: 5, dependsOn: ['finishing'], critical: true, ownerRole: 'quality' },
    { name: 'ex_factory', offsetDaysBeforeExFactory: 0, dependsOn: ['final_inspection'], critical: true, ownerRole: 'shipment' },
  ],
}

/**
 * A jacket or padded outerwear. ~150 days.
 *
 * Carries an extra `hardware_in_house`: zips, snaps and cord-locks come from a different
 * supply chain from the fabric and are the thing that most often holds a jacket order.
 */
const OUTERWEAR: DefaultTemplate = {
  productType: 'outerwear',
  name: 'Outerwear — 150 day',
  milestones: [
    { name: 'order_confirmed', offsetDaysBeforeExFactory: 150, dependsOn: [], critical: true, ownerRole: 'merchandiser' },
    { name: 'fabric_booking', offsetDaysBeforeExFactory: 142, dependsOn: ['order_confirmed'], critical: true, ownerRole: 'procurement' },
    { name: 'lab_dip_approval', offsetDaysBeforeExFactory: 125, dependsOn: ['fabric_booking'], critical: false, ownerRole: 'merchandiser' },
    { name: 'hardware_in_house', offsetDaysBeforeExFactory: 85, dependsOn: ['fabric_booking'], critical: true, ownerRole: 'store' },
    { name: 'fabric_in_house', offsetDaysBeforeExFactory: 80, dependsOn: ['lab_dip_approval'], critical: true, ownerRole: 'store' },
    { name: 'trims_in_house', offsetDaysBeforeExFactory: 75, dependsOn: ['fabric_booking'], critical: true, ownerRole: 'store' },
    { name: 'pp_sample_submit', offsetDaysBeforeExFactory: 70, dependsOn: ['fabric_in_house', 'hardware_in_house'], critical: true, ownerRole: 'merchandiser' },
    { name: 'pp_approval', offsetDaysBeforeExFactory: 56, dependsOn: ['pp_sample_submit'], critical: true, ownerRole: 'merchandiser' },
    {
      name: 'cutting',
      offsetDaysBeforeExFactory: 48,
      dependsOn: [{ name: 'pp_approval', gapDays: 8 }, 'trims_in_house'],
      critical: true,
      ownerRole: 'cutting',
    },
    { name: 'sewing_start', offsetDaysBeforeExFactory: 42, dependsOn: ['cutting'], critical: true, ownerRole: 'production' },
    { name: 'sewing_end', offsetDaysBeforeExFactory: 15, dependsOn: ['sewing_start'], critical: true, ownerRole: 'production' },
    { name: 'finishing', offsetDaysBeforeExFactory: 10, dependsOn: ['sewing_end'], critical: true, ownerRole: 'shipment' },
    { name: 'final_inspection', offsetDaysBeforeExFactory: 6, dependsOn: ['finishing'], critical: true, ownerRole: 'quality' },
    { name: 'ex_factory', offsetDaysBeforeExFactory: 0, dependsOn: ['final_inspection'], critical: true, ownerRole: 'shipment' },
  ],
}

/**
 * A knitted sweater. ~135 days.
 *
 * Panels are knitted to shape rather than cut from cloth, so `yarn_in_house` replaces
 * `fabric_in_house` and `knitting` replaces the spreading. `cutting` is still here and
 * still named `cutting`: the gate 1.4 counts down to is about approval-before-production,
 * not about a cutting table, and renaming it would make the PP escalation blind to every
 * sweater order.
 */
const SWEATER: DefaultTemplate = {
  productType: 'sweater',
  name: 'Sweater — 135 day',
  milestones: [
    { name: 'order_confirmed', offsetDaysBeforeExFactory: 135, dependsOn: [], critical: true, ownerRole: 'merchandiser' },
    { name: 'yarn_booking', offsetDaysBeforeExFactory: 128, dependsOn: ['order_confirmed'], critical: true, ownerRole: 'procurement' },
    { name: 'lab_dip_approval', offsetDaysBeforeExFactory: 112, dependsOn: ['yarn_booking'], critical: false, ownerRole: 'merchandiser' },
    { name: 'yarn_in_house', offsetDaysBeforeExFactory: 75, dependsOn: ['lab_dip_approval'], critical: true, ownerRole: 'store' },
    { name: 'trims_in_house', offsetDaysBeforeExFactory: 70, dependsOn: ['yarn_booking'], critical: true, ownerRole: 'store' },
    { name: 'pp_sample_submit', offsetDaysBeforeExFactory: 66, dependsOn: ['yarn_in_house'], critical: true, ownerRole: 'merchandiser' },
    { name: 'pp_approval', offsetDaysBeforeExFactory: 54, dependsOn: ['pp_sample_submit'], critical: true, ownerRole: 'merchandiser' },
    {
      name: 'cutting',
      offsetDaysBeforeExFactory: 48,
      dependsOn: [{ name: 'pp_approval', gapDays: 6 }, 'trims_in_house'],
      critical: true,
      ownerRole: 'cutting',
    },
    { name: 'knitting', offsetDaysBeforeExFactory: 44, dependsOn: ['cutting'], critical: true, ownerRole: 'production' },
    { name: 'linking', offsetDaysBeforeExFactory: 20, dependsOn: ['knitting'], critical: true, ownerRole: 'production' },
    { name: 'finishing', offsetDaysBeforeExFactory: 10, dependsOn: ['linking'], critical: true, ownerRole: 'shipment' },
    { name: 'final_inspection', offsetDaysBeforeExFactory: 5, dependsOn: ['finishing'], critical: true, ownerRole: 'quality' },
    { name: 'ex_factory', offsetDaysBeforeExFactory: 0, dependsOn: ['final_inspection'], critical: true, ownerRole: 'shipment' },
  ],
}

export const DEFAULT_TNA_TEMPLATES: readonly DefaultTemplate[] = [
  KNIT,
  WOVEN,
  OUTERWEAR,
  SWEATER,
]

/**
 * Product types a factory says versus the templates above.
 *
 * An RFQ's `product_type` is free text a merchandiser typed — "t-shirt", "tee", "polo" all
 * mean the knit template. Resolution is deliberately a small explicit map rather than fuzzy
 * matching: guessing which calendar a product runs on is how an order gets a 90-day schedule
 * when it needed 150, and the ship date is then wrong from the day it was created.
 *
 * An unrecognised type resolves to null, and the caller must decide — never to a default,
 * because the shortest template would silently flatter every unfamiliar product.
 */
const PRODUCT_TYPE_ALIASES: Readonly<Record<string, string>> = {
  knit: 'knit',
  tshirt: 'knit',
  't-shirt': 'knit',
  tee: 'knit',
  polo: 'knit',
  legging: 'knit',
  jersey: 'knit',

  woven: 'woven',
  shirt: 'woven',
  blouse: 'woven',
  trouser: 'woven',
  trousers: 'woven',
  pant: 'woven',
  pants: 'woven',
  chino: 'woven',
  denim: 'woven',
  jeans: 'woven',
  short: 'woven',
  shorts: 'woven',
  dress: 'woven',

  outerwear: 'outerwear',
  jacket: 'outerwear',
  coat: 'outerwear',
  parka: 'outerwear',
  vest: 'outerwear',
  gilet: 'outerwear',

  sweater: 'sweater',
  jumper: 'sweater',
  pullover: 'sweater',
  cardigan: 'sweater',
  knitwear: 'sweater',
}

/** Resolve a merchandiser's product type to a template's, or null. */
export function resolveProductType(productType: string): string | null {
  const key = productType.trim().toLowerCase().replace(/\s+/g, '-')
  return PRODUCT_TYPE_ALIASES[key] ?? PRODUCT_TYPE_ALIASES[key.replace(/-/g, '')] ?? null
}
