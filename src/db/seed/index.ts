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
import postgres from 'postgres'

import { createDirectClient, createDirectDb } from '@/db/direct'
import * as schema from '@/db/schema'

import { COMMERCIAL_SLICE } from './commercial-slice'
import { COMPLIANCE_SLICE } from './compliance-slice'
import { CORE_SLICE } from './core-slice'
import { FINANCE_SLICE } from './finance-slice'
import { CUTTING_SLICE } from './cutting-slice'
import { PLANNING_SLICE } from './planning-slice'
import { MAINTENANCE_SLICE } from './maintenance-slice'
import { PROCUREMENT_SLICE } from './procurement-slice'
import { PRODUCTION_SLICE } from './production-slice'
import { QUALITY_SLICE } from './quality-slice'
import { SHIPMENT_SLICE } from './shipment-slice'
import { WORKFORCE_SLICE } from './workforce-slice'
import { SAMPLING_SLICE } from './sampling-slice'
import { STORE_SLICE } from './store-slice'
import type { SeedContext, SeedScale, SeedSlice } from './types'

const SCALES: Record<SeedScale, { label: string; users: number; documents: number }> = {
  // Enough to click through every core screen; the Phase 0 exit gate runs this one.
  pilot: { label: 'pilot', users: 8, documents: 6 },
  // A second company exists purely so cross-tenant bugs have something to leak into.
  demo: { label: 'demo', users: 20, documents: 30 },
  // Volume for k6. Real numbers arrive with the modules that own the hot tables.
  factory: { label: 'factory', users: 120, documents: 400 },
}

/**
 * Registered slices. Modules append theirs as they land.
 *
 * Order is dependency order, not alphabetical. The store's requisitions reserve stock
 * against an order, so `core` (and the order `pnpm demo` creates) comes first — and
 * `sampling` precedes `cutting` because the PP gate fails closed: without an approved PP
 * sample, no lay may exist, so seeding cutting first would seed rows the product forbids.
 */
const SLICES: SeedSlice[] = [
  CORE_SLICE,
  // Before the store: a bonded GRN references a UD, and the issue gate reads one.
  COMMERCIAL_SLICE,
  STORE_SLICE,
  SAMPLING_SLICE,
  CUTTING_SLICE,
  // Planning owns `lines` (rule 11), and production hangs every hourly output, downtime
  // and endline count off a line id — so the floor's shape is seeded before its work.
  PLANNING_SLICE,
  PRODUCTION_SLICE,
  QUALITY_SLICE,
  SHIPMENT_SLICE,
  PROCUREMENT_SLICE,
  // After quality: it seeds the operators this attaches attendance to.
  WORKFORCE_SLICE,
  COMPLIANCE_SLICE,
  MAINTENANCE_SLICE,
  // Last: it invoices an order and raises payables against receipts, so both must exist.
  FINANCE_SLICE,
]

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

/**
 * Which tenant to fill.
 *
 * Defaults to the seed's own company, which is what makes the generator idempotent. But the
 * company somebody is actually signed into is the one created by THEIR signup, and until
 * this existed the seed could only fill a tenant nobody could log into — the data was
 * there and every screen they opened was empty. `pnpm demo` already took its target this
 * way; the two now agree.
 *
 * The company must already exist: this fills a tenant, it does not invent one.
 */
function resolveTargetCompany(): { id: string; own: boolean } {
  const requested = process.env.SEED_COMPANY_ID?.trim()
  if (!requested) return { id: SEED_COMPANY_ID, own: true }
  if (!/^[0-9a-f-]{36}$/i.test(requested)) {
    throw new Error(`SEED_COMPANY_ID="${requested}" is not a uuid`)
  }
  return { id: requested, own: requested === SEED_COMPANY_ID }
}

async function main() {
  const { scale, reset } = parseArgs(process.argv.slice(2))
  const config = SCALES[scale]
  const target = resolveTargetCompany()
  const startedAt = Date.now()

  console.log(`[seed] scale=${config.label} · ${SLICES.length} slice(s)`)

  const client = createDirectClient()
  const db = createDirectDb(client)

  try {
    if (reset) {
      if (!target.own) {
        // --reset deletes the company row. Doing that to somebody's real tenant because
        // they exported an env var is not a flag, it is a trap.
        throw new Error('--reset only applies to the seed company; unset SEED_COMPANY_ID')
      }
      // audit_log is ON DELETE restrict on purpose — purging history is explicit.
      console.log('[seed] --reset: removing the seed company and its audit trail')
      await db.execute(sql`delete from audit_log where company_id = ${SEED_COMPANY_ID}`)
      await db.delete(schema.companies).where(eq(schema.companies.id, SEED_COMPANY_ID))
    }

    if (target.own) {
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
    } else {
      const [existing] = await db
        .select({ id: schema.companies.id, name: schema.companies.name })
        .from(schema.companies)
        .where(eq(schema.companies.id, target.id))
      if (!existing) throw new Error(`company ${target.id} does not exist`)
      console.log(`[seed] filling ${existing.name} (${target.id})`)
    }

    const ctx: SeedContext = {
      db,
      companyId: target.id,
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

    await assertSeedWroteSomething(db)
    await assertTenantIsolation()

    console.log('[seed] rows:')
    for (const [table, n] of Object.entries(counts).sort()) {
      console.log(`[seed]   ${table.padEnd(20)} ${n}`)
    }
    console.log(`[seed] done in ${Date.now() - startedAt}ms · company=${target.id}`)
  } finally {
    await client.end()
  }
}

/**
 * Did the slices actually write? Runs on the OWNER connection, which sees everything —
 * so all this can prove is that rows exist. It says nothing about tenancy.
 * (Its predecessor claimed to be the wall-2 check while running as the owner: a check
 * that could never fail, labelled "verified". Audit DB-H4.)
 */
async function assertSeedWroteSomething(db: ReturnType<typeof createDirectDb>): Promise<void> {
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
 * The REAL wall-2 smoke test: connect as the app role (DATABASE_URL), set no tenant
 * scope, and demand zero rows from every RLS-enabled table the seed touched. Run on
 * every seed, it catches a missing policy the moment a slice gains a table — not in a
 * later security review.
 *
 * Sweeps every RLS-enabled base table rather than a hand-kept list, so a new tenant
 * table cannot dodge it by being forgotten here.
 */
async function assertTenantIsolation(): Promise<void> {
  const appUrl = process.env.DATABASE_URL
  if (!appUrl) throw new Error('DATABASE_URL must be set for the isolation check')

  const appClient = postgres(appUrl, { max: 1, prepare: false, onnotice: () => {} })
  try {
    const tables = await appClient<{ relname: string }[]>`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
        and exists (
          select 1 from information_schema.columns col
          where col.table_schema = 'public'
            and col.table_name = c.relname
            and col.column_name = 'company_id'
        )`

    const leaks: string[] = []
    for (const { relname } of tables) {
      // No SET LOCAL app.company_id: an unscoped app-role connection must see nothing.
      const [row] = await appClient.unsafe(
        `select count(*)::text as n from "${relname.replace(/"/g, '""')}"`,
      )
      if (Number((row as unknown as { n: string }).n) > 0) leaks.push(relname)
    }

    if (leaks.length > 0) {
      throw new Error(
        `wall 2 breached: the unscoped app role can read rows from: ${leaks.join(', ')} — ` +
          'a policy is missing or not FORCEd on these tables',
      )
    }
    console.log(`[seed] isolation verified: app role sees 0 rows across ${tables.length} RLS tables`)
  } finally {
    await appClient.end()
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
