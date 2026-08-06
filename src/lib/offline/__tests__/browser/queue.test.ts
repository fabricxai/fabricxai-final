/**
 * The floor's offline queue, in a browser (plan 7.2, audit TEST-H8).
 *
 * This file could not exist before 7.2: both vitest projects were `environment: 'node'` and
 * collected `.ts` only, and this module needs IndexedDB, `fetch` and `navigator` — so the
 * code deciding whether a factory's writes survive a dead access point had never been
 * executed by a test.
 *
 * Its own header states three properties. Each is asserted here, and the third is the one
 * that has teeth: **the queue depth must be honest**, because `SyncPill` shows it to an
 * operator who decides whether to walk away from the tablet.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { dismiss, enqueue, flush, pending, rejected } from '../../queue'

const write = (over: Partial<{ moduleId: string; operation: string; payload: Record<string, unknown> }> = {}) => ({
  moduleId: 'store',
  operation: 'receive_grn',
  payload: { challanNo: 'CH-1' },
  ...over,
})

/** A `/api/sync` reply for whatever was posted, one result per row. */
function respondWith(status: 'applied' | 'duplicate' | 'rejected', extra: Record<string, unknown> = {}) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { rows: { offlineKey: string }[] }
    return {
      ok: true,
      json: async () => ({
        results: body.rows.map((row) => ({ offlineKey: row.offlineKey, status, ...extra })),
      }),
    } as Response
  })
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('capture never fails, and never reuses a key', () => {
  it('1 · queues a write and reports it as pending', async () => {
    await enqueue(write())

    const rows = await pending()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ moduleId: 'store', operation: 'receive_grn', attempts: 0 })
  })

  it('2 · gives every capture its own key', async () => {
    /*
     * The property the whole design rests on. A key generated at POST time rather than at
     * capture time makes every retry a new row on the server — which is precisely how a
     * replayed batch becomes a duplicate GRN, i.e. a store recorded as receiving the same
     * cloth twice.
     */
    await enqueue(write())
    await enqueue(write())

    const keys = (await pending()).map((row) => row.offlineKey)
    expect(new Set(keys).size).toBe(2)
  })

  it('3 · records the capture time from the device', async () => {
    await enqueue(write())

    const [row] = await pending()
    expect(row!.clientRecordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

describe('replay is safe', () => {
  it('4 · keeps the SAME key across a failed flush and a retry', async () => {
    /*
     * The heart of it. The device is offline, the flush fails, the entry stays — and when the
     * network comes back the server must see the key it already knows so its ledger can refuse
     * the duplicate. A key that changed here would defeat `offline_keys` entirely, and the
     * server would have no way to tell.
     */
    await enqueue(write())
    const before = (await pending())[0]!.offlineKey

    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))
    await flush()

    const after = (await pending())[0]!.offlineKey
    expect(after).toBe(before)
  })

  it('5 · treats a duplicate as done, because the server already has it', async () => {
    // `duplicate` is a SUCCESS: the row is on the server, it just got there on an earlier
    // attempt. Keeping it queued would leave a pill reading "1 unsent" forever over a write
    // that was never lost.
    await enqueue(write())
    vi.stubGlobal('fetch', respondWith('duplicate'))

    const result = await flush()

    expect(result.duplicate).toBe(1)
    expect(await pending()).toHaveLength(0)
  })
})

describe('the queue depth is honest', () => {
  it('6 · a network failure loses nothing and counts an attempt', async () => {
    await enqueue(write())
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))

    const result = await flush()

    expect(result.stillPending).toBe(1)
    expect(result.applied).toBe(0)
    // Attempts back off; they never discard. A floor write is the operator's work, and the
    // system losing it after N tries is the system deciding their morning did not happen.
    expect((await pending())[0]!.attempts).toBe(1)
  })

  it('7 · a 500 is treated as a network failure, not as a rejection', async () => {
    /*
     * The distinction that matters most in this file. A server error is transient — the row
     * is still valid and must be retried. A REJECTION is the server having decided. Reading
     * a 500 as a rejection would silently drop valid floor writes during a deploy.
     */
    await enqueue(write())
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 }) as Response))

    const result = await flush()

    expect(result.rejected).toBe(0)
    expect(result.stillPending).toBe(1)
    expect(await rejected()).toHaveLength(0)
  })

  it('8 · a rejection stops being retried and stays visible', async () => {
    // A bonded GRN with no UD is refused and always will be. Retrying it forever is how a
    // queue stops draining; deleting it is how an operator never learns their entry was
    // refused. So it is kept, out of `pending`, and shown.
    await enqueue(write())
    vi.stubGlobal('fetch', respondWith('rejected', { errorKey: 'store.errors.bonded_requires_ud' }))

    const result = await flush()

    expect(result.rejected).toBe(1)
    expect(await pending()).toHaveLength(0)

    const refused = await rejected()
    expect(refused).toHaveLength(1)
    expect(refused[0]!.rejection?.errorKey).toBe('store.errors.bonded_requires_ud')
  })

  it('9 · a refused entry is not counted as unsent work', async () => {
    /*
     * `pending()` feeds the pill and `rejected()` feeds the refused list, and the two must not
     * overlap — a pill reading "1 unsent" over an entry nobody will ever send is the dishonest
     * depth this module's own header warns about.
     */
    await enqueue(write())
    await enqueue(write({ payload: { challanNo: 'CH-2' } }))
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { rows: { offlineKey: string }[] }
      return {
        ok: true,
        json: async () => ({
          results: body.rows.map((row, i) => ({
            offlineKey: row.offlineKey,
            status: i === 0 ? 'applied' : 'rejected',
            errorKey: 'store.errors.item_not_found',
          })),
        }),
      } as Response
    }))

    await flush()

    expect(await pending()).toHaveLength(0)
    expect(await rejected()).toHaveLength(1)
  })

  it('10 · dismissing a rejection removes it for good', async () => {
    await enqueue(write())
    vi.stubGlobal('fetch', respondWith('rejected', { errorKey: 'x' }))
    await flush()

    const [refused] = await rejected()
    await dismiss(refused!.offlineKey)

    expect(await rejected()).toHaveLength(0)
  })

  it('11 · an empty queue does not call the network', async () => {
    // A tablet sitting idle on a floor flushes on every reconnect. Posting an empty batch each
    // time is a request per event for nothing, on the connection that is already the problem.
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await flush()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).toEqual({ applied: 0, duplicate: 0, rejected: 0, stillPending: 0 })
  })

  it('12 · sends at most 200 rows, and leaves the rest queued', async () => {
    /*
     * `/api/sync` caps a batch at 200. A device that was offline for a shift can hold more
     * than that, and sending them all would be refused wholesale — the operator's whole day
     * bouncing off a limit rather than draining in slices.
     */
    for (let i = 0; i < 205; i += 1) await enqueue(write({ payload: { n: i } }))

    const fetchMock = respondWith('applied')
    vi.stubGlobal('fetch', fetchMock)

    const result = await flush()

    const sent = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body)) as { rows: unknown[] }
    expect(sent.rows).toHaveLength(200)
    expect(result.applied).toBe(200)
    expect(result.stillPending).toBe(5)
  })
})
