# FabricXAI Fashion — the role-testing tenant

A dev/staging tenant built for one job: exercising **every module's actions as every role
the system has**. Where `pnpm seed`'s own company covers eight roles, this tenant has a
login for all seventeen `role_name` values, and its data is filled by the same seed and
demo machinery the rest of the project uses.

- **Company**: FabricXAI Fashion · id `fabf0000-0000-4000-8000-000000000001` ·
  slug `fabricxai-fashion` · knit-composite (widest module surface: UD workbench, dye house)
- **Created by**: `scripts/seed-fabricxai-fashion.ts` (idempotent — re-run freely)

## 1 · Build / refill

```bash
docker compose -f docker-compose.dev.yml up -d
pnpm tsx scripts/seed-fabricxai-fashion.ts                         # tenant + 17 logins
SEED_COMPANY_ID=fabf0000-0000-4000-8000-000000000001 pnpm seed     # masters + floor data
DEMO_COMPANY_ID=fabf0000-0000-4000-8000-000000000001 \
DEMO_USER_ID=fxf-owner pnpm demo                                   # buyer, order, RFQs, leads
SEED_COMPANY_ID=fabf0000-0000-4000-8000-000000000001 pnpm seed     # again — see below
pnpm dev
```

The seed runs **twice** because its order-dependent slices (sampling, cutting, production,
shipment, finance, commercial LC/UD, store requisitions) bail quietly when the tenant has no
order, and the order comes from `pnpm demo`. Every step is idempotent; the whole sequence is
safe to re-run after a `--reset`-less drift.

`pnpm demo` needs both env vars here: more than one company has an owner in a shared dev
database, and the demo refuses to guess.

## 2 · Signing in

`http://localhost:3000/login`. **Every login below shares the seed password** — the constant
in `src/db/seed/identity.ts` (also listed in `docs/runbooks/local.md` §3).

One user per role, addressed by the role itself: **`<role>@fabricxai-fashion.test`**

| email (`…@fabricxai-fashion.test`) | role | person | locale |
|---|---|---|---|
| `owner@` | owner | Kamrul Hasan | en |
| `admin@` | admin | Sultana Razia | en |
| `merchandiser@` | merchandiser | Tanjila Akter | en |
| `commercial@` | commercial | Rafiqul Islam | en |
| `planner@` | planner | Nazmul Karim | en |
| `store@` | store | Abdul Kader | bn |
| `procurement@` | procurement | Sharmin Nahar | en |
| `cutting@` | cutting | Rafiq Hossain | bn |
| `production@` | production | Shilpi Begum | bn |
| `quality@` | quality | Mitu Rani | bn |
| `shipment@` | shipment | Jahid Hasan | en |
| `maintenance@` | maintenance | Sabbir Khan | bn |
| `hr@` | hr | Farzana Yasmin | en |
| `compliance@` | compliance | Rumi Chowdhury | en |
| `finance@` | finance | Salma Khatun | en |
| `member@` | member | Arif Mahmud | en |
| `viewer@` | viewer | Guest Viewer | en |

The seed also adds its own eight people to this tenant (`<key>+fabf0000@seed-apparels.test`,
same password). They duplicate roles the table above already covers — use whichever set you
like; the table is the canonical one.

## 3 · What each role should test

The data was chosen so the interesting states already exist — gates that refuse, variances
that need a decision, an inbox that is not empty.

- **owner** — sees and writes everything. Approve inbox (2 buyer-requirement drafts routed
  by the module-default rules), audit log, analytics boards, `/board`. The margin-floor and
  every server-side gate below are also theirs to override where the HANDOFF allows it.
- **admin** — supervisory everywhere **except payroll**: opening payroll must return a
  bodyless 403 (`PAYROLL_ROLES` is hr+owner, admin deliberately excluded). That refusal IS
  the test.
- **merchandiser** — 7 leads mid-pipeline, 3 RFQs (one overdue with an unanswered
  clarification), buyer H&M, order `PO-88203` with generated TNA and colour/size breakdown,
  costing studio (consumption template `polo-180gsm` is seeded; margin floor 10% via
  policy).
- **commercial** — 1 master LC, 2 UDs. Worth forcing: a bonded issue that would overdraw
  the UD (hard block), the LC latest-shipment conflict, EXP-number gate on bank docs.
- **planner** — factory tree (1 unit, 2 floors, 6 lines), planning boards.
- **store** (bn) — 3 GRNs, 50 rolls, issues, requisitions; the offline batch endpoint's
  `offline_key` idempotency (submit twice, one write); bonded GRN must reference a UD.
- **procurement** — 3 suppliers with quotes, purchase requisition; import PO should refuse
  when BTB headroom is exceeded.
- **cutting** (bn) — marker `MK-SH4471-A`, 3 lays, cut reports where `LAY-0043` is 18 pcs
  short on M (outside the 2% tolerance — the decision screen), 36 bundles with QR tokens,
  wastage 3.4% against a 3.0% plan. Cutting start is PP-gated: the sampling slice approved
  this style, so cutting is open — test the refusal on a fresh style.
- **production** (bn) — 6 daily line plans, 96 hourly outputs, a downtime, endline counts;
  efficiency and DHU boards derive from these.
- **quality** (bn) — 6,460 inline checks, 24 fabric inspections, measurement spec,
  day-close; defect codes are the semantic default set (16).
- **shipment** — 1 shipment, 45 cartons, finishing output; EXP number required before bank
  submission.
- **maintenance** (bn) — 48 machines, 4 tickets, PM schedules, spare parts.
- **hr** — 24 workers, 624 attendance rows (26 days), active gazette with 7 grades. Run a
  payroll; OT must compute at 2× basic hourly (basic/208). Payroll reads are audited.
- **compliance** — 1 audit, 4 findings, 4 CAPs, 5 certificates, 3 trainings.
- **finance** — invoice, payables, receivable against the demo order.
- **member** — the minimal-access baseline: most modules hidden or locked.
- **viewer** — read-only everywhere; every write control should be absent or refused
  server-side, not just hidden.

Cross-cutting, any role pair: propose→approve (module-default rules route to owner/admin),
`pending_changes` with per-field confidence, and RLS — nothing from Seed Apparels or any
other tenant may appear in any list.

## 4 · Known limits

- Document rows exist; **no bytes in MinIO** (seed policy) — previews 404 by design.
- `approval_rules.condition` is read by nothing; conditional routing cannot be tested.
- MARBIM is live when `.env` has `MARBIM_ENABLED=true` plus provider keys — keys alone do
  nothing, the flag defaults to off. With no `GEMINI_API_KEY`, document intake also needs
  `MARBIM_MODEL_EXTRACT=gpt-4o-mini` (the Gemini default no longer returns the logprobs
  confidence requires). Without any of that, fall back to `MARBIM_MOCK=true`.
- Intake reads PDFs and photos (JPEG/PNG/WebP) directly on the OpenAI extract path —
  attach the file, paste nothing. The Gemini extract path and the mock provider are
  text-only and refuse file-only submissions with a typed error.
- The tenant shares the dev database with other fixture companies — that is a feature: it
  is what makes the RLS checks in §3 meaningful.
