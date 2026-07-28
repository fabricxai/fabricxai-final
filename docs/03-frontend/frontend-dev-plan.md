# FabricXAI — Frontend Development Plan
### How the 23 designed modules become production screens

**Relationship to the rest:** Claude Design produces locked screens per the build-pack prompts → the HANDOFF file captures the contract → backend builds to it (02-backend/PLAYBOOK.md) → THIS plan governs turning the locked design into shipped React code in the same repo. Frontend and backend for a module land in the same phase, frontend one PR behind.

---

## 1. Stack (final)

Next.js 16 app router · React server components by default, client components only where interaction demands · Tailwind v4 on `theme.css` tokens · Radix/shadcn primitives already in repo · TanStack Query for client-side data (mutations, polling, offline queue) · TanStack Virtual for big tables · `next-intl` for i18n (en, bn) · Recharts on the viz palette · Playwright for E2E.

**Non-choices:** no Redux/Zustand global store (server state via Query, UI state local), no CSS-in-JS, no component library beyond Radix+ours.

---

## 2. The component library build (Phase F0 — parallel to backend Phase 0)

Before any module screen, build/refactor the shared primitives to the new design system, each with a story-style demo page under `/dev/components` (internal route):

| Component | Source | Notes |
|---|---|---|
| PageShell, TopBar, Sidebar | refactor existing | density attribute pass-through |
| SmartTable v2 | refactor | virtualized, server sort/filter contract, selvage support, tabular nums |
| DetailDrawer | refactor | glass, 20 radius, route-driven (`?drawer=`) |
| KPICard, StatusChip, CountdownChip | new | status = dot + word, amber rule enforced by API (no `status="amber"` possible) |
| BreakdownGrid | new | the size×color matrix: entry mode, diff overlay, live totals — used by 1.3, 5.1, 8.1 |
| MilestoneTimeline | new | TNA rows, ripple preview slot |
| WorkflowStepper | refactor | |
| DraftCard + ConfidenceBar + SourcePanel | new | the MARBIM review UX; FieldDiff shared with revisions |
| NumpadInput, FloorList | new | floor density entry patterns |
| OfflineBanner + SyncPill | new | one implementation, every floor screen |
| WeaveLoader, ThreadRule, SelvageCard | new | signature elements from theme.css |
| MoneyText, QtyText | new | currency/unit always rendered; wraps formatting + bn digits toggle |

Exit criteria: `/dev/components` renders all of the above in both densities, both themes' languages, with axe-core passing.

## 3. i18n and Bengali — day-one rules

- Every string through `next-intl` keys from the first component; CI greps JSX for bare string literals in `modules/` screens.
- `bn.json` maintained per module in the same PR (machine-first translation, human-reviewed before pilot).
- Numbers: `QtyText`/`MoneyText` handle Bengali-digit toggle from Settings; dates via a shared formatter (never raw `toLocaleDateString` calls).
- Layout tested at 1.4× string length (the component demo pages include a "longest bn string" toggle).

## 4. Offline client (floor screens)

One implementation in `lib/offline`: an IndexedDB queue keyed by `offline_key` (uuid per entry), background sync via TanStack Query mutations with retry, `SyncPill` reflecting queue depth honestly, replay-safe because the server upserts idempotently. Screens opt in by using `useOfflineMutation` — no bespoke offline code per module. Conflict rule: last-write-wins per natural key (line-hour, GRN device-id) with a reconciliation report screen for the rare disagreement.

## 5. Per-module frontend loop (mirrors the backend playbook)

A. Preconditions: HANDOFF locked; backend module merged (or its contract mocked via MSW from the HANDOFF §5 table for parallel work).
B. Kickoff prompt to Claude Code:
```
Read CLAUDE.md, docs/handoffs/HANDOFF-<id>.md, and the module's frontend
prompt in docs/01-design/fabricxai-department-build-pack.md.
Implement screens S1..Sn as listed in HANDOFF §1 using ONLY components
from src/components (see /dev/components) plus module-local composition.
Data via the actions/queries named in HANDOFF §5 — no fetch calls, no
new endpoints. Every string is an i18n key (add to en.json + bn.json).
Include empty, loading (WeaveLoader), error, and (if floor) offline states.
Stop after S1 for review.
```
C. Review gates (human): design fidelity vs the locked Claude Design export (side-by-side screenshot), amber-rule audit (search the diff for amber outside act-surfaces), density correctness, keyboard path (desk screens), axe-core clean, bn toggle renders.
D. E2E: extend the Playwright golden path when the module joins it.
E. Same PR discipline as backend; screenshots in the PR description.

## 6. Phase alignment

| Backend phase | Frontend work in the same window |
|---|---|
| 0–1 Foundation/migration | F0 component library; auth screens on Better Auth; app shell |
| 2 Trust layer | Approve Inbox screens + DraftCard family (the pattern-setters) |
| 3 Orders/TNA | Order Desk screens — the flagship; BreakdownGrid + MilestoneTimeline harden here |
| 4 Store/Production | Floor screens + offline client + TV board variant |
| 5–8 remaining modules | per-module loop, one PR behind backend |
| 9 Hardening | Lighthouse/perf pass (LCP < 2.5s on a 2018 shared PC profile), bundle audit, bn review complete |

## 7. Performance budgets (enforced in CI where measurable)

Route JS < 250KB gz per screen · SmartTable smooth at 10k virtualized rows · floor screens interactive < 3s on low-end hardware profile · zero layout shift on entry grids · glass effects auto-off via `data-perf="low"` heuristic (device memory + connection API).

## 8. Definition of done — frontend module

Screens match HANDOFF §1 inventory incl. all states · reads/writes only via HANDOFF §5 names · i18n complete both languages · axe clean · budgets met · E2E updated · design-fidelity screenshot approved by whoever owns design review.
