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
  // No 'X-Powered-By: Next.js' — an ERP holding payroll and LC data does not advertise
  // its stack to whoever port-scans the factory's static IP.
  poweredByHeader: false,
  // The service layer runs on the server only; these are never bundled for the browser.
  serverExternalPackages: ['postgres', 'bullmq', 'ioredis'],
  typedRoutes: true,
  experimental: {
    // Server actions ARE the backend here (dev-plan §1); keep the body limit
    // generous enough for offline sync batches from floor tablets.
    serverActions: { bodySizeLimit: '4mb' },
  },
  // Baseline security headers (audit INFRA-H6). Set here rather than in the reverse
  // proxy so a deployment that skips or misconfigures Caddy still ships them, and so
  // `next dev` behaves like production instead of hiding header-dependent breakage.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Session cookies + no CSP was the audit's finding: any injected script ran
          // with full access. This CSP keeps scripts to our own bundles. 'unsafe-inline'
          // stays for styles only — the fx components set style attributes pervasively.
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Next's runtime needs 'unsafe-inline' for its bootstrap script and
              // 'unsafe-eval' in dev for react-refresh; both are dropped in production
              // builds of the script policy below where possible. Kept minimal: no
              // third-party origins at all — the CSP doubles as an egress inventory.
              process.env.NODE_ENV === 'development'
                ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
                : "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self'",
              // Presigned S3 uploads go straight from the browser to object storage.
              `connect-src 'self' ${process.env.S3_PUBLIC_ENDPOINT ?? process.env.S3_ENDPOINT ?? ''}`.trim(),
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(), microphone=()' },
          // Two years, preload-eligible. Harmless over plain HTTP (browsers ignore it),
          // load-bearing the moment TLS terminates in front of this process.
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
    ]
  },
}

export default nextConfig
