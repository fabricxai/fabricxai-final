import { NextResponse } from 'next/server'

/**
 * Liveness. Nothing else (plan 7.5, audit INFRA-M13, INFRA-M1).
 *
 * "Is this process able to answer?" — and the honest answer to that is yes if the request
 * arrived here at all. It touches no dependency, so it cannot be made to fail by one.
 *
 * ## What it used to be, and why that was wrong twice
 *
 * One endpoint answered three different questions and returned 503 if any of them was
 * unhappy — including a scheduled task having gone quiet.
 *
 * **It restarted the wrong container.** The image's `HEALTHCHECK` polls this route, so a
 * silent nightly job in the WORKER made Docker mark the APP unhealthy and restart it. That
 * neither fixes the worker nor keeps the app up; it drops in-flight requests on a floor to
 * treat a problem in another process.
 *
 * **It published the deployment's internals.** `NODE_ENV`, raw dependency exception strings —
 * which carry a connection string with a password when Postgres refuses one — and the name of
 * every scheduled task. Unauthenticated, to anybody who could reach the app.
 *
 * So the questions are separated, each answered where it belongs:
 *
 *   `/api/health`       is this process alive          public, no detail, this file
 *   `/api/ready`        can it serve a request         public, ok/latency, no error text
 *   `/api/health/jobs`  is the schedule still firing   bearer token, full detail
 *
 * ## Deliberately says almost nothing
 *
 * No environment, no version, no uptime. A liveness probe is read by a container runtime and
 * a load balancer, neither of which can use any of that — and everything printed here is
 * printed to whoever else is looking.
 */
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({ status: 'ok' }, { status: 200 })
}
