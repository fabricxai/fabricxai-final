/**
 * Which tools a caller may use (plan 6.5, audit AI-H6).
 *
 * The caption under the composer has promised, on every screen, that "MARBIM reads what your
 * role can already read". It did not. Every registered pack in scope went into the prompt
 * whoever was asking, so a viewer's conversation advertised `workforce.payroll_run` — a
 * disclosure of shape while nothing executed, and a disclosure of DATA the moment the
 * execution loop landed.
 *
 * Run against the real `NAV`, not a fixture. The claim being tested is that MARBIM's audience
 * IS the nav's audience, and a fixture would let the two drift apart while the test kept
 * passing — which is the whole failure it exists to prevent.
 */
import { z } from 'zod'
import { describe, expect, it } from 'vitest'

import { NAV } from '@/components/shell/nav'
import '@/modules/registry'
import { listModules } from '@/modules/core/registry'
import type { Role } from '@/modules/core/ctx'

import { moduleOfTool, primerModulesForRoles, toolsForRoles } from '../scope'
import type { ModuleTool, ToolPack } from '../tools'

const read = (name: string): ModuleTool => ({
  kind: 'read',
  name,
  description: 'reads',
  input: z.object({}),
  execute: async () => ({}),
})

const draft = (name: string, targetTable: string): ModuleTool => ({
  kind: 'draft',
  name,
  description: 'drafts',
  targetTable,
  input: z.object({}),
  execute: async () => ({
    targetTable,
    operation: 'insert' as const,
    zodSchemaKey: 'k',
    payload: {},
    method: 'stated in chat',
  }),
})

const pack = (moduleId: string, tools: ModuleTool[]): ToolPack => ({ moduleId, tools })

const PACKS = [
  pack('workforce', [read('workforce.payroll_run'), draft('workforce.propose_wage', 'wages')]),
  pack('store', [read('store.stock'), draft('store.propose_stock_adjustment', 'stock_adjustments')]),
  pack('orders', [read('orders.book')]),
]

const names = (roles: string[]) =>
  toolsForRoles({ packs: PACKS, roles: roles as never, factoryType: 'woven' })
    .map((tool) => tool.name)
    .sort()

describe('toolsForRoles · MARBIM never widens what a person can reach', () => {
  it('1 · a storekeeper gets the store, and not payroll', () => {
    const allowed = names(['store'])

    expect(allowed).toContain('store.stock')
    expect(allowed).not.toContain('workforce.payroll_run')
  })

  it('2 · reading a module is not permission to draft in it', () => {
    /*
     * The read/write split, which is the part most likely to be got wrong. A draft proposes
     * into somebody's approve inbox attributed to the person who asked, so "can this person
     * cause that row to exist" is exactly the WRITE question the nav already answers — not
     * the weaker "can they see this screen".
     */
    const viewer = names(['viewer'])
    const storekeeper = names(['store'])

    expect(viewer.filter((name) => name.startsWith('store.propose'))).toEqual([])
    expect(storekeeper).toContain('store.propose_stock_adjustment')
  })

  it('3 · a viewer gets no draft tool anywhere', () => {
    // A read-only role that could propose changes is a read-only role in name only.
    const allowed = toolsForRoles({ packs: PACKS, roles: ['viewer'] as never, factoryType: 'woven' })

    expect(allowed.filter((tool) => tool.kind === 'draft')).toEqual([])
  })

  it('4 · an owner reaches everything, including payroll', () => {
    // `ALL_ACCESS` in the nav. The owner is the person who would otherwise have to open psql.
    const allowed = names(['owner'])

    expect(allowed).toContain('workforce.payroll_run')
    expect(allowed).toContain('store.propose_stock_adjustment')
  })

  it('5 · hr reaches payroll and nothing of the store’s', () => {
    const allowed = names(['hr'])

    expect(allowed).toContain('workforce.payroll_run')
    expect(allowed).not.toContain('store.stock')
  })

  it('6 · a module with no nav entry contributes nothing', () => {
    /*
     * Fail-closed, the same default 0.2 set on the route gate. A module nobody has decided an
     * audience for is not one a model gets to use on everybody's behalf — and a new module
     * arriving with a tool pack and no nav entry is exactly how that would happen quietly.
     */
    const orphan = [pack('__not_in_nav__', [read('__not_in_nav__.everything')])]

    expect(toolsForRoles({ packs: orphan, roles: ['owner'] as never, factoryType: 'woven' })).toEqual(
      [],
    )
  })

  it('7 · respects factory type, because the nav does', () => {
    // A knit factory has no cutting-room screens for some entries; a tool for a module this
    // factory does not run is one the model can only mislead itself with.
    const knitOnly = NAV.filter((item) => item.factoryTypes && !item.factoryTypes.includes('woven'))

    for (const item of knitOnly) {
      const tools = toolsForRoles({
        packs: [pack(item.id, [read(`${item.id}.something`)])],
        roles: ['owner'] as never,
        factoryType: 'woven',
      })
      expect(tools, item.id).toEqual([])
    }
  })

  it('8 · the empty-roles case reaches nothing', () => {
    expect(names([])).toEqual([])
  })
})

describe('primerModulesForRoles · the prompt is scoped too', () => {
  it('1 · drops a module this person cannot see', () => {
    // Not a data leak — a primer teaches how gazette wage grades work, not anybody's wages —
    // but it is paid for in every request, and a primer for tools they cannot call is prompt
    // they can only be frustrated by.
    const modules = primerModulesForRoles(['orders', 'workforce'], ['store'] as never, 'woven')

    expect(modules).not.toContain('workforce')
  })

  it('2 · keeps a module with no nav entry', () => {
    // `core` and the platform modules teach things that are not a department's private
    // business, and dropping them would quietly change what MARBIM knows about approvals for
    // everybody.
    expect(primerModulesForRoles(['__platform__'], ['viewer'] as never, 'woven')).toEqual([
      '__platform__',
    ])
  })

  it('3 · an owner keeps all of them', () => {
    const all = NAV.map((item) => item.id)
    expect(primerModulesForRoles(all, ['owner'] as never, 'woven')).toEqual(all)
  })
})

describe('moduleOfTool', () => {
  it('reads the namespace the tool pack validator already enforces', () => {
    // `validateToolPack` refuses a tool not namespaced `<moduleId>.`, so this is a read of an
    // invariant rather than a guess at one.
    expect(moduleOfTool('store.propose_stock_adjustment')).toBe('store')
    expect(moduleOfTool('orders.book')).toBe('orders')
  })
})

/**
 * The enquiry draft tool, and who may reach it.
 *
 * A merchandiser pasted a buyer's enquiry into MARBIM and watched it read the buyer, the RFQ
 * board and the margin floor correctly — and then say it could not log the enquiry. Nothing
 * was missing underneath: `rfqs` has been a registered pending target since 1.2, `commitRfq`
 * waits behind it, and `rfqPayload` describes itself as "what MARBIM drafts from a buyer's
 * enquiry email or PDF". Only the tool was absent.
 *
 * `toolsForRoles` gates a draft tool on write access to the tool's OWN module — not to
 * MARBIM — so these pin who now gets it. The viewer case is the one that matters: an enquiry
 * logged by somebody with no write anywhere would be this seam failing open.
 */
describe('rfq.propose_enquiry · reachable by the desk that owns enquiries', () => {
  const packOf = (moduleId: string) => {
    const found = listModules().find((m) => m.id === moduleId)?.toolPack
    expect(found, `${moduleId} registers a tool pack`).toBeTruthy()
    return found as ToolPack
  }

  const namesFor = (roles: readonly Role[]): string[] =>
    toolsForRoles({ packs: [packOf('rfq')], roles, factoryType: 'knit-composite' }).map(
      (t) => t.name,
    )

  it('a merchandiser gets it', () => {
    expect(namesFor(['merchandiser'])).toContain('rfq.propose_enquiry')
  })

  it('commercial gets it — they work the same board', () => {
    expect(namesFor(['commercial'])).toContain('rfq.propose_enquiry')
  })

  it('a viewer gets the reads and NOT the draft', () => {
    // The whole point of the read/draft split. A viewer may ask what the board holds; an
    // enquiry they logged would be a write by somebody the product says cannot write.
    const viewer = namesFor(['viewer'])

    expect(viewer).not.toContain('rfq.propose_enquiry')
  })

  it('production gets nothing from this pack at all — it is not their board', () => {
    expect(namesFor(['production'])).toEqual([])
  })
})
