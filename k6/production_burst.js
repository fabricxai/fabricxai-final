/**
 * k6 — 6.1 Line Tracking burst (dev-plan §7, PLAYBOOK §3 flagship addendum).
 *
 * Built BEFORE any optimisation, deliberately: the first run establishes the baseline, and
 * a number you tuned towards is not a baseline. Phase 4 cannot close until this passes on
 * VPS-class hardware.
 *
 * The shape of a real 17:00 on a sewing floor:
 *   50 lines each posting the hour's count, 10 concurrent bursts,
 *   while 20 dashboards poll the board.
 *
 * Thresholds from the brief:
 *   write p95      < 500ms
 *   board read p95 < 800ms
 *   zero lost or duplicated rows — asserted from row counts after the run, not from
 *   response codes. A 200 that wrote nothing is the failure this is looking for.
 *
 *   pnpm k6 k6/production_burst.js
 *
 * ## Run it with the harness, not by hand
 *
 *   pnpm seed --scale=factory
 *   pnpm dev                       # in another terminal
 *   pnpm k6 production_burst
 *
 * `scripts/k6.ts` creates the load identities, signs each of them in through the real
 * endpoint, passes the line uuids, and — the part that used to be a comment asking a human
 * to run SQL — asserts the row counts afterwards. Running `k6 run` against this file
 * directly still works, but every variable below then has to be supplied by hand.
 *
 * ## Both routes require a session (plan 5.7)
 *
 * `/api/production/outputs` and `/api/production/board` landed with 5.7; until then this
 * scenario had nothing to hit, which is why TEST-B2 could not run. Both are gated — the
 * write is `production` only, the board also allows `planner` and `quality` — so without a
 * cookie every request is a 401 and `http_req_failed` reports 100%, which reads as a broken
 * server rather than a missing session.
 *
 * ## One cookie measures the rate limiter, not the server
 *
 * Both routes are capped per USER — 120 writes and 180 board reads a minute — which is
 * enormously generous for a supervisor who posts once an hour and corrects it twice, and far
 * below what ten `constant-vus` on a single identity generate. That is not a limit needing
 * raising for the run; it is the run needing to look like load, which means fifty lines
 * posted by fifty people rather than by one.
 *
 * So each VU takes its own identity from `AUTH_COOKIE_0..N` — thirty of them, one per VU,
 * because k6 numbers VUs globally across scenarios. `AUTH_COOKIE` remains as the fallback for
 * a hand-run, and a hand-run on one cookie will show exactly the 429s this paragraph is about.
 *
 * ## Why there is think time, and why that is not softening the test
 *
 * The FIRST real run of this scenario (plan 7.1) reported **64% request failures** and a write
 * p95 of 695ms. Neither was the server: with no sleep, `constant-vus` generated 129 req/s
 * across ten shared identities — 219 writes and 558 board reads per identity per minute
 * against limits of 120 and 180. Two thirds of the run was 429s, and the latency was the
 * queue behind them. It was measuring the rate limiter.
 *
 * That is not what this file claims to measure. Its own header says "the shape of a real
 * 17:00 on a sewing floor", and a real floor does not post 219 hourly counts per supervisor
 * per minute — a supervisor posts once an hour and corrects it twice. So the VUs now pause,
 * and the load they generate is still absurd next to the real thing:
 *
 *   writes  10 VUs × 1/s   = 600/min. A factory writes 50 lines × 24 hours = 1,200 cells in
 *                            a WHOLE DAY. This is twelve times the busiest real minute.
 *   reads   20 VUs × 1/2s  = 600/min against boards that would poll every 10–30 seconds.
 *
 * Both sit inside the per-user limits, so what the numbers measure is the server. If the
 * question is instead "what happens when the limits are hit", that is a different scenario
 * and it should say so in its name rather than be this one with the sleeps removed.
 */
import http from 'k6/http'
import { check, group, sleep } from 'k6'
import { Counter, Trend } from 'k6/metrics'

const BASE_URL = __ENV.APP_URL || 'http://localhost:3000'
const AUTH_COOKIE = __ENV.AUTH_COOKIE || ''
/** How many `AUTH_COOKIE_n` the harness supplied. Zero for a hand-run. */
const COOKIES = Number(__ENV.K6_VUS_COOKIES || 0)
const LINES = Number(__ENV.LINES || 50)
const PRODUCED_ON = __ENV.PRODUCED_ON || new Date().toISOString().slice(0, 10)
/** Overridable so the limit-saturation question can be asked deliberately, with `=0`. */
const WRITE_THINK_S = Number(__ENV.WRITE_THINK_S ?? 1)
const READ_THINK_S = Number(__ENV.READ_THINK_S ?? 2)

const writeLatency = new Trend('burst_write_ms', true)
const boardLatency = new Trend('board_read_ms', true)
const rowsSubmitted = new Counter('rows_submitted')

export const options = {
  scenarios: {
    // Ten supervisors hitting submit at once, every hour of a shift.
    burst_writes: {
      executor: 'constant-vus',
      vus: 10,
      duration: '60s',
      exec: 'writeBurst',
    },
    // The board on every supervisor's tablet and the manager's TV, polling throughout.
    dashboard_readers: {
      executor: 'constant-vus',
      vus: 20,
      duration: '60s',
      exec: 'readBoard',
    },
  },
  thresholds: {
    'burst_write_ms': ['p(95)<500'],
    'board_read_ms': ['p(95)<800'],
    // A burst path that starts erroring under load has failed even if it is fast.
    'http_req_failed': ['rate<0.01'],
  },
}

/**
 * This VU's own session.
 *
 * `__VU` is 1-based and each scenario numbers its VUs independently, so the two scenarios
 * below overlap on identities — which is correct: a supervisor posting output is also
 * somebody with the board open, and modelling them as disjoint populations would be a
 * politer load than the floor generates.
 */
function headers() {
  const mine = __ENV[`AUTH_COOKIE_${(__VU - 1) % Math.max(1, COOKIES)}`]
  const cookie = mine || AUTH_COOKIE

  return {
    'Content-Type': 'application/json',
    ...(cookie ? { Cookie: cookie } : {}),
  }
}

/**
 * One supervisor posting one line's hour.
 *
 * The hour slot is derived from the iteration rather than randomised, so a re-run writes
 * the SAME cells — which is what lets the row-count assertion afterwards distinguish
 * "idempotent upsert" from "quietly inserted twice".
 */
export function writeBurst() {
  const lineIndex = (__VU * 1000 + __ITER) % LINES
  const hourSlot = __ITER % 24

  const payload = JSON.stringify({
    entries: [
      {
        lineId: __ENV[`LINE_${lineIndex}`] || __ENV.LINE_ID,
        producedOn: PRODUCED_ON,
        hourSlot,
        target: 120,
        actual: 100 + (__ITER % 40),
      },
    ],
  })

  const response = http.post(`${BASE_URL}/api/production/outputs`, payload, {
    headers: headers(),
    tags: { name: 'burst_write' },
  })

  writeLatency.add(response.timings.duration)
  rowsSubmitted.add(1)

  check(response, {
    'write accepted': (r) => r.status === 200 || r.status === 201,
  })

  // A supervisor posting once an hour, compressed to once a second. See the header for why
  // this is here and why removing it measures something else.
  sleep(WRITE_THINK_S)
}

export function readBoard() {
  group('board', () => {
    const response = http.get(
      `${BASE_URL}/api/production/board?producedOn=${PRODUCED_ON}`,
      { headers: headers(), tags: { name: 'board_read' } },
    )

    boardLatency.add(response.timings.duration)
    check(response, { 'board served': (r) => r.status === 200 })
  })

  sleep(READ_THINK_S)
}

/**
 * The summary k6 prints. The row-count assertion is made by the harness.
 *
 * It used to be made here, in prose: "run this SQL afterwards, it must be <= LINES × 24".
 * That is the assertion that actually matters — a 200 that wrote nothing, or wrote twice, is
 * exactly what response codes cannot show — and leaving it to a human meant it had never once
 * been checked. `scripts/k6.ts` counts the rows before and after and fails the run.
 */
export function handleSummary(data) {
  const submitted = data.metrics.rows_submitted ? data.metrics.rows_submitted.values.count : 0

  return {
    stdout: `
production_burst — ${LINES} lines, ${PRODUCED_ON}

  rows submitted     ${submitted}
  write p95          ${fmt(data.metrics.burst_write_ms)}
  board read p95     ${fmt(data.metrics.board_read_ms)}
  request failures   ${pct(data.metrics.http_req_failed)}

  Row-count assertion is made by scripts/k6.ts, against the database, after this.
  Bound: ${LINES * 24} rows.
`,
  }
}

const fmt = (metric) => (metric ? `${metric.values['p(95)'].toFixed(0)}ms` : 'n/a')
const pct = (metric) => (metric ? `${(metric.values.rate * 100).toFixed(2)}%` : 'n/a')
