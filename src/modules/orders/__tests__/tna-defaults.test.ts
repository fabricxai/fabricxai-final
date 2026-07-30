/**
 * Default TNA template vectors.
 *
 * The most important assertion in this file is the boring one: every template carries
 * `cutting`, `final_inspection` and `ex_factory` under exactly those names. Three other
 * modules query milestones BY NAME —
 *
 *  - 1.4's PP-blocking escalation counts down to `cutting`;
 *  - 7.1's pre-final readiness check looks for `final_inspection`;
 *  - 1.3's own ripple anchors on `ex_factory`, and 8.1's departure consumer actualises it.
 *
 * A template that spells one differently produces a schedule those modules silently cannot
 * see: no escalation, no readiness check, no ripple. Nothing errors — the order just sails
 * past every date unwatched, which is the exact failure the TNA exists to prevent.
 */
import { describe, expect, it } from 'vitest'

import { tnaTemplatePayload } from '../zod'
import {
  DEFAULT_TNA_TEMPLATES,
  NAMES_OTHER_MODULES_READ,
  resolveProductType,
} from '../tna-defaults'
import { generateSchedule } from '../tna'

describe('the milestone names other modules read', () => {
  it('1 · every template carries all three, spelled exactly', () => {
    for (const template of DEFAULT_TNA_TEMPLATES) {
      const names = template.milestones.map((m) => m.name)
      for (const required of NAMES_OTHER_MODULES_READ) {
        expect(names, `${template.productType} is missing "${required}"`).toContain(required)
      }
    }
  })

  it('2 · a sweater still calls it `cutting`, even though nothing is cut', () => {
    // Panels are knitted to shape. The gate 1.4 counts down to is about
    // approval-before-production, not about a cutting table — renaming it would make the PP
    // escalation blind to every sweater order.
    const sweater = DEFAULT_TNA_TEMPLATES.find((t) => t.productType === 'sweater')!
    expect(sweater.milestones.map((m) => m.name)).toContain('cutting')
  })

  it('3 · `ex_factory` is the anchor at offset zero on every template', () => {
    for (const template of DEFAULT_TNA_TEMPLATES) {
      const exFactory = template.milestones.find((m) => m.name === 'ex_factory')!
      expect(exFactory.offsetDaysBeforeExFactory, template.productType).toBe(0)
    }
  })
})

describe('every default template is structurally valid', () => {
  it('4 · passes the module’s own schema', () => {
    // A default that contradicts the milestone schema must fail here, not at the first
    // order that uses it.
    for (const template of DEFAULT_TNA_TEMPLATES) {
      expect(() => tnaTemplatePayload.parse(template), template.productType).not.toThrow()
    }
  })

  it('5 · generates a real schedule from a ship date', () => {
    for (const template of DEFAULT_TNA_TEMPLATES) {
      const schedule = generateSchedule({
        exFactoryDate: '2026-11-15',
        template: tnaTemplatePayload.parse(template),
      })

      expect(schedule.length, template.productType).toBe(template.milestones.length)
      const exFactory = schedule.find((m) => m.name === 'ex_factory')!
      expect(exFactory.plannedDate, template.productType).toBe('2026-11-15')
    }
  })

  it('6 · every dependency names a milestone that exists', () => {
    // A dependency on a milestone nobody defined is a chain that cannot be resolved, and
    // the ripple would quietly stop at the break.
    for (const template of DEFAULT_TNA_TEMPLATES) {
      const names = new Set(template.milestones.map((m) => m.name))
      for (const milestone of template.milestones) {
        for (const dep of milestone.dependsOn) {
          const depName = typeof dep === 'string' ? dep : dep.name
          expect(names, `${template.productType}: ${milestone.name} → ${depName}`).toContain(
            depName,
          )
        }
      }
    }
  })

  it('7 · nothing depends on something scheduled after it', () => {
    // An offset that contradicts a dependency is a calendar that goes backwards.
    for (const template of DEFAULT_TNA_TEMPLATES) {
      const offsets = new Map(
        template.milestones.map((m) => [m.name, m.offsetDaysBeforeExFactory]),
      )
      for (const milestone of template.milestones) {
        for (const dep of milestone.dependsOn) {
          const depName = typeof dep === 'string' ? dep : dep.name
          expect(
            offsets.get(depName)!,
            `${template.productType}: ${milestone.name} must come after ${depName}`,
          ).toBeGreaterThan(milestone.offsetDaysBeforeExFactory)
        }
      }
    }
  })

  it('8 · the fabric lead time grows with the product’s complexity', () => {
    // The whole reason there is more than one template. A knit tee runs on yarn a mill
    // already has; a jacket needs cloth woven to order plus a hardware chain.
    const fabricOffset = (productType: string) => {
      const template = DEFAULT_TNA_TEMPLATES.find((t) => t.productType === productType)!
      const milestone = template.milestones.find(
        (m) => m.name === 'fabric_in_house' || m.name === 'yarn_in_house',
      )!
      return milestone.offsetDaysBeforeExFactory
    }

    expect(fabricOffset('knit')).toBeLessThan(fabricOffset('woven'))
    expect(fabricOffset('woven')).toBeLessThan(fabricOffset('outerwear'))
  })

  it('9 · no template repeats a milestone name', () => {
    for (const template of DEFAULT_TNA_TEMPLATES) {
      const names = template.milestones.map((m) => m.name)
      expect(new Set(names).size, template.productType).toBe(names.length)
    }
  })
})

describe('resolveProductType · what a merchandiser actually types', () => {
  it('10 · maps the words used for a knit', () => {
    for (const typed of ['t-shirt', 'T-Shirt', 'tee', 'polo', 'tshirt', ' KNIT ']) {
      expect(resolveProductType(typed), typed).toBe('knit')
    }
  })

  it('11 · maps wovens, outerwear and knitwear', () => {
    expect(resolveProductType('trousers')).toBe('woven')
    expect(resolveProductType('denim')).toBe('woven')
    expect(resolveProductType('jacket')).toBe('outerwear')
    expect(resolveProductType('cardigan')).toBe('sweater')
  })

  it('12 · returns null for something it does not know', () => {
    // Never a default. The shortest template would silently flatter every unfamiliar
    // product, and an order given a 90-day schedule when it needed 150 has a wrong ship
    // date from the day it was created.
    expect(resolveProductType('swimwear')).toBeNull()
    expect(resolveProductType('')).toBeNull()
  })

  it('13 · every alias resolves to a template that exists', () => {
    const productTypes = new Set(DEFAULT_TNA_TEMPLATES.map((t) => t.productType))
    for (const typed of ['tee', 'shirt', 'parka', 'jumper']) {
      expect(productTypes).toContain(resolveProductType(typed)!)
    }
  })
})
