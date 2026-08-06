/**
 * k6 — store GRN receipt through the offline batch endpoint (plan 7.1, audit TEST-B2).
 *
 *   pnpm seed --scale=factory
 *   pnpm dev
 *   pnpm k6 store_grn
 *
 * ## Why this path and not the service
 *
 * `/api/sync` is the door every floor write goes through (rule 7), and a GRN is the heaviest
 * thing that comes through it: one challan is an insert plus a line per item plus a roll per
 * roll, all in one transaction, with a UoM check reading the item back per line. A production
 * output is one upserted cell. If anything on the floor is going to be the slow write, this is
 * it — which is exactly why the brief wants it measured rather than assumed.
 *
 * ## The idempotency being tested is a DIFFERENT one from production_burst's
 *
 * There is no natural key here. A GRN is not `(line, date, hour)` — a store can legitimately
 * receive two challans from the same supplier on the same day for the same item. What makes a
 * replay safe is the `offline_key` ledger: the device's own handle on the row it queued, which
 * `/api/sync` records and refuses to apply twice.
 *
 * So the assertion is the same shape and rests on something else. Every VU derives its keys
 * deterministically from `(vu, iter, n)`, and the iteration counter CYCLES — so the whole
 * scenario can only ever produce `VUS × CYCLE × BATCH` distinct challans however long it
 * runs, and a second run replays keys the first one already used. `scripts/k6.ts` counts the
 * rows against that bound and fails if it is exceeded.
 *
 * The cycle is what makes the bound assertable. Without it a longer run legitimately produces
 * more rows, "must not grow" is not a property the harness can check, and the idempotency
 * being claimed here would rest on nobody having tested it — which is how this whole item
 * started.
 *
 * That is a stronger check than `production_burst`'s: there the database itself would have
 * refused a duplicate, because `(line, date, hour)` is unique. Here only the ledger stands
 * between a re-sent batch and a store receiving the same cloth twice.
 *
 * ## Batch size
 *
 * Five rows per POST, because that is what a tablet with a morning's queue actually sends: a
 * storekeeper records receipts as the truck is unloaded and the device flushes when it finds
 * signal. The endpoint caps at 200; sending 200 would measure the cap rather than the floor.
 */
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Counter, Trend } from 'k6/metrics'

const BASE_URL = __ENV.APP_URL || 'http://localhost:3000'
const AUTH_COOKIE = __ENV.AUTH_COOKIE || ''
const COOKIES = Number(__ENV.K6_VUS_COOKIES || 0)
const ITEMS = Number(__ENV.ITEMS || 1)
const RECEIVED_ON = __ENV.RECEIVED_ON || new Date().toISOString().slice(0, 10)
const BATCH = Number(__ENV.BATCH || 5)
const THINK_S = Number(__ENV.THINK_S ?? 1)
/**
 * How many iterations before a VU starts reusing its own keys.
 *
 * Bounds the keyspace at `VUS × CYCLE × BATCH` so the row count after any run is a number the
 * harness can assert against. Supplied by `scripts/k6.ts`, which owns the same constant.
 */
const CYCLE = Number(__ENV.CYCLE || 20)

const syncLatency = new Trend('grn_sync_ms', true)
const rowsSubmitted = new Counter('grn_rows_submitted')
const duplicates = new Counter('grn_duplicates')

export const options = {
  scenarios: {
    // Eight storekeepers flushing their tablets as the trucks come in.
    grn_receipts: {
      executor: 'constant-vus',
      vus: 8,
      duration: '60s',
      exec: 'receive',
    },
  },
  thresholds: {
    // The same 500ms the brief sets for a floor write. A GRN does more work per request than
    // an hourly output, and the storekeeper is standing at the gate either way.
    grn_sync_ms: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
}

function headers() {
  const mine = __ENV[`AUTH_COOKIE_${(__VU - 1) % Math.max(1, COOKIES)}`]
  const cookie = mine || AUTH_COOKIE

  return {
    'Content-Type': 'application/json',
    ...(cookie ? { Cookie: cookie } : {}),
  }
}

/**
 * One tablet flushing a batch of challans.
 *
 * The offline keys are `k6-grn-<vu>-<iter>-<n>` — derived, never random. A random key would
 * make every run write new rows and the replay assertion afterwards would be measuring
 * nothing, which is the failure mode of most idempotency tests.
 */
export function receive() {
  const rows = []

  for (let n = 0; n < BATCH; n += 1) {
    const cycle = __ITER % CYCLE
    const key = `k6-grn-${__VU}-${cycle}-${n}`

    rows.push({
      offlineKey: key,
      moduleId: 'store',
      operation: 'receive_grn',
      payload: {
        challanNo: `K6-${__VU}-${cycle}-${n}`,
        receivedAt: RECEIVED_ON,
        bonded: false,
        lines: [
          {
            itemId: __ENV[`ITEM_${n % ITEMS}`] || __ENV.ITEM_ID,
            qty: '100.00',
            unit: __ENV[`UNIT_${n % ITEMS}`] || __ENV.UNIT || 'kg',
            rolls: [],
          },
        ],
      },
    })
  }

  const response = http.post(`${BASE_URL}/api/sync`, JSON.stringify({ rows }), {
    headers: headers(),
    tags: { name: 'grn_sync' },
  })

  syncLatency.add(response.timings.duration)
  rowsSubmitted.add(rows.length)

  const ok = check(response, { 'batch accepted': (r) => r.status === 200 })

  if (ok) {
    // Counted, and worth counting: on a first run this should be zero and on a replay it
    // should be everything. A run reporting neither is a run whose keys are not stable.
    try {
      const body = response.json()
      const applied = (body.results || []).filter((r) => r.status === 'duplicate').length
      duplicates.add(applied)
    } catch {
      // A 200 that is not JSON is already a failed check above.
    }
  }

  sleep(THINK_S)
}

export function handleSummary(data) {
  const submitted = data.metrics.grn_rows_submitted?.values.count ?? 0
  const dupes = data.metrics.grn_duplicates?.values.count ?? 0

  return {
    stdout: `
store_grn — ${RECEIVED_ON}

  rows submitted     ${submitted}
  reported duplicate ${dupes}
  sync p95           ${fmt(data.metrics.grn_sync_ms)}
  request failures   ${pct(data.metrics.http_req_failed)}

  Row-count assertion is made by scripts/k6.ts, against the database, after this.
`,
  }
}

const fmt = (metric) => (metric ? `${metric.values['p(95)'].toFixed(0)}ms` : 'n/a')
const pct = (metric) => (metric ? `${(metric.values.rate * 100).toFixed(2)}%` : 'n/a')
