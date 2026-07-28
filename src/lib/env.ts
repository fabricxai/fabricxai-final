/**
 * Boot-time environment validation (dev-plan §3, §6 "Zod at every boundary … env at boot").
 *
 * Importing this module validates `process.env` once and throws with EVERY missing or
 * malformed key listed — not just the first one. It is imported by `next.config.ts`,
 * `src/instrumentation.ts` and `src/worker/index.ts`, so app, worker and build all fail
 * fast rather than dying on the first request that happens to need a key.
 *
 * Keys that only matter in production (model providers, email, Sentry) are optional in
 * development so a fresh clone boots against docker-compose alone, and required in
 * production so a deploy can never go out half-configured.
 */
import { z } from 'zod'

if (typeof window !== 'undefined') {
  throw new Error('src/lib/env.ts is server-only — never import it from a client component')
}

const bool = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1')

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.url(),

  // Postgres: the app goes through PgBouncer (transaction mode); migrations MUST bypass
  // it — prepared statements and session state do not survive a transaction pooler.
  DATABASE_URL: z.string().min(1).startsWith('postgres'),
  DIRECT_DATABASE_URL: z.string().min(1).startsWith('postgres'),

  REDIS_URL: z.string().min(1).startsWith('redis'),

  // Better Auth — session cookie signing. Rotation documented in docs/runbooks.
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 chars'),
  BETTER_AUTH_URL: z.url().optional(),

  // Object storage: MinIO in dev/prod, any S3 API later — all code uses @aws-sdk/client-s3.
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_FORCE_PATH_STYLE: bool.default(true),

  // Model providers — routed by task type in the model registry (PLAYBOOK §6a).
  // Modules never name a model; only the registry reads these.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  /** Serve MARBIM from fixtures — no provider calls. Dev/test only. */
  MARBIM_MOCK: bool.default(false),

  // Email: transactional only, never self-hosted SMTP in prod. Dev uses Mailpit.
  RESEND_API_KEY: z.string().min(1).optional(),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  EMAIL_FROM: z.email().default('no-reply@fabricxai.local'),

  SENTRY_DSN: z.string().optional(),

  /** BullMQ default per-queue concurrency in the worker process. */
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
})

const envSchema = baseSchema.superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') return

  const requiredInProd = [
    'ANTHROPIC_API_KEY',
    'GEMINI_API_KEY',
    'OPENAI_API_KEY',
    'RESEND_API_KEY',
    'SENTRY_DSN',
  ] as const

  for (const key of requiredInProd) {
    if (!env[key]) {
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: `${key} is required when NODE_ENV=production`,
      })
    }
  }

  if (env.MARBIM_MOCK) {
    ctx.addIssue({
      code: 'custom',
      path: ['MARBIM_MOCK'],
      message: 'MARBIM_MOCK must be off in production',
    })
  }
})

export type Env = z.infer<typeof baseSchema>

/**
 * `.env` files spell "not configured yet" as `KEY=` — an empty string, not an absent
 * key. Strip those before parsing so `.optional()` and `.default()` behave the way the
 * file reads, instead of every blank placeholder failing as "too small".
 */
function withoutBlanks(source: NodeJS.ProcessEnv): Record<string, string> {
  const cleaned: Record<string, string> = {}
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value.trim() !== '') cleaned[key] = value
  }
  return cleaned
}

/**
 * `next build` imports every route module to collect page data, which reaches this file.
 * A build is NOT a boot: production secrets are not available when an image is built and
 * must not be, or CI needs the real keys and the image ends up carrying placeholders.
 *
 * So during a production build the validation is skipped and whatever happens to be set
 * is passed through. Nothing should read a connection string at build time anyway —
 * `src/db/client.ts` is lazy for exactly this reason — and if something does, it gets
 * `undefined` and fails loudly at that point rather than being quietly papered over.
 *
 * The real gate is unchanged: `src/instrumentation.ts` and `src/worker/index.ts` validate
 * on every server boot, so a misconfigured deployment dies immediately at startup.
 */
const isNextBuild = process.env.NEXT_PHASE === 'phase-production-build'

function loadEnv(): Env {
  const source = withoutBlanks(process.env)
  const parsed = envSchema.safeParse(source)

  if (!parsed.success) {
    if (isNextBuild) return source as unknown as Env

    const lines = parsed.error.issues.map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`)
    throw new Error(
      `Invalid environment (${lines.length} problem${lines.length === 1 ? '' : 's'}):\n` +
        `${lines.join('\n')}\n\n` +
        `Copy .env.example to .env and fill it in — values matching docker-compose.dev.yml are already there.`,
    )
  }

  return parsed.data
}

export const env: Env = loadEnv()

export const isProduction = env.NODE_ENV === 'production'
export const isDevelopment = env.NODE_ENV === 'development'
