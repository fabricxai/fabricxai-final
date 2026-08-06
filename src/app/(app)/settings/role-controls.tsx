'use client'

import { useState, useTransition } from 'react'

import { InlineAlert, Toast } from '@/components/fx/feedback'
import { Button } from '@/components/fx/primitives'
import { ROLE_LABEL } from '@/components/shell/nav'
import { actionErrorMessage } from '@/lib/action-error'
import type { Role } from '@/modules/core/ctx'
import { grantUserRole, revokeUserRole } from '@/modules/settings/actions'

const ALL_ROLES = Object.keys(ROLE_LABEL) as Role[]

/**
 * Granting and revoking a role (plan 5.8, audit FE-S14).
 *
 * `grantRole` and `revokeRole` have existed since X.3 with no action and no screen, so the
 * seventeen departments a person can belong to could only be assigned by seeding — a factory
 * could sign up and then had no way to give its storekeeper the store. Signup grants the
 * founder `owner` and nothing else has ever been grantable from the product.
 *
 * ## Revoking is soft, and that is the point
 *
 * The row stays with `revoked_at` set. "Who had permission to do that in March" is a
 * question a deleted row cannot answer, and it is a question an auditor asks. The matrix
 * shows revoked roles struck through for the same reason.
 *
 * ## The last owner cannot go
 *
 * The service refuses it. A company with no owner is a company nobody can administer, and
 * the only way back would be a database console.
 */
export function RoleControls({
  userId,
  held,
}: {
  userId: string
  /** Roles this person currently holds, revoked ones excluded. */
  held: readonly string[]
}) {
  const [pending, startTransition] = useTransition()
  const [failure, setFailure] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [adding, setAdding] = useState('')

  const grantable = ALL_ROLES.filter((role) => !held.includes(role))

  function run(work: () => Promise<void>, message: string) {
    setFailure(null)
    startTransition(async () => {
      try {
        await work()
        setDone(message)
        setTimeout(() => setDone(null), 4000)
      } catch (error) {
        // The service's refusals are the interesting ones — the last owner, a role already
        // held — and they are worded for the person reading them.
        setFailure(actionErrorMessage(error, 'That did not go through.'))
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          aria-label="Role to grant"
          style={{
            font: "400 13px/1.2 var(--fx-font-sans)",
            padding: '7px 10px',
            minHeight: 'var(--fx-tap-min)',
            border: '1px solid var(--fx-border-default)',
            borderRadius: 'var(--fx-radius-md)',
            background: 'var(--fx-bg-surface)',
            color: 'var(--fx-text-primary)',
          }}
        >
          <option value="">Grant a role…</option>
          {grantable.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABEL[role]}
            </option>
          ))}
        </select>

        <Button
          variant="ghost"
          size="sm"
          disabled={pending || adding === ''}
          onClick={() =>
            run(async () => {
              await grantUserRole({ userId, role: adding as Role })
              setAdding('')
            }, `Granted ${ROLE_LABEL[adding as Role] ?? adding}.`)
          }
        >
          Grant
        </Button>
      </div>

      {held.length > 0 ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {held.map((role) => (
            <Button
              key={role}
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                run(
                  () => revokeUserRole({ userId, role: role as Role }),
                  `Revoked ${ROLE_LABEL[role as Role] ?? role}. The record of having held it stays.`,
                )
              }
            >
              Revoke {ROLE_LABEL[role as Role] ?? role}
            </Button>
          ))}
        </div>
      ) : null}

      {failure ? <InlineAlert tone="danger">{failure}</InlineAlert> : null}
      {done ? <Toast message={done} /> : null}
    </div>
  )
}
