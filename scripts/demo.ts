/**
 * `pnpm demo` — the scenario every screen was built and checked against.
 *
 * This replaces three separate scripts (`demo-order`, `demo-rfqs`, `demo-leads`)
 * that had to be run in the right order, with the right environment, and whose
 * only failure message on getting it wrong was a null dereference. The content is
 * the same; what is new is that it is ONE reproducible run.
 *
 * Three properties, each of which the old scripts lacked:
 *
 *  1. **Idempotent.** Every step checks for its own rows first. Re-running adds
 *     nothing and repairs nothing — a demo you cannot run twice is one you end up
 *     dropping the database for, and dropping the database is how a colleague
 *     loses their own work.
 *  2. **Ordered by dependency, not by memory.** The RFQs need the buyer the order
 *     step creates. That is expressed here rather than in a comment telling you
 *     to run another file first.
 *  3. **Explicit about the tenant.** With `DEMO_COMPANY_ID` unset it finds the
 *     company itself and says which one it picked, rather than reading `undefined`
 *     into a query that then returns nothing at all.
 *
 * Everything goes through the real services — `createOrder`, `generateTna`,
 * `createRfq`, `createLead` — never hand-written SQL. Rows that the production
 * code did not write prove nothing about the screens that read them.
 *
 * Usage:
 *   pnpm demo                 all steps
 *   pnpm demo orders rfqs     just those
 */
import 'dotenv/config'
// Importing a module's `register.ts` IS its registration — there is no discovery step. The
// app does this from `instrumentation.ts`; a script has to do it too, or `propose()` refuses
// every target as an unknown module.
import '@/modules/registry'

import { and, eq, inArray, sql } from 'drizzle-orm'

import { createDirectClient, createDirectDb } from '@/db/direct'
import { companies, roles } from '@/db/schema/core'
import { leads } from '@/modules/buyers/schema'
import { buyers } from '@/modules/buyers/schema'
import { createLead, logActivity, setLeadStage } from '@/modules/buyers/service'
import type { RequestCtx } from '@/modules/core/ctx'
import { pendingChanges } from '@/db/schema/core'
import { propose } from '@/modules/core/pending-changes'
import { withTenantRead, withTenantTx } from '@/modules/core/tenancy'
import { orders } from '@/modules/orders/schema'
import {
  createOrder,
  findTemplateForProductType,
  generateTna,
  refreshMilestoneStatuses,
  saveBreakdown,
  seedDefaultTnaTemplates,
} from '@/modules/orders/service'
import { rfqs } from '@/modules/rfq/schema'
import { askClarification, createRfq } from '@/modules/rfq/service'

/** Relative to the day it is run, so the story reads the same every time. */
const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)

// ─────────────────────────────────────────────────────────────────────────────
// Who we are
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The company and user the scenario runs as.
 *
 * Both can be pinned with `DEMO_COMPANY_ID` / `DEMO_USER_ID`. Without them this
 * looks for a company that has an owner — and REFUSES when there is more than
 * one rather than picking. Seeding a colleague's tenant with H&M orders is not
 * something to guess at.
 */
async function resolveCtx(): Promise<RequestCtx> {
  const pinnedCompany = process.env.DEMO_COMPANY_ID
  const pinnedUser = process.env.DEMO_USER_ID
  if (pinnedCompany && pinnedUser) {
    return { companyId: pinnedCompany, userId: pinnedUser, roles: ['owner', 'merchandiser'] }
  }

  const client = createDirectClient()
  try {
    const db = createDirectDb(client)
    const owners = await db
      .select({ companyId: roles.companyId, userId: roles.userId, name: companies.name })
      .from(roles)
      .innerJoin(companies, eq(companies.id, roles.companyId))
      .where(
        and(
          eq(roles.role, 'owner'),
          sql`${roles.revokedAt} is null`,
          // Naming the company is enough — the owner to run as follows from it,
          // and looking up two ids by hand to seed a demo is the kind of friction
          // that gets a script abandoned.
          ...(pinnedCompany ? [eq(roles.companyId, pinnedCompany)] : []),
        ),
      )

    if (owners.length === 0) {
      throw new Error(
        pinnedCompany
          ? `Company ${pinnedCompany} has no owner. Check DEMO_COMPANY_ID.`
          : 'No company with an owner. Run `pnpm seed` first, or sign up through /signup.',
      )
    }

    const distinct = [...new Set(owners.map((o) => o.companyId))]
    if (distinct.length > 1) {
      const list = owners
        .filter((o, i) => owners.findIndex((x) => x.companyId === o.companyId) === i)
        .map((o) => `  ${o.companyId}  ${o.name}`)
        .join('\n')
      throw new Error(
        `${distinct.length} companies have an owner. Say which one:\n${list}\n\n` +
          'DEMO_COMPANY_ID=<id> DEMO_USER_ID=<owner user id> pnpm demo',
      )
    }

    const owner = owners[0]!
    console.log(`[demo] company ${owner.name} (${owner.companyId})`)
    return {
      companyId: owner.companyId,
      userId: pinnedUser ?? owner.userId,
      roles: ['owner', 'merchandiser'],
    }
  } finally {
    await client.end()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The steps
// ─────────────────────────────────────────────────────────────────────────────

interface Step {
  id: string
  /** One line saying what this left behind, for the run log. */
  run: (ctx: RequestCtx) => Promise<string>
}

const PO_NUMBER = 'PO-88203'

/**
 * H&M, one confirmed order, its TNA calendar and a colour/size breakdown.
 *
 * Everything downstream hangs off this: the RFQ step needs the buyer, and the
 * Order Desk, T&A and planning screens all read this order.
 */
const orderStep: Step = {
  id: 'orders',
  async run(ctx) {
    const [buyer] = await withTenantTx(ctx, (tx) =>
      tx
        .insert(buyers)
        .values({
          companyId: ctx.companyId,
          name: 'H&M',
          code: 'HM',
          country: 'SE',
          createdBy: ctx.userId,
        })
        .onConflictDoUpdate({ target: [buyers.companyId, buyers.code], set: { name: 'H&M' } })
        .returning({ id: buyers.id }),
    )

    const [existing] = await withTenantRead(ctx, (tx) =>
      tx
        .select({ id: orders.id })
        .from(orders)
        .where(sql`${orders.poNumbers} @> ARRAY[${PO_NUMBER}]::text[]`),
    )
    if (existing) {
      // The TNA and the breakdown are deliberately skipped too: `generateTna`
      // would collide on the per-order milestone key, and `saveBreakdown` would
      // file a second revision recording a change nobody made.
      return `buyer H&M ready · order ${PO_NUMBER} already present, left alone`
    }

    const created = await createOrder(ctx, {
      order: {
        buyerId: buyer!.id,
        poNumbers: [PO_NUMBER],
        totalValue: '128400.00',
        currency: 'USD',
        plannedExFactoryDate: day(35),
      },
      styles: [
        {
          styleCode: 'SH-4471',
          description: "men's shirt · 40s poplin, single needle",
          contractedQty: 24000,
          unitPrice: '5.35',
          currency: 'USD',
        },
      ],
    })

    await seedDefaultTnaTemplates(ctx)
    const template = await findTemplateForProductType(ctx, { productType: 'shirt' })
    if (template) {
      await generateTna(ctx, {
        orderId: created.orderId,
        templateId: template.id,
        exFactoryDate: day(35),
      })
      // Backdates nothing: it reads today's date and marks what has already
      // slipped, which is what makes the T&A screen show real amber.
      await refreshMilestoneStatuses(ctx, { today: day(0) })
    }

    // Navy / White / Sky across five sizes, adding up to the contracted 24,000.
    const grid: Record<string, number[]> = {
      Navy: [1200, 2400, 3000, 2200, 700],
      White: [1100, 2300, 2900, 2100, 700],
      Sky: [700, 1400, 1700, 1300, 300],
    }
    const cells = Object.entries(grid).flatMap(([color, qtys]) =>
      ['S', 'M', 'L', 'XL', 'XXL'].map((size, i) => ({ color, size, qty: qtys[i]! })),
    )

    const breakdown = await saveBreakdown(ctx, {
      orderStyleId: created.orderStyleIds[0]!,
      cells,
      buyerRevision: false,
    })

    return `order ${PO_NUMBER} · ${template?.name ?? 'no TNA template'} · breakdown ${breakdown.totalQty} pcs rev ${breakdown.revision}`
  },
}

/** Three enquiries on the board, one of them overdue with a question nobody chased. */
const rfqStep: Step = {
  id: 'rfqs',
  async run(ctx) {
    const [buyer] = await withTenantRead(ctx, (tx) =>
      tx.select({ id: buyers.id }).from(buyers).where(eq(buyers.code, 'HM')),
    )
    if (!buyer) throw new Error('the orders step must run first — it creates the H&M buyer')

    const ROWS = [
      ['RFQ-2026-118', 'woven', "men's shirt · 40s poplin, garment wash", 'SH-4471', 24000, '4.10', 2],
      ['RFQ-2026-121', 'knit', 'polo 180gsm pique · embroidery left chest', 'PL-2210', 42000, '4.28', 6],
      ['RFQ-2026-112', 'knit', 'basic tee 150gsm · single jersey', 'TE-1180', 60000, '2.35', -3],
    ] as const

    const titles = ROWS.map((r) => r[0])
    const present = new Set(
      (
        await withTenantRead(ctx, (tx) =>
          tx.select({ title: rfqs.title }).from(rfqs).where(inArray(rfqs.title, [...titles])),
        )
      ).map((r) => r.title),
    )

    let created = 0
    for (const [title, productType, description, styleCode, quantity, targetPrice, dueIn] of ROWS) {
      if (present.has(title)) continue

      const { rfqId } = await createRfq(ctx, {
        buyerId: buyer.id,
        title,
        productType,
        description,
        styleCode,
        quantity,
        unit: 'pcs',
        targetPrice,
        targetCurrency: 'USD',
        currency: 'USD',
        deadline: day(dueIn),
      })
      created += 1

      // The overdue one also has a question nobody has chased — the state the
      // RFQ board exists to make visible.
      if (dueIn < 0) {
        await askClarification(ctx, {
          rfqId,
          question: 'Is the neck rib self-fabric or bought? The tech pack shows both.',
          askedAt: day(-9),
        })
      }
    }

    return `${created} RFQs created, ${present.size} already there`
  },
}

/** A lead pipeline with two that have gone quiet past the default threshold. */
const leadStep: Step = {
  id: 'leads',
  async run(ctx) {
    const LEADS = [
      ['Kappahl AB', 'SE', 'fair', 'new', "Men's poplin shirts, 40s, 30,000 pcs for SS27. Found us through the Dhaka Apparel Summit list.", 2],
      ['Zeeman Textiel', 'NL', 'buying_house', 'new', 'Basic tees, 180 gsm, repeat programme. Asked for a capability deck first, not a price.', 6],
      ['Lindex', 'SE', 'referral', 'contacted', 'Ladies blouses, viscose. Two calls, wants to see the compliance file before anything else.', 9],
      ['Jack & Jones · Bestseller DK', 'DK', 'referral', 'contacted', 'Second division of an existing buyer. Denim shirts, same LC structure.', 21],
      ['Takko Fashion', 'DE', 'buying_house', 'sampling_talk', 'Polo 180 gsm pique. Proto approved, fit sample requested in three colours.', 4],
      ['NKD Group', 'DE', 'inbound', 'sampling_talk', 'Kids tees, high volume, low price. Proto sent 12 Jul, no response to the follow-up.', 16],
      ['Kiabi', 'FR', 'referral', 'negotiation', 'Woven shirt programme, 45,000 pcs. Two rounds on FOB, they are 4% below our floor.', 3],
    ] as const

    const names = LEADS.map((l) => l[0])
    const present = new Set(
      (
        await withTenantRead(ctx, (tx) =>
          tx
            .select({ companyName: leads.companyName })
            .from(leads)
            .where(inArray(leads.companyName, [...names])),
        )
      ).map((r) => r.companyName),
    )

    const PATH = ['new', 'contacted', 'sampling_talk', 'negotiation'] as const
    let created = 0

    for (const [companyName, country, source, stage, notes, quietDays] of LEADS) {
      if (present.has(companyName)) continue

      const { leadId } = await createLead(ctx, { companyName, country, source, notes })
      await logActivity(ctx, {
        leadId,
        kind: 'call',
        summary: 'First contact logged',
        occurredAt: day(-quietDays),
      })

      // The stage machine allows one step at a time, so walk the path rather than
      // jumping — a lead that reached negotiation really did pass contacted.
      for (const step of PATH.slice(1, PATH.indexOf(stage as never) + 1)) {
        await setLeadStage(ctx, { leadId, stage: step })
      }
      created += 1
    }

    return `${created} leads created, ${present.size} already there`
  },
}

/**
 * Two drafts waiting in the approve inbox.
 *
 * Without this the walkthrough leaves the inbox empty, and an empty inbox is the one screen
 * that cannot tell you whether it is working or whether nothing was routed to you — the two
 * read identically. It is also the screen the whole propose→approve→commit loop exists for,
 * so a demo that never shows a draft never shows the product's central idea.
 *
 * Goes through `propose()` like everything else here, which means the payloads are validated
 * by the module's own zod at insert and the target must be registered in `buyers/register.ts`.
 * Hand-writing the rows would prove nothing about either.
 *
 * The two drafts differ on purpose: one transcribed by a person, one extracted by a model
 * with per-field confidence — including a deliberately weak `tolerancePct`, so the inbox has
 * something to rank low and a reviewer has a reason to look.
 */
const approvalStep: Step = {
  id: 'approvals',
  async run(ctx) {
    const [buyer] = await withTenantRead(ctx, (tx) =>
      tx.select({ id: buyers.id }).from(buyers).where(eq(buyers.code, 'HM')),
    )
    if (!buyer) throw new Error('the orders step must run first — it creates the H&M buyer')

    const existing = await withTenantRead(ctx, (tx) =>
      tx
        .select({ id: pendingChanges.id })
        .from(pendingChanges)
        .where(
          and(
            eq(pendingChanges.companyId, ctx.companyId),
            eq(pendingChanges.targetTable, 'buyer_requirements'),
            eq(pendingChanges.status, 'pending'),
          ),
        ),
    )
    if (existing.length > 0) return `${existing.length} already waiting`

    // Both are `buyer_requirements` because it is one of the targets that owns a commit
    // handler. A draft the inbox can show but never commit would make the demo end on a
    // failure — see `buyer_terms`, which is a registered target with no handler and a
    // camelCase payload the generic writer rejects as an invalid identifier.
    const batches = [
      {
        // A clean extraction: the reviewer's job here is a glance, not an argument.
        confidence: { requirements: 0.94, buyerId: 0.99 },
        requirements: [
          {
            category: 'Packing',
            text: 'Solid colour, solid size cartons. Ratio packs only on written instruction.',
            sourcePage: 12,
          },
          {
            category: 'Labelling',
            text: 'Care label in EN/FR/DE. Country of origin on the main label, not a satellite.',
            sourcePage: 14,
          },
          {
            category: 'Inspection',
            text: 'Final inspection AQL 2.5 major / 4.0 minor, booked 7 days before ex-factory.',
            sourcePage: 31,
          },
        ],
      },
      {
        // A weak one, so the inbox has something to rank BELOW the first and a reviewer has
        // a reason to open it. Scanned annexes are where extraction actually struggles.
        confidence: { requirements: 0.62, buyerId: 0.97 },
        requirements: [
          {
            category: 'Chemical compliance',
            text: 'ZDHC MRSL v3.1 applies to all wet processing. Mill test reports valid 12 months.',
            sourcePage: 4,
          },
          {
            category: 'Restricted substances',
            text: 'APEO and PFAS prohibited. Third-party lab report required per dye lot.',
            sourcePage: 7,
          },
        ],
      },
    ] as const

    for (const batch of batches) {
      await propose(ctx, {
        moduleId: 'buyers',
        targetTable: 'buyer_requirements',
        operation: 'insert',
        zodSchemaKey: 'buyer_requirements',
        source: 'ai_extraction',
        extractorVersion: 'demo-extractor-v1',
        fieldConfidence: batch.confidence,
        payload: { buyerId: buyer.id, requirements: batch.requirements },
      })
    }

    return `${batches.length} drafts waiting in the approve inbox`
  },
}

const STEPS: readonly Step[] = [orderStep, rfqStep, leadStep, approvalStep]

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const asked = process.argv.slice(2)
  const unknown = asked.filter((id) => !STEPS.some((s) => s.id === id))
  if (unknown.length > 0) {
    throw new Error(
      `unknown step${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}\n` +
        `available: ${STEPS.map((s) => s.id).join(', ')}`,
    )
  }

  // Filtered, never reordered: the RFQs need the buyer the order step creates,
  // and `pnpm demo rfqs orders` must not mean something different.
  const steps = asked.length > 0 ? STEPS.filter((s) => asked.includes(s.id)) : STEPS

  const ctx = await resolveCtx()

  for (const step of steps) {
    const report = await step.run(ctx)
    console.log(`[demo] ${step.id}: ${report}`)
  }
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(`[demo] ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  },
)
