#!/usr/bin/env node
/**
 * The coverage floor, and it only goes up (plan 7.3, audit TEST-M10).
 *
 * A percentage target picked out of the air is a number people argue with and then disable.
 * A RATCHET is different: it says "not worse than it is today", which nobody can argue with,
 * and it rises whenever somebody deliberately raises it. The same shape as
 * `require-tenant-predicate`'s file list and the `NO_SCREEN_YET` exemptions — this codebase
 * already believes in shrink-only lists, and this is the numeric one.
 *
 *   pnpm coverage            # measure and compare against the floor
 *   pnpm coverage --update   # raise the floor to what was just measured
 *
 * `--update` refuses to LOWER a floor. Lowering it is what turns a ratchet back into a
 * suggestion, so doing it needs `--force` and leaves a diff somebody reviews.
 *
 * ## What this number is, and what it is not
 *
 * The UNIT project only: `src/modules/**` and `src/lib`, services and pure logic, with
 * schema, zod and actions excluded because they are declarations and thin shims. It does NOT
 * include the integration suite, which is where tenancy, state machines and the pending flow
 * are actually proven — so this figure is much lower than how well the product is tested and
 * must not be quoted as though it were the whole story.
 *
 * It is still worth ratcheting. A service that gains a branch nothing exercises is exactly
 * what makes the number fall, and that is the thing worth being told about on the day it
 * happens rather than during the next audit.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const SUMMARY = 'coverage/unit/coverage-summary.json'
const FLOOR = 'coverage/floor.json'
const METRICS = ['statements', 'branches', 'functions', 'lines']

/**
 * How far below the floor is a failure.
 *
 * Zero would fail on a rounding difference between two machines measuring the same code —
 * v8 counts a branch differently under different Node minors — and a gate that fails for no
 * reason is one people rerun until it passes and then stop reading. A tenth of a percent is
 * far smaller than any real regression and larger than any measurement noise seen.
 */
const TOLERANCE = 0.1

const args = process.argv.slice(2)
const updating = args.includes('--update')
const forcing = args.includes('--force')

if (!existsSync(SUMMARY)) {
  console.error(
    `[coverage] no summary at ${SUMMARY}. Run \`pnpm test --coverage\` first — this script ` +
      'reads a report, it does not produce one.',
  )
  process.exit(1)
}

const total = JSON.parse(readFileSync(SUMMARY, 'utf8')).total
const measured = Object.fromEntries(METRICS.map((m) => [m, Number(total[m].pct.toFixed(2))]))

if (!existsSync(FLOOR)) {
  writeFileSync(FLOOR, `${JSON.stringify({ recordedAt: null, floor: measured }, null, 2)}\n`)
  console.log(`[coverage] no floor existed — recorded today's numbers:\n${fmt(measured)}`)
  process.exit(0)
}

const previous = JSON.parse(readFileSync(FLOOR, 'utf8')).floor

if (updating) {
  const lowered = METRICS.filter((m) => measured[m] < previous[m] - TOLERANCE)

  if (lowered.length > 0 && !forcing) {
    console.error(
      `[coverage] refusing to LOWER the floor for ${lowered.join(', ')}.\n` +
        lowered.map((m) => `  ${m}: floor ${previous[m]}% → measured ${measured[m]}%`).join('\n') +
        '\n\nA ratchet that can be lowered is a suggestion. If the drop is deliberate — a ' +
        'module deleted, a file newly in scope — pass --force, and the diff will say so.',
    )
    process.exit(1)
  }

  // Each metric takes the higher of the two, so a run that improved one and jiggled another
  // downward within tolerance cannot quietly give ground on the second.
  const next = Object.fromEntries(
    METRICS.map((m) => [m, forcing ? measured[m] : Math.max(measured[m], previous[m])]),
  )

  writeFileSync(
    FLOOR,
    `${JSON.stringify({ recordedAt: new Date().toISOString().slice(0, 10), floor: next }, null, 2)}\n`,
  )
  console.log(`[coverage] floor updated:\n${fmt(next, previous)}`)
  process.exit(0)
}

const failures = METRICS.filter((m) => measured[m] < previous[m] - TOLERANCE)

console.log(`[coverage] measured against the floor:\n${fmt(measured, previous)}`)

if (failures.length > 0) {
  console.error(
    `\n[coverage] FELL BELOW THE FLOOR: ${failures.join(', ')}\n` +
      failures
        .map((m) => `  ${m}: ${measured[m]}% against a floor of ${previous[m]}%`)
        .join('\n') +
      '\n\nSomething gained a branch nothing exercises. Cover it, or — if the drop is ' +
      'deliberate — `pnpm coverage --update --force` with a reason in the commit.',
  )
  process.exit(1)
}

function fmt(now, was) {
  return METRICS.map((m) => {
    const line = `  ${m.padEnd(11)} ${String(now[m]).padStart(6)}%`
    if (!was) return line
    const delta = Number((now[m] - was[m]).toFixed(2))
    const arrow = delta > 0 ? `+${delta}` : delta < 0 ? String(delta) : '='
    return `${line}   floor ${String(was[m]).padStart(6)}%   ${arrow}`
  }).join('\n')
}
