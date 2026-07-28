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
