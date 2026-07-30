/**
 * Central schema barrel. One file per module (architecture §4) re-exported here; the
 * Drizzle client and drizzle-kit both read this single entry point.
 *
 * Module schemas get added one line at a time as their phases land.
 */
export * from './core'
export * from './auth'

// Phase 3 — 1.3 Orders & TNA, plus the LC tables it must detect conflicts against.
export * from '@/modules/buyers/schema'
export * from '@/modules/commercial/schema'
export * from '@/modules/orders/schema'

// Phase 8 — 10.1 Workforce & Wage Engine (gazette is uploaded data, never hardcoded).
export * from '@/modules/workforce/schema'

// Phase 4 — 3.1 Fabric & Trims Store (floor-facing; draws bonded stock via 2.2).
export * from '@/modules/store/schema'

// Phase 9 — X.2 MARBIM Platform. Extraction jobs and chat turns.
export * from '@/modules/marbim/schema'

// Phase 9 — X.3 Settings & Admin. The one authoritative home for company policy.
export * from '@/modules/settings/schema'

// Phase 7 — 1.2 RFQ & Quotation. Quotes snapshot a cost sheet rather than pointing at it.
export * from '@/modules/rfq/schema'

// Phase 7 — 11.1 Commercial Finance. Explicitly NOT a general ledger.
export * from '@/modules/finance/schema'

// Phase 7 — 8.1 Finishing, Cartons & Shipment. Carries the EXP-number and LC
// latest-shipment gates.
export * from '@/modules/shipment/schema'

// Phase 6 — 7.1 Inline, Endline & Final Inspection. `aql_tables` is global reference
// data with no company_id — see its comment and migration 0034.
export * from '@/modules/quality/schema'

// Phase 6 — 1.4 Sampling. Owns the PP-approval gate that 5.1 Cutting fails closed against.
export * from '@/modules/sampling/schema'

// Phase 6 — 3.2 Procurement & Suppliers. Owns `suppliers`, which 2.1's btb_lcs points at.
export * from '@/modules/procurement/schema'

// Phase 6 — 5.1 Cutting Floor. The point of no return; offline-capable.
export * from '@/modules/cutting/schema'

// Phase 5 — 4.1 Capacity & Line Planning. Owns `lines` (master data) and the factory shape.
export * from '@/modules/planning/schema'

// Phase 4 — 6.1 Line Tracking. hourly_outputs is partitioned by month; see its migration.
export * from '@/modules/production/schema'

// Phase 5 — 1.5 Costing Studio. Feeds quotes (1.2), requisitions (3.1) and finance (11.1).
export * from '@/modules/costing/schema'

// Phase 2 — 1.6 Order Memory. Holds the only pgvector column in the system; feeds 1.2's
// similar-orders panel and 1.5's seeding.
export * from '@/modules/memory/schema'

// Phase 8 — 9.1 Machines & Tickets. Consumes 6.1's machine-downtime event; `downtimes`
// stays 6.1's table (rule 11) and is linked back by id.
export * from '@/modules/maintenance/schema'
