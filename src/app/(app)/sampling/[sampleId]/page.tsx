import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { SectionHeading } from '@/components/fx/signature'
import { RouteHeader } from '@/components/shell/route-header'
import { getCtx } from '@/modules/core/session'
import { sampleTimeline } from '@/modules/sampling/service'
import { requisitionLine } from '@/modules/sampling/zod'

import { RequisitionSection, type RequisitionLineView } from './requisition-client'
import { SampleDetailClient } from './sample-detail-client'

/**
 * 1.4 Sampling room · one request (canvas P3).
 *
 * The screen where a buyer's verdict is recorded, and therefore the screen that releases
 * cutting. Module 5.1's PP gate fails closed and reads its answer from this module's
 * provider, so an approved PP round here is the difference between a cutting floor that
 * can spread a lay and one that cannot.
 *
 * That is why nothing about the verdict is inferred. The zod refuses a round without one,
 * comments are itemised rather than free prose, and "approved with comments" is its own
 * verdict — a buyer who accepts the garment and lists three things to watch has approved
 * it, and treating that as a rejection stops a floor that has permission to run.
 */
export const dynamic = 'force-dynamic'

export default async function SampleDetailPage({
  params,
}: {
  params: Promise<{ sampleId: string }>
}) {
  const ctx = await getCtx(await headers())
  if (!ctx) redirect('/login')

  const { sampleId } = await params
  const timeline = await sampleTimeline(ctx, sampleId).catch(() => null)
  if (!timeline) notFound()

  const { request, stages, rounds, dispatches, totalCost } = timeline

  // Stored jsonb, re-validated on the way out; a row the parser refuses is counted,
  // never silently dropped (the screen says so).
  const requisitionRaw = (request.requisition as unknown[]) ?? []
  const requisition: RequisitionLineView[] = []
  let unreadable = 0
  for (const row of requisitionRaw) {
    const parsed = requisitionLine.safeParse(row)
    if (parsed.success) requisition.push(parsed.data)
    else unreadable += 1
  }
  const mayWrite = ctx.roles.some((r) => r === 'merchandiser' || r === 'owner' || r === 'admin')

  return (
    <>
      <RouteHeader
        path={`/sampling/${sampleId}`}
        labels={{ sampleId: request.requestNo }}
        eyebrow={`Sampling · ${request.type.toUpperCase()} · ${request.styleCode}`}
        title={request.requestNo}
        meta={request.dueDate ? `due ${request.dueDate}` : undefined}
        ownsAmber
      />

      <SampleDetailClient
        sampleRequestId={request.id}
        type={request.type}
        status={request.status}
        dueDate={request.dueDate}
        totalCost={totalCost}
        stages={stages.map((s) => ({
          stage: s.stage,
          at: s.occurredAt.toISOString(),
        }))}
        rounds={rounds.map((r) => ({
          round: r.round,
          verdict: r.verdict,
          comments: r.comments,
          recordedOn: r.recordedOn,
        }))}
        dispatches={dispatches.map((d) => ({
          courier: d.courier,
          awb: d.awb,
          at: d.dispatchedAt.toISOString(),
        }))}
      />

      <section style={{ marginTop: 36 }}>
        <SectionHeading eyebrow="the ask, and what actually went in">
          Requisition
        </SectionHeading>
        <RequisitionSection
          sampleRequestId={request.id}
          lines={requisition}
          unreadable={unreadable}
          canWrite={mayWrite}
          closed={request.status === 'closed'}
        />
      </section>
    </>
  )
}
