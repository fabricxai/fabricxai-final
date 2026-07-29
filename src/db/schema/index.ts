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
