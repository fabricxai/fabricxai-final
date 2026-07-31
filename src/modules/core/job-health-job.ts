/**
 * The scheduled task that notices the other scheduled tasks have stopped.
 *
 * ## What it can and cannot catch
 *
 * It catches ONE task failing or not firing while the rest of the worker carries on: a
 * pattern somebody mistyped, a job throwing every night, a queue that lost its scheduler
 * entry. That is the common case and the one nothing else would report.
 *
 * It CANNOT catch the worker being dead, because it is the worker. If everything stops,
 * this stops with it and nobody is told. That gap is covered from outside, in
 * `/api/health`, which uptime monitoring already polls — and it is stated here rather than
 * left for somebody to discover, because a health check with an unspoken blind spot is
 * worse than none.
 *
 * ## Why it does not alert per task
 *
 * Ten silent tasks are one problem — the scheduler — not ten. It sends ONE notification
 * listing what is quiet, keyed on the set of task names, so a new task going quiet is a new
 * alert and the same set staying quiet is not.
 */
import type { SystemCtx } from './ctx'
import { staleTasks, type SilencePolicy, type StaleTask, type TaskExpectation } from './job-health'
import { lastSuccessByTask, stuckRuns, type StuckRun } from './job-runs'
import { notify } from './notifications'

export interface JobHealthPolicy extends SilencePolicy {
  /** A run still `running` after this long is stuck, not slow. */
  stuckAfterMinutes: number
}

export interface JobHealthResult {
  checked: number
  stale: StaleTask[]
  stuck: StuckRun[]
  alerted: boolean
}

/**
 * Compare what the scheduler promised against what it did.
 *
 * `expectations` is the live schedule — passed in by the worker from `SCHEDULED_TASKS`
 * rather than duplicated here, so a task added to the schedule is monitored by the act of
 * adding it, and one removed stops being reported by the act of removing it.
 */
export async function runJobHealthCheck(
  ctx: SystemCtx,
  input: {
    expectations: readonly TaskExpectation[]
    companyCreatedAt: Date
    now?: Date
  },
  policy: JobHealthPolicy,
): Promise<JobHealthResult> {
  const now = input.now ?? new Date()

  const stale = staleTasks({
    expectations: input.expectations,
    lastSuccessAt: await lastSuccessByTask(ctx),
    now,
    companyCreatedAt: input.companyCreatedAt,
    policy,
  })

  const stuck = await stuckRuns(ctx, policy.stuckAfterMinutes, now)

  const result: JobHealthResult = {
    checked: input.expectations.length,
    stale,
    stuck,
    alerted: false,
  }

  if (stale.length === 0 && stuck.length === 0) return result

  // One notification for the whole picture. Ten silent tasks are one problem.
  await notify(ctx, {
    role: 'owner',
    kind: 'core.jobs.silent',
    severity: 'critical',
    titleKey: 'core.notifications.jobs_silent.title',
    params: {
      staleCount: stale.length,
      stuckCount: stuck.length,
      tasks: stale.map((entry) => ({
        task: entry.task,
        silentMinutes: entry.silentMinutes,
        neverRun: entry.neverRun,
      })),
      stuck: stuck.map((entry) => ({ task: entry.task, minutesRunning: entry.minutesRunning })),
    },
    moduleId: 'core',
    href: '/settings/jobs',
    // The SET of silent tasks. A new one going quiet is a new alert; the same set staying
    // quiet overnight is not, and a scheduler that has been down for a week must not send
    // 2,016 identical notifications.
    dedupeKey: `jobs.silent:${[...stale.map((s) => s.task), ...stuck.map((s) => s.task)]
      .sort()
      .join(',')}`,
  })

  result.alerted = true
  return result
}
