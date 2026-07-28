/**
 * TNA engine — backward scheduling and ripple preview (brief 1.3, Operations).
 *
 * Pure. No database, no clock, no timezone, no I/O. The same functions serve the
 * interactive API, the nightly scan, and the seed generator, and they are the most
 * heavily unit-tested code in the repo because every number they produce is a date
 * somebody schedules real work against.
 *
 * **Dates are calendar dates, not instants.** A milestone is a day. Modelling one as a
 * timestamp is how a shipment silently moves by a day across a timezone boundary and
 * breaches an LC's latest-shipment clause. Arithmetic is done on UTC midnight and only
 * ever emitted as `YYYY-MM-DD`.
 *
 * **Calendar days, not working days.** A real Bangladeshi factory calendar — two Eids on
 * a lunar cycle, national days, the factory's own closures — belongs here eventually.
 * Inventing one now would bake in wrong dates that look authoritative. Template offsets
 * come from the calendar the factory already uses, which absorbs their weekends.
 *
 * ── The one modelling decision worth reading ────────────────────────────────
 *
 * The brief's template gives each milestone an offset before ex-factory and a list of
 * dependencies, but no durations. So what does the gap between two dependent milestones
 * mean — required lead time, or spare room?
 *
 * It has to be *required by default*. "Fabric in-house at −60, PP sample approved at −48"
 * is not twelve idle days; it is how long approval takes once fabric exists. Treating it
 * as slack means a six-day fabric delay reports no impact, which is precisely the alert
 * a merchandiser needs and would never get.
 *
 * So: the default required gap on a dependency edge is the template's own spacing, and
 * slips propagate. Genuine slack is stated explicitly with `gapDays` on the edge — trims
 * only need to be *present* when cutting starts (`gapDays: 0`), whereas PP approval needs
 * three days of paperwork first. Slack you declared absorbs a slip; slack you merely
 * happened to have does not.
 */

export class TnaError extends Error {
  override readonly name = 'TnaError'
}

/**
 * A dependency edge. A bare name means "the template's own spacing is the required lead
 * time"; the object form states a different one, which is how deliberate slack is
 * expressed.
 */
export type TnaDependency = string | { name: string; gapDays: number }

export interface ResolvedDependency {
  name: string
  /** Clear days required between that milestone and this one. */
  gapDays: number
}

export interface TnaTemplateMilestone {
  name: string
  /** Days before ex-factory. Larger = earlier. Ex-factory itself is 0. */
  offsetDaysBeforeExFactory: number
  dependsOn: readonly TnaDependency[]
  /** On the critical path: a slip here moves the ship date. */
  critical: boolean
  ownerRole?: string
}

export interface TnaTemplate {
  productType: string
  milestones: readonly TnaTemplateMilestone[]
}

export interface ScheduledMilestone {
  name: string
  plannedDate: string
  /** Set once the milestone has actually happened. Recomputation never overwrites it. */
  actualDate?: string | null
  dependsOn: readonly ResolvedDependency[]
  critical: boolean
  ownerRole?: string
}

export interface MilestoneChange {
  name: string
  fromDate: string
  toDate: string
  /** Positive = later than before. */
  slipDays: number
  critical: boolean
}

export interface RipplePreview {
  changes: readonly MilestoneChange[]
  /** Days the ship date moves. Zero when declared slack absorbed the slip. */
  exFactorySlipDays: number
  /** Null when ex-factory does not move. */
  newExFactoryDate: string | null
  affectsCriticalPath: boolean
}

/**
 * The milestone that IS the ship date. Named rather than inferred from offset 0, so a
 * template that omits it fails loudly instead of silently reporting no impact.
 */
export const EX_FACTORY_MILESTONE = 'ex_factory'

// ─────────────────────────────────────────────────────────────────────────────
// Date arithmetic — calendar days on UTC midnight, never a local Date
// ─────────────────────────────────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const MS_PER_DAY = 86_400_000

function toUtc(date: string): number {
  if (!ISO_DATE.test(date)) {
    throw new TnaError(`"${date}" is not a calendar date — expected YYYY-MM-DD`)
  }

  const parsed = Date.parse(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed)) throw new TnaError(`"${date}" is not a real date`)

  // Date.parse accepts 2026-02-30 and rolls it into March. A date that changes when you
  // read it back is not a date a factory can plan against.
  if (new Date(parsed).toISOString().slice(0, 10) !== date) {
    throw new TnaError(`"${date}" is not a real calendar date`)
  }

  return parsed
}

const toIso = (utc: number): string => new Date(utc).toISOString().slice(0, 10)
const addDays = (date: string, days: number): string => toIso(toUtc(date) + days * MS_PER_DAY)

export const diffDays = (from: string, to: string): number =>
  Math.round((toUtc(to) - toUtc(from)) / MS_PER_DAY)

// ─────────────────────────────────────────────────────────────────────────────
// Graph
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dependencies first, so a milestone is always visited after everything it depends on.
 * Throws on a cycle rather than looping: a cyclic template is a data-entry error in
 * Settings, and the honest response is to refuse it at the point of use.
 */
function topologicalOrder<T extends { name: string; dependsOn: readonly ResolvedDependency[] }>(
  milestones: readonly T[],
): readonly T[] {
  const byName = new Map(milestones.map((m) => [m.name, m]))

  for (const milestone of milestones) {
    for (const dependency of milestone.dependsOn) {
      if (!byName.has(dependency.name)) {
        throw new TnaError(
          `milestone "${milestone.name}" depends on unknown milestone "${dependency.name}"`,
        )
      }
    }
  }

  const ordered: T[] = []
  const state = new Map<string, 'visiting' | 'done'>()

  const visit = (milestone: T, trail: readonly string[]): void => {
    const seen = state.get(milestone.name)
    if (seen === 'done') return
    if (seen === 'visiting') {
      throw new TnaError(
        `dependency cycle in TNA template: ${[...trail, milestone.name].join(' → ')}`,
      )
    }

    state.set(milestone.name, 'visiting')
    for (const dependency of milestone.dependsOn) {
      visit(byName.get(dependency.name)!, [...trail, milestone.name])
    }
    state.set(milestone.name, 'done')
    ordered.push(milestone)
  }

  for (const milestone of milestones) visit(milestone, [])
  return ordered
}

/** Fill in each edge's required gap from the template's own spacing where unstated. */
function resolveDependencies(template: TnaTemplate): Map<string, ResolvedDependency[]> {
  const offsetOf = new Map(
    template.milestones.map((m) => [m.name, m.offsetDaysBeforeExFactory] as const),
  )
  const resolved = new Map<string, ResolvedDependency[]>()

  for (const milestone of template.milestones) {
    resolved.set(
      milestone.name,
      milestone.dependsOn.map((dependency) => {
        if (typeof dependency !== 'string') {
          if (dependency.gapDays < 0) {
            throw new TnaError(
              `milestone "${milestone.name}" declares a negative gap to "${dependency.name}"`,
            )
          }
          return { name: dependency.name, gapDays: dependency.gapDays }
        }

        const dependencyOffset = offsetOf.get(dependency)
        if (dependencyOffset === undefined) {
          throw new TnaError(
            `milestone "${milestone.name}" depends on unknown milestone "${dependency}"`,
          )
        }

        // The template's own spacing is the required lead time. Never negative: a
        // template whose offsets contradict the dependency is repaired below, not
        // rewarded with a negative gap.
        return {
          name: dependency,
          gapDays: Math.max(0, dependencyOffset - milestone.offsetDaysBeforeExFactory),
        }
      }),
    )
  }

  return resolved
}

// ─────────────────────────────────────────────────────────────────────────────
// Backward scheduling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Place every milestone at its offset before ex-factory, then repair any dependency the
 * offsets contradict.
 *
 * The repair matters: a template saying "PP sample approved at −40" and "cutting starts
 * at −45" asks the floor to cut before the buyer approved the sample. Templates are
 * hand-maintained in Settings and drift. The dependency is the real constraint, so it
 * wins and the dependency moves earlier. Trusting the offset instead produces a plan
 * that cannot be executed and looks perfectly fine on a Gantt chart.
 */
export function generateSchedule(input: {
  exFactoryDate: string
  template: TnaTemplate
}): ScheduledMilestone[] {
  const exFactory = input.exFactoryDate
  toUtc(exFactory) // validate before anything else

  if (input.template.milestones.length === 0) {
    throw new TnaError('TNA template has no milestones')
  }

  const names = new Set<string>()
  for (const milestone of input.template.milestones) {
    if (names.has(milestone.name)) {
      throw new TnaError(`TNA template repeats milestone "${milestone.name}"`)
    }
    names.add(milestone.name)
  }

  const dependencies = resolveDependencies(input.template)
  const withDeps = input.template.milestones.map((m) => ({
    ...m,
    dependsOn: dependencies.get(m.name)!,
  }))

  const dateOf = new Map<string, string>()
  for (const milestone of withDeps) {
    dateOf.set(milestone.name, addDays(exFactory, -milestone.offsetDaysBeforeExFactory))
  }

  // Walk dependents-before-dependencies so pulling one earlier propagates all the way
  // back up the chain in a single pass.
  for (const milestone of [...topologicalOrder(withDeps)].reverse()) {
    for (const dependency of milestone.dependsOn) {
      const latestAllowed = addDays(dateOf.get(milestone.name)!, -dependency.gapDays)
      if (diffDays(latestAllowed, dateOf.get(dependency.name)!) > 0) {
        dateOf.set(dependency.name, latestAllowed)
      }
    }
  }

  return withDeps.map((milestone) => ({
    name: milestone.name,
    plannedDate: dateOf.get(milestone.name)!,
    actualDate: null,
    dependsOn: milestone.dependsOn,
    critical: milestone.critical,
    ...(milestone.ownerRole === undefined ? {} : { ownerRole: milestone.ownerRole }),
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Ripple
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What actualizing one milestone on this date would do to everything downstream.
 *
 * Pure and non-mutating on purpose: the UI shows this BEFORE the user confirms, so if
 * preview changed anything the cancel button would be a lie.
 *
 * Two domain rules, neither obvious:
 *
 * 1. **Only slips propagate.** Finishing early does not pull the calendar forward. Fabric
 *    arriving a week early does not mean the line is free, the trims have landed, or the
 *    buyer has approved the sample — promising that capacity is how a factory
 *    over-commits.
 *
 * 2. **Declared slack absorbs.** An edge with a stated `gapDays` smaller than its planned
 *    spacing can swallow a slip without moving anything downstream.
 */
export function previewRipple(input: {
  schedule: readonly ScheduledMilestone[]
  milestone: string
  actualDate: string
}): RipplePreview {
  const target = input.schedule.find((m) => m.name === input.milestone)
  if (!target) throw new TnaError(`unknown milestone "${input.milestone}"`)

  toUtc(input.actualDate)

  const slip = diffDays(target.plannedDate, input.actualDate)
  // Early or on time: nothing moves. Rule 1 above.
  if (slip <= 0) {
    return { changes: [], exFactorySlipDays: 0, newExFactoryDate: null, affectsCriticalPath: false }
  }

  const effective = new Map<string, string>()
  for (const milestone of input.schedule) {
    effective.set(milestone.name, milestone.actualDate ?? milestone.plannedDate)
  }
  effective.set(target.name, input.actualDate)

  for (const milestone of topologicalOrder(input.schedule)) {
    // A milestone that already happened is history. Recomputation does not rewrite it.
    if (milestone.actualDate || milestone.name === target.name) continue

    let earliest = milestone.plannedDate
    for (const dependency of milestone.dependsOn) {
      const required = addDays(effective.get(dependency.name)!, dependency.gapDays)
      if (diffDays(earliest, required) > 0) earliest = required
    }
    effective.set(milestone.name, earliest)
  }

  const changes: MilestoneChange[] = []
  for (const milestone of input.schedule) {
    if (milestone.actualDate || milestone.name === target.name) continue

    const to = effective.get(milestone.name)!
    const slipDays = diffDays(milestone.plannedDate, to)
    if (slipDays !== 0) {
      changes.push({
        name: milestone.name,
        fromDate: milestone.plannedDate,
        toDate: to,
        slipDays,
        critical: milestone.critical,
      })
    }
  }

  const exFactory = input.schedule.find((m) => m.name === EX_FACTORY_MILESTONE)
  const exFactorySlipDays = exFactory
    ? diffDays(exFactory.plannedDate, effective.get(EX_FACTORY_MILESTONE)!)
    : 0

  return {
    changes,
    exFactorySlipDays,
    newExFactoryDate: exFactorySlipDays > 0 ? effective.get(EX_FACTORY_MILESTONE)! : null,
    affectsCriticalPath: changes.some((c) => c.critical),
  }
}
