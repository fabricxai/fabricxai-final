/**
 * Payloads for 7.1, including every `pending_changes` payload.
 *
 * `inlineCheckPayload` is shaped for the brief's "≤3-tap" capture: line, operation, and a
 * list of tapped defect codes. Everything else on the row — the date, the severity of each
 * code, the defect total — is derived server-side, because a supervisor standing at a
 * sewing machine should not be classifying defects, and two supervisors must not classify
 * the same defect differently.
 */
import { z } from 'zod'

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
export const decimal = (max = 12) =>
  z.string().regex(new RegExp(`^\\d{1,${max}}(\\.\\d{1,2})?$`), 'expected a positive decimal')

export const defectCodePayload = z.object({
  category: z.string().min(1).max(60),
  code: z.string().min(1).max(60),
  label: z.string().min(1).max(200),
  severity: z.enum(['critical', 'major', 'minor']),
})

/** The tap payload. Three taps: line (preselected), operation, defect. */
export const inlineCheckPayload = z.object({
  lineId: z.string().uuid(),
  orderId: z.string().uuid().optional(),
  operation: z.string().min(1).max(120),
  operatorId: z.string().uuid().optional(),
  checkedQty: z.number().int().min(1),
  defects: z
    .array(z.object({ code: z.string().min(1), count: z.number().int().min(1) }))
    .default([]),
  checkedOn: isoDate.optional(),
  occurredAt: z.string().optional(),
  offlineKey: z.string().min(1).max(120).optional(),
})

export const fabricInspectionPayload = z.object({
  grnId: z.string().uuid(),
  rollId: z.string().uuid().optional(),
  /** Defect counts by penalty band. A band-3 defect is worth 3 points. */
  points4: z.object({
    1: z.number().int().min(0).default(0),
    2: z.number().int().min(0).default(0),
    3: z.number().int().min(0).default(0),
    4: z.number().int().min(0).default(0),
  }),
  inspectedLengthYards: decimal(),
  widthInches: decimal(6),
})

export const measurementSpecPayload = z.object({
  styleCode: z.string().min(1),
  unit: z.string().min(1).max(10).default('cm'),
  points: z
    .array(
      z.object({
        name: z.string().min(1),
        spec: decimal(8),
        /** Separate, because garment tolerances are asymmetric by nature. */
        tolPlus: decimal(6),
        tolMinus: decimal(6),
      }),
    )
    .min(1, 'a measurement spec with no points checks nothing'),
})

export const measurementCheckPayload = z.object({
  measurementSpecId: z.string().uuid(),
  orderId: z.string().uuid(),
  sampledSize: z.string().min(1).max(20),
  values: z.record(z.string().min(1), decimal(8)),
})

export const finalInspectionPayload = z.object({
  orderId: z.string().uuid(),
  orderStyleId: z.string().uuid().optional(),
  inspectionNo: z.string().min(1).max(60),
  lotQty: z.number().int().min(1),
  /**
   * From buyer terms. No defaults — an AQL level the system chose for you is an acceptance
   * number nobody agreed to.
   */
  inspectionLevel: z.enum(['I', 'II', 'III']),
  majorAql: z.string().min(1),
  minorAql: z.string().min(1),
  /** Tapped defect codes with counts; severity comes from `defect_codes`. */
  defects: z
    .array(z.object({ code: z.string().min(1), count: z.number().int().min(1) }))
    .default([]),
})

export const thirdPartyInspectionPayload = z
  .object({
    orderId: z.string().uuid(),
    agency: z.enum(['sgs', 'intertek', 'bv', 'other']),
    agencyName: z.string().min(1).max(200).optional(),
    scheduledAt: z.string(),
  })
  .refine((r) => r.agency !== 'other' || r.agencyName !== undefined, {
    message: 'name the agency when it is not one of the majors',
    path: ['agencyName'],
  })

export const QUALITY_ZOD_MAP = {
  defect_code: defectCodePayload,
  measurement_spec: measurementSpecPayload,
} as const

export type InlineCheckPayload = z.infer<typeof inlineCheckPayload>
export type FinalInspectionPayload = z.infer<typeof finalInspectionPayload>
export type MeasurementSpecPayload = z.infer<typeof measurementSpecPayload>
