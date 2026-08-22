/**
 * The route registry against the routes that actually exist.
 *
 * `access.test.ts` already walks `src/app/(app)` and asserts every page resolves to a NAV
 * entry, so no screen can ship unreachable-by-policy. This is the same walk for the other
 * half: no screen can ship un-nameable. A page with no entry in `ROUTES` renders a trail
 * with a hole in it and a back link to nowhere, and the person who added the page is the
 * last one who will notice.
 */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { UI_MESSAGES } from '@/lib/i18n-ui'

import { NAV } from '../nav'
import {
  ROUTES,
  routeLabelKey,
  routeParent,
  routePattern,
  routeTrail,
} from '../routes'

const APP_DIR = join(process.cwd(), 'src', 'app', '(app)')

/** Every route with a `page.tsx` on disk, as a URL pattern. */
function routesOnDisk(dir = APP_DIR, prefix = ''): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (!statSync(full).isDirectory()) continue
    // Route groups contribute no URL segment.
    const segment = entry.startsWith('(') && entry.endsWith(')') ? '' : `/${entry}`
    const path = `${prefix}${segment}`
    if (readdirSync(full).includes('page.tsx')) found.push(path)
    found.push(...routesOnDisk(full, path))
  }
  return found
}

describe('route registry', () => {
  const onDisk = routesOnDisk()

  it('finds the routes it is meant to check', () => {
    // A walk that silently found nothing would pass every assertion below.
    expect(onDisk.length).toBeGreaterThan(30)
    expect(onDisk).toContain('/orders')
  })

  it('names every page that exists', () => {
    const registered = new Set(ROUTES.map((r) => r.pattern))
    const missing = onDisk.filter((r) => !registered.has(r))
    expect(missing, 'add these to ROUTES in components/shell/routes.ts').toEqual([])
  })

  it('registers no route that does not exist', () => {
    const disk = new Set(onDisk)
    const orphans = ROUTES.filter((r) => !disk.has(r.pattern))
    expect(orphans.map((r) => r.pattern), 'these have no page.tsx').toEqual([])
  })

  it('calls a module what the sidebar calls it', () => {
    for (const item of NAV) {
      const def = ROUTES.find((r) => r.pattern === item.href)
      if (!def) continue
      expect(def.label, `${item.href} disagrees with its sidebar entry`).toBe(item.label)
    }
  })

  it('gives every crumb a label in both languages', () => {
    for (const def of ROUTES) {
      const parts = def.pattern.split('/').filter(Boolean)
      // A dynamic leaf is labelled by the page that loaded the row, not by a catalogue.
      if (parts[parts.length - 1]?.startsWith('[')) continue

      const key = routeLabelKey(def.pattern)
      expect(UI_MESSAGES.en[key], `${def.pattern} has no English copy at ${key}`).toBeTruthy()
      expect(UI_MESSAGES.bn[key], `${def.pattern} has no Bangla copy at ${key}`).toBeTruthy()
    }
  })

  it('gives every sub-page a parent that is itself a route', () => {
    const registered = new Set(ROUTES.map((r) => r.pattern))
    for (const def of ROUTES) {
      const parts = def.pattern.split('/').filter(Boolean)
      if (parts.length < 2) continue
      const parent = `/${parts.slice(0, -1).join('/')}`
      expect(registered.has(parent), `${def.pattern} has no parent page at ${parent}`).toBe(true)
    }
  })
})

describe('routeTrail', () => {
  it('reads down the tree, current page last and unlinked', () => {
    const trail = routeTrail('/procurement/receipts')
    expect(trail).toEqual([
      { label: 'Procurement', href: '/procurement' },
      { label: 'Goods in', href: undefined },
    ])
  })

  it('labels a dynamic segment with what the page loaded', () => {
    const trail = routeTrail('/orders/9f3c/documents', { labels: { orderId: 'PO-88203' } })
    expect(trail.map((c) => c.label)).toEqual([
      'Order desk & TNA',
      'PO-88203',
      'Style and documents',
    ])
    expect(trail[1]?.href).toBe('/orders/9f3c')
  })

  it('falls back to the raw segment when the page supplies no label', () => {
    const trail = routeTrail('/orders/9f3c')
    expect(trail[1]?.label).toBe('9f3c')
  })

  it('prefers a literal sibling over a dynamic segment', () => {
    // `/costing/bom` must not be read as a costing row whose id is the word "bom".
    expect(routePattern('/costing/bom')).toBe('/costing/bom')
    expect(routeTrail('/costing/bom')[1]?.label).toBe('Bills of materials')
  })

  it('translates', () => {
    const trail = routeTrail('/procurement/receipts', { locale: 'bn' })
    expect(trail[1]?.label).toBe('মাল গ্রহণ')
    // Top-level crumbs borrow the sidebar's key, so they translate too.
    expect(trail[0]?.label).not.toBe('Procurement')
  })

  it('is empty for a path nobody registered', () => {
    expect(routeTrail('/not-a-screen')).toEqual([])
  })
})

describe('routeParent', () => {
  it('points one step up the tree, not back through history', () => {
    expect(routeParent('/orders/9f3c/documents', { labels: { orderId: 'PO-88203' } })).toEqual({
      label: 'PO-88203',
      href: '/orders/9f3c',
    })
  })

  it('is null at the top of a section', () => {
    expect(routeParent('/orders')).toBeNull()
  })
})
