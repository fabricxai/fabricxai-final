# Runbook · deploy

One VPS, one factory. First deploy is §1–§4; every deploy after that is §5, which is
three commands.

**Sizing:** 4 vCPU / 8GB / 80GB SSD carries one factory (~2,400 workers, 20 lines)
comfortably. The memory limits in `docker-compose.prod.yml` add to ~5.5GB, leaving the
host room for the page cache Postgres actually runs on.

---

## 1 · Host baseline

```bash
# Docker from the official repo, not the distro's — the distro's is usually old enough
# to lack the compose features this file uses.
curl -fsSL https://get.docker.com | sh

# Firewall: only SSH and HTTP(S). Postgres, Redis and MinIO are NOT published by the
# compose file, but a firewall is what makes that a guarantee rather than a property of
# a file somebody may edit later.
ufw default deny incoming
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# Brute-force protection on SSH. The factory's static IP will be scanned within hours.
apt-get install -y fail2ban
systemctl enable --now fail2ban

# The factory reads Asia/Dhaka. Set the host to match so `docker logs` timestamps and
# the cron schedule in scripts/backup.sh mean what they appear to mean. The APPLICATION
# does not depend on this — every schedule registers its own tz — but the humans do.
timedatectl set-timezone Asia/Dhaka
```

DNS must already point at this host before §4: Caddy proves domain control over port 80
to get its certificate, and a name that does not resolve yet fails that.

---

## 2 · Secrets

```bash
git clone <repo> /opt/fabricxai && cd /opt/fabricxai
cp .env.production.example .env.production

# Generate every value marked GENERATE. Do not reuse a secret from anywhere else.
for k in BETTER_AUTH_SECRET; do echo "$k=$(openssl rand -base64 32)"; done
for k in POSTGRES_PASSWORD APP_DB_PASSWORD PGBOUNCER_AUTH_PASSWORD REDIS_PASSWORD MINIO_ROOT_PASSWORD; do
  echo "$k=$(openssl rand -base64 24 | tr -d '/+=')"
done
```

> Strip `/+=` from the database and Redis passwords. They end up inside connection URLs,
> where those characters need percent-encoding and will otherwise produce an
> authentication failure that reads exactly like a wrong password.

Then edit `.env.production`: paste those in, set `APP_DOMAIN`, `APP_URL`, `TLS_EMAIL`,
`IMAGE`, and the SMTP block. **`APP_URL` must be `https://`** — Better Auth infers
secure-cookie behaviour from its scheme, so `http://` silently issues non-secure session
cookies.

### The pooler's userlist

One line, for one low-privilege role. This is the only credential on the pooler's disk;
the application's password never leaves Postgres (migration 0070).

```bash
mkdir -p secrets && chmod 700 secrets
source .env.production
printf '"pgbouncer_auth" "%s"\n' "$PGBOUNCER_AUTH_PASSWORD" > secrets/pgbouncer-userlist.txt
chmod 600 secrets/pgbouncer-userlist.txt
```

`secrets/` is gitignored. Back up `.env.production` and
`PGBACKREST_CIPHER_PASS` somewhere that survives this host — without the cipher pass the
backups are unreadable, and there is no recovery from that.

---

## 3 · Backup configuration

Do this **before** the factory enters real data, not after.

```bash
cp /dev/null .env.backup && chmod 600 .env.backup
cat >> .env.backup <<'EOF'
PGBACKREST_BUCKET=
PGBACKREST_ENDPOINT=
PGBACKREST_REGION=auto
PGBACKREST_KEY=
PGBACKREST_SECRET=
PGBACKREST_CIPHER_PASS=
DOCS_BACKUP_ENDPOINT=
DOCS_BACKUP_BUCKET=
DOCS_BACKUP_KEY=
DOCS_BACKUP_SECRET=
BACKUP_HEARTBEAT_URL=
BACKUP_ALERT_URL=
EOF
```

The repository must be **somewhere else** — R2, B2, another region. A backup on the host
you are recovering from is not a backup.

```bash
# Initialise the stanza once, then take one full backup and prove it reads back.
docker compose -f docker-compose.prod.yml --env-file .env.production \
  run --rm --entrypoint pgbackrest backup --stanza=fabricxai stanza-create
bash scripts/backup.sh

# Cron, at 01:15 Dhaka.
echo '15 1 * * * cd /opt/fabricxai && ./scripts/backup.sh >> /var/log/fabricxai-backup.log 2>&1' | crontab -
```

Then **rehearse the restore** against a scratch host and sign the log in
[`restore.md`](./restore.md). Until that is done the RPO is unknown.

---

## 4 · First bring-up

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

Order is enforced by the file, not by you: `postgres` → `migrate` (migrations + roles,
runs to completion) → `pgbouncer`/`redis`/`minio` → `app`/`worker` → `caddy`. If
`migrate` exits non-zero, app and worker never start — which is the point, because a new
image serving requests against an un-migrated schema is a 500-storm with no obvious
cause.

```bash
# Watch it settle. The app validates its whole environment, warms the module registry
# and asserts its database role before serving anything, so give it up to a minute.
docker compose -f docker-compose.prod.yml --env-file .env.production ps
# /api/ready is the dependency check — Postgres and Redis through the pooler.
# /api/health is liveness only and answers 200 from a process that cannot reach either.
curl -fsS https://<domain>/api/ready | jq
```

Expected failures and what they mean:

| Symptom | Cause |
|---|---|
| `refusing to start: runtime database role … has SUPERUSER` | `DATABASE_URL` points at the owner. It must be `APP_DB_USER`. |
| `Invalid environment (N problems)` | A `.env.production` value is missing or malformed. The message lists every one. |
| Caddy cannot get a certificate | DNS does not resolve to this host yet, or 80/tcp is blocked. |
| App healthy, worker restarting | Check `PGBOUNCER_AUTH_PASSWORD` reached the userlist — the worker connects through the pooler too. |
| `/api/ready` 503 | Postgres or Redis unreachable from the app. The body says which; the reason is in the container logs, deliberately not in the response. |
| `/api/health/jobs` 503, `health_token_not_configured` | `HEALTH_TOKEN` is unset. The route refuses rather than publishing the schedule — set one (`openssl rand -hex 24`). |
| `/api/health/jobs` 503, tasks `silent` | Expected for one cycle after a first boot; the baseline is set from first observed run. |

### Create the first factory

> **If you harden the owner role to non-superuser** — the standard move, and what the
> `owner-privileges` CI job runs against — three things must be done once, as a superuser,
> because `BYPASSRLS` does not imply any of them:
>
> ```sql
> -- 1. Extensions. `vector` is not "trusted", so a non-superuser cannot create it.
> --    Migration 0000 then becomes a no-op via IF NOT EXISTS rather than a hard failure.
> CREATE EXTENSION IF NOT EXISTS vector;
> CREATE EXTENSION IF NOT EXISTS pg_trgm;
> CREATE EXTENSION IF NOT EXISTS btree_gin;
> CREATE EXTENSION IF NOT EXISTS pgcrypto;
>
> -- 2. The pooler's auth_query. app.pgbouncer_get_auth is SECURITY DEFINER, so it reads
> --    verifiers with the OWNER's rights. Without this, PgBouncer refuses every client.
> GRANT SELECT ON pg_shadow TO <owner>;
>
> -- 3. CREATEROLE on the owner, which provisions the app and pooler roles.
> ALTER ROLE <owner> CREATEROLE BYPASSRLS;
> ```
>
> `pnpm db:setup-roles` warns if the `pg_shadow` grant is missing, and
> `node scripts/verify-owner-privileges.mjs` proves all twelve SECURITY DEFINER helpers
> still answer. Note that `0000_extensions.sql`'s own comment — "a fresh production
> database is fully provisioned by `pnpm db:migrate` alone" — is true only when the owner
> is a superuser.

Sign up through the UI at `https://<domain>/signup`. That path creates the company and
the owner role in one hook; there is no admin CLI, deliberately — one code path for
creating a factory means one code path that gets exercised.

Verification email is **required** to sign in, so confirm the SMTP block works before
you need it. If the mail never arrives, the account exists and cannot be used.

> **Do not run `pnpm seed` against production.** It creates verified users with a
> published password. The script now refuses before it opens a connection — on
> `NODE_ENV=production`, and on any `DATABASE_URL`/`DIRECT_DATABASE_URL` that is not
> loopback, which covers the compose service names the production stack resolves. It
> names what it found and exits 1 (audit INFRA-M10).
>
> `SEED_FORCE=1` overrides it, for a scratch host or a staging tenant. That flag does not
> re-enable the seeded passwords: those stay refused whenever `NODE_ENV=production`, so a
> forced run leaves rows and no way in. An SSH tunnel that publishes a production database
> on localhost still looks local to this check — the guard is for the careless invocation,
> not the determined one.

---

## 5 · Every deploy after that

```bash
cd /opt/fabricxai
git pull                                    # for compose/Caddyfile changes
# Pin the new image by digest in .env.production, then:
docker compose -f docker-compose.prod.yml --env-file .env.production pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

`up -d` re-runs `migrate` to completion first, then recreates `app` and `worker`. The
worker gets a 40s grace period so its in-flight jobs drain rather than being killed
mid-transaction.

**Pin by digest, never `:latest`.** During an incident "which build is running" is the
question you least want to be unable to answer.

### Rolling back

```bash
# Set IMAGE back to the previous digest, then up -d.
```

Migrations are **forward-only**: rolling the image back does not roll the schema back, so
a rollback across a migration that dropped or renamed something needs a restore
([`restore.md`](./restore.md)) rather than a redeploy. In practice every migration in this
repo has been additive, which is what makes rollback usually safe — check the diff before
relying on it.

---

## 6 · What is still missing

Honest list, from `docs/DEPLOYMENT-READINESS-AUDIT.md`:

- **No error tracking.** `SENTRY_DSN` is required at boot and read by nothing —
  `@sentry/nextjs` is not installed (INFRA-B5). Container logs are the only sink, and
  they are unstructured `console.*`. Ship them somewhere before the pilot.
- **No rate limiting** on auth, `/api/sync`, or document presigning (INFRA-H7). Caddy's
  `request_body` cap is the only ceiling that exists.
- **No AV scan** on uploads, though `documents.status = 'quarantined'` is checked on
  download (INFRA-M12).
- **MARBIM does not work.** No real provider is registered, so every AI answer hard-fails
  and uploaded documents accumulate unprocessed while job health reports green
  (AI-B1). Tell the factory the copilot is off rather than letting them find it.
- **The floor mostly reads English.** Bangla covers `store/receive` and the route
  boundaries; the other eleven floor routes do not (FE-B1).
