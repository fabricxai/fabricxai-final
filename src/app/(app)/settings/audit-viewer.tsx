'use client'

import { useState, useTransition } from 'react'

import { Card } from '@/components/fx/data'
import { EmptyState, InlineAlert } from '@/components/fx/feedback'
import { Ident } from '@/components/fx/format'
import { Select } from '@/components/fx/forms'
import { Badge, Button } from '@/components/fx/primitives'
import { Eyebrow } from '@/components/fx/signature'
import { actionErrorMessage } from '@/lib/action-error'
import { readAuditTrail } from '@/modules/settings/actions'

interface AuditRow {
  id: string
  actorUserId: string | null
  /** Resolved server-side. Null when the actor has left, or when there was no person at all. */
  actorName: string | null
  actorRole: string | null
  action: string
  targetTable: string
  targetId: string | null
  changedFields: string[] | null
  occurredAt: string
}

/**
 * The audit trail, read at last (plan 5.8, audit FE-S14).
 *
 * Ten modules write `audit_log` under rule 10 — orders, credits, pending commits, payroll,
 * adjustments, compliance, shipments, finance — and **nothing read it**. So the answer to
 * "who changed that", which is the reason those writes exist and a large part of why a
 * factory owner is asked to trust this product with their order book, lived in a table
 * reachable only from a database console.
 *
 * ## Field names, not values
 *
 * The row carries `before` and `after` images and this shows neither. `changed_fields` is on
 * the row precisely because most audit questions are answerable without them — and the trail
 * covers payroll, where the values are the thing the ⚖ rules exist to protect. Reading a
 * wage off an audit screen would copy it out from under `payroll_lines`' own access rules,
 * which is the argument `approvals.provenance` already makes for the same reason.
 *
 * ## Owner and admin only
 *
 * The trail names who did what. A screen that showed everybody every action would turn an
 * accountability record into a surveillance one.
 */
export function AuditViewer({
  initial,
  tables,
}: {
  initial: readonly AuditRow[]
  tables: readonly string[]
}) {
  const [rows, setRows] = useState<readonly AuditRow[]>(initial)
  const [table, setTable] = useState('')
  const [action, setAction] = useState('')
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function reload(nextTable: string, nextAction: string) {
    setFailure(null)
    startTransition(async () => {
      try {
        const result = await readAuditTrail({
          ...(nextTable ? { targetTable: nextTable } : {}),
          ...(nextAction ? { action: nextAction } : {}),
        })
        setRows(result.rows as unknown as AuditRow[])
      } catch (error) {
        setFailure(actionErrorMessage(error, 'The trail could not be read.'))
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="fx-stack-tablet" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', gap: 12, alignItems: 'end' }}>
        <Select
          label="Table"
          value={table}
          onChange={(e) => {
            setTable(e.target.value)
            reload(e.target.value, action)
          }}
        >
          <option value="">Every ⚖ table</option>
          {tables.map((name) => (
            <option key={name} value={name}>
              {name.replace(/_/g, ' ')}
            </option>
          ))}
        </Select>

        <Select
          label="What happened"
          value={action}
          onChange={(e) => {
            setAction(e.target.value)
            reload(table, e.target.value)
          }}
        >
          <option value="">Anything</option>
          {/* `read` is here because payroll reads are audited too (rule 9) — who looked at
              whose wages is itself information worth keeping, and worth being able to ask. */}
          {['insert', 'update', 'delete', 'approve', 'reject', 'read', 'export', 'login'].map(
            (kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ),
          )}
        </Select>

        <Button
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setTable('')
            setAction('')
            reload('', '')
          }}
        >
          Clear
        </Button>
      </div>

      {failure ? <InlineAlert tone="danger">{failure}</InlineAlert> : null}

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing recorded here yet"
          body="Every change to an order, a credit, a payroll run, an adjustment or a shipment is written here as it happens. An empty trail means nothing has been changed, not that nothing was watched."
        />
      ) : (
        <Card padding={0}>
          {rows.map((row) => (
            <div
              key={row.id}
              className="fx-stack-tablet"
              style={{
                display: 'grid',
                gridTemplateColumns: '150px 110px minmax(0, 1fr) minmax(0, 1.2fr)',
                gap: 14,
                alignItems: 'center',
                padding: '13px 18px',
                borderTop: '1px solid var(--fx-border-subtle)',
              }}
            >
              <Ident size={12}>{row.occurredAt.slice(0, 16).replace('T', ' ')}</Ident>

              <span>
                <Badge tone={row.action === 'delete' ? 'danger' : 'neutral'}>{row.action}</Badge>
              </span>

              <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <span style={{ font: "500 13.5px/1.3 var(--fx-font-sans)" }}>
                  {row.targetTable.replace(/_/g, ' ')}
                </span>
                {row.targetId ? (
                  <span style={{ font: "400 11.5px/1.3 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
                    {row.targetId.slice(0, 8)}
                  </span>
                ) : null}
              </span>

              <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <Eyebrow>{row.actorRole ?? 'system'}</Eyebrow>
                <span
                  style={{
                    font: "500 12.5px/1.4 var(--fx-font-sans)",
                    color: 'var(--fx-text-primary)',
                  }}
                >
                  {/*
                    * The WHO, at last. `actor_user_id` was written on every one of these
                    * rows and rendered nowhere — the trail said an admin did it and withheld
                    * which one, which on a screen titled "who changed what" was the one
                    * omission that mattered. A row with an id but no surviving user is a
                    * departed colleague, not a system actor; the distinction is real.
                    */}
                  {row.actorName ??
                    (row.actorUserId ? 'someone who has left' : 'the system itself')}
                </span>
                <span
                  style={{
                    font: "400 12px/1.4 var(--fx-font-mono)",
                    color: 'var(--fx-text-secondary)',
                  }}
                >
                  {/*
                    * Field NAMES. The row holds before/after images and this deliberately
                    * shows neither — the trail covers payroll, and a wage read off an audit
                    * screen is a wage copied out from under the rules that protect it. An
                    * insert names no fields: the whole row is new, and saying so beats a
                    * dash that reads as "nothing recorded".
                    */}
                  {row.changedFields && row.changedFields.length > 0
                    ? row.changedFields.join(', ')
                    : row.action === 'insert'
                      ? 'new row'
                      : '—'}
                </span>
              </span>
            </div>
          ))}
        </Card>
      )}

      <span style={{ font: "400 12px/1.45 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
        newest first · capped at 200 · field names only, never the values
      </span>
    </div>
  )
}
