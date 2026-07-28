# `src/modules` — the backend

One folder per module id (architecture §2.1). Boundaries are enforced by this folder
contract, lint rules and review — not by network hops. The uniformity is the point: it
is what makes building a module with Claude Code fast and safe.

The business module folders are **deliberately empty**. A module is not started until
its `docs/handoffs/HANDOFF-<id>.md` exists with §8 empty (PLAYBOOK, prime directive).

## Module folder contract

Every module has exactly these files:

| File | Contains |
|---|---|
| `schema.ts` | Drizzle tables, re-exported from `src/db/schema/index.ts` |
| `zod.ts` | Payload schemas, including the `pending_changes` payloads |
| `service.ts` | **All** business logic; state machines; gates; pure where possible |
| `queries.ts` | Screen-shaped read models — must match HANDOFF §3 field for field |
| `actions.ts` | Server actions: auth check → zod parse → service. No `db` access |
| `events.ts` | Outbox event names + payload types |
| `jobs.ts` | BullMQ processors owned by this module |
| `tools.ts` | MARBIM tool pack — read + draft tools only |
| `register.ts` | `registerModule({ id, pendingTargets, zodMap, approvalDefaults, toolPack, jobs, domainPrimer })` |
| `__tests__/` | Unit (pure logic) + integration (tenancy, state machines, pending flow) |

## Build order inside a module

`schema.ts` → migration → `zod.ts` → `service.ts` + tests → `queries.ts` → `actions.ts`
→ `jobs.ts`/`events.ts` → `tools.ts` → `register.ts`

## Module ids

| Folder | Module | Phase |
|---|---|---|
| `core` | Cross-cutting invariants | 0 |
| `marbim` | X.2 MARBIM platform | 2 |
| `settings` | X.3 Settings & admin | 2 / 9 |
| `orders` | 1.3 Order desk & TNA | 3 |
| `store` | 3.1 Fabric & trims store | 4 |
| `production` | 6.1 Line tracking ⚡ | 4 |
| `rfq` | 1.2 RFQ & quotation | 5 |
| `planning` | 4.1 Capacity & line planning | 5 |
| `quality` | 7.1 Inline/endline/final inspection | 6 |
| `cutting` | 5.1 Cutting floor | 6 |
| `shipment` | 8.1 Finishing, cartons, shipment | 6 |
| `procurement` | 3.2 Procurement & suppliers | 6 |
| `commercial` | 2.1 LC register & bank docs, 2.2 bonded/UD | 7 |
| `finance` | 11.1 Commercial finance | 7 |
| `workforce` | 10.1 Workforce & payroll 🔒 | 8 |
| `compliance` | 10.2 Compliance & audit | 8 |
| `maintenance` | 9.1 Machines & tickets | 8 |
| `analytics` | 11.2 Owner dashboard (read-only) | 9 |
| `buyers` | 1.1 Buyer lead desk | — |
| `sampling` | 1.4 Sampling | — |

## Rules that get a PR rejected

1. Actions never touch `db` — thin boundary only, service layer owns logic.
2. Every service function takes `ctx {companyId, userId, roles}`; scoping comes from
   the core repo helpers. RLS is the second wall, never the only one.
3. AI and junior writes go through `pending_changes` only. `target_table` must be in
   this module's `pendingTargets`; confidence is per field, from the extractor.
4. Money via `lib/money`. `parseFloat`/`Number()` on money is lint-banned.
5. Status fields use `defineStateMachine()`; illegal transition ⇒ typed 409.
6. Events via the outbox in the same transaction; handlers idempotent.
7. Floor writes go through the offline batch endpoint with `offline_key`.
8. Gates are server-side and structured — never UI-only.
9. `analytics` is read-only; importing a write op there is lint-banned.
10. Shared tables have one writer module; read across modules via the owner's
    `queries.ts`, never raw tables.
11. `core` changes are never mixed into a module PR.
