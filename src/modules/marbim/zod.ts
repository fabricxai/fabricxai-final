/**
 * Payloads for X.2.
 *
 * `extractorVersion` is required and has no default. The correction rate that decides
 * whether an extractor is worth trusting groups on it, and a version that defaults to
 * something would silently pool a rewritten extractor's results with its predecessor's.
 */
import { z } from 'zod'

export const extractionRequest = z
  .object({
    moduleId: z.string().min(1),
    targetTable: z.string().min(1),
    zodSchemaKey: z.string().min(1),

    extractorName: z.string().min(1).max(80),
    /** Required. See the note above. */
    extractorVersion: z.string().min(1).max(40),

    sourceDocumentId: z.string().uuid().optional(),
    sourceText: z.string().max(200_000).optional(),
  })
  .refine((r) => r.sourceDocumentId !== undefined || r.sourceText !== undefined, {
    message: 'an extraction needs a document or some text to read',
    path: ['sourceText'],
  })

export const chatRequest = z.object({
  conversationId: z.string().uuid(),
  turnIndex: z.number().int().min(0),
  question: z.string().min(1).max(8000),
  moduleIds: z.array(z.string().min(1)).default([]),
  /** Record ids from the client. Never a companyId — `scopeToolDefaults` drops it. */
  scope: z.record(z.string(), z.string()).optional(),
})

export const MARBIM_ZOD_MAP = {} as const

export type ExtractionRequest = z.infer<typeof extractionRequest>
