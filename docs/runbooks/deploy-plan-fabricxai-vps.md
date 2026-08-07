# Deploy plan · fabricxai Contabo VPS (169.58.141.169)

**Status: §1 and §2 EXECUTED 2026-08-07 (see §11). §3 onward not started.** This is the
host-specific execution plan for
[`deploy.md`](./deploy.md); that runbook stays the source of truth for *why* each step
exists, this file records *what I will actually type* on this box and *what I need from you*.

Written 2026-08-07. Read §0 and §6 first — §6 is the list of things only you can supply,
and three of them block the deploy.

---

## 0 · What I verified on the host (read-only, already done)

I connected over SSH and looked; I changed nothing.

| Fact | Value | Verdict |
|---|---|---|
| Host | `169.58.141.169`, alias `fabricxai` | reachable, key auth works |
| OS | Ubuntu 24.04.4 LTS | supported |
| CPU / RAM / disk | 6 vCPU / 12 GB / 200 GB | **exactly the runbook's recommended sizing** |
| Disk type | `rotational=0` (SSD/NVMe) | `random_page_cost=1.1` default is correct — no override needed |
| Docker | not installed | §1 installs it |
| Firewall (ufw) | inactive | §1 enables it |
| Swap | none | §1 adds 2 GB (see note) |
| Ports 80/443 | nothing listening | no conflict; Caddy can bind |
| `/opt/fabricxai` | does not exist | greenfield, no data at risk |
| `deploy` user | does not exist | §2 creates it |

Two corrections to what we thought going in:

- **Your SSH config comment is stale.** It says *"Key not yet installed on the server —
  run `ssh-copy-id` first"*. The key **is** installed; `ssh fabricxai` authenticates with
  `~/.ssh/fabricxai_vps` and no password. You do not need to run `ssh-copy-id`. I'll fix
  that comment as part of §2.
- **The box is a match for the workload.** The runbook calls 12 GB "the comfortable floor"
  and 8 GB "leaves almost nothing for cache". You have 12 GB and an SSD, so the Postgres
  tuning committed in `96fba08` applies as written with no adjustment.

---

## 1 · Host baseline

Straight from `deploy.md` §1, plus swap.

```bash
curl -fsSL https://get.docker.com | sh          # official repo, not Ubuntu's (too old)

ufw default deny incoming
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

apt-get install -y fail2ban                     # this IP will be scanned within hours
systemctl enable --now fail2ban

timedatectl set-timezone Asia/Dhaka             # so `docker logs` and cron read as Dhaka
```

**Swap — a deviation from the runbook, and I want your nod.** The box has none. The
compose memory limits total 5.5 GB against 12 GB, so it will not swap in normal running;
2 GB exists so that a `docker build` or a Postgres `maintenance_work_mem` spike degrades
into slowness instead of the OOM killer choosing a victim. Cost is 2 GB of a 191 GB disk.

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
sysctl -w vm.swappiness=10                      # swap as a safety net, not as a habit
```

**Ordering note:** `ufw --force enable` is run in the same SSH session it firewalls.
`ufw allow OpenSSH` comes first, so the session survives — but if anything in §1 goes wrong
I will stop rather than improvise, because the recovery path for a locked-out box is
Contabo's web console, not me.

---

## 2 · The deploy user

You asked for this specifically, so here is exactly what it is and what it is worth.

```bash
adduser --disabled-password --gecos '' deploy
usermod -aG docker deploy                       # see the honesty note below
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys

install -d -o deploy -g deploy /opt/fabricxai   # the app lives here, owned by deploy
```

Then a new block in **your local** `~/.ssh/config`, replacing the stale comment:

```
# ─── Contabo #2 — fabricxai ────────────────────────────────────
# vmi… · Ubuntu 24.04.4 LTS · verified working 2026-08-07
Host fabricxai
    HostName 169.58.141.169
    User root
    IdentityFile ~/.ssh/fabricxai_vps
    IdentitiesOnly yes

Host fabricxai-deploy
    HostName 169.58.141.169
    User deploy
    IdentityFile ~/.ssh/fabricxai_vps
    IdentitiesOnly yes
```

**Honesty about what this buys you.** `deploy` is in the `docker` group, and membership in
that group is root-equivalent on this host — `docker run -v /:/host` reads and writes
anything. So the deploy user is *operational hygiene*, not a security boundary: it means
routine deploys are not typed as root, day-to-day file ownership under `/opt/fabricxai` is
not root's, and a fat-fingered command has a smaller blast radius. It does **not** contain
someone who compromises the account. Real containment would be rootless Docker, which
breaks binding 80/443 and is not worth it here. I would rather say this plainly than let
"we run as a deploy user" sound like more than it is.

**Root login stays enabled** through the first successful deploy. Hardening SSH while I am
mid-deploy over SSH is how a box gets orphaned. Once §5 verifies green, I can set
`PermitRootLogin prohibit-password` (key-only, no password) as a follow-up if you want it.

---

## 3 · The gap: nothing publishes a container image

This is the one real hole between the repo and a running deployment, and it is worth
understanding before you pick.

`docker-compose.prod.yml` requires `IMAGE` — a registry reference, ideally pinned by digest
(`ghcr.io/org/fabricxai@sha256:…`). The runbook is emphatic: *"Pin by digest, never
`:latest`. During an incident 'which build is running' is the question you least want to be
unable to answer."*

But CI's `docker` job builds the image with **`push: false`** (`.github/workflows/ci.yml`).
It builds, Trivy-scans it, proves it refuses to boot without a valid environment — and then
throws it away. **No registry anywhere holds a FabricXAI image.** So `IMAGE` has nothing to
point at, and the runbook's §4 and §5 cannot run as written.

Two ways to close it:

### Option A — publish to GHCR (recommended)

Add a workflow that builds and pushes to `ghcr.io/fabricxai/fabricxai` on every push to
`main`, tagged with the commit SHA and pinned by digest in `.env.production`. Uses the
Actions `GITHUB_TOKEN` with `packages: write` — **no new PAT needed**, so your existing
`gh` scopes (which lack `write:packages`) are not a blocker.

- *For:* keeps the repo's digest-pinning discipline; the VPS pulls a pre-built, already
  scanned image; rollback is one line in `.env.production`; the box is never busy building.
- *Against:* one new workflow file to review; first push takes ~10-20 min of CI.

### Option B — build on the VPS

`git pull && docker compose build && up -d`. No registry.

- *For:* nothing new to add; fully self-contained.
- *Against:* throws away digest pinning and the Trivy scan; a Next.js build on a box also
  serving the factory competes for the RAM the plan just budgeted; "which build is running"
  becomes unanswerable. A rollback means rebuilding an old commit rather than pulling a
  known-good digest.

**I recommend A** — it is what the compose file and runbook were written for, and B quietly
discards two safety properties the repo went to some trouble to establish.

### DECIDED 2026-08-07: Option A, publishing from `fabricxai-poc-baraka`

- Image: `ghcr.io/fabricxai/fabricxai-poc-baraka`, tagged by commit SHA, **deployed by
  digest**.
- Implemented as a `publish` job in `.github/workflows/ci.yml`. It `needs:` all eight
  quality jobs (`static`, `browser`, `migrations`, `owner-privileges`, `integration`,
  `e2e`, `supply-chain`, `docker`) and is `main`-only, so an image reaches the registry
  only if every gate passed for that commit. The `docker` job's Trivy scan and boot check
  stay upstream of it — a gate you can push past is decoration.
- Auth is the Actions `GITHUB_TOKEN` with `permissions: packages: write`. No PAT, so no
  long-lived credential exists for a once-per-merge job.
- The digest line to paste into `.env.production` is printed to the job summary.

---

## 4 · Secrets and configuration

Per `deploy.md` §2. Generated **on the VPS**, so they never touch this laptop or a chat log:

```bash
cd /opt/fabricxai
git clone <the repo you choose> .
cp .env.production.example .env.production && chmod 600 .env.production

# GENERATE-marked values
for k in BETTER_AUTH_SECRET; do echo "$k=$(openssl rand -base64 32)"; done
for k in POSTGRES_PASSWORD APP_DB_PASSWORD PGBOUNCER_AUTH_PASSWORD REDIS_PASSWORD MINIO_ROOT_PASSWORD; do
  echo "$k=$(openssl rand -base64 24 | tr -d '/+=')"    # stripped: these go inside URLs
done
echo "HEALTH_TOKEN=$(openssl rand -hex 24)"

mkdir -p secrets && chmod 700 secrets
source .env.production
printf '"pgbouncer_auth" "%s"\n' "$PGBOUNCER_AUTH_PASSWORD" > secrets/pgbouncer-userlist.txt
chmod 600 secrets/pgbouncer-userlist.txt
```

Then I fill in `APP_DOMAIN`, `APP_URL` (**must be `https://`** — Better Auth infers
secure-cookie behaviour from the scheme and `http://` silently issues non-secure session
cookies), `TLS_EMAIL`, `IMAGE`, and the SMTP block.

`HEALTH_TOKEN` is set deliberately: without it `/api/health/jobs` returns 503 and refuses to
report, which means a schedule that stops firing is invisible.

**Backing up `.env.production` off this host is your job and I will remind you at the end.**
Also `PGBACKREST_CIPHER_PASS` if we do §7 — without the cipher pass the backups are
unreadable and there is no recovery from that.

---

## 5 · Bring-up and verification

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

Order is enforced by the compose file: `postgres` → `migrate` (migrations + role
provisioning, runs to completion) → `pgbouncer`/`redis`/`minio` → `app`/`worker` → `caddy`.
If `migrate` exits non-zero, app and worker never start — deliberately, because a new image
serving requests against an un-migrated schema is a 500-storm with no obvious cause.

Verification I will run and report back, rather than declaring success:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production ps    # all healthy
curl -fsS https://<domain>/api/ready | jq                                  # deps: pg + redis
curl -fsS -H "Authorization: Bearer $HEALTH_TOKEN" https://<domain>/api/health/jobs | jq
```

`deploy.md` §4 has a table of expected failures and their causes (wrong DB role, DNS not
resolving, userlist not reaching the pooler). I will work that table rather than guess.

**Then the first factory is created by you, not me:** sign up through the UI at
`https://<domain>/signup`. That path creates the company and owner role in one hook; there
is no admin CLI, deliberately. **The verification email is required to sign in** — if SMTP
is wrong, the account exists and cannot be used, which is why SMTP is a blocking question.

**I will not run `pnpm seed`.** It creates verified users with a published password; the
script refuses on production anyway.

---

## 6 · What I need from you — 3 blocking, 2 not

| # | Question | Blocking? |
|---|---|---|
| 1 | ~~Domain~~ | ✅ `baraka.fabricxai.com` → A record to `169.58.141.169` |
| 2 | ~~Image strategy~~ | ✅ Option A, GHCR (§3) |
| 3 | ~~Mail~~ | ✅ Resend (see §6a) |
| 4 | ~~Which repo~~ | ✅ `fabricxai-poc-baraka` |
| 5 | **Real factory data, or demo/pilot?** | No — changes §7 only |

On **1**: DNS must resolve to this host *before* bring-up. Caddy proves domain control over
port 80 to get its certificate, and a name that does not resolve yet fails that. Propagation
can take minutes to hours, so start it early — it is the long pole.

On **3**: there is no way around this. Email verification is mandatory to sign in, so
without a working mail path the deployment comes up healthy and nobody can log in.

### 6a · Mail: Resend, outbound only

`src/lib/mailer.ts` sends three things — verification, password reset, notifications —
through one `POST https://api.resend.com/emails`. There is no inbound route, no webhook and
no reply parsing anywhere in `src/app/api/`. **Inbound/receiving does not need enabling.**

- The **MX record Resend asks for is not an inbox.** It sits on `send.<domain>` and points
  at `feedback-smtp.<region>.amazonses.com` — the bounce return-path, for SPF alignment.
- **Replies go nowhere.** The mailer sets `from` and no `reply_to`, so use a `no-reply@`
  address rather than one that invites an answer nobody reads.
- Verify a dedicated sending subdomain (`mail.fabricxai.com`) so transactional reputation
  stays separate from the main domain. It does not collide with `baraka.fabricxai.com`'s A
  record.

**Blocker found while checking this — `docker-compose.prod.yml:50`:**

```yaml
SMTP_HOST: ${SMTP_HOST:?a real SMTP host — mailpit is dev-only}
```

That `:?` makes compose refuse to start without `SMTP_HOST`. But `src/lib/env.ts:135`
requires only *one* of `SMTP_HOST` or `RESEND_API_KEY`, and `mailer.ts:37` prefers Resend
when set. So a **correct Resend-only `.env.production` cannot boot** — compose fails before
the app validates anything, and the error blames a missing SMTP host on a deployment that
does not need one. The compose file and the application disagree about what a valid mail
configuration is.

Fix: relax to `${SMTP_HOST:-}` and let `env.ts` be the single authority — it already
enforces "at least one mail path" with a message that names both options.

---

## 7 · Backups — the decision behind question 5

`deploy.md` §3 says to configure backups **before** the factory enters real data, and
`docker-compose.prod.yml` says the deployment "has an undefined RPO and should not hold a
payroll" until a restore has been rehearsed once. `scripts/backup.sh` and
`docker/backup/pgbackrest.conf` exist; what is missing is an **offsite bucket** (R2, B2,
another region — a backup on the host you are recovering from is not a backup) and a
rehearsed restore.

- **Demo/pilot with throwaway data:** we can skip §7 for now, and I will say plainly in the
  handover that this deployment has no backups.
- **Any real factory data — especially payroll:** §7 is not optional, and I will need
  bucket credentials. The restore rehearsal against a scratch host is a separate session.

---

## 8 · What will NOT work after this deploy

From `deploy.md` §6 and `docs/DEPLOYMENT-READINESS-AUDIT.md`. None of these are caused by
the deployment; they are the repo's own honest list, and you should know them before anyone
is shown the result.

- **MARBIM (the AI copilot) does not work.** No real provider is registered, so every AI
  answer hard-fails and uploaded documents accumulate unprocessed *while job health reports
  green* (AI-B1). `MARBIM_ENABLED` defaults to `false` and I will leave it false — telling
  the factory the copilot is off beats letting them discover it. Turning it on needs
  `ANTHROPIC_API_KEY` specifically, not just any provider key.
- **No error tracking.** `SENTRY_DSN` is read by nothing — `@sentry/nextjs` is not installed
  (INFRA-B5). Container logs are the only sink.
- **No rate limiting** on auth, `/api/sync`, or document presigning (INFRA-H7). Caddy's
  30 MB body cap is the only ceiling.
- **No AV scan** on uploads (INFRA-M12).
- **The floor mostly reads English.** Bangla covers `store/receive` and the route boundaries;
  eleven other floor routes do not (FE-B1).
- **85 sites compute "today" in UTC** for a UTC+6 factory (open in the audit). Setting the
  host timezone in §1 does *not* fix this — it is application-level.

---

## 9 · Rollback and blast radius

- Through §2, everything is additive on a box with no data. Worst case is a rebuild.
- From §5 on, rollback is `IMAGE` set to the previous digest, then `up -d` (Option A). Under
  Option B it means rebuilding an older commit.
- **Migrations are forward-only.** Rolling the image back does not roll the schema back. Every
  migration in this repo has been additive so far, which is what makes rollback usually safe
  — but a rollback across a destructive migration needs `restore.md`, not a redeploy.
- Docker volumes (`pgdata`, `miniodata`, `redisdata`, `caddy-data`) survive `down`. I will
  never run `down -v` on this host; that flag destroys the database.

---

## 10 · Execution order

1. §1 host baseline → report
2. §2 deploy user → report
3. **Stop.** Confirm §6 answers; DNS should be propagating by now
4. §3 image path (workflow PR if Option A — you review before merge)
5. §4 secrets on the box
6. §5 bring-up → verification output pasted back to you
7. You sign up the first factory; we confirm the verification email arrives
8. §7 backups, if question 5 says real data

I will report after each numbered step rather than running the whole thing and presenting a
result.

---

## 11 · Execution log

### 2026-08-07 · §1 host baseline + §2 deploy user — DONE

Run against a fresh box before the deploy questions were settled, because neither step
depends on them.

| Step | Result |
|---|---|
| Docker | 29.7.2 + Compose v5.4.0, from the official repo; enabled and active |
| ufw | active — 22/OpenSSH, 80/tcp, 443/tcp in; default deny incoming |
| fail2ban | active, `sshd` jail enabled |
| Timezone | Asia/Dhaka (+06) |
| Swap | 2 GB `/swapfile`, persisted in fstab, `vm.swappiness=10` |
| `deploy` user | uid 1001, groups `deploy users docker`, password **locked** (key-only) |
| `/opt/fabricxai` | exists, owned `deploy:deploy` |
| Verified | SSH as `deploy` works; `docker run hello-world` succeeds without sudo; `/opt/fabricxai` is writable by `deploy` |

Notes worth keeping:

- **fail2ban was not precautionary.** On first start it found **477 failed SSH attempts**
  already in the journal and banned 5 IPs immediately. The box had been up hours.
- **Ubuntu 24.04 needed an explicit `jail.local`.** The packaged fail2ban enables no jail by
  default, and there is no `/var/log/auth.log` on a stock 24.04 — the `sshd` jail must be
  turned on with `backend = systemd` or it silently protects nothing while reporting active.
- **`vm.swappiness=10`** — swap is the OOM safety net, not a routine tier. With 5.5 GB of
  container limits against 12 GB it should stay at 0 B in normal running.
- **Docker bypasses ufw for published ports.** It writes its own iptables rules ahead of
  ufw's chain, so a `ports:` entry in compose is reachable from the internet even if ufw
  does not list it. Harmless here — `docker-compose.prod.yml` publishes only Caddy's 80/443,
  which ufw allows anyway — but it means ufw is *not* what keeps Postgres unpublished. The
  compose file is. Do not add a `ports:` line to postgres, redis or minio and assume the
  firewall covers it.
- **Local `~/.ssh/config` updated:** stale "key not installed" comment replaced, and a
  `fabricxai-deploy` alias added alongside root's `fabricxai`.

Root login remains enabled by design until the first deploy verifies green.
