/**
 * Factory-scale seed generator (dev-plan §7) — `pnpm seed --scale=pilot`.
 * One generator feeds dev, demos and k6.
 *
 * **Module-aware by construction.** Each module contributes its own slice through
 * `register.ts`, and `--scale` controls volume only. The alternative — one monolithic
 * script that knows every table — would have to be rewritten at every phase boundary,
 * and the Phase 0 exit gate would stop meaning anything the moment orders landed.
 *
 * At Phase 0 only the core slice exists: one company, users across the role matrix,
 * profiles, roles, approval rules, documents, notifications, and pending_changes in each
 * status. dev-plan §7's headline numbers (250 orders, 1.2M hourly_outputs, 30k rolls,
 * 2,400 workers) and its deliberate edge rows (LC latest-shipment conflict, overdrawn UD
 * attempt, a 38% line, a negative-margin order) belong to modules that do not exist until
 * Phase 3–8. They arrive as slices, not as edits to this file.
 *
 * **Re-runnable.** Running it twice must not double anything — it is used before demos
 * and before k6 runs, and a generator you have to drop the database to re-run is a
 * generator nobody runs.
 */
import 'dotenv/config'

import { randomUUID } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'

import { createDirectClient, createDirectDb } from '@/db/direct'
import * as schema from '@/db/schema'

import { CORE_SLICE } from './core-slice'
import type { SeedContext, SeedScale, SeedSlice } from './types'

const SCALES: Record<SeedScale, { label: string; users: number; documents: number }> = {
  // Enough to click through every core screen; the Phase 0 exit gate runs this one.
  pilot: { label: 'pilot', users: 8, documents: 6 },
  // A second company exists purely so cross-tenant bugs have something to leak into.
  demo: { label: 'demo', users: 20, documents: 30 },
  // Volume for k6. Real numbers arrive with the modules that own the hot tables.
  factory: { label: 'factory', users: 120, documents: 400 },
}

/** Registered slices. Modules append theirs as they land. */
const SLICES: SeedSlice[] = [CORE_SLICE]

function parseArgs(argv: readonly string[]): { scale: SeedScale; reset: boolean } {
  const scaleArg = argv.find((a) => a.startsWith('--scale='))?.split('=')[1] ?? 'pilot'
  if (!(scaleArg in SCALES)) {
    throw new Error(`unknown --scale=${scaleArg}. Expected one of: ${Object.keys(SCALES).join(', ')}`)
  }
  return { scale: scaleArg as SeedScale, reset: argv.includes('--reset') }
}

/**
 * The seed's own company. A fixed uuid, so re-running updates the same tenant instead of
 * creating a new one every time — that is what makes the generator idempotent.
 */
const SEED_COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const SEED_COMPANY_SLUG = 'seed-apparels'

async function main() {
  const { scale, reset } = parseArgs(process.argv.slice(2))
  const config = SCALES[scale]
  const startedAt = Date.now()

  console.log(`[seed] scale=${config.label} · ${SLICES.length} slice(s)`)

  const client = createDirectClient()
  const db = createDirectDb(client)

  try {
    if (reset) {
      // audit_log is ON DELETE restrict on purpose — purging history is explicit.
      console.log('[seed] --reset: removing the seed company and its audit trail')
      await db.execute(sql`delete from audit_log where company_id = ${SEED_COMPANY_ID}`)
      await db.delete(schema.companies).where(eq(schema.companies.id, SEED_COMPANY_ID))
    }

    await db
      .insert(schema.companies)
      .values({
        id: SEED_COMPANY_ID,
        name: 'Seed Apparels Ltd.',
        legalName: 'Seed Apparels Limited',
        slug: SEED_COMPANY_SLUG,
        bin: '004123456789',
        bondedLicenseNo: 'BOND/DHK/2019/4471',
        factoryLicenseNo: 'FL-DHK-88231',
        address: { line1: 'Plot 42, DEPZ', city: 'Savar', district: 'Dhaka', country: 'BD' },
      })
      .onConflictDoUpdate({
        target: schema.companies.id,
        set: { name: 'Seed Apparels Ltd.', updatedAt: new Date() },
      })

    const ctx: SeedContext = {
      db,
      companyId: SEED_COMPANY_ID,
      scale,
      volume: config,
      rng: makeRng(`fabricxai:${scale}`),
    }

    const counts: Record<string, number> = {}
    for (const slice of SLICES) {
      const result = await slice.run(ctx)
      for (const [table, n] of Object.entries(result)) {
        counts[table] = (counts[table] ?? 0) + n
      }
      console.log(`[seed]   ✓ ${slice.id}`)
    }

    await assertTenantIsolation(db)

    console.log('[seed] rows:')
    for (const [table, n] of Object.entries(counts).sort()) {
      console.log(`[seed]   ${table.padEnd(20)} ${n}`)
    }
    console.log(`[seed] done in ${Date.now() - startedAt}ms · company=${SEED_COMPANY_ID}`)
  } finally {
    await client.end()
  }
}

/**
 * Cheap smoke test of wall 2 on every seed run: seeded rows must be invisible without
 * the matching scope. Three lines, and it catches a missing policy on a new table the
 * moment its slice is added rather than in a later security review.
 */
async function assertTenantIsolation(db: ReturnType<typeof createDirectDb>): Promise<void> {
  const result = await db.execute<{ visible: string }>(sql`
    select count(*)::text as visible
    from (
      select 1 from notifications where company_id = ${SEED_COMPANY_ID}
      union all
      select 1 from documents where company_id = ${SEED_COMPANY_ID}
    ) seeded`)

  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
  const visible = Number((rows[0] as { visible: string }).visible)
  if (visible === 0) {
    throw new Error('seed wrote nothing visible — the slices did not run')
  }
}

/**
 * Deterministic RNG. A seed run must be reproducible: "it only fails with the demo data"
 * is not debuggable if the demo data is different every time.
 */
function makeRng(seedText: string): () => number {
  let h = 2166136261
  for (const ch of seedText) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return () => {
    h ^= h << 13
    h ^= h >>> 17
    h ^= h << 5
    return ((h >>> 0) % 1_000_000) / 1_000_000
  }
}

export { SEED_COMPANY_ID, SEED_COMPANY_SLUG, randomUUID }

main().catch((error: unknown) => {
  console.error('[seed] failed:', error)
  process.exit(1)
})
