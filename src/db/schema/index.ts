/**
 * Central schema barrel. One file per module (architecture §4) re-exported here; the
 * Drizzle client and drizzle-kit both read this single entry point.
 *
 * Module schemas get added one line at a time as their phases land:
 *   export * from './orders'
 */
export * from './core'
export * from './auth'
