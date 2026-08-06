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
     * The gate is `/api/me` answering 401, and it stays that way.
     *
     * It proves both things this needs: the server is serving, and it is THIS build — a
     * stale one would 404 the route. `/api/health` is now liveness only (plan 7.5) and
     * answers 200 from a process that cannot reach its database, which is correct for a
     * container runtime and useless as a gate for a suite about to query one.
     *
     * Before the split this comment explained a workaround: health returned 503 when the
     * scheduler had gone quiet, no worker runs during the suite, so within a few hours of
     * the last worker the endpoint 503'd forever and the suite refused to start with "app
     * did not become ready" — pointing at the app when the app was fine. That is the
     * conflation 7.5 removed, and `/api/ready` is now the honest thing to report.
     */
    const me = await probe('/api/me')
    if (me === 401) {
      const ready = await probe('/api/ready', 5_000)
      if (ready !== 200) {
        // Worth saying, not worth blocking on: a failing dependency is about to fail every
        // test anyway, and it will say so with a better message than this one could.
        console.log(`[integration] app ready · /api/ready is ${ready ?? 'unreachable'}`)
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
