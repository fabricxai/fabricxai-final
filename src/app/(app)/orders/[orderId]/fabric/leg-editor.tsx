'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { InlineAlert } from '@/components/fx/feedback'
import { Button } from '@/components/fx/primitives'
import { TextArea, TextInput } from '@/components/fx/forms'
import { actionErrorMessage } from '@/lib/action-error'
import { unwrap } from '@/lib/action-failure'
import { setOrderFabricLeg } from '@/modules/orders/actions'
import type { FabricLegCell } from '@/modules/orders/queries'

/** Edit one leg in place — the same whole-cell habit as the inputs checklist. */
export function LegEditor({
  orderId,
  cell,
  canWrite,
}: {
  orderId: string
  cell: FabricLegCell
  canWrite: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [failure, setFailure] = useState<string | null>(null)
  const [planDate, setPlanDate] = useState(cell.planDate ?? '')
  const [actualDate, setActualDate] = useState(cell.actualDate ?? '')
  const [note, setNote] = useState(cell.note ?? '')

  if (!canWrite) return null

  function save() {
    setFailure(null)
    startTransition(async () => {
      try {
        unwrap(
          await setOrderFabricLeg({
            orderId,
            leg: cell.leg,
            planDate: planDate || null,
            actualDate: actualDate || null,
            note: note.trim() || null,
          }),
        )
        setOpen(false)
        router.refresh()
      } catch (error) {
        setFailure(actionErrorMessage(error, 'The leg was not saved.'))
      }
    })
  }

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Edit
      </Button>
    )
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 12,
        alignItems: 'end',
        padding: '12px 0 0',
        width: '100%',
      }}
    >
      <TextInput
        label="Planned"
        type="date"
        value={planDate}
        onChange={(e) => setPlanDate(e.target.value)}
      />
      <TextInput
        label="Actually happened"
        type="date"
        value={actualDate}
        onChange={(e) => setActualDate(e.target.value)}
      />
      <TextArea label="Note" rows={1} value={note} onChange={(e) => setNote(e.target.value)} />
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button variant="secondary" disabled={pending} onClick={save}>
          Save
        </Button>
      </div>
      {failure ? (
        <div style={{ gridColumn: '1 / -1' }}>
          <InlineAlert tone="danger">{failure}</InlineAlert>
        </div>
      ) : null}
    </div>
  )
}
