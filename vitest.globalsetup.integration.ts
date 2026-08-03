import 'dotenv/config'

import { spawn, type ChildProcess } from 'node:child_process'

/**
 * Integration global setup.
 *
 * Gate A exercises the real HTTP surface (Better Auth routes, cookies, redirects), so it
 * needs a running app. This ALWAYS starts its own on a dedicated port and never reuses
 * whatever happens to be on 3000.
 *
 * That is deliberate and was learned the hard way: an earlier version reused any server
 * answering /api/health, and silently ran the whole suite against a stale build left over
 * from a previous run — every route added since returned 404 and the failures pointed
 * everywhere except the actual cause. A test harness that can pass or fail depending on
 * what you forgot to shut down is not a harness.
 */
const PORT = Number(process.env.INTEGRATION_PORT ?? 3100)
const BASE_URL = `http://localhost:${PORT}`
const READY_TIMEOUT_MS = 120_000

let server: ChildProcess | undefined

// The app under test must agree with the harness about its own URL, or Better Auth
// rejects the request as an untrusted origin and issues cookies for the wrong host.
process.env.APP_URL = BASE_URL
process.env.BETTER_AUTH_URL = BASE_URL

/**
 * `next dev` compiles routes on first request, so a cold route can take several seconds.
 * The timeout has to be generous or readiness checks fail on compile latency and report
 * it as a broken build.
 */
async function probe(path: string, timeoutMs = 20_000): Promise<number | null> {
  try {
    const response = await fetch(`${BASE_URL}${path}`, { signal: AbortSignal.timeout(timeoutMs) })
    return response.status
  } catch {
    return null
  }
}

export async function setup() {
  if ((await probe('/api/health', 2_000)) !== null) {
    throw new Error(
      `something is already listening on ${BASE_URL}.\n` +
        'The integration suite needs an exclusive port so it cannot run against a stale build.\n' +
        `Stop it, or set INTEGRATION_PORT to a free port.`,
    )
  }

  console.log(`[integration] starting next dev on ${BASE_URL} …`)
  server = spawn('pnpm', ['exec', 'next', 'dev', '--port', String(PORT)], {
    stdio: 'ignore',
    // Own process group, so teardown kills next dev AND the compiler it forks.
    detached: true,
    env: { ...process.env, PORT: String(PORT) },
  })

  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    /*
     * Readiness is `/api/me` answering 401, not `/api/health` answering 200.
     *
     * Health is a DEPLOYMENT check: it reports degraded when the BullMQ scheduler has gone
     * quiet, which is exactly right for uptime monitoring and exactly wrong as a gate here.
     * No worker runs during the suite, and none runs in CI, so within a few hours of the
     * last worker the endpoint returns 503 forever and the whole suite refuses to start
     * with "app did not become ready" — a message pointing at the app when the app is fine.
     *
     * 401 from `/api/me` proves both things this gate actually needs: the server is
     * serving, and it is THIS build (a stale one would 404 the route). Postgres and Redis
     * failures still surface — as failing tests, which is where they belong.
     */
    const me = await probe('/api/me')
    if (me === 401) {
      const health = await probe('/api/health', 5_000)
      if (health !== 200) {
        // Worth saying, not worth blocking on. A degraded scheduler in a suite that runs
        // no worker is expected; a failing database is about to fail every test anyway.
        console.log(`[integration] app ready · /api/health is ${health ?? 'unreachable'}`)
      } else {
        console.log('[integration] app ready')
      }
      return
    }
    if (me !== null && me !== 404) {
      throw new Error(
        `server on ${BASE_URL} answered /api/me with ${me} (expected 401).\n` +
          'That is a stale or broken build, not the code under test.',
      )
    }
    // null = not up yet; 404 = still compiling the route. Keep waiting rather than guessing.
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error(
    `app did not become ready at ${BASE_URL} within ${READY_TIMEOUT_MS}ms.\n` +
      'Is the compose stack up? `docker compose -f docker-compose.dev.yml up -d`',
  )
}

export async function teardown() {
  if (!server?.pid) return
  console.log('[integration] stopping next dev')
  try {
    process.kill(-server.pid, 'SIGKILL')
  } catch {
    // Already gone — nothing to do.
  }
}
