/**
 * Pre-test data for the live-test runbook — what the phases ASSUME and never create.
 *
 * `pnpm tsx scripts/seed-pretest.ts --company=<uuid>`
 *
 * The runbook (live-test kit, 00-LIVE-TEST-RUNBOOK.md) walks an order from inquiry to cash
 * through eighteen users' screens. Reading it phase by phase, four things are referenced
 * before any step that could have created them:
 *
 *   · BUYERS — Phase 1 turns an inquiry into an RFQ and Phase 2 into an order, and both
 *     tables carry a NOT NULL `buyer_id`. No phase creates a buyer.
 *   · WORKERS — Phase 9 imports attendance for BF-#### employee numbers and computes a
 *     payroll run against them. No phase hires anybody.
 *   · MACHINES — Phase 6's downtime tap picks "OV-3-114" and expects a ticket Sabbir can
 *     claim. Day-0 seeded only the knitting section.
 *   · STORE ITEMS — Phase 4 receives yarn and denim against item codes. No phase creates
 *     the catalogue.
 *
 * Everything here is idempotent by natural key, and tenant-pinned: --company is required,
 * deliberately, because this writes BUSINESS data and a default aimed at the wrong tenant
 * would seed somebody's real company.
 *
 * ## Buyers go through the real services, as the right people
 *
 * Not table inserts. `createLead` → `convertLead` under Rashida's identity for Bestseller
 * and Imran's for H&M — the same two whose role scopes name those buyers — so the audit
 * trail, the outbox events and the buyer codes all look exactly as they would had the desk
 * been used. A buyer row with no converted lead behind it would be a shape the product
 * itself can no longer produce.
 */
import 'dotenv/config'

import { eq, and } from 'drizzle-orm'

import { createDirectClient, createDirectDb } from '@/db/direct'
import * as schema from '@/db/schema'
import type { RequestCtx } from '@/modules/core/ctx'
import { createLead, convertLead } from '@/modules/buyers/service'

const K = {
  buyers: [
    { name: 'Bestseller A/S', code: 'BSL', country: 'Denmark', by: 'rashida' },
    { name: 'H&M (Hennes & Mauritz)', code: 'HM', country: 'Sweden', by: 'imran' },
  ],
  machines: [
    // `serial` is "the number stencilled on the machine" (schema comment) — the kit's `id`
    // is that stencil; its manufacturer serial goes to `model`.
    { serial: 'OV-3-114', type: 'overlock 4-thread', model: 'JK-88-114', line: 'L3' },
    { serial: 'SN-1-021', type: 'single needle', model: null, line: 'L1' },
  ],
  /**
   * The kit's yarn and greige entries are seeded as `fabric` because `item_kind` is only
   * fabric | trim | accessory. A knit-composite factory genuinely stocks yarn and greige —
   * the enum is missing the two kinds the knitting section exists to consume — but an enum
   * change is a migration, not a seed's decision. `spec.materialKind` carries the truth so
   * nothing is lost when the enum learns them.
   */
  items: [
    { code: 'YRN-30-1', kind: 'fabric', name: '30/1 combed cotton yarn', uom: 'kg', spec: { materialKind: 'yarn' } },
    { code: 'GRG-PIQ', kind: 'fabric', name: 'greige piqué 180gsm', uom: 'kg', spec: { materialKind: 'greige' } },
    { code: 'FAB-PIQ-180', kind: 'fabric', name: 'dyed piqué 180gsm', uom: 'kg', spec: {} },
    { code: 'FAB-DEN-12', kind: 'fabric', name: '12oz stretch denim 58"', uom: 'yds', spec: {} },
    { code: 'TRM-PLK', kind: 'trim', name: '3-button placket set', uom: 'pcs', spec: {} },
    { code: 'TRM-ZIP', kind: 'trim', name: 'YKK jacket zipper', uom: 'pcs', spec: {} },
  ],
} as const

const companyId = process.argv
  .slice(2)
  .find((a) => a.startsWith('--company='))
  ?.split('=')[1]

if (!companyId) {
  console.error('[pretest] --company=<uuid> is required — this writes business data')
  process.exit(1)
}

/** Day-0 user ids are `day0-<company8>-<email local part>`. */
const userId = (person: string): string => `day0-${companyId.slice(0, 8)}-${person}`

async function main(): Promise<void> {
  const client = createDirectClient()
  const db = createDirectDb(client)
  const out: string[] = []

  try {
    const [company] = await db
      .select({ name: schema.companies.name })
      .from(schema.companies)
      .where(eq(schema.companies.id, companyId!))
    if (!company) throw new Error(`company ${companyId} does not exist`)
    console.log(`[pretest] ${company.name} (${companyId})`)

    // ── buyers, through the desk's own path ──────────────────────────────────
    for (const buyer of K.buyers) {
      const existing = await db
        .select({ id: schema.buyers.id })
        .from(schema.buyers)
        .where(and(eq(schema.buyers.companyId, companyId!), eq(schema.buyers.code, buyer.code)))
      if (existing.length > 0) {
        out.push(`buyer ${buyer.code} — already there`)
        continue
      }

      const ctx: RequestCtx = { companyId: companyId!, userId: userId(buyer.by), roles: ['merchandiser'] }
      const { leadId } = await createLead(ctx, {
        source: 'inbound',
        companyName: buyer.name,
        country: buyer.country,
        notes: 'Seeded for the live-test runbook — lead and conversion through the real services.',
      })
      await convertLead(ctx, { leadId, code: buyer.code })
      out.push(`buyer ${buyer.code} (${buyer.name}) — lead created and converted as ${buyer.by}`)
    }

    // ── workers, from the kit's 40-person sample ─────────────────────────────
    const { readFileSync } = await import('node:fs')
    const kit = JSON.parse(
      readFileSync(
        // Overridable because the kit lives on the operator's machine, not the server.
        process.env.KIT_WORKERS ??
          '/home/kamrul-hasan/Downloads/fabricxai-live-test-kit/structured-data/10-hr/workers_wages.json',
        'utf8',
      ),
    ) as {
      workers_sample_40_of_2384: {
        employee_no: string
        name: string
        grade: number
        line: string
        designation: string
        disbursement: string
      }[]
    }

    const lines = await db
      .select({ id: schema.lines.id, code: schema.lines.code })
      .from(schema.lines)
      .where(eq(schema.lines.companyId, companyId!))
    const lineByCode = new Map(lines.map((l) => [l.code, l.id]))

    let created = 0
    let existing = 0
    for (const w of kit.workers_sample_40_of_2384) {
      const lineId = lineByCode.get(w.line)
      if (!lineId) throw new Error(`worker ${w.employee_no}: line ${w.line} does not exist`)

      const found = await db
        .select({ id: schema.workers.id })
        .from(schema.workers)
        .where(
          and(eq(schema.workers.companyId, companyId!), eq(schema.workers.employeeNo, w.employee_no)),
        )
      if (found.length > 0) {
        existing += 1
        continue
      }
      await db.insert(schema.workers).values({
        companyId: companyId!,
        employeeNo: w.employee_no,
        name: w.name,
        grade: String(w.grade),
        designation: w.designation,
        lineId,
        // The kit carries no join dates; fixed and past, so tenure maths is deterministic
        // and a re-run writes the same row. Festival-bonus pro-rating reads this.
        joinDate: '2023-06-01',
        disbursementType: w.disbursement as 'bank' | 'bkash',
        status: 'active',
      })
      created += 1
    }
    out.push(`workers — ${created} created, ${existing} already there (of ${kit.workers_sample_40_of_2384.length})`)

    // ── machines ─────────────────────────────────────────────────────────────
    for (const m of K.machines) {
      const found = await db
        .select({ id: schema.machines.id })
        .from(schema.machines)
        .where(and(eq(schema.machines.companyId, companyId!), eq(schema.machines.serial, m.serial)))
      if (found.length > 0) {
        out.push(`machine ${m.serial} — already there`)
        continue
      }
      const lineId = lineByCode.get(m.line)
      if (!lineId) throw new Error(`machine ${m.serial}: line ${m.line} does not exist`)
      await db.insert(schema.machines).values({
        companyId: companyId!,
        machineType: m.type,
        serial: m.serial,
        ...(m.model ? { model: m.model } : {}),
        lineId,
      })
      out.push(`machine ${m.serial} (${m.type}) — on ${m.line}`)
    }

    // ── store items ──────────────────────────────────────────────────────────
    let itemsNew = 0
    for (const item of K.items) {
      await db
        .insert(schema.items)
        .values({
          companyId: companyId!,
          code: item.code,
          kind: item.kind as 'fabric' | 'trim',
          name: item.name,
          uom: item.uom,
          spec: { ...item.spec },
        })
        .onConflictDoNothing()
      itemsNew += 1
    }
    out.push(`items — ${itemsNew} ensured (yarn/greige carried as fabric + spec.materialKind; see header)`)

    console.log('\n' + out.map((line) => '  ' + line).join('\n'))
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error('[pretest] failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
