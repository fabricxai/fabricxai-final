# FabricXAI — Master Documentation
### AI-powered ERP for garment export factories · complete build documentation

**What FabricXAI is, in one sentence:** it carries a buyer's email all the way to realized payment — every physical step (cut, sew, pass, pack) and every paper step (LC, UD, EXP, bank docs) in one system — with AI drafting the paperwork while humans keep the pen.

**Scope of this documentation:** 23 modules across 11 factory departments + 3 cross-cutting layers, full stack (backend, frontend, AI layer, owner phone app), production-ready targets including load, security, backup, and factory rollout.

---

## Reading order (start here)

**Everyone, once:**
1. This README, then `00-vision/product-overview.md` — the flow, the modules, the boundaries
2. `CLAUDE.md` — the repo rules every Claude Code session inherits
3. `02-backend/fabricxai-backend-architecture.md` §1 — the five load-bearing decisions

**By role, when working:**

| You are… | Your documents |
|---|---|
| Designing a module (Claude Design) | `01-design/fabricxai-department-build-pack.md` (its frontend prompt + shared preamble) · `01-design/theme.css` + `fabricxai-design-system.html` |
| Filling a handoff | `01-design/design-handoff-template.md` (includes a filled example) |
| Building backend | `02-backend/PLAYBOOK.md` §2 loop · `02-backend/briefs/<module>.md` · the module's HANDOFF |
| Building frontend | `03-frontend/frontend-dev-plan.md` · the HANDOFF · the build-pack prompt |
| Building/tuning AI | `04-ai-layer/marbim-implementation.md` · PLAYBOOK §6 model routing |
| Building the owner app | `05-owner-app/owner-app-spec.md` |
| Testing / load / release | `06-quality/testing-and-pressure.md` |
| Rolling out to a factory | `07-rollout/rollout-playbook.md` |
| Tracking status | `templates/PROGRESS.md`, `templates/STUBS.md` (copy into `docs/` of the repo) |

## The workflow (how a module goes from idea to a factory using it)

```
build-pack frontend prompt ──▶ Claude Design session ──▶ locked screens
        │                                                     │
        ▼                                                     ▼
02-backend/briefs/<m>.md (draft contract) ──▶ HANDOFF-<m>.md (§8 empty = final contract)
                                                              │
                              ┌───────────────────────────────┴───────────────┐
                              ▼                                               ▼
                    backend (PLAYBOOK §2 loop)                 frontend (frontend-dev-plan §5)
                              └───────────────┬───────────────────────────────┘
                                              ▼
                       tests + k6 (06-quality) ──▶ merged ──▶ pilot use (07-rollout)
```

Phase order and timelines: `02-backend/fabricxai-backend-dev-plan.md` §4 (backend) aligned with `03-frontend/frontend-dev-plan.md` §6. Design sessions run one phase ahead of code.

## Directory map

```
fabricxai-docs/
  README.md                     ← you are here
  CLAUDE.md                     ← commit to repo ROOT
  00-vision/product-overview.md
  01-design/    theme.css · design-system.html · department-build-pack.md · handoff-template.md
  02-backend/   architecture.md · dev-plan.md · backend-briefs.md · PLAYBOOK.md · briefs/ (23 files)
  03-frontend/  frontend-dev-plan.md
  04-ai-layer/  marbim-implementation.md
  05-owner-app/ owner-app-spec.md
  06-quality/   testing-and-pressure.md
  07-rollout/   rollout-playbook.md
  templates/    PROGRESS.md · STUBS.md
```

Repo placement: `CLAUDE.md` → repo root; everything else → `docs/` keeping this structure; create `docs/handoffs/` for the per-module handoff files as designs lock.

## The non-negotiables (if you remember five things)

1. No backend/frontend build without a HANDOFF whose §8 is empty.
2. Amber means "a person must act" — nowhere else, ever.
3. Gates are server-side; the UI only reflects them.
4. Every AI write is a draft through the Approve Inbox; every confidence is measured, never constant.
5. Payroll: gazette vectors before code, parallel month before go-live; the tenancy and state-machine tests are never skipped anywhere.

## Current status

Specification complete (23 modules, no known holes). Zero screens designed, zero handoffs filled, backend unbuilt. Next action: run the Order Desk & TNA design session (build-pack §1.3) while Claude Code executes backend Phase 0.
