/**
 * Inputs for 11.2's read endpoints and tools.
 *
 * There are no pending payloads: this module registers no pending targets, because nothing
 * it holds is a fact somebody could approve.
 */
import { z } from 'zod'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')

export const windowInput = z
  .object({ from: isoDate, to: isoDate })
  .refine((w) => w.from <= w.to, { message: 'the window ends before it starts' })

export const otdToolInput = windowInput
export const exceptionsToolInput = z.object({ now: z.string().optional() })

export const savedReportInput = z.object({
  name: z.string().min(1),
  kind: z.string().min(1),
  params: z.record(z.string(), z.unknown()).default({}),
})
