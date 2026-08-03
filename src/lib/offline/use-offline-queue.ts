'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

import { dismiss, enqueue, flush, pending, rejected, type QueuedWrite } from './queue'

export interface OfflineState {
  online: boolean
  queued: number
  refused: QueuedWrite[]
  syncing: boolean
}

/**
 * The one hook every floor screen uses to write.
 *
 * Screens never call `/api/sync` themselves — they capture, and this drains.
 * That keeps the idempotency key in one place and means a screen cannot
 * accidentally post without one.
 */
/** Connectivity is an external system, so it is subscribed to rather than mirrored. */
function subscribeToConnectivity(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

export function useOfflineQueue(): OfflineState & {
  capture: (write: { moduleId: string; operation: string; payload: Record<string, unknown> }) => Promise<void>
  sync: () => Promise<void>
  clear: (offlineKey: string) => Promise<void>
} {
  const online = useSyncExternalStore(
    subscribeToConnectivity,
    () => navigator.onLine,
    // The server has no network status to report, and rendering "offline"
    // during SSR would flash a warning at somebody who is perfectly connected.
    () => true,
  )
  const [queued, setQueued] = useState(0)
  const [refused, setRefused] = useState<QueuedWrite[]>([])
  const [syncing, setSyncing] = useState(false)

  const refresh = useCallback(async () => {
    // Both reads are awaited before any state is set, so this never updates
    // state synchronously with respect to a caller in an effect body.
    const [waiting, refusedRows] = await Promise.all([pending(), rejected()])
    setQueued(waiting.length)
    setRefused(refusedRows)
  }, [])

  const sync = useCallback(async () => {
    // Yield before touching state. Callers include effects, and setting state
    // synchronously inside an effect body causes a cascading render.
    await Promise.resolve()
    setSyncing(true)
    try {
      await flush()
    } finally {
      setSyncing(false)
      await refresh()
    }
  }, [refresh])

  /*
   * Both effects below read from IndexedDB — an external system with no change
   * events to subscribe to, so there is no `useSyncExternalStore` form of this.
   * `refresh` and `sync` await their reads before touching state, so nothing is
   * set synchronously; the lint rule cannot see past the async boundary and
   * flags the call itself. Suppressed narrowly rather than restructured,
   * because every restructuring makes the queue harder to follow without
   * changing when a single setState actually runs.
   */

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void refresh()

    // A slow drip rather than a tight poll: the floor's batches are small and a
    // shared tablet's battery matters more than a few seconds of latency.
    const timer = setInterval(() => {
      if (navigator.onLine) void sync()
    }, 30_000)

    return () => clearInterval(timer)
  }, [refresh, sync])

  // Drain as soon as the network returns, without waiting for the next tick or
  // for somebody to tap the pill.
  useEffect(() => {
    if (online) void sync()
  }, [online, sync])
  /* eslint-enable react-hooks/set-state-in-effect */

  const capture = useCallback(
    async (write: { moduleId: string; operation: string; payload: Record<string, unknown> }) => {
      await enqueue(write)
      await refresh()
      // Try immediately when there is a network; if not, it is already saved.
      if (navigator.onLine) void sync()
    },
    [refresh, sync],
  )

  const clear = useCallback(
    async (offlineKey: string) => {
      await dismiss(offlineKey)
      await refresh()
    },
    [refresh],
  )

  return { online, queued, refused, syncing, capture, sync, clear }
}
