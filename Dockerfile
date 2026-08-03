# FabricXAI — one image, two processes (app and worker), selected by CMD.
#
# App and worker share a codebase and their module boundaries are enforced in code, not
# by deployment (architecture §1). Building one image keeps them in lockstep: a worker
# can never run against a different build of the service layer than the app does.

# ── deps ─────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ── build ────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# No secrets are needed to build, by design: env is validated at boot (instrumentation.ts
# and the worker entry), never at build time. An image that needs the production keys to
# compile is an image that ends up carrying them.
ENV NODE_ENV=production
RUN pnpm build

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Deliberately no corepack/pnpm here: the runtime only needs to execute binaries that are
# already in node_modules. Keeping the package manager out means one less thing running as
# the app user — and corepack wants a writable HOME, which a system user does not have.
ENV PATH=/app/node_modules/.bin:$PATH

# Do not run as root. A container that does is one file-write bug from a bad day.
#
# dumb-init is PID 1 for a specific reason (audit INFRA-H4): the worker's entry runs
# under `tsx`, which spawns a child Node process. As PID 1, tsx does not reliably
# forward SIGTERM to that child, so the careful graceful drain in
# `src/worker/index.ts` — stop the relay, close workers before queues so in-flight
# jobs are interrupted rather than marked failed — never ran on a deploy. Every
# rolling restart hard-killed jobs mid-transaction and left them stalled.
RUN apt-get update \
 && apt-get install -y --no-install-recommends dumb-init \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 fabricxai \
 && useradd --system --uid 1001 --gid fabricxai --home-dir /app fabricxai

COPY --from=deps  --chown=fabricxai:fabricxai /app/node_modules ./node_modules
COPY --from=build --chown=fabricxai:fabricxai /app/.next        ./.next
COPY --from=build --chown=fabricxai:fabricxai /app/public       ./public
COPY --from=build --chown=fabricxai:fabricxai /app/src          ./src
COPY --from=build --chown=fabricxai:fabricxai \
     /app/package.json /app/next.config.ts /app/tsconfig.json /app/drizzle.config.ts ./

USER fabricxai
EXPOSE 3000

# Uptime Kuma and the orchestrator both poll this; it exercises Postgres through
# PgBouncer and Redis, so a green check means the real paths work.
#
# 60s start-period, not 20s: a cold Next 16 boot on a loaded VPS validates the whole
# environment, warms the module registry and asserts the database role before it
# serves anything, and a check that fires before that finishes restarts a container
# that was about to be fine.
#
# The WORKER SERVICE MUST SET `healthcheck: disable: true` — it serves no HTTP, so it
# inherits this check and reports unhealthy forever. docker-compose.prod.yml does.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# dumb-init reaps zombies and forwards signals; see the note above the install.
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# The worker container overrides this with:  ["tsx", "src/worker/index.ts"]
CMD ["next", "start"]
