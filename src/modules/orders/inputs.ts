/**
 * Inputs readiness — the pure rules, importable by both sides.
 *
 * The one decision that needed writing down as code: what the roll-up counts.
 * The factory's sheet has twelve columns whether or not a style uses them, so a
 * naive N/12 makes a style with no zipper look forever unfinished and a style
 * with everything landed read 11/12. The count is therefore over the categories
 * the style ACTUALLY USES: `not_applicable` is neither an achievement nor a gap.
 */
import type { InputCategory } from './zod'
import { INPUT_CATEGORIES } from './zod'

export type InputState = 'pending' | 'booked' | 'in_house' | 'not_applicable'

export interface InputCell {
  category: InputCategory
  state: InputState
  planDate: string | null
  actualDate: string | null
  note: string | null
}

export interface InputsRollup {
  /** Cells physically landed. */
  inHouse: number
  /** Cells the style uses at all — the denominator. */
  applicable: number
  /** Landed after their plan date, or planned and still absent past it. */
  late: number
  /** True when every applicable cell is in-house. */
  complete: boolean
}

/** Words for a category, in the sheet's own vocabulary. */
export const INPUT_CATEGORY_WORDS: Record<InputCategory, string> = {
  pp: 'PP',
  fabric: 'Fabric',
  pocketing: 'Pocketing',
  thread: 'Thread',
  labels: 'Labels',
  elastic: 'Elastic',
  hook_bar: 'Hook & bar',
  zipper: 'Zipper',
  buttons: 'Buttons',
  hangtag: 'Hangtag',
  barcode: 'Barcode',
  poly_carton: 'Poly / carton',
}

/**
 * Missing rows count as `pending`: an order nobody has touched yet is twelve
 * open questions, not a blank that reads as done.
 */
export function fillCategories(cells: readonly InputCell[]): InputCell[] {
  const byCategory = new Map(cells.map((c) => [c.category, c]))
  return INPUT_CATEGORIES.map(
    (category) =>
      byCategory.get(category) ?? {
        category,
        state: 'pending' as const,
        planDate: null,
        actualDate: null,
        note: null,
      },
  )
}

export function rollupInputs(cells: readonly InputCell[], today: string): InputsRollup {
  const applicable = cells.filter((c) => c.state !== 'not_applicable')
  const inHouse = applicable.filter((c) => c.state === 'in_house')
  const late = applicable.filter((c) =>
    c.state === 'in_house'
      ? c.planDate !== null && c.actualDate !== null && c.actualDate > c.planDate
      : c.planDate !== null && c.planDate < today,
  )

  return {
    inHouse: inHouse.length,
    applicable: applicable.length,
    late: late.length,
    complete: applicable.length > 0 && inHouse.length === applicable.length,
  }
}
