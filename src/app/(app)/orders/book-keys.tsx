'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

/**
 * The book under the hands (build pack: "power users, 10 hrs/day, keyboard-heavy").
 *
 * j/k walk the rows, Enter opens the focused order, i opens inputs readiness. The
 * same grammar as the approve inbox's keys, because a second grammar is a tax on
 * the fingers that use both screens all day. Focus is painted with the existing
 * selected-row background — no new visual vocabulary.
 *
 * Deliberately NOT arrow keys or a global handler: typing fields keep every key,
 * and the editor's own undo/redo is never touched (the browser owns ⌘Z here).
 */
export function OrderBookKeys({ orderIds }: { orderIds: readonly string[] }) {
  const router = useRouter()
  const [focus, setFocus] = useState(-1)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (orderIds.length === 0) return

      const k = e.key.toLowerCase()
      if (k === 'j') {
        e.preventDefault()
        setFocus((f) => Math.min(f + 1, orderIds.length - 1))
      } else if (k === 'k') {
        e.preventDefault()
        setFocus((f) => Math.max(f - 1, 0))
      } else if (e.key === 'Enter' && focus >= 0) {
        e.preventDefault()
        router.push(`/orders/${orderIds[focus]}`)
      } else if (k === 'i') {
        e.preventDefault()
        router.push('/orders/inputs')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [orderIds, focus, router])

  // Paint the focused row via a data attribute the server-rendered rows carry.
  useEffect(() => {
    const rows = document.querySelectorAll<HTMLElement>('[data-book-row]')
    rows.forEach((row, i) => {
      row.style.background = i === focus ? 'var(--fx-bg-selected)' : ''
    })
    if (focus >= 0) rows[focus]?.scrollIntoView({ block: 'nearest' })
  }, [focus])

  return null
}
