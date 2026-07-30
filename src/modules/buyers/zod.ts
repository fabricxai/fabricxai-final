/**
 * Payloads for 1.1, including every `pending_changes` payload.
 *
 * `buyerTermsPayload` has no defaults on `aqlLevel` or `tolerancePct`. Both are read by
 * downstream gates — 7.1's final inspection and 8.1's shipping band — and a default here
 * would be an agreement the buyer never made, applied to every shipment.
 */
import { z } from 'zod'

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
export const pct = z.string().regex(/^\d{1,3}(\.\d{1,2})?$/, 'expected a percentage')

export const leadPayload = z.object({
  source: z.enum(['fair', 'referral', 'buying_house', 'inbound', 'other']),
  companyName: z.string().min(1).max(200),
  country: z.string().max(80).optional(),
  website: z.string().max(300).optional(),
  agentId: z.string().uuid().optional(),
  notes: z.string().max(4000).optional(),
})

export const logActivityPayload = z.object({
  leadId: z.string().uuid(),
  kind: z.enum(['call', 'email', 'meeting', 'note']),
  summary: z.string().min(1).max(2000),
  occurredAt: isoDate,
})

export const buyerContactPayload = z.object({
  buyerId: z.string().uuid(),
  name: z.string().min(1).max(200),
  role: z.enum(['merchandiser', 'qa', 'sourcing', 'finance', 'other']),
  email: z.email().optional(),
  phone: z.string().max(60).optional(),
  isPrimary: z.boolean().default(false),
})

export const buyerTermsPayload = z.object({
  buyerId: z.string().uuid(),
  validFrom: isoDate,
  payment: z.enum(['lc', 'tt', 'dp']),
  incoterm: z.string().min(1).max(20),
  /** No default: 8.1 reads this as the LC shipping band. */
  tolerancePct: pct,
  /** No default: 7.1 reads this as the final-inspection AQL level. */
  aqlLevel: z.string().min(1).max(10),
  minorAqlLevel: z.string().min(1).max(10).optional(),
  nominatedBanks: z.array(z.string().min(1)).default([]),
  nominatedForwarders: z.array(z.string().min(1)).default([]),
  nominatedLabs: z.array(z.string().min(1)).default([]),
})

/**
 * A whole manual's worth of requirements as ONE draft.
 *
 * The brief is explicit that the extraction produces "one pending_change containing the
 * batch". A reviewer reading a buyer manual approves the extraction as a whole; forty
 * separate approvals is a queue nobody clears, and a half-approved manual is worse than an
 * unextracted one.
 */
export const buyerRequirementsBatch = z.object({
  buyerId: z.string().uuid(),
  sourceDocumentId: z.string().uuid().optional(),
  requirements: z
    .array(
      z.object({
        category: z.string().min(1).max(80),
        text: z.string().min(1).max(4000),
        /** The page it came from, so a disputed requirement can be checked. */
        sourcePage: z.number().int().min(1).optional(),
      }),
    )
    .min(1, 'an empty extraction is not a draft'),
})

export const BUYERS_ZOD_MAP = {
  buyer_terms: buyerTermsPayload,
  buyer_requirements: buyerRequirementsBatch,
} as const

export type LeadPayload = z.infer<typeof leadPayload>
export type BuyerTermsPayload = z.infer<typeof buyerTermsPayload>
