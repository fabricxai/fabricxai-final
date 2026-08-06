'use client'

/**
 * The floor's offline queue.
 *
 * A shared tablet on a factory floor loses the network constantly — a concrete
 * wall, a dead AP, a shift change. Every floor write is therefore captured
 * LOCALLY first and posted afterwards, so an operator is never blocked by a
 * network they cannot see or fix.
 *
 * Three properties this has to hold:
 *
 * 1. **Capture never fails.** Writing to IndexedDB is the operation the
 *    operator performed; posting it is the system's problem, not theirs.
 * 2. **Replay is safe.** Each entry carries a device-generated `offlineKey`
 *    generated ONCE at capture, so replaying a batch the server already applied
 *    returns the original result instead of duplicating the write.
 * 3. **The queue depth is honest.** `SyncPill` shows what is actually still
 *    unsent. A pill that reads zero while forty entries are stuck is worse than
 *    no pill at all.
 */

/** Exported for `test-support.ts` only — see its header. */
export const DB_NAME = 'fabricxai-offline'
export const STORE = 'queue'
const DB_VERSION = 1

export interface QueuedWrite {
  offlineKey: string
  moduleId: string
  operation: string
  payload: Record<string, unknown>
  clientRecordedAt: string
  /** Failed attempts so far. Used to back off, never to discard. */
  attempts: number
  /** Set once the server has decided; the entry is kept so the floor can see it. */
  rejection?: { errorKey: string; details?: Record<string, unknown> }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'offlineKey' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = run(t.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/**
 * Capture a write. The key is generated HERE, once, and never regenerated —
 * a fresh key on retry is exactly how a replay becomes a duplicate row.
 */
export async function enqueue(
  input: Omit<QueuedWrite, 'offlineKey' | 'attempts' | 'clientRecordedAt'>,
): Promise<string> {
  const entry: QueuedWrite = {
    ...input,
    offlineKey: crypto.randomUUID(),
    clientRecordedAt: new Date().toISOString(),
    attempts: 0,
  }
  await tx('readwrite', (store) => store.put(entry))
  return entry.offlineKey
}

export async function pending(): Promise<QueuedWrite[]> {
  const all = await tx<QueuedWrite[]>('readonly', (store) => store.getAll() as IDBRequest<QueuedWrite[]>)
  // A rejected entry is no longer pending — it is waiting for a person.
  return all.filter((e) => !e.rejection)
}

export async function rejected(): Promise<QueuedWrite[]> {
  const all = await tx<QueuedWrite[]>('readonly', (store) => store.getAll() as IDBRequest<QueuedWrite[]>)
  return all.filter((e) => e.rejection)
}

async function remove(offlineKey: string): Promise<void> {
  await tx('readwrite', (store) => store.delete(offlineKey))
}

async function update(entry: QueuedWrite): Promise<void> {
  await tx('readwrite', (store) => store.put(entry))
}

export interface FlushResult {
  applied: number
  duplicate: number
  rejected: number
  /** Entries still queued because the network failed, not because they were refused. */
  stillPending: number
}

/**
 * Post everything queued.
 *
 * A network failure leaves the batch intact and increments attempts — the data
 * stays on the device. A REJECTION is different: the server has decided, so the
 * entry stops being retried and is kept for the operator to see. Retrying a
 * permanently-invalid row forever is how a queue stops draining.
 */
export async function flush(): Promise<FlushResult> {
  const rows = await pending()
  if (rows.length === 0) return { applied: 0, duplicate: 0, rejected: 0, stillPending: 0 }

  // The endpoint caps a batch; send the oldest slice and let the next flush take the rest.
  const batch = rows.slice(0, 200)

  let response: Response
  try {
    response = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rows: batch.map(({ offlineKey, moduleId, operation, payload, clientRecordedAt }) => ({
          offlineKey,
          moduleId,
          operation,
          payload,
          clientRecordedAt,
        })),
      }),
    })
  } catch {
    // Offline. Nothing is lost and nothing is marked — try again on reconnect.
    for (const entry of batch) await update({ ...entry, attempts: entry.attempts + 1 })
    return { applied: 0, duplicate: 0, rejected: 0, stillPending: rows.length }
  }

  if (!response.ok) {
    for (const entry of batch) await update({ ...entry, attempts: entry.attempts + 1 })
    return { applied: 0, duplicate: 0, rejected: 0, stillPending: rows.length }
  }

  const body = (await response.json()) as {
    results: {
      offlineKey: string
      status: 'applied' | 'duplicate' | 'rejected'
      errorKey?: string
      details?: Record<string, unknown>
    }[]
  }

  let applied = 0
  let duplicate = 0
  let refused = 0

  for (const result of body.results) {
    const entry = batch.find((e) => e.offlineKey === result.offlineKey)
    if (!entry) continue

    if (result.status === 'rejected') {
      refused += 1
      await update({
        ...entry,
        rejection: { errorKey: result.errorKey ?? 'errors.unknown', details: result.details },
      })
    } else {
      if (result.status === 'applied') applied += 1
      else duplicate += 1
      await remove(entry.offlineKey)
    }
  }

  return {
    applied,
    duplicate,
    rejected: refused,
    stillPending: (await pending()).length,
  }
}

/** Forget a rejection the operator has read and dealt with. */
export async function dismiss(offlineKey: string): Promise<void> {
  await remove(offlineKey)
}
