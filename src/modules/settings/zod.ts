/**
 * Payloads for X.3.
 *
 * There is deliberately no pending_changes payload in this module. A drafted policy is a
 * drafted control: a model proposing a lower margin floor, approved by somebody who did not
 * realise what it governs, is exactly the failure the trust layer exists to prevent. Policy
 * is edited by an admin, directly and audited.
 */
import { z } from 'zod'

export const companyProfilePayload = z.object({
  legalName: z.string().min(1).max(200),
  addressLines: z.array(z.string().min(1)).max(6).default([]),
  country: z.string().length(2).default('BD'),

  /** Bangladeshi tax identifiers. They appear on export documents by law. */
  binNumber: z.string().max(40).optional(),
  tinNumber: z.string().max(40).optional(),
  /** Bonded warehouse licence — 2.2's UDs are drawn against it. */
  bondLicenceNo: z.string().max(60).optional(),

  /** Decides which modules exist for this unit — see the schema note. */
  factoryType: z.enum(['woven', 'knit', 'knit-composite']).default('woven'),

  timezone: z.string().min(1).max(60).default('Asia/Dhaka'),
  locale: z.string().min(2).max(10).default('en'),
  baseCurrency: z.string().length(3).default('USD'),
  localCurrency: z.string().length(3).default('BDT'),
  logoDocumentId: z.string().uuid().optional(),
})

export const setPolicyPayload = z.object({
  moduleId: z.string().min(1),
  /** Values are unchecked HERE; the registry validates them against the module's schema. */
  patch: z.record(z.string().min(1), z.unknown()),
})

export const grantRolePayload = z.object({
  userId: z.string().min(1),
  role: z.string().min(1),
  scope: z.record(z.string(), z.unknown()).optional(),
})

export type CompanyProfilePayload = z.infer<typeof companyProfilePayload>
