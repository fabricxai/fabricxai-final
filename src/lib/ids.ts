import { randomBytes, randomUUID } from 'node:crypto'

/** Primary keys. Matches `gen_random_uuid()` on the database side. */
export const newId = (): string => randomUUID()

/**
 * Storage object keys must be unguessable — buckets are private and access is via
 * signed URL, but a guessable key is one misconfiguration away from being a leak
 * (dev-plan §6). Never derive a key from the filename.
 */
export function objectKey(companyId: string, filename: string): string {
  const extension = filename.includes('.') ? `.${filename.split('.').pop()}` : ''
  return `${companyId}/${randomBytes(16).toString('hex')}${extension.toLowerCase()}`
}

/** Idempotency key for a floor device's offline queue entry. */
export const newOfflineKey = (): string => randomUUID()
