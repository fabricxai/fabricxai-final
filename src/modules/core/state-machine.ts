/**
 * `defineStateMachine()` — dev-plan §2.2.4.
 *
 * Every status field in the system declares its legal transitions from its module's
 * HANDOFF §6, and gets them enforced in one place. An illegal transition is a typed
 * 409, never a silently-ignored update.
 *
 * Pure and dependency-free on purpose: this is unit-tested without a database, and
 * every module's state-machine test asserts one illegal transition per status field.
 */
import { illegalTransition } from './errors'

export interface StateMachine<S extends string> {
  readonly field: string
  readonly initial: S
  readonly states: readonly S[]
  /** States with no outgoing transitions. */
  readonly terminal: readonly S[]
  can(from: S, to: S): boolean
  /** Throws a 409 AppError when the transition is not in the table. */
  assert(from: S, to: S): void
  next(from: S): readonly S[]
}

export function defineStateMachine<S extends string>(config: {
  /** Column name, used in the error payload so the UI can point at the right field. */
  field: string
  initial: S
  /** from → the complete set of states reachable from it. Terminal states map to []. */
  transitions: Readonly<Record<S, readonly S[]>>
}): StateMachine<S> {
  const states = Object.keys(config.transitions) as S[]
  const terminal = states.filter((state) => (config.transitions[state] ?? []).length === 0)

  // Catch a typo in the transition table at import time rather than in production.
  for (const [from, targets] of Object.entries(config.transitions) as [S, readonly S[]][]) {
    for (const target of targets) {
      if (!states.includes(target)) {
        throw new Error(
          `defineStateMachine(${config.field}): "${from}" transitions to unknown state "${target}"`,
        )
      }
    }
  }
  if (!states.includes(config.initial)) {
    throw new Error(
      `defineStateMachine(${config.field}): initial state "${config.initial}" is not declared`,
    )
  }

  const next = (from: S): readonly S[] => config.transitions[from] ?? []
  const can = (from: S, to: S): boolean => next(from).includes(to)

  return {
    field: config.field,
    initial: config.initial,
    states,
    terminal,
    can,
    next,
    assert(from, to) {
      if (!can(from, to)) {
        throw illegalTransition({ field: config.field, from, to, allowed: next(from) })
      }
    },
  }
}
