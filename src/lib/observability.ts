/**
 * Error tracking.
 *
 * `SENTRY_DSN` was a REQUIRED production variable that nothing read — `@sentry/nextjs`
 * was not even installed. So a deployment was forced to supply a value, and then got
 * exactly what it would have got with no value at all: 34 unstructured `console.*` calls
 * and nobody paged when the nightly scan failed (audit INFRA-B5).
 *
 * This is the smaller half of the fix; `lib/logger.ts` is the other. Sentry answers "what
 * broke, with a stack, and how often"; the logger answers "what was happening around it".
 *
 * ## Optional, deliberately
 *
 * `initObservability()` is a no-op without a DSN, and `lib/env.ts` no longer forces one.
 * A single-factory pilot on a VPS with no Sentry account is a legitimate deployment — it
 * should ship logs to a file and know that is what it has, rather than either lying about
 * having error tracking or refusing to boot over a monitoring tool.
 */
import * as Sentry from '@sentry/nextjs'

import { env } from './env'
import { logger } from './logger'

let initialised = false

/**
 * Call once per process, as early as possible: `instrumentation.ts` for the app, the top
 * of `main()` for the worker. Idempotent, because Next may evaluate the instrumentation
 * hook more than once across runtimes.
 */
export function initObservability(process_: 'app' | 'worker'): void {
  if (initialised) return
  initialised = true

  if (!env.SENTRY_DSN) {
    logger.warn(
      { process: process_ },
      'SENTRY_DSN is not set — errors go to the log only, nothing is aggregated or alerted',
    )
    return
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,

    // 10% of traces. A floor posting hourly output all shift would otherwise dominate the
    // quota with the least interesting spans in the product.
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 0,

    // OFF. Session replay records what is on the screen, and the screens here show payroll
    // lines, buyer prices and LC values — a replay is a copy of that data on somebody
    // else's infrastructure.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

    // Do not send PII by default: this would otherwise attach IP addresses and, worse,
    // request bodies from the offline sync endpoint — which is a batch of a factory's
    // production data.
    sendDefaultPii: false,

    beforeSend(event) {
      // Strip anything that could carry a figure or a credential. Sentry's own scrubbing
      // is server-side and configurable by whoever owns the Sentry project; this happens
      // before the packet leaves the factory, which is the only place it can be relied on.
      if (event.request) {
        delete event.request.data
        delete event.request.cookies
        if (event.request.headers) {
          delete event.request.headers.authorization
          delete event.request.headers.cookie
        }
      }
      return event
    },
  })

  logger.info({ process: process_, environment: env.NODE_ENV }, 'error tracking initialised')
}

/**
 * Report a caught error that has already been handled.
 *
 * For the places that deliberately swallow — a job that will retry, a notification that
 * failed to send. An error nobody sees is the class of bug that gets found by a customer,
 * and `catch {}` is where they live.
 */
export function captureHandled(error: unknown, context: Record<string, unknown> = {}): void {
  logger.error({ err: error, ...context }, 'handled error')
  if (env.SENTRY_DSN) Sentry.captureException(error, { extra: context })
}
