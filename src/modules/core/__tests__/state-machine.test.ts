import { describe, expect, it } from 'vitest'

import { AppError } from '../errors'
import { defineStateMachine } from '../state-machine'

/**
 * The state-machine test is one of the two suites that is never skipped for any module
 * (PLAYBOOK §5). This covers the helper itself; each module tests its own table.
 */
const pendingChange = defineStateMachine({
  field: 'status',
  initial: 'pending',
  transitions: {
    pending: ['approved', 'rejected', 'superseded'],
    approved: ['committed', 'failed'],
    committed: [],
    rejected: [],
    failed: ['pending'],
    superseded: [],
  },
})

describe('defineStateMachine', () => {
  it('allows declared transitions', () => {
    expect(pendingChange.can('pending', 'approved')).toBe(true)
    expect(pendingChange.can('approved', 'committed')).toBe(true)
    expect(pendingChange.can('failed', 'pending')).toBe(true)
  })

  it('refuses undeclared transitions', () => {
    expect(pendingChange.can('pending', 'committed')).toBe(false)
    expect(pendingChange.can('committed', 'pending')).toBe(false)
  })

  it('throws a 409 with the allowed set on an illegal transition', () => {
    let thrown: unknown
    try {
      pendingChange.assert('committed', 'pending')
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(AppError)
    const error = thrown as AppError
    expect(error.status).toBe(409)
    expect(error.code).toBe('illegal_transition')
    expect(error.details).toMatchObject({ field: 'status', from: 'committed', to: 'pending' })
    expect(error.details.allowed).toEqual([])
  })

  it('identifies terminal states', () => {
    expect([...pendingChange.terminal].sort()).toEqual(['committed', 'rejected', 'superseded'])
  })

  it('rejects a transition table pointing at an undeclared state', () => {
    expect(() =>
      defineStateMachine({
        field: 'status',
        initial: 'draft',
        // @ts-expect-error — deliberately malformed table
        transitions: { draft: ['tpyo_state'] },
      }),
    ).toThrow(/unknown state/)
  })
})
