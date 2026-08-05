/**
 * Runs the seed's target check before anything else in the process loads.
 *
 * Import order is the whole point of this file. `assertSeedTargetIsSafe()` called from
 * `main()` runs *after* every module-level side effect in the import graph — including
 * `@/lib/env`, which validates the entire application environment and throws first. A seed
 * aimed at production with a half-filled `.env` therefore died with "MARBIM_MOCK must be
 * off in production": a true statement, exit 1, and completely the wrong thing to tell
 * somebody who is one keystroke from writing published passwords into a live factory.
 *
 * ESM evaluates dependencies in source order, so importing this above the slices makes the
 * refusal the first thing that can happen. **Keep it first.**
 *
 * It exits rather than throwing because a throw during module evaluation escapes
 * `main().catch()` and prints a stack trace over the message the operator needs to read.
 */
import 'dotenv/config'

import { assertSeedTargetIsSafe } from './guard'

try {
  assertSeedTargetIsSafe()
} catch (error) {
  console.error(`[seed] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
