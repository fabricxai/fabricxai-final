'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { InlineAlert } from '@/components/fx/feedback'
import { actionErrorMessage } from '@/lib/action-error'
import { Badge, Button } from '@/components/fx/primitives'
import {
  dropTicket,
  resolveMachineTicket,
  takeTicket,
} from '@/modules/maintenance/actions'

export interface TicketState {
  ticketId: string
  status: string
  priority: string
  machineLabel: string | null
  lineCode: string | null
  notes: string | null
  openedMinutesAgo: number
}

const PRIORITY_TONE: Record<string, 'danger' | 'warning' | 'neutral'> = {
  line_down: 'danger',
  high: 'warning',
  normal: 'neutral',
}

/**
 * One ticket in the mechanic's queue.
 *
 * **The clock is the whole screen.** A ticket is a line that is not running, and the only
 * number that matters is how long that has been true — so it counts up in minutes and sits
 * next to the priority rather than in a detail view somebody has to open.
 *
 * **Resolving does not ask about downtime.** Closing the ticket emits an event that 6.1
 * consumes to close the stoppage it came from, so the minutes are the ticket's own
 * timestamps rather than a mechanic's recollection. A mechanic who has just got a machine
 * running should not then be asked how long it was broken; they would guess, and the guess
 * would be the number the line's efficiency is measured on.
 *
 * It happens through the queue, not in this request — so the screen says the stoppage
 * closes with it rather than quoting a figure this response does not carry.
 */
export function TicketActions({ ticket }: { ticket: TicketState }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [notes, setNotes] = useState('')
  const [noted, setNoted] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  function run(work: () => Promise<string>) {
    setFailure(null)
    startTransition(async () => {
      try {
        setNoted(await work())
        setNotes('')
        router.refresh()
      } catch (error) {
        setFailure(actionErrorMessage(error, 'That did not go through.'))
      }
    })
  }

  const open = ticket.status === 'open'
  const claimed = ticket.status === 'claimed' || ticket.status === 'in_progress'
  const done = ticket.status === 'resolved' || ticket.status === 'cancelled'

  const hours = Math.floor(ticket.openedMinutesAgo / 60)
  const stopped =
    hours > 0
      ? `${hours}h ${ticket.openedMinutesAgo % 60}m`
      : `${ticket.openedMinutesAgo}m`

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '13px 18px',
        background: 'var(--fx-bg-surface)',
        border: '1px solid var(--fx-border-subtle)',
        borderLeft:
          ticket.priority === 'line_down' && !done
            ? '3px solid var(--fx-danger)'
            : undefined,
      }}
    >
      {noted ? <InlineAlert tone="success">{noted}</InlineAlert> : null}
      {failure ? <InlineAlert tone="danger">{failure}</InlineAlert> : null}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Badge tone={PRIORITY_TONE[ticket.priority] ?? 'neutral'}>
          {ticket.priority.replace(/_/g, ' ')}
        </Badge>

        <span style={{ font: "600 14px/1.2 var(--fx-font-sans)" }}>
          {ticket.machineLabel ?? 'machine not identified'}
        </span>

        {ticket.lineCode ? (
          <span style={{ font: "400 12.5px/1.2 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
            {ticket.lineCode}
          </span>
        ) : null}

        {!done ? (
          <span
            style={{
              font: "500 13px/1.2 var(--fx-font-mono)",
              color: ticket.priority === 'line_down' ? 'var(--fx-danger)' : 'var(--fx-text-secondary)',
            }}
          >
            stopped {stopped}
          </span>
        ) : (
          <Badge tone={ticket.status === 'resolved' ? 'success' : 'neutral'}>{ticket.status}</Badge>
        )}

        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {open ? (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  await takeTicket({ ticketId: ticket.ticketId })
                  return 'Claimed — nobody else will walk to this machine.'
                })
              }
            >
              Claim it
            </Button>
          ) : null}

          {claimed ? (
            <Button
              variant="primary"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const r = await resolveMachineTicket({
                    ticketId: ticket.ticketId,
                    ...(notes.trim() ? { notes: notes.trim() } : {}),
                  })
                  // The minutes are closed by the ticket-resolved consumer, not by this
                  // call — so the message does not quote a number this response does not
                  // have. Claiming one and being wrong is worse than not claiming one.
                  void r
                  return 'Machine running · the stoppage on the line closes with it.'
                })
              }
            >
              Machine running
            </Button>
          ) : null}

          {!done ? (
            <Button
              variant="ghost"
              disabled={pending || !notes.trim()}
              onClick={() =>
                run(async () => {
                  await dropTicket({ ticketId: ticket.ticketId, reason: notes.trim() })
                  return 'Ticket cancelled.'
                })
              }
            >
              Cancel
            </Button>
          ) : null}
        </span>
      </div>

      {ticket.notes ? (
        <span style={{ font: "400 13px/1.5 var(--fx-font-sans)", color: 'var(--fx-text-secondary)' }}>
          {ticket.notes}
        </span>
      ) : null}

      {!done ? (
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={
            claimed
              ? 'What was wrong, and what was done'
              : 'A reason, if you are cancelling this'
          }
          style={{
            minHeight: 40,
            minWidth: 0,
            padding: '8px 11px',
            border: '1px solid var(--fx-border-default)',
            borderRadius: 'var(--fx-radius-sm)',
            background: 'var(--fx-bg-surface)',
            color: 'var(--fx-text-primary)',
            font: "400 13.5px/1.4 var(--fx-font-sans)",
          }}
        />
      ) : null}

      {claimed ? (
        <span style={{ font: "400 12px/1.6 var(--fx-font-mono)", color: 'var(--fx-text-tertiary)' }}>
          closing this closes the stoppage on the line too — nobody files the lost minutes
          separately, and nobody has to guess them
        </span>
      ) : null}
    </div>
  )
}
