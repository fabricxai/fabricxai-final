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
import type { AnyCtx } from '../core/ctx'

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
