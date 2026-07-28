/**
 * Typed errors. Anything surfaced to the UI carries an i18n key, never a hardcoded
 * string (CLAUDE.md, definition of done) — the floor reads Bangla.
 *
 * The action boundary maps these to HTTP status codes; services throw them and never
 * think about HTTP.
 */

export type AppErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'validation_failed'
  | 'illegal_transition'
  | 'gate_blocked'
  | 'conflict'
  | 'rate_limited'
  | 'internal'

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  validation_failed: 422,
  illegal_transition: 409,
  gate_blocked: 409,
  conflict: 409,
  rate_limited: 429,
  internal: 500,
}

export class AppError extends Error {
  readonly code: AppErrorCode
  readonly status: number
  /** i18n key for the message the user actually sees. */
  readonly messageKey: string
  /** Interpolation values for `messageKey`, and anything the UI needs to act on. */
  readonly details: Record<string, unknown>

  constructor(
    code: AppErrorCode,
    messageKey: string,
    details: Record<string, unknown> = {},
    developerMessage?: string,
  ) {
    super(developerMessage ?? `${code}: ${messageKey}`)
    this.name = 'AppError'
    this.code = code
    this.status = STATUS_BY_CODE[code]
    this.messageKey = messageKey
    this.details = details
  }

  toJSON() {
    return {
      code: this.code,
      messageKey: this.messageKey,
      details: this.details,
    }
  }
}

export const isAppError = (error: unknown): error is AppError => error instanceof AppError

export const forbidden = (messageKey = 'errors.forbidden', details?: Record<string, unknown>) =>
  new AppError('forbidden', messageKey, details)

export const notFound = (messageKey = 'errors.not_found', details?: Record<string, unknown>) =>
  new AppError('not_found', messageKey, details)

/**
 * An illegal state transition. 409, always — the request was well-formed, the world
 * just is not in a state where it makes sense (CLAUDE.md rule 5).
 */
export const illegalTransition = (details: {
  field: string
  from: string
  to: string
  allowed: readonly string[]
}) => new AppError('illegal_transition', 'errors.illegal_transition', details)

/** A second approve of the same draft. One commit ever happens (architecture §9). */
export const conflict = (messageKey: string, details?: Record<string, unknown>) =>
  new AppError('conflict', messageKey, details)
