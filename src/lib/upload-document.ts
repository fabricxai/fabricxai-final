/**
 * Put a file in object storage, from the browser.
 *
 * Three steps, and the middle one deliberately does not touch the app server: reserve a
 * row and get a presigned PUT, send the bytes straight to storage, then confirm. Routing
 * a 25 MB tech pack through Next would tie up a request worker for the duration of a
 * delivery-bay upload for no benefit.
 *
 * Shared rather than written twice. The MARBIM composer and the store's challan capture
 * both need it, and an upload path that exists in two copies is one where the second one
 * quietly stops confirming and leaves rows stuck in `uploading`.
 */

export interface UploadedDocument {
  documentId: string
  filename: string
  sizeBytes: number
  mimeType: string
}

export interface DocumentLimits {
  maxBytes: number
  allowedMime: readonly string[]
}

export class UploadError extends Error {
  override readonly name = 'UploadError'
  /** True when retrying later could work — offline, or storage briefly refusing. */
  readonly retryable: boolean

  constructor(message: string, options: { retryable: boolean }) {
    super(message)
    this.retryable = options.retryable
  }
}

export const humanBytes = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`

/** The server's own limits, so a screen refuses exactly what the server would. */
export async function documentLimits(): Promise<DocumentLimits | null> {
  try {
    const response = await fetch('/api/documents')
    if (!response.ok) return null
    return (await response.json()) as DocumentLimits
  } catch {
    return null
  }
}

export async function uploadDocument(
  file: File,
  meta: { kind: string; moduleId: string; limits?: DocumentLimits | null },
): Promise<UploadedDocument> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    // Said plainly rather than left to a fetch failure: the delivery bay is where the
    // signal is worst, and "upload failed" tells a storekeeper nothing about what to do.
    throw new UploadError('no connection — the file cannot be sent yet', { retryable: true })
  }

  const limits = meta.limits
  if (limits && file.size > limits.maxBytes) {
    throw new UploadError(
      `${humanBytes(file.size)} is over the ${humanBytes(limits.maxBytes)} limit`,
      { retryable: false },
    )
  }
  if (limits && !limits.allowedMime.includes(file.type)) {
    throw new UploadError(`${file.type || 'that file type'} is not accepted`, { retryable: false })
  }

  const reserved = await fetch('/api/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      kind: meta.kind,
      moduleId: meta.moduleId,
    }),
  })
  if (!reserved.ok) {
    const body = (await reserved.json().catch(() => null)) as { error?: { code?: string } } | null
    throw new UploadError(body?.error?.code ?? 'the upload was refused', {
      retryable: reserved.status >= 500,
    })
  }

  const { documentId, uploadUrl } = (await reserved.json()) as {
    documentId: string
    uploadUrl: string
  }

  // A failure here leaves the row in `uploading` — which is what the sweeper looks for,
  // and better than an object in the bucket with no row pointing at it.
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  })
  if (!put.ok) {
    throw new UploadError(`storage refused the file (${put.status})`, { retryable: true })
  }

  const confirmed = await fetch('/api/documents?confirm=1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentId }),
  })
  if (!confirmed.ok) {
    const body = (await confirmed.json().catch(() => null)) as { error?: { code?: string } } | null
    throw new UploadError(body?.error?.code ?? 'the upload could not be confirmed', {
      retryable: true,
    })
  }

  return { documentId, filename: file.name, sizeBytes: file.size, mimeType: file.type }
}
