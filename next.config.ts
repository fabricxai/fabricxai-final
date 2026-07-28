import type { NextConfig } from 'next'

/**
 * Env is validated at BOOT, in `src/instrumentation.ts` and `src/worker/index.ts` — not
 * here. A build is not a boot: production secrets are not available when an image is
 * built, and they must not be, or every CI run needs the real keys and the image ends up
 * carrying placeholders. The container starts, validates, and fails fast if anything is
 * missing; that is what "fail fast" means for a deployed process.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The service layer runs on the server only; these are never bundled for the browser.
  serverExternalPackages: ['postgres', 'bullmq', 'ioredis'],
  typedRoutes: true,
  experimental: {
    // Server actions ARE the backend here (dev-plan §1); keep the body limit
    // generous enough for offline sync batches from floor tablets.
    serverActions: { bodySizeLimit: '4mb' },
  },
}

export default nextConfig
