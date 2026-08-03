import { NextResponse } from 'next/server'
import { z } from 'zod'

import {
  confirmUpload,
  createUploadUrl,
  DOCUMENT_LIMITS,
} from '@/modules/core/documents'
import { isAppError } from '@/modules/core/errors'
import { consume, LIMITS, tooManyRequests } from '@/lib/rate-limit'
import { getCtx } from '@/modules/core/session'

/**
 * Upload, from a browser.
 *
 * `createUploadUrl` and `confirmUpload` have existed in core since Phase 0 and, until this
 * file, were reachable from nothing — no action, no route. Every "attach a file" affordance
 * in the design (the composer's ＋, the universal drop-zone) had no door to knock on, which
 * is why none of them were built.
 *
 * A route rather than a server action, for the same reason the sync endpoint is one: the
 * browser has to PUT the bytes straight to object storage between the two calls. That is an
 * ordinary two-step HTTP conversation the client drives, not something a single RPC can
 * express — and the bytes must never pass through the app server, which is the entire point
 * of a presigned URL.
 *
 *   POST /api/documents            → reserve a row, get a presigned PUT
 *   PUT  <uploadUrl>               → the browser sends the bytes to MinIO/S3 directly
 *   POST /api/documents?confirm=1  → head the object, mark the row ready
 *
 * The row exists before the bytes do, so an abandoned upload is a findable row rather than
 * an orphan object nobody knows about.
 */
export const dynamic = 'force-dynamic'

const reserveRequest = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive(),
  kind: z.string().min(1).max(60).optional(),
  moduleId: z.string().min(1).max(64).optional(),
})

const confirmRequest = z.object({ documentId: z.string().uuid() })

export async function GET() {
  // The client needs the limits to refuse a file before spending a round trip on it, and
  // they must come from the same constant the server enforces — a second copy in the UI is
  // how "up to 25 MB" and a 413 start disagreeing.
  return NextResponse.json({
    maxBytes: DOCUMENT_LIMITS.maxBytes,
    allowedMime: DOCUMENT_LIMITS.allowedMime,
  })
}

export async function POST(request: Request) {
  const ctx = await getCtx(request.headers)
  if (!ctx) {
    return NextResponse.json({ error: { code: 'unauthenticated' } }, { status: 401 })
  }

  // Presign issuance. A compromised tablet session could otherwise mint unlimited 25MB
  // upload grants against the factory's object storage.
  const limit = await consume(`rl:documents:${ctx.userId}`, LIMITS.documents)
  if (!limit.ok) return tooManyRequests(limit)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: { code: 'invalid_json' } }, { status: 400 })
  }

  const confirming = new URL(request.url).searchParams.get('confirm') === '1'
  const parsed = confirming ? confirmRequest.safeParse(body) : reserveRequest.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'validation_failed',
          issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      },
      { status: 400 },
    )
  }

  try {
    if (confirming) {
      const data = parsed.data as z.infer<typeof confirmRequest>
      return NextResponse.json(await confirmUpload(ctx, data.documentId))
    }

    const data = parsed.data as z.infer<typeof reserveRequest>
    const reserved = await createUploadUrl(ctx, data)
    return NextResponse.json(reserved)
  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json(
        { error: { code: error.code, messageKey: error.messageKey, details: error.details } },
        { status: error.code === 'validation_failed' ? 400 : 409 },
      )
    }
    throw error
  }
}
