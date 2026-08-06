/**
 * k6 — the owner's dashboard under a morning's worth of refreshes (plan 7.1, audit TEST-B2).
 *
 *   pnpm seed --scale=factory
 *   pnpm dev
 *   pnpm k6 owner_dashboard
 *
 * ## Why the PAGE and not the queries
 *
 * The other two scenarios post to routes. This one requests the rendered dashboard, and that
 * is deliberate: `/dashboard` is a server component that runs `exceptions`, `orderBook`,
 * `otd`, `efficiencyTrend`, `dhuTrend`, `cash` and `buyerScorecards` — seven analytics reads
 * across most of the schema — and then renders. Timing the queries in isolation would measure
 * the half of that which is easy to measure and report it as the page.
 *
 * What an owner experiences is the whole thing: the session lookup, the RLS-scoped reads, the
 * render, the payload over the wire. That number is the one worth having a baseline for,
 * because it is the one that will quietly get worse as every module adds a card.
 *
 * ## The shape
 *
 * Six people with the dashboard open — the owner, two directors, the GM, and a couple of
 * managers who keep it in a tab — refreshing every few seconds. That is far more often than
 * anybody actually refreshes a dashboard, and deliberately so: this is a read path with no
 * cache in front of it, so the interesting question is what happens when several arrive at
 * once rather than what one costs.
 *
 * ## Read-only, so there is no row assertion
 *
 * `production_burst` and `store_grn` both prove an idempotency. This proves a latency and
 * nothing else, and the harness has no invariant for it — a dashboard that wrote rows would
 * be a finding of a different kind entirely, which `analytics-no-writes` already makes a lint
 * error rather than something to discover here.
 */
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Trend } from 'k6/metrics'

const BASE_URL = __ENV.APP_URL || 'http://localhost:3000'
const AUTH_COOKIE = __ENV.AUTH_COOKIE || ''
const COOKIES = Number(__ENV.K6_VUS_COOKIES || 0)
const THINK_S = Number(__ENV.THINK_S ?? 3)

const dashboardLatency = new Trend('dashboard_ms', true)

export const options = {
  scenarios: {
    owners_watching: {
      executor: 'constant-vus',
      vus: 6,
      duration: '60s',
      exec: 'openDashboard',
    },
  },
  thresholds: {
    /*
     * Two seconds, not the 800ms the board gets.
     *
     * A different promise for a different screen. The production board is a floor display a
     * supervisor glances at between hours; the owner's dashboard is seven cross-module
     * aggregates over a factory's year, opened a few times a day. Holding it to the board's
     * budget would either be a threshold that fails forever or an argument for making the
     * dashboard say less.
     */
    dashboard_ms: ['p(95)<2000'],
    http_req_failed: ['rate<0.01'],
  },
}

function headers() {
  const mine = __ENV[`AUTH_COOKIE_${(__VU - 1) % Math.max(1, COOKIES)}`]
  const cookie = mine || AUTH_COOKIE

  return { ...(cookie ? { Cookie: cookie } : {}) }
}

export function openDashboard() {
  const response = http.get(`${BASE_URL}/dashboard`, {
    headers: headers(),
    tags: { name: 'dashboard' },
  })

  dashboardLatency.add(response.timings.duration)

  check(response, {
    'dashboard served': (r) => r.status === 200,
    // A 200 that redirected to /login is a session problem wearing a success code, and it
    // would otherwise show up as a suspiciously fast page.
    'not the login page': (r) => !r.url.includes('/login'),
  })

  sleep(THINK_S)
}

export function handleSummary(data) {
  return {
    stdout: `
owner_dashboard

  dashboard p95      ${fmt(data.metrics.dashboard_ms)}
  request failures   ${pct(data.metrics.http_req_failed)}

  Read-only — no row assertion. See the header.
`,
  }
}

const fmt = (metric) => (metric ? `${metric.values['p(95)'].toFixed(0)}ms` : 'n/a')
const pct = (metric) => (metric ? `${(metric.values.rate * 100).toFixed(2)}%` : 'n/a')
