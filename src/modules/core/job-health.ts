/**
 * Job health — pure logic.
 *
 * The quietest failure this system has is a schedule that stops firing. There is no error,
 * no failed job, no row: the TNA scan simply never runs again, every milestone stays "on
 * track", and a dead scheduler is indistinguishable from a factory with nothing wrong. The
 * alerts wired in the last commit make that worse rather than better — silence now means
 * both "everything is fine" and "nothing is running".
 *
 * Two decisions carry this.
 *
 * **The expected interval is read FROM the cron pattern.** Restating it as a separate
 * `maxSilence` field beside each schedule would drift the first time somebody changed one
 * and not the other, and a monitor that has quietly drifted is worse than none.
 *
 * **A pattern shape the classifier does not understand is REFUSED.** Falling back to some
 * default interval would leave a task on a dashboard saying it is being watched when the
 * number underneath it means nothing.
 *
 * Nothing here reads a clock or a database.
 */

export class JobHealthError extends Error {
  override readonly name = 'JobHealthError'
}

const MINUTES_PER_HOUR = 60
const MINUTES_PER_DAY = 1_440
/** The LONGEST month. Using 30 days would alarm every January and July on the 31st. */
const MINUTES_PER_MONTH = 31 * MINUTES_PER_DAY

const isLiteral = (field: string): boolean => /^\d+$/.test(field)

/**
 * How often a cron pattern is expected to fire, in minutes.
 *
 * Deliberately understands only the shapes this system actually schedules. Adding a weekly
 * or a business-hours pattern means teaching this function about it, which is the point —
 * the alternative is a new schedule that is silently unmonitored.
 */
export function expectedIntervalMinutes(pattern: string): number {
  const fields = pattern.trim().split(/\s+/)

  if (fields.length !== 5) {
    throw new JobHealthError(`"${pattern}" is not a five-field cron pattern`)
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields as [
    string,
    string,
    string,
    string,
    string,
  ]

  if (month !== '*' || dayOfWeek !== '*') {
    throw new JobHealthError(
      `"${pattern}" restricts the month or day-of-week, which this classifier does not ` +
        'understand — teach it the shape rather than leaving the task unmonitored',
    )
  }

  const step = /^\*\/(\d+)$/.exec(minute)
  if (step && hour === '*' && dayOfMonth === '*') {
    return Number(step[1])
  }

  if (isLiteral(minute) && hour === '*' && dayOfMonth === '*') return MINUTES_PER_HOUR
  if (isLiteral(minute) && isLiteral(hour) && dayOfMonth === '*') return MINUTES_PER_DAY
  if (isLiteral(minute) && isLiteral(hour) && isLiteral(dayOfMonth)) return MINUTES_PER_MONTH

  throw new JobHealthError(
    `"${pattern}" is not a shape this classifier understands — teach it the shape rather ` +
      'than leaving the task unmonitored',
  )
}

export interface SilencePolicy {
  /** How many expected intervals may pass before a task counts as silent. */
  toleranceFactor: number
  /** The shortest budget any task gets, so one slow run does not page anybody. */
  floorMinutes: number
}

/**
 * How long a task may stay quiet before it is a problem.
 *
 * The floor matters more than the factor. A five-minute task at 1.5× would be reported
 * after seven and a half minutes, which one slow run or one restart would trip — and an
 * alert that cries wolf on a healthy system gets muted, taking the real one with it.
 */
export function maxSilenceMinutes(intervalMinutes: number, policy: SilencePolicy): number {
  return Math.max(policy.floorMinutes, intervalMinutes * policy.toleranceFactor)
}

export interface TaskExpectation {
  task: string
  /** The cron pattern the scheduler registered. */
  pattern: string
}

export interface StaleTask {
  task: string
  pattern: string
  lastSuccessAt: Date | null
  silentMinutes: number
  maxSilenceMinutes: number
  /** True when this task has never succeeded for this company at all. */
  neverRun: boolean
  /** How many times past its own budget. Ranked on this, not on raw minutes. */
  overBudget: number
}

/**
 * Which scheduled tasks have gone quiet.
 *
 * A task that has NEVER succeeded is measured from `watchingSince` rather than treated as
 * infinitely stale. That handles both ends honestly: a watcher that started two hours ago
 * does not alarm because the nightly scan has not had a night yet, and a task that was
 * added to the schedule months ago and never wired up does — which is the case that would
 * otherwise be indistinguishable from a task running perfectly.
 *
 * Both callers answer "since when could we have seen this run?" with the oldest thing they
 * honestly know: the per-company job passes the company's creation, and `/api/health`
 * passes the start of the deployment's run history. Nothing can have been provably quiet
 * for longer than somebody was listening.
 *
 * Ranked by how far each is PAST its own budget rather than by elapsed minutes. Otherwise
 * every daily task outranks every five-minute one purely for being daily, and the extraction
 * runner that died an hour ago sits below a nightly scan that is barely late.
 */
export function staleTasks(input: {
  expectations: readonly TaskExpectation[]
  lastSuccessAt: Readonly<Record<string, Date | undefined>>
  now: Date
  /** The baseline a task with no run at all is aged from. */
  watchingSince: Date
  policy: SilencePolicy
}): StaleTask[] {
  const stale: StaleTask[] = []

  for (const expectation of input.expectations) {
    // Throws on a pattern it cannot classify — see `expectedIntervalMinutes`.
    const interval = expectedIntervalMinutes(expectation.pattern)
    const budget = maxSilenceMinutes(interval, input.policy)

    const lastSuccess = input.lastSuccessAt[expectation.task] ?? null
    const since = lastSuccess ?? input.watchingSince
    const silentMinutes = Math.floor((input.now.getTime() - since.getTime()) / 60_000)

    if (silentMinutes <= budget) continue

    stale.push({
      task: expectation.task,
      pattern: expectation.pattern,
      lastSuccessAt: lastSuccess,
      silentMinutes,
      maxSilenceMinutes: budget,
      neverRun: lastSuccess === null,
      overBudget: Number((silentMinutes / budget).toFixed(2)),
    })
  }

  return stale.sort((a, b) => b.overBudget - a.overBudget || a.task.localeCompare(b.task))
}
