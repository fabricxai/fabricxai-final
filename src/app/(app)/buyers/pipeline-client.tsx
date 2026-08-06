'use client'

import { useState, type ReactNode } from 'react'

import { LeadDrawer, type DrawerLead } from './lead-drawer'

/**
 * Makes one lead card openable (plan 5.2).
 *
 * A wrapper rather than a rewrite of the board. The pipeline page is a server component and
 * renders the cards itself — the layout, the quiet colouring, the agent line and the selvage
 * are all fine, and none of them need to become client code to be clickable. This adds the
 * one thing that was missing: a hand.
 *
 * The card comes through as `children`, which a server component may hand to a client one
 * because it arrives as rendered output rather than as code. A render prop would not: a
 * function is not serialisable across that boundary, which is the mistake this shape avoids.
 *
 * One drawer per card rather than one for the board. `Modal` renders nothing while closed,
 * so the cost is a closed component per lead, and the alternative — lifting the open id to a
 * parent — would mean the parent holding every card, which is the server's job.
 */
export function LeadOpener({
  lead,
  canWrite,
  children,
}: {
  lead: DrawerLead
  /** False for a role that reads the desk but does not work it; nothing becomes clickable. */
  canWrite: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  if (!canWrite) return <>{children}</>

  return (
    <>
      {/*
        * A `button`, not a click handler on the card div. A lead is opened with the keyboard
        * as often as with a mouse on a desk screen, and a div with an onClick is invisible
        * to both a tab key and a screen reader.
        */}
      <button
        onClick={() => setOpen(true)}
        aria-label={lead.companyName}
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          padding: 0,
          font: 'inherit',
          color: 'inherit',
          cursor: 'pointer',
        }}
      >
        {children}
      </button>

      <LeadDrawer lead={open ? lead : null} onClose={() => setOpen(false)} />
    </>
  )
}
