/**
 * Documents on MinIO/S3 (dev-plan §2.2, §6).
 *
 * Buyer POs, LC copies, challans, wage sheets, audit reports, photos of handwritten
 * floor sheets. Every one of them is private and every access is a short-lived signed
 * URL — the bucket is never public and object keys are never derived from filenames,
 * because a guessable key is one misconfiguration away from being a leak.
 *
 * The flow is upload-then-confirm rather than a single call: the browser PUTs straight
 * to storage (the app process never proxies file bytes), then tells us it finished, and
 * we verify the object really exists before marking it usable. Without the confirm step
 * a row saying "ready" could point at nothing.
 */
import { HeadObjectCommand, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { and, eq, isNull } from 'drizzle-orm'

import { documents } from '@/db/schema/core'
import { env } from '@/lib/env'
import { objectKey as newObjectKey } from '@/lib/ids'
import { getS3, getS3ForSigning } from '@/lib/s3'

import type { AnyCtx } from './ctx'
import { AppError, notFound } from './errors'
import { scoped } from './scoped'
import { withTenantRead, withTenantTx } from './tenancy'

/**
 * What a factory actually uploads. Deliberately a allowlist, not a blocklist — an
 * unexpected type is a rejected upload, not a stored one we hope nothing executes.
 */
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

/** Scans of a full LC file run large; anything past this is a mistake or an attack. */
const MAX_BYTES = 25 * 1024 * 1024

/** Upload URLs are single-use in practice and short-lived by policy. */
const UPLOAD_TTL_SECONDS = 300
const DOWNLOAD_TTL_SECONDS = 300

export interface UploadInput {
  filename: string
  mimeType: string
  sizeBytes: number
  kind?: string
  moduleId?: string
  entityTable?: string
  entityId?: string
  meta?: Record<string, unknown>
}

function validate(input: UploadInput): void {
  if (!ALLOWED_MIME.has(input.mimeType)) {
    throw new AppError('validation_failed', 'errors.document_type_not_allowed', {
      mimeType: input.mimeType,
    })
  }
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new AppError('validation_failed', 'errors.document_size_invalid', {
      sizeBytes: input.sizeBytes,
    })
  }
  if (input.sizeBytes > MAX_BYTES) {
    throw new AppError('validation_failed', 'errors.document_too_large', {
      sizeBytes: input.sizeBytes,
      maxBytes: MAX_BYTES,
    })
  }
}

/**
 * Reserve a document row and hand back a presigned PUT. The row exists before the bytes
 * do, which is what lets a failed or abandoned upload be found and swept rather than
 * becoming an orphan object nobody knows about.
 */
export async function createUploadUrl(
  ctx: AnyCtx,
  input: UploadInput,
): Promise<{ documentId: string; uploadUrl: string; objectKey: string; expiresIn: number }> {
  validate(input)

  const key = newObjectKey(ctx.companyId, input.filename)

  const documentId = await withTenantTx(ctx, async (tx) => {
    const [row] = await tx
      .insert(documents)
      .values({
        companyId: ctx.companyId,
        bucket: env.S3_BUCKET,
        objectKey: key,
        filename: input.filename,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        kind: input.kind ?? null,
        moduleId: input.moduleId ?? null,
        entityTable: input.entityTable ?? null,
        entityId: input.entityId ?? null,
        status: 'uploaded',
        meta: input.meta ?? {},
        uploadedBy: ctx.userId,
      })
      .returning({ id: documents.id })

    if (!row) throw new Error('documents insert returned nothing')
    return row.id
  })

  const uploadUrl = await getSignedUrl(
    // Signed for the address the DEVICE will open, not the one the server uses.
    getS3ForSigning(),
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      ContentType: input.mimeType,
      // Bind the signature to the declared length so a 10 KB claim cannot become 10 GB.
      ContentLength: input.sizeBytes,
    }),
    { expiresIn: UPLOAD_TTL_SECONDS },
  )

  return { documentId, uploadUrl, objectKey: key, expiresIn: UPLOAD_TTL_SECONDS }
}

/**
 * Called once the client's PUT succeeded. Verifies the object is really there and
 * records what storage says its size is — not what the client claimed earlier.
 */
export async function confirmUpload(
  ctx: AnyCtx,
  documentId: string,
): Promise<{ status: 'ready'; sizeBytes: number }> {
  const doc = await withTenantRead(ctx, async (tx) => {
    const [row] = await tx
      .select()
      .from(documents)
      .where(scoped(documents, ctx, and(eq(documents.id, documentId), isNull(documents.deletedAt))))
    return row
  })

  if (!doc) throw notFound('errors.document_not_found', { documentId })

  let head
  try {
    head = await getS3().send(
      new HeadObjectCommand({ Bucket: doc.bucket, Key: doc.objectKey }),
    )
  } catch {
    // The row exists but the bytes do not — an abandoned or failed upload. Mark it so a
    // sweeper can find it, and tell the caller the truth.
    await withTenantTx(ctx, (tx) =>
      tx.update(documents).set({ status: 'failed', updatedAt: new Date() }).where(scoped(documents, ctx, eq(documents.id, documentId))),
    )
    throw new AppError('validation_failed', 'errors.document_not_uploaded', { documentId })
  }

  const actualSize = Number(head.ContentLength ?? 0)
  if (actualSize > MAX_BYTES) {
    throw new AppError('validation_failed', 'errors.document_too_large', {
      sizeBytes: actualSize,
      maxBytes: MAX_BYTES,
    })
  }

  await withTenantTx(ctx, (tx) =>
    tx
      .update(documents)
      .set({
        status: 'ready',
        sizeBytes: actualSize,
        checksumSha256: head.ChecksumSHA256 ?? null,
        updatedAt: new Date(),
      })
      .where(scoped(documents, ctx, eq(documents.id, documentId))),
  )

  return { status: 'ready', sizeBytes: actualSize }
}

/**
 * A short-lived signed GET. The document is fetched through the tenant wall first, so a
 * URL is only ever issued for a document the caller's company actually owns — RLS, not a
 * hand-written company check that someone will forget.
 */
export async function createDownloadUrl(
  ctx: AnyCtx,
  documentId: string,
  ttlSeconds = DOWNLOAD_TTL_SECONDS,
): Promise<{ url: string; filename: string; expiresIn: number }> {
  const doc = await withTenantRead(ctx, async (tx) => {
    const [row] = await tx
      .select()
      .from(documents)
      .where(scoped(documents, ctx, and(eq(documents.id, documentId), isNull(documents.deletedAt))))
    return row
  })

  if (!doc) throw notFound('errors.document_not_found', { documentId })
  if (doc.status === 'quarantined') {
    throw new AppError('forbidden', 'errors.document_quarantined', { documentId })
  }

  const url = await getSignedUrl(
    getS3ForSigning(),
    new GetObjectCommand({
      Bucket: doc.bucket,
      Key: doc.objectKey,
      ResponseContentDisposition: `attachment; filename="${doc.filename.replace(/"/g, '')}"`,
    }),
    { expiresIn: ttlSeconds },
  )

  return { url, filename: doc.filename, expiresIn: ttlSeconds }
}

/**
 * The bytes themselves, for a server-side reader — today that is MARBIM handing a PDF or
 * scan to a vision-capable extract model.
 *
 * Same wall as `createDownloadUrl`: the row is fetched tenant-scoped first, so bytes are
 * only ever returned for a document the caller's company owns, and a quarantined document
 * stays unreadable by machine exactly as it is by person. The 25 MB upload cap bounds what
 * this can pull into memory.
 */
export async function readDocumentBytes(
  ctx: AnyCtx,
  documentId: string,
): Promise<{ bytes: Uint8Array; mimeType: string; filename: string }> {
  const doc = await withTenantRead(ctx, async (tx) => {
    const [row] = await tx
      .select()
      .from(documents)
      .where(scoped(documents, ctx, and(eq(documents.id, documentId), isNull(documents.deletedAt))))
    return row
  })

  if (!doc) throw notFound('errors.document_not_found', { documentId })
  if (doc.status === 'quarantined') {
    throw new AppError('forbidden', 'errors.document_quarantined', { documentId })
  }

  const object = await getS3().send(
    new GetObjectCommand({ Bucket: doc.bucket, Key: doc.objectKey }),
  )
  if (!object.Body) throw notFound('errors.document_not_found', { documentId })

  return {
    bytes: await object.Body.transformToByteArray(),
    mimeType: doc.mimeType,
    filename: doc.filename,
  }
}

/**
 * The row's facts without the bytes — for a caller deciding whether a fetch is worth it
 * (is this a type the model can read?) before paying for the object.
 */
export async function documentMeta(
  ctx: AnyCtx,
  documentId: string,
): Promise<{ mimeType: string; filename: string; sizeBytes: number; status: string }> {
  const doc = await withTenantRead(ctx, async (tx) => {
    const [row] = await tx
      .select({
        mimeType: documents.mimeType,
        filename: documents.filename,
        sizeBytes: documents.sizeBytes,
        status: documents.status,
      })
      .from(documents)
      .where(scoped(documents, ctx, and(eq(documents.id, documentId), isNull(documents.deletedAt))))
    return row
  })

  if (!doc) throw notFound('errors.document_not_found', { documentId })
  return doc
}

/** Soft delete. The object is swept separately so a mistaken delete stays recoverable. */
export async function softDelete(ctx: AnyCtx, documentId: string): Promise<void> {
  const updated = await withTenantTx(ctx, (tx) =>
    tx
      .update(documents)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(scoped(documents, ctx, and(eq(documents.id, documentId), isNull(documents.deletedAt))))
      .returning({ id: documents.id }),
  )

  if (updated.length === 0) throw notFound('errors.document_not_found', { documentId })
}

export const DOCUMENT_LIMITS = { maxBytes: MAX_BYTES, allowedMime: [...ALLOWED_MIME] } as const
