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
  /**
   * Browser-facing object-storage base, used ONLY to sign presigned URLs.
   *
   * `S3_ENDPOINT` is the server's route to storage — on a compose deployment that is
   * `http://minio:9000`, which a floor tablet cannot resolve. SigV4 signs the Host
   * header and the path, so a URL signed for the internal name cannot be rewritten in
   * the browser: without this split every upload and download fails in production
   * (audit INFRA-H1). Optional, and falls back to `S3_ENDPOINT`, because in dev the two
   * are genuinely the same address.
   */
  S3_PUBLIC_ENDPOINT: z.url().optional(),
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
  /**
   * Whether the copilot is offered at all.
   *
   * Off by default, and off is the honest setting today: no real provider is registered,
   * so an enabled MARBIM hard-fails every question while its extraction poller silently
   * accumulates unread documents (audit AI-B1). A factory should be told the copilot is
   * not available rather than shown one that does not work.
   */
  MARBIM_ENABLED: bool.default(false),

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

  // ── A working mail path, by either route ────────────────────────────────────
  //
  // Verification email is required to SIGN IN, so a deployment with no mail path is a
  // deployment nobody can log into. This used to demand RESEND_API_KEY specifically,
  // which was wrong in both directions: it failed a perfectly good SMTP deployment (the
  // one docker-compose.prod.yml actually describes) and would have passed a Resend key
  // with no sender configured.
  if (!env.RESEND_API_KEY && !env.SMTP_HOST) {
    ctx.addIssue({
      code: 'custom',
      path: ['SMTP_HOST'],
      message:
        'production needs a mail path: set SMTP_HOST (with SMTP_PORT) or RESEND_API_KEY. ' +
        'Email verification is required to sign in, so without one nobody can log in.',
    })
  }

  // ── MARBIM ─────────────────────────────────────────────────────────────────
  //
  // This used to require ANTHROPIC_API_KEY *and* GEMINI_API_KEY *and* OPENAI_API_KEY —
  // three unrelated vendor accounts — while no real provider was registered, so a
  // deployment had to buy and configure all three and then still got a hard failure the
  // moment anybody asked MARBIM a question (audit INFRA-H8).
  //
  // Now it is a flag. Off (the default) means the copilot is honestly absent. On means at
  // least one provider key must be present, because a MARBIM that is enabled and cannot
  // reach a model is the worst of the three states: it looks available and fails per use.
  if (env.MARBIM_ENABLED && !env.ANTHROPIC_API_KEY && !env.GEMINI_API_KEY && !env.OPENAI_API_KEY) {
    ctx.addIssue({
      code: 'custom',
      path: ['MARBIM_ENABLED'],
      message:
        'MARBIM_ENABLED is set but no provider key is configured — set at least one of ' +
        'ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, or unset MARBIM_ENABLED.',
    })
  }

  if (env.MARBIM_MOCK) {
    ctx.addIssue({
      code: 'custom',
      path: ['MARBIM_MOCK'],
      message: 'MARBIM_MOCK must be off in production',
    })
  }

  // SENTRY_DSN is deliberately NOT required. It is now actually read
  // (`lib/observability.ts`), and a single-factory pilot on a VPS with no Sentry account
  // is a legitimate deployment — it should ship logs and know that is what it has, rather
  // than refusing to boot over a monitoring tool. Its absence is warned about at startup.
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
