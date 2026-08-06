'use client'

/**
 * Emptying the offline queue, for tests only (plan 7.2).
 *
 * Lives beside the queue rather than in the setup file because it needs the same `DB_NAME`
 * and `STORE`, and a second copy of those constants in a test helper is a helper that
 * silently stops clearing the thing it is supposed to clear the day a name changes.
 *
 * ## Why it clears the store rather than deleting the database
 *
 * `openDb()` opens a fresh connection per call and never closes one — reasonable for a page
 * that lives as long as the tab, fatal for `indexedDB.deleteDatabase`, which blocks while any
 * connection is open. Written that way first, it hung for ten seconds per test and timed the
 * whole suite out. Clearing the object store needs no exclusivity and leaves the same empty
 * queue behind.
 *
 * Deliberately not exported from `queue.ts`: nothing in the product may empty a floor's unsent
 * writes, and the way to guarantee that is for the function not to be reachable from there.
 */
import { DB_NAME, STORE } from './queue'

export function clearQueue(): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME)

    open.onupgradeneeded = () => {
      // A test running before anything has captured: create the store so the clear below has
      // something to open rather than throwing `NotFoundError`.
      const db = open.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'offlineKey' })
    }

    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      const request = db.transaction(STORE, 'readwrite').objectStore(STORE).clear()
      request.onsuccess = () => {
        db.close()
        resolve()
      }
      request.onerror = () => {
        db.close()
        reject(request.error)
      }
    }
  })
}
