/**
 * FabricXAI Fashion — the role-testing tenant.
 *
 * `pnpm tsx scripts/seed-fabricxai-fashion.ts [--reset-passwords]`
 *
 * A dev/staging tenant whose purpose is trying every module's actions as every role the
 * system has. It creates the company and ONE login per `role_name` enum value — all
 * seventeen, where `pnpm seed` covers only eight — then leaves the data to the tools that
 * already exist:
 *
 *   1. pnpm tsx scripts/seed-fabricxai-fashion.ts
 *   2. SEED_COMPANY_ID=fabf0000-0000-4000-8000-000000000001 pnpm seed
 *   3. DEMO_COMPANY_ID=fabf0000-0000-4000-8000-000000000001 \
 *      DEMO_USER_ID=fxf-owner pnpm demo
 *   4. SEED_COMPANY_ID=fabf0000-0000-4000-8000-000000000001 pnpm seed   # again — see below
 *
 * The seed runs twice because its order-dependent slices (sampling, cutting, production,
 * shipment, finance, store requisitions, commercial LC/UD) bail quietly when the tenant has
 * no order, and the order comes from `pnpm demo`. Seed → demo → seed fills everything.
 *
 * ## Why the company id starts `fabf0000`
 *
 * The seed derives every user id and email from `companyId.slice(0, 8)`. The default seed
 * company's prefix is `00000000` — an id sharing it would make the seed compute the SAME
 * addresses as Seed Apparels' users and silently cross-link one set of people into two
 * tenants. `fabf0000` keeps this tenant's derived identities its own.
 *
 * ## Credentials
 *
 * Every login shares `SEED_PASSWORD` (identity.ts) — switching roles mid-walkthrough should
 * not mean looking up seventeen passwords. Written once; `--reset-passwords` is the explicit
 * override, and nothing is written at all under NODE_ENV=production (same stance as
 * `seedCredential`). Deliberately different from seed-day0.ts, whose random printed-once
 * passwords are right for a LIVE factory and wrong for a fixture everybody signs into daily.
 *
 * Idempotent throughout: deterministic ids, upserts on natural keys. Re-run freely.
 */
import 'dotenv/config'

import { hashPassword } from 'better-auth/crypto'
import { and, eq, sql } from 'drizzle-orm'

import { createDirectClient, createDirectDb } from '@/db/direct'
import * as schema from '@/db/schema'
import { SEED_PASSWORD } from '@/db/seed/identity'
import type { Role } from '@/modules/core/ctx'

/** Fixed so the fill commands in the header are copy-pasteable without a lookup. */
export const FXF_COMPANY_ID = 'fabf0000-0000-4000-8000-000000000001'

const COMPANY = {
  name: 'FabricXAI Fashion',
  legalName: 'FabricXAI Fashion Ltd.',
  slug: 'fabricxai-fashion',
  address: 'Plot 7, DEPZ Extension Area, Ashulia, Savar, Dhaka',
  bondLicence: 'BL-2024-1107',
  // knit-composite turns on the widest module surface (UD workbench, dye house) —
  // right for a tenant meant to reach every screen.
  factoryType: 'knit-composite' as const,
}

/**
 * One person per enum value — the whole point of this tenant. Floor roles get `bn` like the
 * real floor does; everyone signs in as `<role>@fabricxai-fashion.test`.
 */
const PEOPLE: readonly { role: Role; name: string; dept: string; locale: 'en' | 'bn' }[] = [
  { role: 'owner', name: 'Kamrul Hasan', dept: 'Management', locale: 'en' },
  { role: 'admin', name: 'Sultana Razia', dept: 'Management', locale: 'en' },
  { role: 'merchandiser', name: 'Tanjila Akter', dept: 'Merchandising', locale: 'en' },
  { role: 'commercial', name: 'Rafiqul Islam', dept: 'Commercial', locale: 'en' },
  { role: 'planner', name: 'Nazmul Karim', dept: 'Planning', locale: 'en' },
  { role: 'store', name: 'Abdul Kader', dept: 'Store', locale: 'bn' },
  { role: 'procurement', name: 'Sharmin Nahar', dept: 'Procurement', locale: 'en' },
  { role: 'cutting', name: 'Rafiq Hossain', dept: 'Cutting', locale: 'bn' },
  { role: 'production', name: 'Shilpi Begum', dept: 'Production', locale: 'bn' },
  { role: 'quality', name: 'Mitu Rani', dept: 'Quality', locale: 'bn' },
  { role: 'shipment', name: 'Jahid Hasan', dept: 'Finishing & Shipment', locale: 'en' },
  { role: 'maintenance', name: 'Sabbir Khan', dept: 'Maintenance', locale: 'bn' },
  { role: 'hr', name: 'Farzana Yasmin', dept: 'HR', locale: 'en' },
  { role: 'compliance', name: 'Rumi Chowdhury', dept: 'Compliance', locale: 'en' },
  { role: 'finance', name: 'Salma Khatun', dept: 'Accounts', locale: 'en' },
  { role: 'member', name: 'Arif Mahmud', dept: 'General', locale: 'en' },
  { role: 'viewer', name: 'Guest Viewer', dept: 'External', locale: 'en' },
]

export function fxfEmail(role: Role): string {
  return `${role}@fabricxai-fashion.test`
}

/**
 * Module-level approve-inbox defaults, so a propose() from ANY module routes to a human
 * instead of falling through with no matching rule. Priority 100 — below any specific rule
 * a test adds later, and no collision with the core slice's rules (those match module
 * 'core' only).
 */
const DEFAULT_RULE_MODULES = [
  'buyers', 'commercial', 'compliance', 'costing', 'cutting', 'finance', 'maintenance',
  'orders', 'planning', 'procurement', 'production', 'quality', 'rfq', 'sampling',
  'shipment', 'store', 'workforce',
]

const RESET_PASSWORDS = process.argv.includes('--reset-passwords')

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('a shared-password fixture tenant has no business in production')
  }

  const client = createDirectClient()
  const db = createDirectDb(client)
  const tally: string[] = []

  try {
    // ── company ──────────────────────────────────────────────────────────────
    const [found] = await db
      .select({ id: schema.companies.id })
      .from(schema.companies)
      .where(eq(schema.companies.id, FXF_COMPANY_ID))

    await db
      .insert(schema.companies)
      .values({
        id: FXF_COMPANY_ID,
        name: COMPANY.name,
        legalName: COMPANY.legalName,
        slug: COMPANY.slug,
        bondedLicenseNo: COMPANY.bondLicence,
        address: { line1: COMPANY.address, city: 'Savar', district: 'Dhaka', country: 'BD' },
      })
      .onConflictDoUpdate({
        target: schema.companies.id,
        set: { name: COMPANY.name, legalName: COMPANY.legalName, updatedAt: new Date() },
      })
    tally.push(`company ${found ? 'updated' : 'created'} · ${COMPANY.name}`)

    await db
      .insert(schema.companyProfiles)
      .values({
        companyId: FXF_COMPANY_ID,
        legalName: COMPANY.legalName,
        addressLines: [COMPANY.address],
        country: 'BD',
        bondLicenceNo: COMPANY.bondLicence,
        factoryType: COMPANY.factoryType,
        timezone: 'Asia/Dhaka',
        locale: 'en',
        baseCurrency: 'USD',
      })
      .onConflictDoUpdate({
        target: schema.companyProfiles.companyId,
        set: { legalName: COMPANY.legalName, factoryType: COMPANY.factoryType },
      })
    tally.push(`company_profile · factory_type=${COMPANY.factoryType}`)

    // ── people: one login per role ───────────────────────────────────────────
    let created = 0
    let reissued = 0
    for (const person of PEOPLE) {
      const userId = `fxf-${person.role}`
      const email = fxfEmail(person.role)

      // emailVerified on purpose: the .test domain receives no mail and verification
      // gates sign-in.
      await db
        .insert(schema.users)
        .values({ id: userId, email, name: person.name, emailVerified: true })
        .onConflictDoUpdate({ target: schema.users.id, set: { name: person.name } })

      await db
        .insert(schema.profiles)
        .values({
          userId,
          fullName: person.name,
          department: person.dept,
          locale: person.locale,
          defaultCompanyId: FXF_COMPANY_ID,
        })
        .onConflictDoUpdate({
          target: schema.profiles.userId,
          set: { fullName: person.name, defaultCompanyId: FXF_COMPANY_ID },
        })

      // Scope left empty on purpose: `roles.scope` narrows what a role SEES, and a tenant
      // built for reaching every screen must not hide rows from its own testers.
      await db
        .insert(schema.roles)
        .values({ companyId: FXF_COMPANY_ID, userId, role: person.role })
        .onConflictDoUpdate({
          target: [schema.roles.companyId, schema.roles.userId, schema.roles.role],
          set: { revokedAt: null },
        })

      const [cred] = await db
        .select({ id: schema.accounts.id })
        .from(schema.accounts)
        .where(
          and(eq(schema.accounts.userId, userId), eq(schema.accounts.providerId, 'credential')),
        )
      if (!cred) {
        await db.insert(schema.accounts).values({
          id: `fxf-cred-${userId}`,
          userId,
          accountId: userId,
          providerId: 'credential',
          password: await hashPassword(SEED_PASSWORD),
        })
        created += 1
      } else if (RESET_PASSWORDS) {
        await db
          .update(schema.accounts)
          .set({ password: await hashPassword(SEED_PASSWORD), updatedAt: new Date() })
          .where(eq(schema.accounts.id, cred.id))
        reissued += 1
      }
    }
    tally.push(`people · ${PEOPLE.length} roles, ${created} new credentials, ${reissued} reset`)

    // ── approve-inbox defaults ───────────────────────────────────────────────
    let rules = 0
    for (const moduleId of DEFAULT_RULE_MODULES) {
      // No unique index covers (module, target, operation) — match, then write.
      const existing = await db
        .select({ id: schema.approvalRules.id })
        .from(schema.approvalRules)
        .where(
          and(
            eq(schema.approvalRules.companyId, FXF_COMPANY_ID),
            eq(schema.approvalRules.moduleId, moduleId),
            sql`${schema.approvalRules.targetTable} is null`,
            sql`${schema.approvalRules.operation} is null`,
          ),
        )
      if (existing[0]) {
        await db
          .update(schema.approvalRules)
          .set({ requiredRoles: ['owner', 'admin'], isActive: true, updatedAt: new Date() })
          .where(eq(schema.approvalRules.id, existing[0].id))
      } else {
        await db.insert(schema.approvalRules).values({
          companyId: FXF_COMPANY_ID,
          moduleId,
          targetTable: null,
          operation: null,
          requiredRoles: ['owner', 'admin'],
          approvalsRequired: 1,
          autoApprove: false,
          priority: 100,
        })
      }
      rules += 1
    }
    tally.push(`approval_rules · ${rules} module defaults (owner/admin)`)

    // A consumption template so the costing studio has a master to compute from — the one
    // reference row provisionCompany does not cover.
    await db
      .insert(schema.consumptionTemplates)
      .values({
        companyId: FXF_COMPANY_ID,
        productType: 'polo-180gsm',
        params: { fabricGsm: 180, consumptionGramsPerPc: 255, unit: 'g/pc' },
      })
      .onConflictDoUpdate({
        target: [schema.consumptionTemplates.companyId, schema.consumptionTemplates.productType],
        set: { updatedAt: new Date() },
      })
    tally.push('consumption_template · polo-180gsm')

    // ── starting reference data ──────────────────────────────────────────────
    // The same call signup makes: TNA templates, RFQ loss reasons, defect codes. Idempotent
    // and non-destructive by contract, so a re-run cannot clobber a customised set.
    const { provisionCompany } = await import('@/lib/provisioning')
    const provisioned = await provisionCompany({
      companyId: FXF_COMPANY_ID,
      userId: null,
      roles: ['owner'],
      system: true,
    })
    for (const step of provisioned.steps) {
      tally.push(
        step.ok
          ? `${step.step} · ${step.created} new, ${step.existing} existing`
          : `${step.step} · FAILED: ${step.error}`,
      )
    }

    // ── report ───────────────────────────────────────────────────────────────
    console.log(`\n[fxf] FabricXAI Fashion · ${FXF_COMPANY_ID}\n`)
    for (const line of tally) console.log(`  ${line}`)
    console.log(`\n[fxf] Sign in as <role>@fabricxai-fashion.test — any of the 17 role names.`)
    console.log(`[fxf] Shared password: the seed password in src/db/seed/identity.ts.`)
    console.log(`[fxf] Now fill it (seed → demo → seed) — commands in this file's header.\n`)
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error('[fxf] failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
