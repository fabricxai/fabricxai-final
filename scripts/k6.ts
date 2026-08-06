/**
 * The load-test harness — `pnpm k6 <scenario>` (plan 7.1, audit TEST-B2/TEST-H5).
 *
 * `pnpm k6` was `k6 run`, which meant the flagship scenario could only be executed by
 * somebody who already knew six things that were written down nowhere: which accounts to sign
 * in as, that one cookie measures the rate limiter rather than the server, which line uuids
 * to pass, what to seed first, and — the one that actually mattered — that the assertion the
 * whole scenario exists for was a COMMENT telling a human to go and run SQL afterwards.
 *
 * So TEST-B2 had never run. Not "ran and was slow": never run, on a scenario written before
 * any optimisation precisely so the first number would be a baseline.
 *
 * This does the whole thing:
 *
 *   1. refuse to run against anything that looks like production;
 *   2. ensure the load identities exist — N accounts per role, because a run on one cookie
 *      measures `LIMITS.productionWrite` and reports a healthy server as 100% failed;
 *   3. sign each of them in through the REAL endpoint, so the cookie is a real session;
 *   4. read the fixtures the scenario needs (line ids) from the database;
 *   5. snapshot the invariant rows BEFORE;
 *   6. run k6;
 *   7. snapshot AFTER and assert the invariant in code, not in a comment;
 *   8. compare the result against a committed baseline, and fail if it regressed.
 *
 * ## Why the baseline is committed
 *
 * A threshold in the scenario says "p95 under 500ms" forever. A baseline says "it was 210ms
 * on the day we measured it", and a run at 480ms passes the threshold while having doubled.
 * The first is a contract with the brief; the second is how anybody notices a regression that
 * has not yet broken the contract. Both are checked.
 *
 * `--update-baseline` rewrites the file. That is a deliberate act with a diff somebody reads,
 * which is the point.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { cpus } from 'node:os'
import { dirname, join } from 'node:path'

import { hashPassword } from 'better-auth/crypto'
import { and, eq, sql } from 'drizzle-orm'

import { createDirectClient, createDirectDb } from '@/db/direct'
import * as schema from '@/db/schema'
import { env } from '@/lib/env'

import { assertSeedTargetIsSafe } from '../src/db/seed/guard'

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios
// ─────────────────────────────────────────────────────────────────────────────

interface Invariant {
  /** What is being asserted, in the words that go in the failure. */
  label: string
  /** Rows that must not have grown beyond `bound`. */
  count: (db: Db, companyId: string, config: ScenarioConfig) => Promise<number>
  /**
   * The most rows this run may legitimately produce.
   *
   * Not "must equal": a re-run writes the SAME cells, so the count after the second run must
   * equal the count after the first. That is the duplicate check, and it is the one a 200
   * response code cannot make.
   */
  bound: (config: ScenarioConfig) => number
}

interface Scenario {
  /** The k6 file, relative to the repo root. */
  file: string
  /** Roles the load identities need. One account per VU that writes. */
  identities: { role: Role; count: number }[]
  /** Environment k6 needs, beyond the cookies. */
  env: (db: Db, companyId: string, config: ScenarioConfig) => Promise<Record<string, string>>
  invariants: Invariant[]
  /** Metrics compared against the baseline, and the direction that is bad. */
  tracked: string[]
}

type Role = 'production' | 'store' | 'owner' | 'quality' | 'merchandiser'
type Db = ReturnType<typeof createDirectDb>

interface ScenarioConfig {
  lines: number
  producedOn: string
}

/** How much slower than the baseline is a regression rather than noise. */
const REGRESSION_FACTOR = 1.3

/**
 * `store_grn`'s shape, in one place because the scenario and the row bound both need it.
 *
 * `vus × cycle × batch` is the most challans the scenario can ever create: the VU's iteration
 * counter cycles, so its offline keys repeat and a longer run replays rather than grows. The
 * numbers are passed into k6 as env rather than duplicated in the JS.
 */
const GRN = { vus: 8, cycle: 20, batch: 5 } as const

const SCENARIOS: Record<string, Scenario> = {
  production_burst: {
    file: 'k6/production_burst.js',
    /*
     * One identity per VU — 10 writers + 20 board readers, and k6 numbers VUs globally
     * across scenarios so each takes a distinct cookie.
     *
     * Ten, and the number is arithmetic rather than taste. Each identity serves one write VU
     * and two board VUs — 60 writes and 60 reads a minute against per-user caps of 120 and
     * 180, so the run stays inside the limits and measures the server.
     *
     * The first attempt gave all thirty VUs ten SHARED identities with no think time and
     * reported 64% failures: it was measuring `LIMITS.productionWrite`. The second gave each
     * VU its own and hit `LIMITS.signIn` — ten sign-ins per five minutes by IP — which is why
     * ten is also the ceiling. `production` for all of them because the board route accepts
     * it alongside planner and quality.
     */
    identities: [{ role: 'production', count: 10 }],
    env: async (db, companyId, config) => {
      const rows = await db
        .select({ id: schema.lines.id })
        .from(schema.lines)
        .where(eq(schema.lines.companyId, companyId))
        .orderBy(schema.lines.id)

      if (rows.length === 0) {
        throw new Error('no sewing lines — run `pnpm seed --scale=factory` first')
      }

      const vars: Record<string, string> = {
        LINES: String(Math.min(config.lines, rows.length)),
        PRODUCED_ON: config.producedOn,
        LINE_ID: rows[0]!.id,
      }
      // `LINE_0..N`, so the scenario spreads writes across real lines rather than hammering
      // one row — which would measure row-lock contention instead of throughput.
      rows.slice(0, config.lines).forEach((row, i) => {
        vars[`LINE_${i}`] = row.id
      })
      return vars
    },
    invariants: [
      {
        label: 'hourly_outputs rows for the run date',
        /*
         * Scoped to the run's DATE, and that scoping is the whole assertion working.
         *
         * Counting every row for the company reported 363 against a bound of 144 on the first
         * clean run and failed it — the seed writes a week of history, and the count is
         * meaningless unless it is the same slice the bound describes. The bound is
         * `lines × 24 hours`, so the count has to be one day.
         */
        count: async (db, companyId, config) => {
          const [row] = await db
            .select({ n: sql<string>`count(*)` })
            .from(schema.hourlyOutputs)
            .where(
              and(
                eq(schema.hourlyOutputs.companyId, companyId),
                eq(schema.hourlyOutputs.producedOn, config.producedOn),
              ),
            )
          return Number(row?.n ?? 0)
        },
        // `(line, produced_on, hour_slot)` is a unique natural key, so however many requests
        // were sent the distinct cells are bounded by lines × 24. More than that means the
        // upsert is not idempotent and a replayed batch is silently doubling a factory's
        // output figures — the failure this scenario was written to find.
        bound: (config) => config.lines * 24,
      },
    ],
    tracked: ['burst_write_ms', 'board_read_ms'],
  },

  store_grn: {
    file: 'k6/store_grn.js',
    identities: [{ role: 'store', count: GRN.vus }],
    env: async (db, companyId) => {
      const rows = await db
        .select({ id: schema.items.id, uom: schema.items.uom })
        .from(schema.items)
        .where(eq(schema.items.companyId, companyId))
        .orderBy(schema.items.id)
        .limit(10)

      if (rows.length === 0) {
        throw new Error('no store items — run `pnpm seed --scale=factory` first')
      }

      const vars: Record<string, string> = {
        ITEMS: String(rows.length),
        ITEM_ID: rows[0]!.id,
        UNIT: rows[0]!.uom,
        // The scenario and the bound below read the SAME numbers. Two copies is how a bound
        // silently stops describing the run it is bounding.
        CYCLE: String(GRN.cycle),
        BATCH: String(GRN.batch),
      }
      // The UoM travels with the item, because `receiveGrnIn` refuses a line whose unit
      // disagrees with the item's — correctly, since a challan recorded in the wrong unit
      // makes every stock figure for that item meaningless. A scenario guessing 'kg' would
      // measure the refusal path.
      rows.forEach((row, i) => {
        vars[`ITEM_${i}`] = row.id
        vars[`UNIT_${i}`] = row.uom
      })
      return vars
    },
    invariants: [
      {
        label: 'GRNs created by k6',
        /*
         * Only the rows this scenario made. `challan_no` carries the `K6-` prefix the
         * scenario writes, which is both the filter and the reason a real challan can never
         * be confused with one of these.
         */
        count: async (db, companyId) => {
          const [row] = await db
            .select({ n: sql<string>`count(*)` })
            .from(schema.grns)
            .where(
              and(
                eq(schema.grns.companyId, companyId),
                sql`${schema.grns.challanNo} like 'K6-%'`,
              ),
            )
          return Number(row?.n ?? 0)
        },
        /*
         * There is no natural key here — a store may legitimately receive two challans from
         * one supplier on one day for one item. What makes a replay safe is the `offline_key`
         * ledger, and the scenario derives its keys from `(vu, iter, n)` so a second run
         * replays exactly the first run's keys.
         *
         * So the bound is deliberately generous on a first run and the REAL assertion is the
         * second: `after` must not exceed `before` once the keys have been seen. That is what
         * `bound` cannot express and the before/after comparison in `main` does.
         */
        bound: () => GRN.vus * GRN.cycle * GRN.batch,
      },
    ],
    tracked: ['grn_sync_ms'],
  },

  owner_dashboard: {
    file: 'k6/owner_dashboard.js',
    identities: [{ role: 'owner', count: 6 }],
    env: async () => ({}),
    // Read-only. A dashboard that wrote rows is a finding of a different kind, and
    // `analytics-no-writes` makes it a lint error rather than something to discover here.
    invariants: [],
    tracked: ['dashboard_ms'],
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Load identities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The password every load identity shares.
 *
 * Same reasoning as the seed's, and the same guard: these accounts are created only after
 * `assertSeedTarget` has refused anything that looks like production. They are also
 * recognisable — `@k6.invalid` is a reserved TLD that can never receive mail, so one of these
 * appearing in a real database is unmistakable rather than plausible.
 */
const LOAD_PASSWORD = 'FabricXai-k6-load-2026'
const LOAD_DOMAIN = 'k6.invalid'

/**
 * Create (or find) N accounts holding a role, and return their credentials.
 *
 * Idempotent, because a load run is something you do twenty times in an afternoon while
 * chasing a number, and a harness that fails the second time is one people work around.
 */
async function ensureIdentities(
  db: Db,
  companyId: string,
  role: Role,
  count: number,
): Promise<{ email: string; password: string }[]> {
  const out: { email: string; password: string }[] = []
  const hashed = await hashPassword(LOAD_PASSWORD)

  for (let i = 0; i < count; i += 1) {
    const short = companyId.slice(0, 8)
    const userId = `k6-${short}-${role}-${i}`
    const email = `k6-${role}-${i}+${short}@${LOAD_DOMAIN}`

    await db
      .insert(schema.users)
      .values({ id: userId, email, name: `k6 ${role} ${i}`, emailVerified: true })
      .onConflictDoNothing()

    await db
      .insert(schema.profiles)
      .values({ userId, fullName: `k6 ${role} ${i}`, defaultCompanyId: companyId })
      .onConflictDoNothing()

    await db
      .insert(schema.roles)
      .values({ companyId, userId, role })
      .onConflictDoNothing()

    const existing = await db
      .select({ id: schema.accounts.id })
      .from(schema.accounts)
      .where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.providerId, 'credential')))

    if (existing.length === 0) {
      await db.insert(schema.accounts).values({
        id: `k6-cred-${userId}`,
        userId,
        accountId: userId,
        providerId: 'credential',
        password: hashed,
      })
    }

    out.push({ email, password: LOAD_PASSWORD })
  }

  return out
}

/**
 * Sessions from the last run, reused while they still work.
 *
 * Not an optimisation — a correctness fix found by running this five times in ten minutes.
 * Sign-in is rate-limited per identifier (`LIMITS.auth`, ten in five minutes) and it should
 * be, so a harness that re-authenticates thirty identities on every invocation locks itself
 * out on the third run and reports it as "is the server running?".
 *
 * Reusing a session is also what a real client does. Nobody signs in before each request.
 *
 * Gitignored: these are live session tokens for accounts with a published password on a
 * database the guard has already confirmed is not production, but they are still tokens.
 */
const SESSION_CACHE = join('k6', '.sessions.json')

function cachedSessions(): Record<string, string> {
  if (!existsSync(SESSION_CACHE)) return {}
  try {
    return JSON.parse(readFileSync(SESSION_CACHE, 'utf8')) as Record<string, string>
  } catch {
    // A truncated cache is not worth failing a run over; it just means signing in again.
    return {}
  }
}

/** Does this cookie still open an authenticated door? */
async function sessionWorks(baseUrl: string, cookie: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/auth/get-session`, {
      headers: { cookie, origin: baseUrl },
    })
    if (!response.ok) return false
    const body = (await response.json()) as { user?: unknown } | null
    return Boolean(body?.user)
  } catch {
    return false
  }
}

/**
 * Sign in through the running server's own endpoint.
 *
 * **The SERVER has to issue the cookie**, and that is not a stylistic preference. Better Auth
 * names the session cookie by environment: `better-auth.session_token` in development,
 * `__Secure-better-auth.session_token` in production. Signing in from this process — which
 * runs in development, because the seed guard refuses `NODE_ENV=production` — mints the
 * unprefixed name against a production server that looks up the prefixed one. Every request
 * then 401s in 15ms, and the run reports a beautifully fast 100% failure.
 *
 * That was the second attempt. The first went through this same route and hit
 * `LIMITS.signIn` — ten per five minutes, **by IP**, enabled in production. Correct for a
 * product where a real user signs in once and keeps the session for days, and unforgiving of
 * a harness provisioning identities from one address.
 *
 * So: no scenario asks for more than ten identities, and sessions are cached and revalidated
 * between runs. A repeat run signs in nobody.
 */
async function signIn(baseUrl: string, who: { email: string; password: string }): Promise<string> {
  const response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // Better Auth refuses a state-changing request with no `Origin` —
      // `MISSING_OR_NULL_ORIGIN`, returned as a 403 that reads like a role problem. A browser
      // always sends one, so this is the harness looking like the client it stands in for.
      origin: baseUrl,
    },
    body: JSON.stringify({ email: who.email, password: who.password }),
  })

  if (response.status === 429) {
    throw new Error(
      `sign-in for ${who.email} was rate limited. That is LIMITS.signIn doing its job — ten ` +
        'per five minutes by IP. Wait for the window and re-run: the session cache makes this ' +
        'a one-time cost per mode.',
    )
  }

  if (!response.ok) {
    throw new Error(
      `could not sign in ${who.email} (${response.status}). Is the server running at ${baseUrl}, ` +
        'and has `pnpm seed` been run against the same database?',
    )
  }

  const raw = response.headers.getSetCookie?.() ?? []
  const cookie = raw.map((line) => line.split(';')[0]).join('; ')

  if (!cookie) throw new Error(`sign-in for ${who.email} returned no session cookie`)
  return cookie
}

// ─────────────────────────────────────────────────────────────────────────────
// Baselines
// ─────────────────────────────────────────────────────────────────────────────

interface Baseline {
  recordedAt: string
  scale: string
  /**
   * What it was measured on.
   *
   * A p95 without hardware is a number nobody can argue with or reproduce. The scenario's own
   * header says phase 4 cannot close until it passes on **VPS-class hardware**, so a baseline
   * recorded on a developer laptop has to say so rather than be quietly promoted into the
   * release gate.
   */
  host: { cpus: number; platform: string; note: string }
  /**
   * `production` (`pnpm build && pnpm start`) or `dev`.
   *
   * Recorded, and a run is refused against a baseline from the other one — because the gap is
   * not noise. The owner dashboard measured **2,887ms under `pnpm dev` and 296ms under `pnpm
   * start`**: ten times, on the same machine, in the same minute. `next dev` compiles per
   * request and skips every optimisation, so a dev baseline is a number about the build tool.
   *
   * Not detected, declared. Both `.next/BUILD_ID` and `.next/dev` exist on any machine that
   * has run both, and a heuristic that is wrong once puts a meaningless number in a committed
   * file — which is worse than asking.
   */
  mode: 'production' | 'dev'
  /** metric name → p95 in ms, as measured on the day. */
  p95: Record<string, number>
}

const baselinePath = (name: string) => join('k6', 'baselines', `${name}.json`)

function readBaseline(name: string): Baseline | null {
  const path = baselinePath(name)
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8')) as Baseline
}

function writeBaseline(name: string, baseline: Baseline): void {
  const path = baselinePath(name)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(baseline, null, 2)}\n`)
}

/**
 * k6's own JSON summary, reduced to the p95s this harness compares.
 *
 * Two shapes, because k6 has two. `--summary-export` writes the percentiles directly on the
 * metric; the `handleSummary` callback receives them nested under `values`. Reading only the
 * nested one produced an empty baseline that wrote successfully and said `{}` — a file that
 * looks like a recorded reference and asserts nothing.
 */
function p95sFrom(summaryPath: string, tracked: readonly string[]): Record<string, number> {
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8')) as {
    metrics: Record<string, { 'p(95)'?: number; values?: Record<string, number> }>
  }

  const out: Record<string, number> = {}
  for (const metric of tracked) {
    const entry = summary.metrics[metric]
    const value = entry?.['p(95)'] ?? entry?.values?.['p(95)']
    if (typeof value === 'number') out[metric] = Math.round(value)
  }

  const missing = tracked.filter((metric) => !(metric in out))
  if (missing.length > 0) {
    // Loud, because a silently-empty baseline is worse than none: it commits a file that
    // reads as a measured reference and can never fail a regression.
    throw new Error(
      `k6 reported no p(95) for ${missing.join(', ')} — the scenario's tracked metric names ` +
        'and its Trend names have drifted apart.',
    )
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────

function arg(name: string, fallback: string): string {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback
}

async function main(): Promise<void> {
  const name = process.argv[2] ?? ''
  const scenario = SCENARIOS[name]

  if (!scenario) {
    console.error(
      `usage: pnpm k6 <scenario> [--lines=N] [--update-baseline]\n\n` +
        `scenarios: ${Object.keys(SCENARIOS).join(', ')}`,
    )
    process.exit(1)
  }

  // The same refusal the seed makes, for the same reason and with more force: this creates
  // accounts with a known password AND then writes production figures through them.
  assertSeedTargetIsSafe(process.env)

  const baseUrl = env.APP_URL
  const mode = arg('mode', 'production') === 'dev' ? ('dev' as const) : ('production' as const)

  if (mode === 'dev') {
    console.warn(
      '[k6] --mode=dev: `next dev` compiles per request, so these numbers measure the build ' +
        'tool as much as the product. The owner dashboard was 2,887ms in dev and 296ms in ' +
        'production on the same machine.',
    )
  }
  const config: ScenarioConfig = {
    lines: Number(arg('lines', '50')),
    producedOn: arg('date', new Date().toISOString().slice(0, 10)),
  }

  const client = createDirectClient()
  const db = createDirectDb(client)

  try {
    /*
     * The company with the most sewing lines, not the oldest.
     *
     * A dev database accumulates companies — every integration run leaves a couple — and
     * "oldest" picked one of those, which had no lines, no production users and nothing to
     * load-test. Choosing by the FIXTURE the scenario needs is both more likely to be right
     * and self-explaining when it is not. Tie-broken by id so two identical seeds pick the
     * same one every run, which a baseline depends on.
     */
    const [company] = await db
      .select({
        id: schema.companies.id,
        lines: sql<string>`count(${schema.lines.id})`,
      })
      .from(schema.companies)
      .leftJoin(schema.lines, eq(schema.lines.companyId, schema.companies.id))
      .groupBy(schema.companies.id)
      .orderBy(sql`count(${schema.lines.id}) desc`, schema.companies.id)
      .limit(1)

    if (!company || Number(company.lines) === 0) {
      throw new Error('no company with sewing lines — run `pnpm seed --scale=factory` first')
    }

    console.log(
      `[k6] ${name} · company ${company.id.slice(0, 8)} · ${company.lines} lines · ${baseUrl}`,
    )

    const cache = cachedSessions()
    const cookies: string[] = []
    let reused = 0

    for (const { role, count } of scenario.identities) {
      const people = await ensureIdentities(db, company.id, role, count)

      for (const who of people) {
        const cached = cache[who.email]
        if (cached && (await sessionWorks(baseUrl, cached))) {
          cookies.push(cached)
          reused += 1
          continue
        }

        const fresh = await signIn(baseUrl, who)
        cache[who.email] = fresh
        cookies.push(fresh)
      }
    }

    writeFileSync(SESSION_CACHE, `${JSON.stringify(cache, null, 2)}\n`)
    console.log(
      `[k6] ${cookies.length} identities · ${reused} session${reused === 1 ? '' : 's'} reused`,
    )

    const scenarioEnv = await scenario.env(db, company.id, config)

    const before = await Promise.all(
      scenario.invariants.map((inv) => inv.count(db, company.id, config)),
    )

    const summaryPath = join('k6', '.last-summary.json')
    const k6Env: Record<string, string> = {
      ...process.env,
      ...scenarioEnv,
      APP_URL: baseUrl,
      AUTH_COOKIE: cookies[0] ?? '',
      K6_VUS_COOKIES: String(cookies.length),
    }
    // `AUTH_COOKIE_0..N`, so a scenario can give each VU its own identity. The single
    // `AUTH_COOKIE` stays for a scenario that has not been taught to.
    cookies.forEach((cookie, i) => {
      k6Env[`AUTH_COOKIE_${i}`] = cookie
    })

    console.log(`[k6] running ${scenario.file} …`)
    execFileSync('k6', ['run', '--summary-export', summaryPath, scenario.file], {
      env: k6Env,
      stdio: 'inherit',
    } as never)

    // ── The assertion that was a comment ─────────────────────────────────────
    const failures: string[] = []

    for (const [i, invariant] of scenario.invariants.entries()) {
      const after = await invariant.count(db, company.id, config)
      const bound = invariant.bound(config)

      const was = before[i] ?? 0
      console.log(`[k6] ${invariant.label}: ${was} → ${after} (bound ${bound})`)

      if (after > bound) {
        failures.push(
          `${invariant.label} is ${after}, above the bound of ${bound}. The natural key should ` +
            'have made repeated writes idempotent — this is duplicated rows, not throughput.',
        )
      }
      if (after < was) {
        failures.push(`${invariant.label} went DOWN (${was} → ${after}). Rows were lost.`)
      }
    }

    // ── Baseline ─────────────────────────────────────────────────────────────
    const measured = p95sFrom(summaryPath, scenario.tracked)
    const scale = arg('scale', 'factory')

    if (process.argv.includes('--update-baseline')) {
      writeBaseline(name, {
        recordedAt: new Date().toISOString(),
        scale,
        mode,
        host: {
          cpus: cpus().length,
          platform: `${process.platform}-${process.arch}`,
          note: arg('host-note', 'developer machine — NOT the VPS-class gate the brief requires'),
        },
        p95: measured,
      })
      console.log(`[k6] baseline written: ${JSON.stringify(measured)}`)
    } else {
      const baseline = readBaseline(name)
      if (baseline && baseline.mode !== mode) {
        // Refused rather than compared. A dev run against a production baseline reports a
        // tenfold "regression" that is entirely the build tool, and the next person to see it
        // learns to ignore the check.
        console.warn(
          `[k6] baseline was recorded in ${baseline.mode} mode and this run is ${mode} — not ` +
            'comparing. Re-run in the same mode, or record a new baseline.',
        )
      } else if (!baseline) {
        console.warn(
          `[k6] no committed baseline for ${name}. Re-run with --update-baseline to record ` +
            'this run as the reference.',
        )
      } else {
        for (const [metric, value] of Object.entries(measured)) {
          const was = baseline.p95[metric]
          if (was === undefined) continue
          const ceiling = Math.round(was * REGRESSION_FACTOR)
          const verdict = value > ceiling ? 'REGRESSED' : 'ok'
          console.log(`[k6] ${metric} p95 ${value}ms vs baseline ${was}ms — ${verdict}`)
          if (value > ceiling) {
            failures.push(
              `${metric} p95 is ${value}ms against a baseline of ${was}ms (>${REGRESSION_FACTOR}×). ` +
                'It may still pass the scenario threshold and still be a regression.',
            )
          }
        }
      }
    }

    if (failures.length > 0) {
      console.error(`\n[k6] FAILED:\n${failures.map((f) => `  • ${f}`).join('\n')}`)
      process.exit(1)
    }

    console.log('\n[k6] passed')
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(`[k6] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
