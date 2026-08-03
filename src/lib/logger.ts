/**
 * Structured logging.
 *
 * Before this, the entire log strategy was 34 unstructured `console.*` calls. A failed
 * nightly TNA scan printed `[worker] derive job 41 failed: …` to stdout with no company,
 * no job id, no level and no timestamp — so the two questions anyone actually asks after
 * an incident ("which factory?" and "what else happened in that request?") could not be
 * answered at all, and nothing could be filtered or shipped anywhere.
 *
 * ## Why pino, and why JSON everywhere
 *
 * One line per event, machine-readable, so `docker logs` can be piped to anything later
 * without revisiting this decision.
 *
 * JSON in development too, deliberately. `pino-pretty` would be nicer to read, and it is
 * one more dependency whose absence in production changes the shape of the output — the
 * format you debug against should be the format you get paged about. `pnpm dlx pino-pretty`
 * is available to anyone who wants it for an afternoon:
 *
 *   pnpm worker:dev | pnpm dlx pino-pretty
 *
 * ## What is NEVER logged
 *
 * This is an ERP holding payroll, buyer prices and LC values. `redact` below is not a
 * courtesy: a wage figure or an LC value in a log line has left the walls the rest of the
 * system spends its effort maintaining, and log aggregation is exactly the sort of place
 * access control is weakest. Add to that list rather than trimming it.
 */
import pino, { type Logger } from 'pino'

import { env } from './env'

const isProduction = env.NODE_ENV === 'production'

export const logger: Logger = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),

  // `severity` alongside `level` so a collector that expects either can read it.
  formatters: {
    level: (label, number) => ({ level: number, severity: label }),
  },

  // ISO timestamps, not epoch millis: the person reading these is correlating against a
  // supervisor's "it broke around half past two", and Dhaka is UTC+6.
  timestamp: pino.stdTimeFunctions.isoTime,

  redact: {
    paths: [
      // Credentials and tokens.
      'password',
      'passwd',
      '*.password',
      'token',
      '*.token',
      'secret',
      '*.secret',
      'authorization',
      'req.headers.authorization',
      'req.headers.cookie',
      'apiKey',
      '*.apiKey',
      // Commercially sensitive figures. A log line is not the place to learn what a
      // buyer pays or what a worker earns.
      'netPay',
      '*.netPay',
      'basic',
      '*.basic',
      'unitPrice',
      '*.unitPrice',
      'fobPrice',
      '*.fobPrice',
      'amount',
      '*.amount',
      'value',
      '*.value',
    ],
    censor: '[redacted]',
  },

})

/**
 * A logger bound to one unit of work.
 *
 * Every line from a request or a job then carries the same `companyId` / `jobId` /
 * `requestId`, which is what makes "what else happened in that request" answerable. Use
 * this rather than passing the ids into each call: the ones that matter are exactly the
 * ones somebody forgets on the line that turns out to matter.
 *
 *   const log = childLogger({ companyId: ctx.companyId, jobId })
 *   log.error({ err }, 'derive job failed')
 */
export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings)
}
