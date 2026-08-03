/**
 * S3 client (MinIO in dev and prod; provider-portable by construction).
 * Buckets are private, keys are unguessable, access is via short-lived signed URLs.
 *
 * ⚠ Wired in Phase 0 session 3 together with modules/core/documents.
 */
import { S3Client } from '@aws-sdk/client-s3'

import { env } from './env'

let client: S3Client | undefined
let signingClient: S3Client | undefined

function configure(endpoint: string): S3Client {
  return new S3Client({
    endpoint,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  })
}

/** For the server's own calls: HeadObject, DeleteObject, bucket checks. */
export function getS3(): S3Client {
  client ??= configure(env.S3_ENDPOINT)
  return client
}

/**
 * For signing URLs a BROWSER will open.
 *
 * A separate client because the endpoint has to differ. The server reaches MinIO at
 * `http://minio:9000` on the compose network; a tablet in the cutting section cannot
 * resolve that name, and SigV4 covers the Host header and path, so the URL cannot be
 * fixed up client-side after signing — it has to be signed for the address the device
 * will actually use (audit INFRA-H1).
 *
 * Falls back to `S3_ENDPOINT` when no public endpoint is configured, which is the
 * correct behaviour in dev where the browser and the server share one address.
 */
export function getS3ForSigning(): S3Client {
  signingClient ??= configure(env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT)
  return signingClient
}
