/**
 * 1.1 Buyer Lead Desk — service layer ⚖
 *
 * Where a name at a trade fair becomes an account the factory ships to.
 *
 * The operation that matters most is `convertLead`, and it is idempotent by construction:
 * conversion carries contacts and activity history across and closes the lead, and running
 * it twice must not produce two buyers. A duplicate buyer splits the order history and the
 * scorecards built on it, which is the exact failure `detectDuplicates` exists to prevent
 * at the other end.
 *
 * `buyer_terms` is versioned and never edited. Every downstream gate reads from it — 8.1's
 * shipping tolerance, 7.1's AQL level — so editing a version in place would retroactively
 * re-govern orders already shipped under the old one.
 */
import { and, desc, eq, isNotNull, ne, sql } from 'drizzle-orm'

import { recordChange, registerAuditedTables } from '../core/audit'
import type { AnyCtx, RequestCtx } from '../core/ctx'
import { AppError, conflict, notFound } from '../core/errors'
import { emit } from '../core/outbox'
import { withTenantRead, withTenantTx, type TenantDb } from '../core/tenancy'

import {
  BuyersError,
  leadStageMachine,
  normalizeCompanyName,
  normalizeDomain,
  quietDays,
  termsInForceOn,
  type LeadStage,
} from './buyers'
import { BUYERS_EVENTS } from './events'
import {
  agents,
  buyerContacts,
  buyerRequirements,
  buyers,
  buyerTerms,
  leadActivities,
  leads,
} from './schema'
import { buyerTermsPayload, leadPayload, logActivityPayload } from './zod'

/** ⚖ — terms decide an AQL level and a shipping tolerance on every order. */
registerAuditedTables('buyer_terms')

/** Company policy. Owned by Settings (X.3); passed in until that module exists. */
export interface BuyerDeskPolicy {
  /** Days without contact before a lead is flagged quiet. */
  quietAfterDays: number
  /** Trigram similarity at or above which two names are candidate duplicates. */
  duplicateThreshold: number
}

function wrapBuyersError<T>(run: () => T): T {
  try {
    return run()
  } catch (error) {
    if (error instanceof BuyersError) {
      throw new AppError('validation_failed', 'buyers.errors.invalid', { reason: error.message })
    }
    throw error
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Duplicate detection
// ─────────────────────────────────────────────────────────────────────────────

export interface DuplicateCandidate {
  kind: 'buyer' | 'lead'
  id: string
  name: string
  similarity: number
  /** True when the DOMAIN matched, which is a far stronger signal than a name score. */
  domainMatch: boolean
}

/**
 * Who this might already be (brief: "trigram similarity ≥ 0.6 returns candidates; UI
 * confirms").
 *
 * Returns candidates and never blocks. Two genuinely different buyers can have similar
 * names — "Fashion Forward" and "Fashion Forward Asia" may be unrelated — and a system that
 * refused the second would be worked around by typing a deliberate typo, which is worse
 * than the duplicate.
 *
 * A domain match is reported even below the name threshold: the same website is the
 * strongest signal there is, and two companies sharing one are the same company.
 */
export async function detectDuplicates(
  ctx: AnyCtx,
  input: { name: string; website?: string | null },
  policy: BuyerDeskPolicy,
): Promise<DuplicateCandidate[]> {
  const normalized = wrapBuyersError(() => normalizeCompanyName(input.name))
  const domain = normalizeDomain(input.website)

  return withTenantRead(ctx, async (tx) => {
    const threshold = policy.duplicateThreshold

    const buyerRows = await tx
      .select({
        id: buyers.id,
        name: buyers.name,
        similarity: sql<number>`similarity(${buyers.normalizedName}, ${normalized})`,
        domainMatch: sql<boolean>`${buyers.normalizedDomain} is not null and ${buyers.normalizedDomain} = ${domain}`,
      })
      .from(buyers)
      .where(
        sql`(${buyers.normalizedName} is not null and similarity(${buyers.normalizedName}, ${normalized}) >= ${threshold})
            or (${domain}::text is not null and ${buyers.normalizedDomain} = ${domain})`,
      )
      .orderBy(sql`similarity(${buyers.normalizedName}, ${normalized}) desc`)
      .limit(10)

    const leadRows = await tx
      .select({
        id: leads.id,
        name: leads.companyName,
        similarity: sql<number>`similarity(${leads.normalizedName}, ${normalized})`,
        domainMatch: sql<boolean>`${leads.normalizedDomain} is not null and ${leads.normalizedDomain} = ${domain}`,
      })
      .from(leads)
      .where(
        and(
          // A converted lead is already represented by its buyer; showing both would be
          // two candidates for one company.
          ne(leads.stage, 'won'),
          sql`(${leads.normalizedName} is not null and similarity(${leads.normalizedName}, ${normalized}) >= ${threshold})
              or (${domain}::text is not null and ${leads.normalizedDomain} = ${domain})`,
        ),
      )
      .orderBy(sql`similarity(${leads.normalizedName}, ${normalized}) desc`)
      .limit(10)

    const all: DuplicateCandidate[] = [
      ...buyerRows.map((row) => ({ kind: 'buyer' as const, ...row })),
      ...leadRows.map((row) => ({ kind: 'lead' as const, ...row })),
    ]

    // Domain matches first: a shared website beats any name score.
    return all.sort((a, b) => {
      if (a.domainMatch !== b.domainMatch) return a.domainMatch ? -1 : 1
      return b.similarity - a.similarity
    })
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Leads
// ─────────────────────────────────────────────────────────────────────────────

export async function createLead(
  ctx: RequestCtx,
  input: unknown,
): Promise<{ leadId: string }> {
  const payload = leadPayload.parse(input)

  return withTenantTx(ctx, async (tx) => {
    const [row] = await tx
      .insert(leads)
      .values({
        companyId: ctx.companyId,
        source: payload.source,
        companyName: payload.companyName,
        country: payload.country ?? null,
        website: payload.website ?? null,
        // Stored so the trigram index has something to search.
        normalizedName: wrapBuyersError(() => normalizeCompanyName(payload.companyName)),
        normalizedDomain: normalizeDomain(payload.website),
        agentId: payload.agentId ?? null,
        notes: payload.notes ?? null,
        createdBy: ctx.userId,
      })
      .returning({ id: leads.id })

    if (!row) throw new Error('leads insert returned nothing')

    await emit(ctx, tx, {
      eventName: BUYERS_EVENTS.leadCreated,
      payload: { leadId: row.id, companyName: payload.companyName, source: payload.source },
      aggregateTable: 'leads',
      aggregateId: row.id,
    })

    return { leadId: row.id }
  })
}

export async function logActivity(
  ctx: RequestCtx,
  input: unknown,
): Promise<{ activityId: string }> {
  const payload = logActivityPayload.parse(input)

  return withTenantTx(ctx, async (tx) => {
    const [lead] = await tx.select({ id: leads.id }).from(leads).where(eq(leads.id, payload.leadId))
    if (!lead) throw notFound('buyers.errors.lead_not_found', { leadId: payload.leadId })

    const [row] = await tx
      .insert(leadActivities)
      .values({
        companyId: ctx.companyId,
        leadId: payload.leadId,
        kind: payload.kind,
        summary: payload.summary,
        occurredAt: payload.occurredAt,
        createdBy: ctx.userId,
      })
      .returning({ id: leadActivities.id })

    if (!row) throw new Error('lead_activities insert returned nothing')
    return { activityId: row.id }
  })
}

export async function setLeadStage(
  ctx: RequestCtx,
  input: { leadId: string; stage: LeadStage; lostReason?: string },
): Promise<void> {
  await withTenantTx(ctx, async (tx) => {
    const [lead] = await tx.select().from(leads).where(eq(leads.id, input.leadId)).for('update')
    if (!lead) throw notFound('buyers.errors.lead_not_found', { leadId: input.leadId })

    leadStageMachine.assert(lead.stage as LeadStage, input.stage)

    if (input.stage === 'lost' && !input.lostReason) {
      // A loss with no reason is a loss nobody learns from, and the desk's whole value is
      // the taxonomy of why buyers went elsewhere.
      throw new AppError('validation_failed', 'buyers.errors.lost_needs_reason', {})
    }

    await tx
      .update(leads)
      .set({
        stage: input.stage,
        lostReason: input.stage === 'lost' ? input.lostReason! : lead.lostReason,
        updatedAt: new Date(),
      })
      .where(eq(leads.id, lead.id))

    await emit(ctx, tx, {
      eventName: BUYERS_EVENTS.leadStageChanged,
      payload: { leadId: lead.id, from: lead.stage, to: input.stage },
      aggregateTable: 'leads',
      aggregateId: lead.id,
    })
  })
}

export interface ConversionResult {
  buyerId: string
  leadId: string
  /** False when the lead had already been converted — the idempotent path. */
  created: boolean
}

/**
 * Turn a lead into a buyer (brief: "creates buyer + carries contacts/activities, closes
 * lead as won. Idempotent").
 *
 * Idempotency is structural, not a check: `leads.converted_buyer_id` is the record of
 * having converted, and a second call returns the buyer it already made. Two buyers for one
 * company splits the order history and every scorecard built on it — the same failure
 * `detectDuplicates` exists to prevent at the other end.
 */
export async function convertLead(
  ctx: RequestCtx,
  input: { leadId: string; code: string },
): Promise<ConversionResult> {
  return withTenantTx(ctx, async (tx) => {
    const [lead] = await tx.select().from(leads).where(eq(leads.id, input.leadId)).for('update')
    if (!lead) throw notFound('buyers.errors.lead_not_found', { leadId: input.leadId })

    // Already converted. Return what it became rather than making a second buyer.
    if (lead.convertedBuyerId) {
      return { buyerId: lead.convertedBuyerId, leadId: lead.id, created: false }
    }

    if (lead.stage === 'lost') {
      // A lost lead can be reopened and then converted; converting it directly would skip
      // the conversation that changed their mind.
      throw conflict('buyers.errors.lead_is_lost', { leadId: lead.id })
    }

    const [buyer] = await tx
      .insert(buyers)
      .values({
        companyId: ctx.companyId,
        code: input.code,
        name: lead.companyName,
        country: lead.country,
        website: lead.website,
        normalizedName: lead.normalizedName,
        normalizedDomain: lead.normalizedDomain,
        createdBy: ctx.userId,
      })
      .returning({ id: buyers.id })

    if (!buyer) throw new Error('buyers insert returned nothing')

    await tx
      .update(leads)
      .set({ stage: 'won', convertedBuyerId: buyer.id, updatedAt: new Date() })
      .where(eq(leads.id, lead.id))

    await emit(ctx, tx, {
      eventName: BUYERS_EVENTS.leadConverted,
      payload: { leadId: lead.id, buyerId: buyer.id, name: lead.companyName },
      aggregateTable: 'buyers',
      aggregateId: buyer.id,
    })

    // The activity history stays on the lead and is reachable through
    // `leads.converted_buyer_id` — copying it would duplicate a record of conversations
    // that happened once.
    return { buyerId: buyer.id, leadId: lead.id, created: true }
  })
}

/** Leads nobody has spoken to in a while (brief §Events/jobs). */
export async function quietLeads(
  ctx: AnyCtx,
  input: { today: string },
  policy: BuyerDeskPolicy,
): Promise<{ leadId: string; companyName: string; stage: string; days: number }[]> {
  return withTenantRead(ctx, async (tx) => {
    // A left join and an aggregate rather than a correlated subquery: drizzle does not
    // render a table reference inside a `sql` fragment in the select list, and the silent
    // result is every lead looking freshly contacted.
    const rows = await tx
      .select({
        id: leads.id,
        companyName: leads.companyName,
        stage: leads.stage,
        createdAt: leads.createdAt,
        lastActivityAt: sql<string | null>`max(${leadActivities.occurredAt})`,
      })
      .from(leads)
      .leftJoin(leadActivities, eq(leadActivities.leadId, leads.id))
      // A won or lost lead is not waiting on anybody.
      .where(sql`${leads.stage} not in ('won', 'lost')`)
      .groupBy(leads.id, leads.companyName, leads.stage, leads.createdAt)

    const out: { leadId: string; companyName: string; stage: string; days: number }[] = []

    for (const row of rows) {
      const days = wrapBuyersError(() =>
        quietDays({
          lastActivityAt: row.lastActivityAt,
          createdAt: row.createdAt.toISOString().slice(0, 10),
          today: input.today,
        }),
      )
      if (days < policy.quietAfterDays) continue
      out.push({ leadId: row.id, companyName: row.companyName, stage: row.stage, days })
    }

    // Quietest first — the one closest to being forgotten.
    return out.sort((a, b) => b.days - a.days)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Terms ⚖
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Add a new version of a buyer's terms ⚖.
 *
 * A NEW ROW, always. Terms are read by 7.1's AQL gate and 8.1's tolerance band, so editing
 * a version in place would retroactively re-govern orders already shipped under it.
 *
 * Backdating before the newest existing version is refused: it would silently change which
 * terms governed orders taken in between, and the whole point of `valid_from` is that the
 * answer to "what applied on the day" does not move.
 */
export async function upsertTerms(
  ctx: RequestCtx,
  input: unknown,
): Promise<{ termsId: string; version: number }> {
  const payload = buyerTermsPayload.parse(input)

  return withTenantTx(ctx, async (tx) => {
    const [buyer] = await tx
      .select({ id: buyers.id })
      .from(buyers)
      .where(eq(buyers.id, payload.buyerId))
    if (!buyer) throw notFound('buyers.errors.buyer_not_found', { buyerId: payload.buyerId })

    const [latest] = await tx
      .select({ version: buyerTerms.version, validFrom: buyerTerms.validFrom })
      .from(buyerTerms)
      .where(eq(buyerTerms.buyerId, payload.buyerId))
      .orderBy(desc(buyerTerms.version))
      .limit(1)

    if (latest && payload.validFrom <= latest.validFrom) {
      throw new AppError('validation_failed', 'buyers.errors.terms_backdated', {
        validFrom: payload.validFrom,
        latestValidFrom: latest.validFrom,
      })
    }

    const version = (latest?.version ?? 0) + 1

    const [row] = await tx
      .insert(buyerTerms)
      .values({
        companyId: ctx.companyId,
        buyerId: payload.buyerId,
        version,
        validFrom: payload.validFrom,
        payment: payload.payment,
        incoterm: payload.incoterm,
        tolerancePct: payload.tolerancePct,
        aqlLevel: payload.aqlLevel,
        minorAqlLevel: payload.minorAqlLevel ?? null,
        nominatedBanks: payload.nominatedBanks,
        nominatedForwarders: payload.nominatedForwarders,
        nominatedLabs: payload.nominatedLabs,
        createdBy: ctx.userId,
      })
      .returning({ id: buyerTerms.id })

    if (!row) throw new Error('buyer_terms insert returned nothing')

    await recordChange(ctx, tx, {
      action: 'insert',
      targetTable: 'buyer_terms',
      targetId: row.id,
      after: {
        buyerId: payload.buyerId,
        version,
        validFrom: payload.validFrom,
        aqlLevel: payload.aqlLevel,
        tolerancePct: payload.tolerancePct,
      },
    })

    await emit(ctx, tx, {
      eventName: BUYERS_EVENTS.termsVersioned,
      payload: { buyerId: payload.buyerId, termsId: row.id, version, validFrom: payload.validFrom },
      aggregateTable: 'buyer_terms',
      aggregateId: row.id,
    })

    return { termsId: row.id, version }
  })
}

/**
 * The terms that governed a buyer on a given date.
 *
 * The read 7.1 and 8.1 should use. Passing today's date is almost always wrong for anything
 * about an existing order — use the date the order was taken.
 */
export async function termsFor(
  ctx: AnyCtx,
  input: { buyerId: string; onDate: string },
): Promise<typeof buyerTerms.$inferSelect | null> {
  return withTenantRead(ctx, async (tx) => {
    const versions = await tx
      .select()
      .from(buyerTerms)
      .where(eq(buyerTerms.buyerId, input.buyerId))
      .orderBy(desc(buyerTerms.validFrom))

    const match = wrapBuyersError(() => termsInForceOn(versions, input.onDate))
    return match ?? null
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Commit handler for extracted requirements
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Commit an approved batch of buyer requirements (registered in `register.ts`).
 *
 * The brief asks for one pending_change containing the BATCH, not one per requirement: a
 * reviewer reading a buyer manual approves the extraction as a whole, and forty separate
 * approvals is a queue nobody clears.
 */
export async function commitBuyerRequirements(
  ctx: AnyCtx,
  tx: TenantDb,
  input: { payload: Record<string, unknown> },
): Promise<{ rowId: string; after: Record<string, unknown> }> {
  const { buyerRequirementsBatch } = await import('./zod')
  const payload = buyerRequirementsBatch.parse(input.payload)

  const inserted: string[] = []
  for (const requirement of payload.requirements) {
    const [row] = await tx
      .insert(buyerRequirements)
      .values({
        companyId: ctx.companyId,
        buyerId: payload.buyerId,
        category: requirement.category,
        text: requirement.text,
        sourceDocumentId: payload.sourceDocumentId ?? null,
        sourcePage: requirement.sourcePage ?? null,
        createdBy: ctx.userId,
      })
      .returning({ id: buyerRequirements.id })

    if (!row) throw new Error('buyer_requirements insert returned nothing')
    inserted.push(row.id)
  }

  return {
    rowId: payload.buyerId,
    after: { buyerId: payload.buyerId, requirements: inserted.length, ids: inserted },
  }
}

/** Agents, for the lead form's dropdown and the commission report. */
export async function listAgents(ctx: AnyCtx): Promise<(typeof agents.$inferSelect)[]> {
  return withTenantRead(ctx, async (tx) =>
    tx.select().from(agents).where(eq(agents.isActive, true)).orderBy(agents.name),
  )
}

/** A buyer's primary contact — who merchandising actually emails. */
export async function primaryContact(
  ctx: AnyCtx,
  input: { buyerId: string },
): Promise<typeof buyerContacts.$inferSelect | null> {
  return withTenantRead(ctx, async (tx) => {
    const [row] = await tx
      .select()
      .from(buyerContacts)
      .where(and(eq(buyerContacts.buyerId, input.buyerId), eq(buyerContacts.isPrimary, true)))
    return row ?? null
  })
}

export { conflict, isNotNull }
