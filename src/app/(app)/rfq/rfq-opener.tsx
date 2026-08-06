'use client'

import { useState, type ReactNode } from 'react'

import { RfqDrawer, type DrawerRfq } from './rfq-drawer'

/**
 * Makes one enquiry card openable (plan 5.3).
 *
 * Same shape as the buyer desk's `LeadOpener`, and for the same reason: the board is a
 * server component that renders its own cards, and none of that layout needs to become
 * client code to gain a hand. The card arrives as `children` — rendered output, which
 * crosses the boundary — rather than as a render prop, which is a function and does not.
 */
export function RfqOpener({
  rfq,
  lossReasons,
  canWrite,
  children,
}: {
  rfq: DrawerRfq
  lossReasons: readonly { code: string; label: string }[]
  /** False for a role that reads the board but does not quote; nothing becomes clickable. */
  canWrite: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  if (!canWrite) return <>{children}</>

  return (
    <>
      {/* A button, not an onClick on a div — a tab key and a screen reader both need one. */}
      <button
        onClick={() => setOpen(true)}
        aria-label={rfq.title}
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

      {open ? (
        <RfqDrawer rfq={rfq} lossReasons={lossReasons} onClose={() => setOpen(false)} />
      ) : null}
    </>
  )
}
