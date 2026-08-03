/**
 * The packs every module actually registered, checked as a set.
 *
 * `validateToolPack` has vectors of its own for one pack in isolation. What this covers is
 * the fleet: MARBIM led with the right primer on twenty-one departments and could read the
 * numbers of two, so every question on a cutting floor or a quality desk was answered "I
 * have nothing to read a figure from" — correct, and useless.
 *
 * The coverage number is asserted rather than the exact list, so adding a pack does not
 * break a test, and REMOVING one does.
 */
import 'dotenv/config'

import { describe, expect, it } from 'vitest'

import '@/modules/registry'
import { listModules } from '@/modules/core/registry'
import { assertToolPacks, type DraftTool, type ToolPack } from '@/modules/marbim/tools'

const modules = listModules()
const packs = modules
  .filter((m) => m.toolPack)
  .map((m) => ({ id: m.id, pack: m.toolPack as ToolPack, targets: m.pendingTargets }))

describe('the registered tool packs', () => {
  it('validates every one of them at boot', () => {
    // `toolsInScope` validates too, but at CHAT time — a namespace typo used to fail for
    // one person mid-question rather than stopping the process.
    expect(() => assertToolPacks(modules)).not.toThrow()
    expect(assertToolPacks(modules)).toBe(packs.length)
  })

  it('covers the departments somebody asks under pressure', () => {
    const covered = new Set(packs.map((p) => p.id))

    // Cutting, quality, commercial, store and shipment: a stopped table, a failing line,
    // a credit, the issue window, and the bank presentation.
    for (const id of [
      'cutting',
      'quality',
      'commercial',
      'store',
      'shipment',
      'orders',
      'production',
      'costing',
      'finance',
      'sampling',
      'procurement',
      'analytics',
      'memory',
    ]) {
      expect(covered.has(id), `${id} has no tool pack`).toBe(true)
    }
  })

  it('names every tool for the module that registered it', () => {
    for (const { id, pack } of packs) {
      for (const tool of pack.tools) {
        expect(tool.name.startsWith(`${id}.`), tool.name).toBe(true)
      }
    }
  })

  it('never lets a draft tool target a table its module did not whitelist', () => {
    // The check that keeps rule 3 true: a draft tool is only safe because `pendingTargets`
    // bounds what it can ever propose against.
    for (const { pack, targets } of packs) {
      for (const tool of pack.tools) {
        if (tool.kind !== 'draft') continue
        expect(targets, tool.name).toContain((tool as DraftTool).targetTable)
      }
    }
  })

  it('gives every tool a description a model can choose on', () => {
    for (const { pack } of packs) {
      for (const tool of pack.tools) {
        // A model picks by description; a thin one is picked at random or never.
        expect(tool.description.trim().length, tool.name).toBeGreaterThan(40)
      }
    }
  })

  it('lets no tool scope companyId from the client', () => {
    // Tenancy comes from the session. A tool that let a caller name the company would read
    // another factory's book, and it is the one argument that can never be scoped.
    for (const { pack } of packs) {
      for (const tool of pack.tools) {
        expect(tool.scopedArgs ?? [], tool.name).not.toContain('companyId')
      }
    }
  })

  it('leaves no department with a primer and no tools', () => {
    /*
     * The ratchet, now closed. It started at nineteen and came down a pack at a time; this
     * is the assertion that stops it reopening — a module added with a primer and no tools
     * fails here rather than answering "I have nothing to read a figure from" in production.
     */
    const withPrimer = modules.filter((m) => m.domainPrimer).map((m) => m.id)
    const withoutTools = withPrimer.filter((id) => !packs.some((p) => p.id === id))

    expect(withoutTools, `these teach a craft they cannot read: ${withoutTools.join(', ')}`).toEqual(
      [],
    )
  })

  it('keeps every draft tool aimed at something a human approves', () => {
    // Eight draft tools across the fleet, and each one lands in `pending_changes` rather
    // than writing. The modules that deliberately offer NONE — finance, commercial, rfq,
    // planning, costing, production, maintenance, buyers — are the argument, not an
    // omission: money leaving, a customs declaration, a quoted price and a promise of
    // capacity are all decisions a person makes.
    const drafts = packs.flatMap(({ pack }) => pack.tools.filter((t) => t.kind === 'draft'))

    expect(drafts.length).toBeGreaterThanOrEqual(8)
    for (const tool of drafts) {
      expect((tool as DraftTool).targetTable, tool.name).toBeTruthy()
    }
  })
})
