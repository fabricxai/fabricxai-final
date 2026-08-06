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
 * ## Both routes require a session (plan 5.7)
 *
 * They exist now — `/api/production/outputs` and `/api/production/board` landed with 5.7,
 * and until then this scenario had nothing to hit, which is why TEST-B2 could not run. Both
 * are gated: the write is `production` only, the board also allows `planner` and `quality`.
 * So `AUTH_COOKIE` is not optional in practice — without it every request is a 401 and
 * `http_req_failed` reports 100%, which looks like a broken server rather than a missing
 * cookie.
 *
 *   AUTH_COOKIE="$(curl -s -i -X POST http://localhost:3000/api/auth/sign-in/email \
 *     -H 'content-type: application/json' \
 *     -d '{"email":"...","password":"..."}' \
 *     | grep -i '^set-cookie' | cut -d' ' -f2 | cut -d';' -f1 | paste -sd'; ')" \
 *   LINE_ID=<a line uuid> pnpm k6 k6/production_burst.js
 *
 * ## One cookie will be rate-limited, and that is the limit being right
 *
 * Both routes are capped per USER — 120 writes and 180 board reads a minute — which is
 * enormously generous for a supervisor who posts once an hour and corrects it twice, and
 * far below what ten `constant-vus` on a single identity generate. That is not a limit that
 * needs raising for the run; it is the run needing to look like load, which means fifty
 * lines posted by fifty people rather than by one.
 *
 * So: sign in per VU, or seed N accounts and pass `AUTH_COOKIE_0..N`. A run on one cookie
 * measures the rate limiter, and `http_req_failed` reports 100% for a server that is fine.
 */
import http from 'k6/http'
import { check, group } from 'k6'
import { Counter, Trend } from 'k6/metrics'

const BASE_URL = __ENV.APP_URL || 'http://localhost:3000'
const AUTH_COOKIE = __ENV.AUTH_COOKIE || ''
const LINES = Number(__ENV.LINES || 50)
const PRODUCED_ON = __ENV.PRODUCED_ON || new Date().toISOString().slice(0, 10)

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

function headers() {
  return {
    'Content-Type': 'application/json',
    ...(AUTH_COOKIE ? { Cookie: AUTH_COOKIE } : {}),
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
}

/**
 * After the run, count the rows.
 *
 * This is the assertion that actually matters and the one response codes cannot make.
 * Every write targeted a `(line, date, hour)` cell that the natural key makes unique, so
 * the number of DISTINCT cells is bounded by LINES × 24 no matter how many requests were
 * sent. More rows than that means the upsert is not idempotent and a replayed batch is
 * silently duplicating a factory's output figures.
 *
 * Run against the database after k6 finishes:
 *
 *   select count(*) from hourly_outputs where produced_on = '<PRODUCED_ON>';
 *   -- must be <= LINES * 24, and must not grow on a second identical k6 run
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

  Row-count assertion is NOT made here — run it against the database:
    select count(*) from hourly_outputs where produced_on = '${PRODUCED_ON}';
  It must be <= ${LINES * 24} and must not change on a second identical run.
`,
  }
}

const fmt = (metric) => (metric ? `${metric.values['p(95)'].toFixed(0)}ms` : 'n/a')
const pct = (metric) => (metric ? `${(metric.values.rate * 100).toFixed(2)}%` : 'n/a')
