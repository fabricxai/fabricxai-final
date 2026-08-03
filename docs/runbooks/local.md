# Runbook · run it locally

For clicking through the product on your own machine before it goes anywhere. Production
is [`deploy.md`](./deploy.md); this file is deliberately not that — it uses the dev compose,
Mailpit instead of real email, and MARBIM's fixture provider.

---

## 1 · Bring it up

```bash
cd ~/Projects/fabricXai/fabricxai-POC

# Infrastructure: postgres, pgbouncer, redis, minio, mailpit.
docker compose -f docker-compose.dev.yml up -d

# Schema and the non-owner app role. Both idempotent — safe to re-run.
pnpm db:migrate
pnpm db:setup-roles

# Two processes, two terminals. The worker is not optional: schedules, event consumers
# and notifications all live there, so without it approvals never route and nothing is
# derived.
pnpm dev
pnpm worker:dev
```

The app validates its whole environment, asserts its database role cannot bypass RLS, and
warms the module registry before serving anything — so a cold start takes a few seconds and
says what it did:

```
{"severity":"info","msg":"environment validated"}
{"severity":"info","msg":"database role verified — RLS applies to this connection"}
{"severity":"info","modules":21,"msg":"module registry populated"}
```

| | |
|---|---|
| App | http://localhost:3000 |
| Mailpit (every email the app sends) | http://localhost:8025 |
| MinIO console | http://localhost:9001 |

---

## 2 · Data

```bash
pnpm seed            # factory-scale reference data, idempotent
pnpm demo            # the order/RFQ/lead walkthrough the screens were built against
```

`pnpm demo` is what fills the screens a merchandiser looks at — `seed` alone leaves orders,
buyers and RFQs empty, which reads as a broken screen rather than an empty factory.

**If more than one company has an owner, `demo` refuses rather than guessing.** Pin it:

```bash
DEMO_COMPANY_ID=<company uuid> pnpm demo
```

Integration test runs leave companies behind, so this happens on any machine that has run
`pnpm test:integration`. Find the one you want:

```bash
docker exec fxai-postgres psql -U fabricxai -d fabricxai -c "
  select c.id, c.name, count(r.*) as users
  from companies c join roles r on r.company_id = c.id
  group by c.id, c.name order by users desc"
```

Those leftovers are harmless — RLS means a login only ever sees its own company — but they
make `demo` ambiguous.

### Starting completely clean

```bash
pnpm seed --reset    # deletes the seed company's rows and rewrites them
```

---

## 3 · Signing in

Seeded accounts, one per department, all with the password **`FabricXai-seed-2026`**:

```
owner+<short>@seed-apparels.test        merch+<short>@seed-apparels.test
store+<short>@seed-apparels.test        production+<short>@seed-apparels.test
quality+<short>@seed-apparels.test      commercial+<short>@seed-apparels.test
hr+<short>@seed-apparels.test           viewer+<short>@seed-apparels.test
```

`<short>` is the first 8 characters of the company id — the seed makes addresses unique per
company so several seeded factories can coexist. List them:

```bash
docker exec fxai-postgres psql -U fabricxai -d fabricxai -c "
  select r.role, u.email from roles r join users u on u.id = r.user_id
  where r.company_id = '<company uuid>' order by r.role"
```

**Sign in as different roles — it is the point.** Nav is computed server-side from your
roles, and a screen your role cannot open is refused in the shell rather than hidden: a
storekeeper who types `/lcs` gets a locked panel, not the LC register.

> Signing up a brand-new factory works too (`/signup`) — verification email is required
> and lands in Mailpit at :8025.

---

## 4 · Worth clicking

**The floor, in Bangla.** Open the account menu (top right) → **Language · ভাষা** → বাংলা.
All twelve floor routes are translated, including their refusals:

```
/store  /store/receive  /store/issue  /store/rolls
/cutting  /cutting/lay  /cutting/report  /cutting/wastage
/lines  /lines/hourly  /lines/endline  /board
/quality  /quality/inline  /quality/fabric  /quality/final  /quality/measurements
```

The other 44 screens stay English on purpose — that is the office.

**Offline capture.** On `/store/receive`, open devtools → Network → Offline, then record a
GRN. The pill turns amber and holds it on the device; go back online and it drains. Replay
is a no-op, so nothing double-writes.

**A gate refusing.** Try to issue bonded stock without a UD on `/store/issue`, or start
cutting a lay whose PP sample is not approved on `/cutting/lay`. Both refuse server-side
with a sentence, not a disabled button.

**Password reset.** `/login` → "Forgotten your password?" → the mail arrives in Mailpit,
its link opens the reset form, and the token works once.

**`/board`** is the wall display — no sidebar, no MARBIM, meant to be read from thirty feet.

---

## 5 · Known rough edges

Not bugs to report — these are tracked in
[`../DEPLOYMENT-READINESS-AUDIT.md`](../DEPLOYMENT-READINESS-AUDIT.md):

- **MARBIM answers from fixtures, not a model.** `MARBIM_MOCK=true` locally; no real
  provider is registered anywhere yet, and its tools cannot execute (AI-B1, AI-B3).
- **Read-only screens.** The order TNA cannot be ticked, a lead cannot be converted, the
  planning board does not drag — those modules have no write surface yet (FE-B2, FE-B4,
  BE-B6).
- **No charts.** Sparklines and trend curves the design pack calls for are absent (FE-H4).
- **Desktop-first.** Floor screens have 48px targets but the sidebar does not collapse, so
  a 768px tablet is cramped (FE-H6).
- **Rate limits are off locally.** Auth limiting is production-only so it cannot fail the
  test suite; `RATE_LIMIT_ENFORCE=1 pnpm dev` turns it on if you want to see a 429.
- **Between 00:00 and 06:00 local**, anything that computes "today" is a day behind — 85
  sites still use UTC (INFRA-H2). Worth knowing if you test late.

---

## 6 · Checking your own changes

```bash
pnpm lint              # includes no-float-money and analytics-no-writes; --max-warnings=0
pnpm typecheck
pnpm test              # 718 unit
pnpm test:integration  # 609, against the real Postgres/Redis/MinIO/Mailpit
```

`test:integration` **spawns its own app on port 3100 and refuses to start if anything is
already there.** If it times out waiting for readiness, that is usually a leftover
`next dev`:

```bash
ss -ltnp | grep -E ':3000|:3100'
kill <pid>
```

It also shares one database with the app, so it writes to whatever `DATABASE_URL` points
at. Fine locally; never point it at anything you care about.
