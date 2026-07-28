/**
 * modules/core — cross-cutting invariants, implemented once and consumed everywhere
 * (dev-plan §2.2). Core changes are never mixed into a module PR (CLAUDE.md rule 12).
 */
export * from './ctx'
export * from './errors'
export * from './gates'
export * from './registry'
export * from './state-machine'

export * as audit from './audit'
export * as documents from './documents'
export * as notifications from './notifications'
export * as offlineSync from './offline-sync'
export * as outbox from './outbox'
export * as pendingChanges from './pending-changes'
export * as tenancy from './tenancy'
export * from './session'
