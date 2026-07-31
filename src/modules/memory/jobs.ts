/**
 * Background work for 1.6.
 *
 * Both jobs exist because they call a model or read half the database, and neither is
 * something a merchandiser should be watching a spinner for. They are also both idempotent
 * by construction, which is what lets the outbox relay redeliver freely:
 *
 *  - `embedStyleJob` skips the model call when the fingerprint text is unchanged, so a
 *    redelivery costs one hash, not one embedding.
 *  - `compileOutcomeJob` upserts on `order_id`, so a redelivered close recompiles the same
 *    row rather than adding a competing account of the same order.
 */
import { sql } from 'drizzle-orm'

import type { AnyCtx, SystemCtx } from '../core/ctx'
import { withTenantRead } from '../core/tenancy'
import { hasProvider } from '../marbim/provider'

import { styleFingerprints } from './schema'
import { compileOutcome, embedStyle } from './service'

export interface EmbedStyleJobData {
  styleCode: string
  attrs?: Record<string, string | number | null>
  techPackText?: string
}

export async function embedStyleJob(ctx: AnyCtx, data: EmbedStyleJobData): Promise<void> {
  await embedStyle(ctx, {
    styleCode: data.styleCode,
    attrs: data.attrs ?? {},
    techPackText: data.techPackText,
  })
}

export interface CompileOutcomeJobData {
  orderId: string
}

export async function compileOutcomeJob(
  ctx: AnyCtx,
  data: CompileOutcomeJobData,
): Promise<void> {
  await compileOutcome(ctx, { orderId: data.orderId })
}

export interface EmbedSweepResult {
  styles: number
  embedded: number
  unchanged: number
  /** Set when nothing ran, with the reason. */
  skipped?: string
}

/**
 * Fingerprint every style that does not have one yet.
 *
 * A sweep rather than an event consumer, and that is the more robust choice: a style
 * created while the model provider was down, or before this module existed, is picked up on
 * the next run. An event-driven embed would have missed both, permanently and silently —
 * and `findSimilar` REFUSES a style with no fingerprint, so the gap would surface as an
 * error on the merchandiser's screen rather than as a job that never ran.
 *
 * Skips entirely when no provider is registered, for the same reason X.2's extraction runner
 * does: doing the work badly is worse than not doing it.
 *
 * `embedStyle` is itself idempotent — it hashes the fingerprint text and skips the model
 * call when nothing changed — so a sweep that runs nightly over an unchanged factory costs
 * one hash per style and no model calls at all.
 */
export async function runStyleEmbedSweep(ctx: SystemCtx): Promise<EmbedSweepResult> {
  if (!hasProvider()) {
    return { styles: 0, embedded: 0, unchanged: 0, skipped: 'no MARBIM provider is registered' }
  }

  const { orderStyles } = await import('@/modules/orders/schema')

  const styles = await withTenantRead(ctx, async (tx) =>
    tx
      .selectDistinct({
        styleCode: orderStyles.styleCode,
        description: orderStyles.description,
      })
      .from(orderStyles)
      .where(
        sql`not exists (
          select 1 from ${styleFingerprints}
          where ${styleFingerprints.styleCode} = ${orderStyles.styleCode}
        )`,
      ),
  )

  const result: EmbedSweepResult = { styles: styles.length, embedded: 0, unchanged: 0 }

  for (const style of styles) {
    // The attributes a style carries today are its code and whatever description came with
    // it. Richer ones (GSM, construction, gauge) arrive with the tech pack — see
    // docs/STUBS.md; embedding what exists is better than embedding nothing, and the
    // fingerprint re-embeds itself when they land because the text hash changes.
    const embedded = await embedStyle(ctx, {
      styleCode: style.styleCode,
      attrs: style.description ? { description: style.description } : {},
    })

    if (embedded.embedded) result.embedded += 1
    else result.unchanged += 1
  }

  return result
}

