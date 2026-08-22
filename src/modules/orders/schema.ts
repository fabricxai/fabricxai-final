/**
 * 1.3 Order Desk & TNA ⚖ — entities from the brief.
 *
 * The flagship module. An order carries the buyer's commitment, the money, the breakdown
 * the floor cuts to, and the calendar every other department schedules against.
 *
 * Two things here are less obvious than they look:
 *
 * **Breakdowns are revisioned, not edited.** A buyer changing a size ratio after cutting
 * has started is a different fact from a typo being fixed before production — one costs
 * money and the other does not. `order_breakdowns` is keyed by revision and
 * `order_styles.active_revision` points at the live one, so "what were we cutting to in
 * March" stays answerable.
 *
 * **`tna_milestones.depends_on` carries a gap, not just a name.** The brief lists
 * `depends_on[]`; storing `{name, gapDays}` is a deliberate extension, because the gap
 * between two dependent milestones is a required lead time and the ripple engine cannot
 * compute a slip without it. See `tna.ts` for why that had to be explicit.
 */
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { companies, documents, roleNameEnum, users } from '@/db/schema/core'
import { buyers } from '@/modules/buyers/schema'
import { lcs } from '@/modules/commercial/schema'

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export const orderStatusEnum = pgEnum('order_status', [
  'confirmed',
  'in_production',
  'shipped_partial',
  'shipped_full',
  'closed',
  'cancelled',
])

/** Derived from planned vs actual dates by the nightly scan, never set by hand. */
export const milestoneStatusEnum = pgEnum('milestone_status', [
  'pending',
  'on_track',
  'at_risk',
  'late',
  'done',
])

// ─────────────────────────────────────────────────────────────────────────────
// Orders
// ─────────────────────────────────────────────────────────────────────────────

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    buyerId: uuid('buyer_id')
      .notNull()
      .references(() => buyers.id, { onDelete: 'restrict' }),

    /** One order can cover several buyer POs; the buyer thinks in PO numbers. */
    poNumbers: text('po_numbers').array().notNull().default(sql`ARRAY[]::text[]`),

    totalValue: numeric('total_value', { precision: 14, scale: 2 }),
    currency: text('currency').notNull().default('USD'),

    /**
     * Over/under shipment the buyer accepts, e.g. 3.00 for ±3%. A breakdown outside it is
     * refused: shipping 5% short against a buyer who allows 2% is a claim, not a rounding
     * difference. Usually mirrors the LC's own tolerance but is negotiated separately.
     */
    qtyTolerancePct: numeric('qty_tolerance_pct', { precision: 5, scale: 2 })
      .notNull()
      .default('0'),

    /**
     * The buying agent's terms AS AT confirmation. A snapshot, not a reference: agents
     * renegotiate, and an order's commission must not silently change afterwards.
     */
    agentSnapshot: jsonb('agent_snapshot').$type<Record<string, unknown>>(),

    status: orderStatusEnum('status').notNull().default('confirmed'),

    /** Denormalised from `tna_milestones.ex_factory` so the order book can sort on it. */
    plannedExFactoryDate: date('planned_ex_factory_date'),

    /** The merchandiser who owns this order — roles gate on it (brief §Roles). */
    ownerUserId: text('owner_user_id').references(() => users.id, { onDelete: 'set null' }),

    /**
     * The RFQ this order was won from. No FK: `rfqs` is 1.2's and 1.2 already imports this
     * module for nothing — but more to the point, an order outlives the enquiry that
     * produced it and must not be deleted with it.
     *
     * Unique, and that is the point: it is what makes the `rfq.won` consumer idempotent.
     * Two orders for one win would double the factory's committed capacity against a single
     * buyer commitment.
     */
    sourceRfqId: uuid('source_rfq_id'),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The order book: a company's live orders by ship date.
    index('orders_company_exfactory_idx').on(t.companyId, t.plannedExFactoryDate),
    uniqueIndex('orders_source_rfq_key').on(t.sourceRfqId).where(sql`source_rfq_id IS NOT NULL`),
    index('orders_company_status_idx').on(t.companyId, t.status, t.plannedExFactoryDate),
    index('orders_company_buyer_idx').on(t.companyId, t.buyerId),
    index('orders_company_owner_idx').on(t.companyId, t.ownerUserId),
    // "Which order is PO-9931?" — merchandisers search by the buyer's number, not ours.
    index('orders_po_numbers_idx').using('gin', t.poNumbers),
    check('orders_currency_iso', sql`char_length(${t.currency}) = 3`),
    check(
      'orders_qty_tolerance_range',
      sql`${t.qtyTolerancePct} >= 0 AND ${t.qtyTolerancePct} <= 100`,
    ),
  ],
).enableRLS()

export const orderStyles = pgTable(
  'order_styles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    styleCode: text('style_code').notNull(),
    description: text('description'),
    /** Pieces the buyer ordered for this style — what the breakdown must add up to. */
    contractedQty: integer('contracted_qty'),
    unitPrice: numeric('unit_price', { precision: 14, scale: 2 }),
    currency: text('currency').notNull().default('USD'),

    /** Which breakdown revision the floor is currently cutting to. */
    activeRevision: integer('active_revision').notNull().default(1),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('order_styles_order_code_key').on(t.orderId, t.styleCode),
    index('order_styles_company_order_idx').on(t.companyId, t.orderId),
    check('order_styles_currency_iso', sql`char_length(${t.currency}) = 3`),
    check('order_styles_active_revision_positive', sql`${t.activeRevision} >= 1`),
    check(
      'order_styles_contracted_qty_positive',
      sql`${t.contractedQty} IS NULL OR ${t.contractedQty} > 0`,
    ),
  ],
).enableRLS()

/**
 * The colour × size grid. Pieces are integers — half a garment does not exist, and using
 * a decimal here invites a rounding argument on a cutting floor.
 */
export const orderBreakdowns = pgTable(
  'order_breakdowns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    orderStyleId: uuid('order_style_id')
      .notNull()
      .references(() => orderStyles.id, { onDelete: 'cascade' }),

    revision: integer('revision').notNull(),
    color: text('color').notNull(),
    size: text('size').notNull(),
    /**
     * The third axis a real PO line sometimes carries — a leg length, a ratio-pack id.
     * Empty string means "no third axis" (the overwhelming case), NOT NULL because two
     * NULLs are distinct to a unique index and the cell-dedupe guarantee must hold.
     * Readers that aggregate by (color, size) — cutting's markers, shipment's cartons —
     * see the union of variants, which is what a marker or a carton count wants.
     */
    variant: text('variant').notNull().default(''),
    qty: integer('qty').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('order_breakdowns_style_revision_cell_key').on(
      t.orderStyleId,
      t.revision,
      t.color,
      t.size,
      t.variant,
    ),
    index('order_breakdowns_company_style_idx').on(t.companyId, t.orderStyleId, t.revision),
    check('order_breakdowns_qty_positive', sql`${t.qty} > 0`),
  ],
).enableRLS()

/**
 * Why the breakdown changed, who confirmed it, and against which buyer document. This is
 * the row that answers "the buyer says they never asked for that".
 */
export const orderRevisions = pgTable(
  'order_revisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    revision: integer('revision').notNull(),
    /** Cell-level before/after, produced by the service, not by the client. */
    diff: jsonb('diff').$type<Record<string, unknown>>().notNull(),
    reason: text('reason'),

    buyerConfirmedAt: timestamp('buyer_confirmed_at', { withTimezone: true }),
    /** The buyer's email or amended PO backing the change. */
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('order_revisions_order_revision_key').on(t.orderId, t.revision),
    index('order_revisions_company_order_idx').on(t.companyId, t.orderId),
    check('order_revisions_revision_positive', sql`${t.revision} >= 1`),
  ],
).enableRLS()

/** m:n — one LC can cover several POs, and one order can draw on more than one credit. */
export const orderLcs = pgTable(
  'order_lcs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    lcId: uuid('lc_id')
      .notNull()
      .references(() => lcs.id, { onDelete: 'restrict' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('order_lcs_order_lc_key').on(t.orderId, t.lcId),
    index('order_lcs_company_lc_idx').on(t.companyId, t.lcId),
  ],
).enableRLS()

export const orderFiles = pgTable(
  'order_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),

    label: text('label'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('order_files_order_document_key').on(t.orderId, t.documentId),
    index('order_files_company_order_idx').on(t.companyId, t.orderId),
  ],
).enableRLS()

// ─────────────────────────────────────────────────────────────────────────────
// TNA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The factory's reusable calendars, one per product type. Hand-maintained in Settings,
 * which is exactly why `generateSchedule` repairs offsets that contradict a dependency
 * rather than trusting them.
 */
export const tnaTemplates = pgTable(
  'tna_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    productType: text('product_type').notNull(),
    /** `TnaTemplateMilestone[]` — shape validated by zod.ts on write. */
    milestones: jsonb('milestones').$type<unknown[]>().notNull(),

    isActive: boolean('is_active').notNull().default(true),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('tna_templates_company_name_key').on(t.companyId, t.name),
    index('tna_templates_company_product_idx').on(t.companyId, t.productType, t.isActive),
  ],
).enableRLS()

export const tnaMilestones = pgTable(
  'tna_milestones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    /** Calendar dates, not timestamps — a milestone is a day (see tna.ts). */
    plannedDate: date('planned_date').notNull(),
    actualDate: date('actual_date'),

    /** `ResolvedDependency[]` — carries the required gap, not just the name. */
    dependsOn: jsonb('depends_on').$type<unknown[]>().notNull().default([]),
    critical: boolean('critical').notNull().default(false),

    ownerRole: roleNameEnum('owner_role'),
    ownerUserId: text('owner_user_id').references(() => users.id, { onDelete: 'set null' }),

    status: milestoneStatusEnum('status').notNull().default('pending'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('tna_milestones_order_name_key').on(t.orderId, t.name),
    // The nightly TNA scan: everything not yet done, oldest planned date first.
    index('tna_milestones_company_planned_idx').on(t.companyId, t.plannedDate),
    index('tna_milestones_company_status_idx').on(t.companyId, t.status, t.plannedDate),
    // "What is this person supposed to be doing this week?"
    index('tna_milestones_company_owner_idx').on(t.companyId, t.ownerUserId, t.plannedDate),
    index('tna_milestones_order_idx').on(t.orderId),
  ],
).enableRLS()

// ─────────────────────────────────────────────────────────────────────────────
// Inputs readiness — the In-House Check List, as a table
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Where one input category stands for one order.
 *
 * `pending` — nothing done yet. `booked` — ordered from a supplier, not landed.
 * `in_house` — physically at the store (carries `actualDate`). `not_applicable` —
 * this style has no such input, which is neither an achievement nor a gap and is
 * excluded from every count.
 */
export const orderInputStateEnum = pgEnum('order_input_state', [
  'pending',
  'booked',
  'in_house',
  'not_applicable',
])

/**
 * The merchandiser's In-House Check List, one cell per (order, input category).
 *
 * Modelled on the sheet the factory actually keeps: a monthly workbook, one row per PO,
 * a Plan/Actual date-pair column per input — fabric, pocketing, thread, labels, elastic,
 * hook & bar, zipper, buttons, hangtags, barcodes, poly/carton — whose cells hold a date
 * OR a word ("Booked", "Stock") OR a note ("101 rolls short, talk to commercial"). That
 * date-or-word-or-note cell is the load-bearing observation: forcing it to a date-only
 * column would make the sheet unusable on day one, so a cell here is state + optional
 * dates + optional note, and the screen renders whichever the cell has.
 *
 * Categories are free text validated by the module's zod, not a pg enum: the canonical
 * twelve cover the sheet, but a knit factory tracks collars and a woven one does not, and
 * an ALTER TYPE for every new trim would make the schema the bottleneck for a checklist.
 *
 * The TNA stays the calendar of MILESTONES (fabric_in_house, trims_in_house); this is the
 * per-material detail behind the trims milestone. The two are deliberately not merged —
 * a milestone is a date the buyer plan hangs on, an input row is one supplier's delivery.
 */
export const orderInputs = pgTable(
  'order_inputs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    /** One of the module's registered categories — see `INPUT_CATEGORIES` in zod.ts. */
    category: text('category').notNull(),

    state: orderInputStateEnum('state').notNull().default('pending'),

    /** When it is meant to be in-house. Null on the sheet is common — a row can be tracked before it is planned. */
    planDate: date('plan_date'),
    /** When it actually landed. Set with `in_house`, cleared when the state moves back. */
    actualDate: date('actual_date'),

    /** The margin note — "coming by air, lands 26 Aug". The cell's third voice. */
    note: text('note'),

    updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('order_inputs_order_category_key').on(t.orderId, t.category),
    index('order_inputs_company_order_idx').on(t.companyId, t.orderId),
    // The matrix screen: every open order's cells in one read.
    index('order_inputs_company_state_idx').on(t.companyId, t.state),
    // An in-house cell carries the date it landed; the others must not pretend to.
    check(
      'order_inputs_actual_only_in_house',
      sql`${t.actualDate} IS NULL OR ${t.state} = 'in_house'`,
    ),
  ],
).enableRLS()

// ─────────────────────────────────────────────────────────────────────────────
// Ship dates — a trail, not a column
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `contract` — the date the order was sold against. `reship` — a renegotiated date,
 * agreed with the buyer, now in force. `proposed` — asked for and not yet agreed;
 * changes nothing until somebody records the agreement.
 */
export const shipDateKindEnum = pgEnum('ship_date_kind', ['contract', 'reship', 'proposed'])

/**
 * Every ship date this order has had, in order — the factory's own paper keeps
 * `Ship Date`, `Re-Ship Date-01`, `Re-Ship Date-02` as separate columns because the
 * history IS the negotiation record. A single overwritten column answers "when does
 * it ship"; it cannot answer "when did we promise, who moved it, and on whose mail",
 * which is the question a claim dispute actually asks.
 *
 * Append-only: nothing here is ever updated or deleted. `orders.planned_ex_factory_date`
 * stays the denormalised date IN FORCE (the book sorts on it); recording a `reship`
 * moves it, recording a `proposed` does not. The TNA is deliberately NOT recomputed by
 * a ship-date row — rescheduling the calendar is its own decision with its own ripple
 * preview, and welding the two together would move a factory's milestones as a side
 * effect of typing in what a buyer asked for.
 */
export const orderShipDates = pgTable(
  'order_ship_dates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    shipDate: date('ship_date').notNull(),
    kind: shipDateKindEnum('kind').notNull(),

    /** Who agreed it and where — "buyer mail, 8 Aug", "sales contract §4". Free text on purpose: the evidence is a citation, not a foreign key. */
    agreedWith: text('agreed_with'),
    /** Why the date moved. Required for a reship by the service — a moved promise with no reason is the row nobody can defend later. */
    reason: text('reason'),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('order_ship_dates_company_order_idx').on(t.companyId, t.orderId, t.createdAt)],
).enableRLS()


// ─────────────────────────────────────────────────────────────────────────────
// Fabric legs, drops, colour approvals — HANDOFF-orders-dossier-additions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The fabric's journey, one row per (order, leg) — the confirmation sheet's
 * FABRICS ETD / ETA / INHOUSE PLAN columns as data. The cell is the checklist
 * shape (plan, actual, note); late is derived, never stored. The store's GRN
 * stays the truth of "in-house"; a leg records the chase, not the stock.
 */
export const orderFabricLegs = pgTable(
  'order_fabric_legs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    /** One of FABRIC_LEGS in zod.ts — booking_placed … in_house, in transit order. */
    leg: text('leg').notNull(),

    planDate: date('plan_date'),
    actualDate: date('actual_date'),
    /** "mill lost four days at ex-mill" — the chase's margin voice. */
    note: text('note'),

    updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('order_fabric_legs_order_leg_key').on(t.orderId, t.leg),
    index('order_fabric_legs_company_order_idx').on(t.companyId, t.orderId),
  ],
).enableRLS()

/**
 * One buyer PO, several departures. Each drop carries its own latest-ship date and
 * is read against the credit on its own; the order's denormalised ex-factory date
 * is the LAST drop's — the order leaves the factory when the last drop does — and
 * `saveDrops` keeps it in step in the same transaction.
 */
export const orderDrops = pgTable(
  'order_drops',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    dropNo: integer('drop_no').notNull(),
    qty: integer('qty').notNull(),
    shipDate: date('ship_date').notNull(),
    note: text('note'),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('order_drops_order_no_key').on(t.orderId, t.dropNo),
    index('order_drops_company_order_idx').on(t.companyId, t.orderId),
    check('order_drops_qty_positive', sql`${t.qty} > 0`),
  ],
).enableRLS()

/** pending → sent → approved | rejected; rejected → sent. A log, not a gate — see the HANDOFF's §6. */
export const colourApprovalStatusEnum = pgEnum('colour_approval_status', [
  'pending',
  'sent',
  'approved',
  'rejected',
])

/**
 * The colour chain, one row per (order, colour, stage): lab dip → bulk lot → shade
 * band. The merchandiser's record of what the BUYER approved and when — quality's
 * 4-point result is deliberately not duplicated here. Colour is free text matched
 * against the breakdown's colours by the screen, not an FK: an approval can be
 * recorded before the grid revision that names the colour lands.
 */
export const orderColourApprovals = pgTable(
  'order_colour_approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    color: text('color').notNull(),
    /** One of COLOUR_STAGES in zod.ts. */
    stage: text('stage').notNull(),

    status: colourApprovalStatusEnum('status').notNull().default('pending'),
    /** When the buyer decided — their date, not ours. */
    decidedOn: date('decided_on'),
    note: text('note'),

    updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('order_colour_approvals_cell_key').on(t.orderId, t.color, t.stage),
    index('order_colour_approvals_company_order_idx').on(t.companyId, t.orderId),
  ],
).enableRLS()
