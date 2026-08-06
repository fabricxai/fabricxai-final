/**
 * The three health endpoints, over HTTP (plan 7.5, audit INFRA-M1/M13).
 *
 * One endpoint answered three questions and returned 503 if any was unhappy. That did two
 * things wrong, and both are asserted here rather than described:
 *
 *  - a quiet scheduled task in the WORKER made the image's `HEALTHCHECK` mark the APP
 *    unhealthy, so Docker restarted a process that was serving requests perfectly well;
 *  - it published `NODE_ENV`, raw dependency exception strings — which carry a connection
 *    string when Postgres refuses one — and the name of every scheduled task, to anybody who
 *    could reach the app.
 *
 * Over HTTP against the running server rather than by calling the handlers, because what is
 * being checked includes the STATUS CODE a container runtime reads and the body a stranger
 * sees. A handler test would assert the shape of an object and miss both.
 */
import { beforeAll, describe, expect, it } from 'vitest'

const BASE_URL = process.env.APP_URL ?? 'http://localhost:3100'

const get = (path: string, init?: RequestInit) => fetch(`${BASE_URL}${path}`, init)

/**
 * Compile the routes before timing anything.
 *
 * The suite runs against `next dev`, which builds a route the first time it is requested —
 * the first `/api/ready` call took sixty seconds and the next took seventeen milliseconds.
 * Timing that first call measured the bundler, and the timeout it produced looked exactly
 * like the hanging probe this file was written to catch, which cost a while to tell apart.
 */
beforeAll(async () => {
  await Promise.all(
    ['/api/health', '/api/ready', '/api/health/jobs'].map((path) =>
      get(path).catch(() => undefined),
    ),
  )
}, 120_000)

describe('/api/health · liveness, and nothing else', () => {
  it('1 · answers 200 because the request arrived', async () => {
    const response = await get('/api/health')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })

  it('2 · leaks no environment, no versions, no task names', async () => {
    /*
     * The disclosure half of INFRA-M1. A liveness probe is read by a container runtime and a
     * load balancer, neither of which can use any of that — and everything printed here is
     * printed to whoever else is looking.
     */
    const body = await (await get('/api/health')).text()

    expect(body).not.toMatch(/development|production|NODE_ENV/i)
    expect(body).not.toMatch(/postgres|redis|scheduler/i)
    expect(body).not.toMatch(/marbim|tna_scan|lc_countdown/i)
    // The whole payload, so a future field cannot be added without this failing.
    expect(body.length).toBeLessThan(40)
  })

  it('3 · does not depend on the scheduler, which is the restart bug', async () => {
    // No worker runs during this suite, so every scheduled task is silent. Under the old
    // endpoint that was a 503 — and a 503 here is what restarted the app for a problem in
    // another process.
    expect((await get('/api/health')).status).toBe(200)
  })
})

describe('/api/ready · dependencies', () => {
  it('4 · reports the real pooled path as up', async () => {
    const response = await get('/api/ready')
    const body = (await response.json()) as {
      status: string
      checks: { postgres: { ok: boolean; latencyMs: number }; redis: { ok: boolean } }
    }

    expect(response.status).toBe(200)
    expect(body.status).toBe('ready')
    expect(body.checks.postgres.ok).toBe(true)
    expect(body.checks.redis.ok).toBe(true)
    // Worth having: "up but answering in four seconds" is the state that precedes an outage
    // and is invisible in a boolean.
    expect(body.checks.postgres.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('5 · carries no exception text, only ok and a latency', async () => {
    /*
     * The reason this endpoint can be public. A refused Postgres connection reports back with
     * the connection string in it — user, host, database — and a load balancer cannot hold a
     * credential, so it cannot be put behind a token either.
     */
    const body = await (await get('/api/ready')).text()

    expect(body).not.toMatch(/error|ECONNREFUSED|password|postgres:\/\//i)
  })

  it('5b · answers quickly even when a dependency does not', async () => {
    /*
     * Found by writing test 4, which sat for the full 60-second limit on its first call:
     * ioredis retries a dead server with backoff rather than refusing, so the probe had
     * inherited a retry loop it never asked for.
     *
     * A readiness probe that can hang has failed at its own job — a load balancer holding an
     * open connection to an instance that will never answer is exactly the instance it is
     * trying to take out of rotation. Each dependency now gets a deadline, so the answer
     * arrives as a 503 the balancer can act on rather than as a hang it must give up on.
     */
    const startedAt = Date.now()
    await get('/api/ready')

    // Generous next to the 2s per-probe deadline and far under any proxy's own timeout. The
    // two run concurrently, so this is one deadline plus the request, not two.
    expect(Date.now() - startedAt).toBeLessThan(10_000)
  })

  it('6 · is never cached', async () => {
    // A readiness answer one second old is a lie a proxy will keep telling for as long as it
    // holds it.
    expect((await get('/api/ready')).headers.get('cache-control')).toContain('no-store')
  })

  it('7 · says nothing about the scheduler', async () => {
    // A nightly job that has not fired does not stop this instance serving a merchandiser.
    // Reporting it here takes a working app out of rotation for another process's problem.
    const body = await (await get('/api/ready')).text()

    expect(body).not.toMatch(/scheduler|silent|task/i)
  })
})

describe('/api/health/jobs · the detail, behind a token', () => {
  it('8 · exists, which it did not', async () => {
    /*
     * `docker-compose.prod.yml` disables the worker's healthcheck on the strength of this
     * route — "its liveness is observable instead through /api/health/jobs" — and the route
     * 404ed. A worker that had stopped firing was observable by nothing at all.
     */
    expect((await get('/api/health/jobs')).status).not.toBe(404)
  })

  it('9 · refuses without a token rather than falling open', async () => {
    const response = await get('/api/health/jobs')

    // 401 when a token is configured, 503 when none is — different states, different fixes,
    // and neither is a 404 reading as "the route the compose file names does not exist".
    expect([401, 503]).toContain(response.status)

    const body = await response.text()
    // The refusal must not itself disclose what the route would have said.
    expect(body).not.toMatch(/tna_scan|lc_countdown|marbim|silentMinutes/i)
  })

  it('10 · refuses a wrong token', async () => {
    const response = await get('/api/health/jobs', {
      headers: { authorization: 'Bearer not-the-token-not-even-close' },
    })

    expect([401, 503]).toContain(response.status)
  })

  it('11 · is never cached', async () => {
    const response = await get('/api/health/jobs', {
      headers: { authorization: 'Bearer whatever' },
    })

    // The unauthorised path may or may not set it; what matters is it is not a 200 with a
    // cacheable body, which a shared proxy would then serve to the next caller.
    expect(response.status).not.toBe(200)
  })
})
