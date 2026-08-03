/**
 * The floor's offline queue.
 *
 * This is the one component in the product where a bug loses a factory's data
 * silently: an operator taps Save, the tablet says saved, and the entry never
 * reaches the server. So the assertions here are mostly about what must NOT
 * happen — nothing is dropped, nothing is retried forever, and a key is never
 * regenerated.
 *
 * IndexedDB is supplied by `fake-indexeddb`; the queue's own logic is under
 * test, not the browser's storage engine.
 */
import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { dismiss, enqueue, flush, pending, rejected } from '../queue'

/** Wipe the store between tests — the queue is deliberately durable. */
async function reset(): Promise<void> {
  for (const entry of [...(await pending()), ...(await rejected())]) {
    await dismiss(entry.offlineKey)
  }
}

const WRITE = {
  moduleId: 'production',
  operation: 'record_hourly_outputs',
  payload: { entries: [{ lineId: 'l1', producedOn: '2026-07-31', hourSlot: 9, target: 120, actual: 108 }] },
}

/** Build a /api/sync response for the keys the queue actually sent. */
function respond(
  verdict: (key: string, index: number) => { status: string; rowId?: string; errorKey?: string },
) {
  return vi.fn(async (_url: string, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? '{"rows":[]}') as {
      rows: { offlineKey: string }[]
    }
    return {
      ok: true,
      json: async () => ({
        results: body.rows.map((r, i) => ({ offlineKey: r.offlineKey, ...verdict(r.offlineKey, i) })),
      }),
    } as unknown as Response
  })
}

beforeEach(async () => {
  await reset()
  vi.stubGlobal('navigator', { onLine: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('capture', () => {
  it('saves the write and generates a key', async () => {
    const key = await enqueue(WRITE)

    const waiting = await pending()
    expect(waiting).toHaveLength(1)
    expect(waiting[0]!.offlineKey).toBe(key)
    expect(waiting[0]!.payload).toEqual(WRITE.payload)
    // Stamped at capture, because the device clock is the only record of when
    // the operator actually did the thing.
    expect(waiting[0]!.clientRecordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('gives every capture its own key', async () => {
    const a = await enqueue(WRITE)
    const b = await enqueue(WRITE)

    expect(a).not.toBe(b)
    expect(await pending()).toHaveLength(2)
  })
})

describe('flush', () => {
  it('removes entries the server applied', async () => {
    await enqueue(WRITE)
    vi.stubGlobal('fetch', respond((key) => ({ status: 'applied', rowId: key })))

    const result = await flush()

    expect(result.applied).toBe(1)
    expect(result.stillPending).toBe(0)
    expect(await pending()).toHaveLength(0)
  })

  it('treats a duplicate as settled, not as a failure', async () => {
    await enqueue(WRITE)
    // What a replay of an already-applied batch returns.
    vi.stubGlobal('fetch', respond(() => ({ status: 'duplicate', rowId: 'existing' })))

    const result = await flush()

    expect(result.duplicate).toBe(1)
    // The server has the write; keeping it queued would resend it forever.
    expect(await pending()).toHaveLength(0)
  })

  it('sends the SAME key on a retry, so a replay cannot duplicate the row', async () => {
    const key = await enqueue(WRITE)

    // First attempt: the network is gone.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )
    await flush()

    const sent: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: { body?: string }) => {
        const body = JSON.parse(init?.body ?? '{"rows":[]}') as { rows: { offlineKey: string }[] }
        sent.push(...body.rows.map((r) => r.offlineKey))
        return {
          ok: true,
          json: async () => ({
            results: body.rows.map((r) => ({ offlineKey: r.offlineKey, status: 'applied', rowId: r.offlineKey })),
          }),
        } as unknown as Response
      }),
    )
    await flush()

    // A fresh key on retry is exactly how a replay becomes a second row.
    expect(sent).toEqual([key])
  })
})

describe('a network failure loses nothing', () => {
  it('keeps the entry queued and counts the attempt', async () => {
    await enqueue(WRITE)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )

    const result = await flush()

    expect(result.applied).toBe(0)
    expect(result.stillPending).toBe(1)

    const waiting = await pending()
    expect(waiting).toHaveLength(1)
    expect(waiting[0]!.attempts).toBe(1)
    // Crucially NOT marked rejected — nobody has decided anything about it.
    expect(waiting[0]!.rejection).toBeUndefined()
  })

  it('does the same on a non-2xx, which is a server problem not a verdict', async () => {
    await enqueue(WRITE)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response))

    const result = await flush()

    expect(result.stillPending).toBe(1)
    expect(await rejected()).toHaveLength(0)
  })
})

describe('a rejection stops being retried', () => {
  it('is kept for a person to read rather than resent', async () => {
    await enqueue(WRITE)
    vi.stubGlobal(
      'fetch',
      respond(() => ({ status: 'rejected', errorKey: 'gates.ud_balance.exceeded' })),
    )

    const result = await flush()

    expect(result.rejected).toBe(1)
    // Off the pending list — retrying a permanently invalid row forever is how
    // a queue stops draining.
    expect(await pending()).toHaveLength(0)

    const refused = await rejected()
    expect(refused).toHaveLength(1)
    expect(refused[0]!.rejection?.errorKey).toBe('gates.ud_balance.exceeded')
  })

  it('is not resent by a later flush', async () => {
    await enqueue(WRITE)
    vi.stubGlobal(
      'fetch',
      respond(() => ({ status: 'rejected', errorKey: 'errors.invalid' })),
    )
    await flush()

    const second = vi.fn()
    vi.stubGlobal('fetch', second)
    const result = await flush()

    expect(second).not.toHaveBeenCalled()
    expect(result.applied).toBe(0)
    // Still visible to the operator.
    expect(await rejected()).toHaveLength(1)
  })

  it('is forgotten once dismissed', async () => {
    await enqueue(WRITE)
    vi.stubGlobal(
      'fetch',
      respond(() => ({ status: 'rejected', errorKey: 'errors.invalid' })),
    )
    await flush()

    const [refused] = await rejected()
    await dismiss(refused!.offlineKey)

    expect(await rejected()).toHaveLength(0)
    expect(await pending()).toHaveLength(0)
  })
})

describe('a mixed batch is settled per row', () => {
  it('applies, rejects and keeps the right ones', async () => {
    await enqueue({ ...WRITE, operation: 'a' })
    await enqueue({ ...WRITE, operation: 'b' })
    await enqueue({ ...WRITE, operation: 'c' })

    // One of each verdict — a batch is not all-or-nothing, because the operator
    // has gone home and the data is on a device that may not come back.
    vi.stubGlobal(
      'fetch',
      respond((key, i) =>
        i === 0
          ? { status: 'applied', rowId: key }
          : i === 1
            ? { status: 'duplicate', rowId: 'x' }
            : { status: 'rejected', errorKey: 'errors.invalid' },
      ),
    )

    const result = await flush()

    expect(result).toMatchObject({ applied: 1, duplicate: 1, rejected: 1, stillPending: 0 })
    expect(await pending()).toHaveLength(0)
    expect(await rejected()).toHaveLength(1)
  })
})

describe('an empty queue', () => {
  it('does not call the server at all', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await flush()

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result).toEqual({ applied: 0, duplicate: 0, rejected: 0, stillPending: 0 })
  })
})
