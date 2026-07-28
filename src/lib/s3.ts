/**
 * S3 client (MinIO in dev and prod; provider-portable by construction).
 * Buckets are private, keys are unguessable, access is via short-lived signed URLs.
 *
 * ⚠ Wired in Phase 0 session 3 together with modules/core/documents.
 */
import { S3Client } from '@aws-sdk/client-s3'

import { env } from './env'

let client: S3Client | undefined

export function getS3(): S3Client {
  client ??= new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  })
  return client
}
