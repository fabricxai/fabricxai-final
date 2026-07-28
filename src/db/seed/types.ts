/**
 * Seed slice contract. A module contributes one of these and knows nothing about the
 * others — which is what stops the generator becoming a single file that every phase has
 * to edit.
 */
import type { createDirectDb } from '@/db/direct'

export type SeedScale = 'pilot' | 'demo' | 'factory'

export interface SeedVolume {
  label: string
  users: number
  documents: number
}

export interface SeedContext {
  db: ReturnType<typeof createDirectDb>
  companyId: string
  scale: SeedScale
  volume: SeedVolume
  /** Deterministic — a seed run has to be reproducible to be debuggable. */
  rng: () => number
}

export interface SeedSlice {
  /** Module id, e.g. 'core' or 'orders'. */
  id: string
  /**
   * Must be idempotent: running the seed twice produces the same database, not double
   * the rows. Return per-table counts for the summary.
   */
  run(ctx: SeedContext): Promise<Record<string, number>>
}
