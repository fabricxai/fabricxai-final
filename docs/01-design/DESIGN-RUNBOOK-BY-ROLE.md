# FabricXAI — Role-based UI/UX Design Runbook

**Created:** 2026-09-06. **Companion to** `fabricxai-design-sessions.md` (the module-by-module
program, 2026-07) — that file designs *modules*; this one designs *jobs*. A storekeeper does not
open "module 3.1", they receive a truck. Every prompt here is written from one role's chair.

**What this produces.** One design canvas per role (17 roles, 14 sessions because owner/admin and
viewer/member share), plus a shell session before them and a handshake session after. Each canvas
is a set of artboards: the role's landing, every page and sub-page they can open, and the side
drawer that carries the details of whatever row they clicked. Actions live where the role would
reach for them, and only the actions that role may take are drawn as buttons.

**The one structural rule (the user's brief):** *lists on the page, details in the side drawer.*
A row is a sentence; clicking it opens a drawer on the right with the full record, its history,
and the actions this role may take on it. Full-page detail is reserved for the three records that
are genuinely too big for 560px (an order, an LC, a sample) and for anything that is a form the
person fills top-to-bottom (a lay, a payroll run). Section 2 is the contract.

**How to run it.** Every session is one Claude Code conversation in this repo:

1. Start Claude Code in `fabricxai-POC/`. Say: `Read docs/01-design/DESIGN-RUNBOOK-BY-ROLE.md
   sections 1–2, then run session <N>.` Claude Code reads the standing rules and the drawer
   contract itself — you don't paste them.
2. Paste the session's **PROMPT** block. Claude Code uses the `/design` skill and writes the canvas
   to `docs/01-design/canvases/roles/`. **The format is not the one the 27 canvases in
   `docs/01-design/canvases/` use.** Those are the older single-component `.dc.html` files, one
   file holding one interactive prototype with props and state. The `/design` skill now emits a
   multi-artboard canvas: one `.dc.html` per artboard in a working folder
   (`roles/<session-slug>/`), a `canvas.json` laying them out, and a seeded page published as an
   Artifact. The seeder refuses a mixed-case filename, so the published page is
   `roles/fabricx-role-<slug>.html` and the display name lives in its title. S0's folder is
   `roles/shell-and-drawers/`, and its `_kit.mjs` / `_shell.mjs` / `_drawer.mjs` are the chrome
   every later session imports rather than redraws — see `roles/shell-and-drawers/_README.md`.
3. Open the published canvas. Walk it as the role, with the **lock checklist** at the end of the
   session. Ask for changes in the same conversation until it passes.
4. Run the session's **VERIFY** prompt. It checks the canvas against `src/components/shell/nav.ts`
   (routes and `writeRoles`) and the module `actions.ts` files, and lists what the canvas drew that
   the code cannot do — or the reverse. Fix the canvas, not the code, unless the finding is a
   real gap; then it goes to `docs/UI-UX-BUILD-PLAN.md` as a task.
5. Commit the canvas: `docs(design): role canvas — <role>`.

Run order matters: S0 (shell + drawer) first, then S1 (owner/admin) because every other role's
"what the owner sees of my work" references it, then floor roles before desk roles (their screens
are smaller and lock the density rules), and S15 last. Never design more than two sessions
without walking the previous ones with a real person of that role, or the nearest champion.

**Where the truth is** (Claude Code reads these; you don't need to):

| Question | File |
|---|---|
| Which roles exist, which routes each may open, which may write | `src/components/shell/nav.ts` (`NAV`, `ROLE_LANDINGS`, `railHiddenFor`) |
| What each module can actually do | `src/modules/<m>/actions.ts` — every exported function is a door |
| Tokens, type, radius, density | `src/app/theme.css` |
| The component vocabulary (use, don't reinvent) | `src/components/fx/*.tsx` — Drawer, Modal, ConfirmDialog, DataTable, Tabs, StatusLabel, Selvage, ThreadRule, SlashRule, BreakdownGrid, MilestoneTimeline, FactPair, FloorScreen, FloorRow, NumpadInput, SyncPill, StatTile, FigureTile, ExceptionRow, EmptyState, LoadingState, ErrorState, LockedState, ReadOnlyNote, MarbimMark, AnswerCard. `ReadIntoForm` is in `src/components/shell/`, not `fx/` |
| What is wrong with each role's screens today | `docs/UI-UX-ROLE-AUDIT.md` §2, `docs/03-frontend/UX-AUDIT-BY-ROLE.md` Part 2 |
| The mobile skins (tabs and push per role) | `docs/05-owner-app/MOBILE-CONTRACT.md` §3 |
| Per-module states and gates | `docs/handoffs/HANDOFF-*.md` §6/§7, `docs/02-backend/briefs/` |

---

## 1 · Standing rules (Claude Code applies these to every session)

These are the rules the existing product already enforces with lint and tests. A canvas that
breaks one will be rejected at build time, so the design must not.

**Tokens and type.** Use `src/app/theme.css` values only; no invented colours. Dark-first
canvas/surface/raised; depth is borders, not shadows. Plus Jakarta Sans for everything Latin,
Anek Bangla for Bengali, JetBrains Mono for every code (PO, LC, UD, style, roll, ticket numbers).
Tabular numerals on every figure. Radius 4 inputs and chips, 8 buttons and cards, 14 modals,
sheets and drawers, 20 for the MARBIM slide-over and nothing else, 999 for pills.

*Corrected 2026-09-07 (S0 VERIFY).* This paragraph said Archivo and Inter, and a 8/12/16/20
radius scale. Neither was ever true: `src/app/layout.tsx` loads Plus Jakarta Sans, JetBrains Mono
and Anek Bangla, and `theme.css` defines `--fx-radius-sm: 4px` through `--fx-radius-xl: 20px`
with the xl reserved by name for the slide-over. A canvas drawing a 20px drawer would take the
one radius the theme reserves.

**Amber means "a person must act".** Primary buttons, focus rings, pending drafts, MARBIM
draft borders. Never for status. Status is a dot plus a word (`StatusLabel`), never colour alone:
on-track, at-risk, late, info, done.

**Signature elements.** Selvage edge (3px status stripe on the left rim of rows and cards),
thread rule under page headers, weave loader instead of spinners. Use them; do not invent
alternatives.

**Density.** `data-density="desk"` (44px rows) for office roles. `data-density="floor"` (56px
rows, every tap ≥44px, dark only) for store, cutting, production, quality, maintenance, shipment
packing. Floor screens carry the `SyncPill` (online / queued / rejected) and an offline state.

**Words.** No JSON, no raw identifiers, no bare UUIDs anywhere a person reads (standing rule,
`no-json-in-the-ui`). Every label is an i18n key; show one artboard per role with Bengali strings
at 1.4× length. Money always carries its currency: USD buyer-facing, ৳ local. Dates as the
factory reads them (2 Dec 2026), never ISO in prose. Refusals are sentences that name the thing
and the reason ("Cutting can't start: PP sample for ST-2610 is still with the buyer"), never a
code.

**Access is drawn, not implied.** For every artboard state which of the 17 roles can open it
(from `NAV.roles`) and which can change anything (from `NAV.writeRoles`). A role that may open
but not write sees the same screen with a `ReadOnlyNote` at the top and no action buttons — not
disabled buttons. A role with no access does not see the entry at all; the locked card
(`LockedState`) names the module.

**AI never writes.** Every MARBIM output is a draft: amber border, per-field confidence bars
(from a measurement; `ai_chat` drafts have none and say so), click-to-source, approve / reject /
edit-then-approve. Drafts land in the approve inbox of the role whose rule routes them.

**Gates are server-side and explained.** PP approval before cutting, UD balance before a bonded
issue, BTB headroom before an import PO, EXP number before bank docs, LC latest-shipment
conflict. The screen shows the gate's state *before* the person presses the button (headroom
bar, PP chip, balance pill), and the refusal after is the same sentence.

**Every artboard has four states** — populated (real Bangladeshi sample data: H&M, Primark, C&A,
Bestseller; ST-2610; 8,000–80,000 pcs; ৳ and $ where they belong), empty (an instruction and a
door, not a sad icon), loading (weave), error. Floor artboards add offline/queued.

**The day-3 test.** Would a Gazipur person in this job be faster here than in their Excel or
paper by day three? If a screen fails that, simplify it before locking.

---

## 2 · The side-drawer contract

The drawer is the product's detail surface. The `Drawer` primitive exists in
`src/components/fx/feedback.tsx` (right-anchored, 560px default, Escape closes, optional footer)
and is almost unused — pages today open dialogs or navigate. This runbook makes it the default.

### 2.1 What opens where

| Surface | Use for | Examples |
|---|---|---|
| **Page** | a list, a board, a queue, a form the person fills top-to-bottom | order book, planning board, hourly sheet, payroll run |
| **Drawer** (right, 560px; 720px for grids) | the details and actions of ONE row the person clicked | a PO, a ticket, a roll, a draft, a CAP, a shipment, a supplier, a worker |
| **Full-page detail** | only the three records too big for a drawer, and only as a second click from the drawer's "Open full page" | `/orders/[orderId]`, `/lcs/[lcId]`, `/sampling/[sampleId]` |
| **Modal / ConfirmDialog** | a decision with consequences that must not be missed | approve payroll, accept an LC date breach, confirm a milestone ripple |
| **Bottom sheet (mobile)** | the drawer's phone form — same content, slides up | every drawer on the floor skins |

A drawer never opens a second drawer. A link inside a drawer that would need one navigates to
the target's page with that row's drawer pre-opened (`?open=<id>` in the URL — deep-linkable,
so a push notification and an approve-inbox source link land inside the right drawer).

### 2.2 Anatomy (every drawer, in this order)

1. **Header** — selvage stripe in the row's status colour; identity line (code in mono + the
   human name: `PO-BF-2044 · H&M · ST-2610`); `StatusLabel`; close (×). Below it, the one number
   the job cares about (qty, balance, headroom, days-to-date) as a `FigureTile`.
2. **Tabs** when the record has more than one face, otherwise sections. Default tab is what the
   role acts on. Tab names are nouns: Details · Timeline · Documents · History.
3. **Body** — facts as `FactPair` rows (label left, value right, code in mono); linked records
   as rows that navigate (see 2.1); the audit trail as a "History" tab with person + time + what
   changed, as a sentence.
4. **Gate strip** (when a gate applies) — the live state of every gate the next action would
   hit: PP ✓ / UD balance 1,240 m / BTB headroom 12% / EXP missing. Drawn before the button.
5. **Footer** — the actions *this role* may take on *this record in this state*. Primary
   (amber) is the one the state machine expects next; secondary are ghosts; destructive is red
   and goes through `ConfirmDialog`. A role with no write on this module gets no footer; a role
   with write but the wrong state gets the button with a sentence why it is not available.
   Never more than three buttons; more than that is a "More" menu.

### 2.3 Drawer families to design once in S0 and reuse

| Family | Opened from | Tabs | Footer (by role) |
|---|---|---|---|
| **Record drawer** | any list row | Details · History (+ module tabs) | the module's state-machine actions |
| **Draft drawer** | approve inbox, "drafts aging" on home, MARBIM panel | Fields (confidence bars, click-to-source) · Source (the document/page) · Trail | Approve · Reject · Edit and approve (raiser: Confirm · Discard) |
| **Exception drawer** | owner/admin home, alerts | What happened (sentence) · Why (cause chain) · Who (owner desk) | "Open the door" (navigates to the desk page with the row pre-opened) |
| **Gate drawer** | a refused button, `/refused` | The gate · Its current value · What would clear it | the request-override action if one exists (UD overdraw, tolerance exception) — else none |
| **Person drawer** | setup, workforce, any avatar | Roles · Line scope · Activity | Grant/revoke (owner/admin only) |
| **Document drawer** | any Files tab | Preview · Extracted fields (if MARBIM read it) · Versions | Read into form (raises a draft) · Download |

---

## 3 · Sessions

Each session block is copy-paste ready. `PROMPT` goes to Claude Code after it has read §1–§2.
`VERIFY` runs after the canvas passes the lock checklist.

Naming: canvases go to `docs/01-design/canvases/roles/`. Artboards carry the name
`<route> · <state>` (`/store/receive · populated`, `/store/receive · offline`) so the VERIFY step
can match them to `nav.ts` mechanically; drawers are `drawer · <family> · <record>`. That name
goes in the artboard's `title` field in `canvas.json` — the FILE has to be `<CamelCase>.dc.html`,
which is the seeder's rule, and the file stem stays the artboard's identity.

---

### S0 — Shell, drawer system, shared surfaces

**Why first.** Every role's canvas is composed from these. Locks: rail per section, the top bar
(factory chip, role phrase, MARBIM mark, shortcuts), the drawer families, and the five screens
every role shares.

**PROMPT**

```
Design the FabricXAI SHELL and the SIDE-DRAWER SYSTEM as a canvas at
docs/01-design/canvases/roles/FabricX Role — Shell and Drawers.dc.html.

Read first: src/components/shell/nav.ts (sections, NAV, ROLE_LANDINGS, railHiddenFor),
src/components/shell/*.tsx (marbim-panel, shortcuts-sheet, read-into-form),
src/components/fx/feedback.tsx (Drawer, Modal, ConfirmDialog, EmptyState, LockedState),
src/components/fx/signature.tsx, src/app/theme.css.

Artboards:
1. Shell · desk — left rail grouped Work / Commercial / Floor / Oversight / System exactly as
   NAV_SECTIONS; top bar with the factory chip (opens /factory), the role phrase ("Storekeeper"
   / "Merchandiser and Planner" — describeRoles), the animated MARBIM mark (opens the panel),
   search, the ? shortcuts sheet. Show it for three roles side by side: owner (25 entries, rail
   is a directory — group headers collapsed by default except Work), merchandiser (13),
   production (rail trimmed to 7 by railHiddenFor, with a "More" group for the six it still
   opens — orders, sampling, planning, store, quality, setup). Production has no "Your work"
   entry at all: it is absent from that entry's role list, so the More group does not hold it
   either.
2. Shell · floor — no rail; a single back chevron, the screen title, the SyncPill, the role
   phrase. data-density="floor", dark only.
3. Shell · phone — the bottom tab bar the mobile skins use (3 tabs max), rail hidden; the
   drawer becomes a bottom sheet.
4. Drawer · anatomy — the six-part anatomy from the runbook §2.2 annotated on one example
   (a purchase order: PO-IMP-0311, Shanghai Textile, 12,400 m of 40s poplin, ৳ and $ both).
5. Drawer · record — three examples in three widths: a machine ticket (560), a roll (560),
   an order breakdown grid (720).
6. Drawer · draft — a MARBIM draft of a GRN read from a challan photo: seven fields, each with
   its confidence bar; one field below threshold highlighted; Source tab showing the photo with
   the field's region outlined; footer Approve / Reject / Edit and approve. Second state: the
   raiser's own view (Confirm / Discard). Third state: an ai_chat draft that carries NO
   confidence and says so in one sentence.
7. Drawer · exception — "PO-BF-2044 will miss ex-factory by 4 days: cutting has not started
   because the PP sample is still with H&M." Why tab shows the chain (PP → cutting → sewing →
   ex-factory). Footer: Open the order (lands on /orders?open=… with the TNA tab).
8. Drawer · gate — the UD balance refusal: "Can't issue 1,400 m against UD-2026-118: balance is
   1,240 m." Shows the balance, the requested draw, the shortfall; footer "Request overdraw
   approval" (store) vs no footer (production reading the same drawer).
9. Drawer · person and Drawer · document.
10. Shared screens, each in populated + empty: /approve (inbox that TEACHES — the empty state
    lists the 2–3 draft kinds that route to THIS role and the door that raises each),
    /alerts, /refused (the role's own refusals with the gate drawer), /factory (the
    tenant card the top-bar chip opens), /settings (profile + language + the 11-anchor
    jump nav for owner/admin; read-only profile for everyone else).
11. Auth: /login, /signup, /forgot-password, /reset-password, and the email-confirmation
    landing — desk and phone widths.
12. The five states strip: populated / empty / loading (weave) / error / offline-queued, as a
    reference row every later canvas points at.
13. Bengali pass: artboards 1, 6 and 10 again with bn strings at 1.4× length.

Data: Barakah Fashions Ltd (woven), the fabf… test tenant's names are fine for people.
```

**Lock checklist (S0)**

- [ ] Rail matches `NAV_SECTIONS` order and every entry's section in `nav.ts`
- [ ] Production's rail shows exactly the 7 entries not in `railHiddenFor` plus a More group of 6
- [ ] Drawer anatomy has all six parts; the footer never exceeds three buttons
- [ ] Draft drawer's `ai_chat` state has no confidence bars and says why
- [ ] Amber audit: only on buttons, focus, drafts, pending badges
- [ ] Every shared screen has populated + empty; the approve inbox's empty state names draft kinds
- [ ] Phone shell shows the drawer as a bottom sheet with the same footer

**VERIFY**

```
Compare docs/01-design/canvases/roles/FabricX Role — Shell and Drawers.dc.html against
src/components/shell/nav.ts and src/components/fx/*.tsx. Report: (1) rail entries drawn that
are not in NAV or in the wrong section; (2) drawer parts the canvas uses that no fx primitive
provides (name the primitive to add to src/components/fx/feedback.tsx and add it to
docs/UI-UX-BUILD-PLAN.md as a task); (3) any colour or radius not in theme.css. Do not change
code.
```

---

### S1 — Owner and Admin ("the pulse")

**Chair.** The owner reads exceptions and decides; approves drafts; occasionally does any desk's
work. The admin is the owner's twin for setup, roles and policies — but is NOT hr, so payroll
doors are absent and the screen must say why. Landing `/home` for both. Mobile skin: Pulse
(What's wrong · Approve · Figures).

**PROMPT**

```
Design the OWNER and ADMIN experience as one canvas:
docs/01-design/canvases/roles/FabricX Role — Owner and Admin.dc.html.

Read first: nav.ts (ALL_ACCESS — they see every entry), src/app/(app)/home/desk-sections.ts,
src/app/(app)/home/page.tsx, src/app/(app)/setup, src/app/(app)/settings,
src/modules/approvals/actions.ts, src/modules/settings/actions.ts,
docs/UI-UX-ROLE-AUDIT.md §2 Owner/Admin, docs/UI-UX-BUILD-PLAN.md 2.1 (the decision that home
wins over dashboard — do not reopen it).

PAGES (each: populated, empty, loading, error):
1. /home (owner) — the morning. Order: (a) "What needs you" — exceptions as sentences with a
   selvage in their severity, each opens the Exception drawer; (b) "Drafts aging" — count by
   desk, each opens the Draft drawer; (c) the figures strip — OTD, DHU, efficiency, cash,
   each with denominator and as-of ("OTD 91% of 34 shipments, to yesterday"), each opens a
   Figure drawer (trend, the denominator's rows); (d) desk summaries — one row per desk with
   its queue count and the desk's own landing as the link. Phone: the three Pulse tabs.
2. /home (admin) — same page; the payroll figure is replaced by a sentence: "Payroll is HR's
   and the owner's; you can see the roster in Workforce." No hidden buttons — absent ones.
3. /approve — the owner's inbox: everything across desks, filter chips by module and by draft
   kind, batch select, "aging > 2 days" sort default. Draft drawer from S0.
4. /alerts and /refused — as S0, owner scope (all desks).
5. /setup — a page of sections, each a list with its Record drawer: Company profile
   (saveCompanyProfile), People (grantUserRole / setUserLineScope / revokeUserRole — the Person
   drawer; invite flow; line scope picker for production supervisors), Lines and calendars
   (planner's saveLine/setLineCalendar reused), Locations and Items (store's saveItem /
   saveLocation reused), Suppliers (procurement's createSupplier reused), Workers (hr's
   saveWorker reused, with the note that HR has its own door on /workforce).
6. /settings — the eleven-anchor jump nav: profile, language, then per-module policy
   (saveModulePolicy) and approval rules (setApprovalRule / removeApprovalRule — a rule row:
   draft kind → required roles → auto-approve threshold, with the sentence the inbox will
   show for it), audit trail (readAuditTrail — a list of sentences, filter by person/table/day,
   each row opens a Record drawer showing before/after as FactPairs).
7. /factory — the tenant card; factory type (woven / knit / knit-composite) with the sentence
   about what it hides (the UD workbench for pure knit).
8. Every other desk's landing as the owner sees it — ONE artboard per desk, small, in a grid:
   the same screen the desk role gets, with the owner's extra "as owner" affordances only
   where they exist (approve payroll run; approve cost sheet). This grid is what later
   sessions reference for "what the owner sees of my work".

FLOWS (draw as numbered artboard sequences):
F1. Morning: /home → exception drawer → Open the order → /orders?open=PO-BF-2044 (TNA tab in
    the order's drawer) → back to /home with the exception gone or snoozed.
F2. Approve: /home drafts aging → /approve filtered → draft drawer → Edit and approve (one
    field corrected) → the trail shows the correction → the row leaves the inbox.
F3. Admin onboards a supervisor: /setup People → Invite → Person drawer → grant production →
    set line scope L1, L2 → the email confirmation state → the person's first landing
    (/lines/hourly showing only L1/L2).
F4. Admin changes an approval rule: /settings → Approval rules → edit threshold → the
    sentence preview updates → save → /approve's empty state now names the kind.
F5. Owner approves payroll (owner only): /workforce → run in "awaiting approval" → ConfirmDialog
    with the run's totals and the parallel-run note → approved.

DRAWERS: Exception, Draft, Figure (new: trend sparkline + the denominator rows), Person,
Audit-trail record.

ROLE GATES to draw explicitly: admin sees /workforce with no payroll doors and the sentence;
owner sees them. Both see /finance and /lcs with full write.

Bengali pass on /home and /setup.
```

**Lock checklist (S1)**

- [ ] `/home` has queues first, figures second; no `/dashboard` artboard exists
- [ ] Every figure shows denominator + as-of
- [ ] Admin's `/workforce` explains the absent payroll doors in one sentence
- [ ] Approval-rule editor previews the sentence the inbox will show
- [ ] The desk-landings grid has one artboard per desk role (12 desks)

**VERIFY**

```
Check the Owner and Admin canvas against nav.ts and src/modules/settings/actions.ts,
src/modules/approvals/actions.ts, src/modules/workforce/actions.ts. Every exported action in
those files must appear as a button somewhere on the canvas (name the artboard), or be listed
as "deliberately absent" with a reason. List routes under src/app/(app) the canvas does not
show the owner reaching. Do not change code.
```

---

### S2 — Store ("the truck")

**Chair.** Lands on `/store/receive`, the best landing in the product. Receives goods against
POs (challan photo → draft GRN), issues against requisitions behind the UD gate and the shade-mix
warning, keeps rolls, requests overdraws, raises adjustments through approval. Reads procurement.
Mobile skin: Truck (Receive · Issue · Rolls). Floor density, offline first.

**PROMPT**

```
Design the STOREKEEPER experience: docs/01-design/canvases/roles/FabricX Role — Store.dc.html.

Read first: nav.ts (store: home, approve, marbim, procurement, store, ud, refused, alerts,
setup, settings; writeRoles on store/ud/procurement/setup), src/app/(app)/store/**,
src/app/(app)/ud/**, src/modules/store/actions.ts (saveItem, saveLocation,
raiseMaterialRequisition, draftStockAdjustment), src/modules/commercial/actions.ts
(requestUdOverride, checkUdDraw, udBalancePreview), src/modules/procurement/actions.ts
(recordReceipt), the offline batch endpoint src/app/api/sync, docs/handoffs/HANDOFF-3-1-fabric-trims-store.md §5–§7, docs/UI-UX-ROLE-AUDIT.md §2 Store and §3.1, MOBILE-CONTRACT §3 Truck.

Density: floor. Every artboard in desk width AND 390px phone. Dark only.

PAGES:
1. /store/receive (landing) — one screen: drop the challan (photo/PDF) → MARBIM draft GRN
   with per-line confidence → check against the PO's open lines → save. The PO picker is a
   list of POs expecting delivery, most overdue first, each row: PO code, supplier, expected
   date, open qty. Bonded lines show the UD chip and its balance BEFORE save (gate strip).
   The GRN inspection verdict (4-point, quality's) arrives later as a push — show the row's
   "awaiting inspection" state.
2. /store/issue — requisition-driven: the list is open material requisitions (from cutting
   and sewing), each row: order, item, qty asked, qty available, UD balance if bonded, shade
   groups available. Row → Record drawer (Issue): roll picker filtered by shade group (2.7c),
   the shade-mix warning as a sentence naming groups, the UD gate strip, Issue button; refused
   state opens the Gate drawer with "Request overdraw approval" (requestUdOverride) — the
   draft then shows in the storekeeper's /refused and in commercial's inbox.
3. /store/rolls — the shelf: rolls by item, shade-group chips (only when >1 group), location,
   metres left, the roll's lot and 4-point result. Row → Record drawer (Roll): facts, history
   (received → inspected → issued), "Move location", "Draft adjustment" (draftStockAdjustment,
   goes to approval, explain that).
4. /store — the summary (items, low stock vs requisitions coming, GRNs awaiting inspection).
5. /ud and /ud/[udId] as store sees them: balances per UD, draws, the overdraw request state;
   write = requestUdOverride only. Full-page UD is commercial's; store's view is the list +
   drawer.
6. /procurement as read-only (ReadOnlyNote: "You can record a receipt from Store; the PO
   itself is procurement's"), /setup with only Items and Locations sections writable.
7. /home — the queues: trucks expected today, requisitions waiting, GRNs awaiting inspection,
   drafts I raised awaiting someone. /refused — my refusals with the Gate drawer.
8. /marbim — the panel opened from the mark, with the store's suggested prompts ("what is
   left on UD-2026-118", "which rolls of ST-2610 navy are unissued").

FLOWS:
F1. Receive a truck offline: /store/receive → photo → draft (queued, SyncPill "queued 1") →
    check → save → SyncPill "syncing" → "synced" → the row shows awaiting inspection → push
    later: "GRN-0412 failed 4-point on 2 rolls" → tap → the roll drawer.
F2. Issue behind the UD gate: /store/issue → requisition → drawer → picker shows 1,240 m on
    the UD, 1,400 asked → Issue refused with the sentence → Request overdraw → draft raised →
    /refused shows it pending → commercial approves → push → issue completes.
F3. Shade mix: two groups picked → warning sentence → the storekeeper picks one group → warning
    clears → issue.
F4. Adjustment: /store/rolls → roll drawer → Draft adjustment (reason, qty) → sentence "this
    goes to the owner's inbox" → pending badge on the roll.

STATES: every page populated / empty (Test Textile Ltd: no POs yet → "Nothing is expected;
receipts appear when procurement issues a PO") / loading / error / offline-queued / rejected
writes (RejectedWrites strip with the refusal sentence per line).

Bengali pass on /store/receive and /store/issue at phone width — a storekeeper reads Bangla.
```

**Lock checklist (S2)**

- [ ] Zero taps under 44px at 390px
- [ ] UD balance and shade groups visible before the Issue button, not only in the refusal
- [ ] Overdraw request leads to a draft and the storekeeper sees where it went
- [ ] Offline state on receive and issue; rejected-writes strip drawn
- [ ] Procurement page carries the ReadOnlyNote; setup shows only Items and Locations as writable

**VERIFY**

```
Check the Store canvas against nav.ts (store's roles/writeRoles per entry) and the actions
listed above plus src/app/api/sync handlers. Every store write must be a drawn button; every
non-store write on a page store can open must be absent (not disabled). List mismatches and any
artboard where a tap target reads under 44px. Do not change code.
```

---

### S3 — Production supervisor ("the hour")

**Chair.** Lands on `/lines/hourly`. Enters hourly output per line (or a whole-day sheet),
endline counts, opens/closes downtime which auto-raises a maintenance ticket, taps inline checks.
Scoped to their lines (L1, L2). Rail trimmed to 7. Reads planning, orders, cutting. Mobile skin:
Hour (This hour · Endline · Stoppages).

**PROMPT**

```
Design the PRODUCTION SUPERVISOR experience:
docs/01-design/canvases/roles/FabricX Role — Production.dc.html.

Read first: nav.ts (production's entries; railHiddenFor trims orders, sampling, planning,
store, quality, setup from the rail — access stays), src/app/(app)/lines/**,
src/modules/production/actions.ts (planTheLine, whatTheLineRan), the offline writes
record_hourly_outputs / record_endline_count / open_downtime / close_downtime in
src/app/api/sync and src/app/api/production/**, src/modules/maintenance/actions.ts
(reportMachine — production may raise), src/modules/quality (inline_check — production may
tap), docs/handoffs/HANDOFF-6-1-line-tracking.md, HANDOFF-7-1 §5 (inline),
docs/UI-UX-ROLE-AUDIT.md §2 Production and S5, MOBILE-CONTRACT §3 Hour.

Density: floor. Desk width and 390px. Dark only. Line scope: this supervisor sees L1 and L2
only — draw the scoping, and the state when a supervisor has no line scope set ("Ask your
admin to give you lines").

PAGES:
1. /lines/hourly (landing) — the hour sheet: one row per scoped line, the running order and
   colour, target for this hour (from planTheLine's day plan), a NumpadInput, run-rate vs
   target as a SlashProgress, the "an hour behind" state. Whole-day catch-up mode (the
   sheet photo → draft, or the 10-column grid). Save is one button for all lines.
2. /lines/endline — endline counts per line per order: good / rework / reject, DHU today
   against target, the drawer for a line showing the hour-by-hour history.
3. /lines — the board: lines × today, each cell the hour's state; a line row → Record drawer
   (Line today): plan (planTheLine — set the day's order, target, SMV), ran (whatTheLineRan —
   yesterday's actual as sentences), stoppages, tickets open on this line's machines.
4. Stoppages — open downtime (reason picker: machine, no input, power, other) → the ticket
   auto-raised for a machine reason, shown as a chip that opens the Ticket drawer (read; claim
   is maintenance's); close downtime.
5. /quality/inline as production sees it — the tap surface only (defect taps on my lines);
   verdicts are quality's (ReadOnlyNote on anything beyond the taps).
6. /maintenance as production sees it — my lines' tickets; reportMachine (raise) is the one
   write; claim/resolve absent.
7. Read-only pages with the ReadOnlyNote as the FIRST thing on the page (audit S5: /planning
   with zero buttons looked broken): /planning (what is coming to my lines), /orders (dates
   and breakdown), /cutting (what is cut for my lines), /sampling.
8. /marbim with production's prompts ("why is L2 behind", "what ran on L1 yesterday").
   /alerts, /refused, /settings.

FLOWS:
F1. The hour, offline: 10:00 → enter L1 412, L2 388 → save → queued → synced. 11:00 L2 behind
    → the row turns at-risk with the sentence "L2 is 40 pcs behind plan for the hour" → push
    fires once for the day.
F2. Stoppage → ticket: L1 machine 14 down → open downtime, reason machine → ticket raised
    (chip) → maintenance claims → push "Rafiq took ticket T-0921" → resolved → close downtime
    → the hour's target recalculated.
F3. Whole-day catch-up: the sheet photo → draft with 10 hours × 2 lines and confidence per
    cell → correct two cells → save.
F4. Plan tomorrow: /lines → line drawer → plan (order picker from /planning's allocations for
    this line, target from SMV × hours) → saved → tomorrow's hourly sheet shows it.

STATES: populated / empty (no plan for today: "No plan for L1 today — set one here or ask the
planner") / loading / error / offline / rejected writes / no-line-scope.

Bengali pass on /lines/hourly and /lines/endline at phone width.
```

**Lock checklist (S3)**

- [ ] Rail shows 7 entries; the More group holds the other 6 and each still opens
- [ ] Every read-only page opens with the ReadOnlyNote, not a bare board
- [ ] The behind-plan state is a sentence with the number, and appears once per line-day
- [ ] Ticket chip from downtime opens the Ticket drawer with no claim button for production
- [ ] Zero sub-44px taps at 390px

**VERIFY**

```
Check the Production canvas against nav.ts (railHiddenFor for production; writeRoles on lines,
quality, maintenance, cutting), src/modules/production/actions.ts, the sync handlers. Confirm
the canvas draws no write production lacks (planning allocations, quality verdicts, ticket
claims) and every write it has. Do not change code.
```

---

### S4 — Quality ("the walk")

**Chair.** Lands on `/quality/inline`. Walks lines tapping defects against DHU targets; runs
fabric 4-point on received rolls; sizes AQL final inspections from finished goods; records
measurements against specs. Reads lines and the sample board. Mobile skin: Walk (Line walk ·
4-point · Final). Floor density.

**PROMPT**

```
Design the QUALITY INSPECTOR experience:
docs/01-design/canvases/roles/FabricX Role — Quality.dc.html.

Read first: nav.ts (quality: home, approve, marbim, sampling(read), lines(read), quality,
refused, alerts, settings), src/app/(app)/quality/**, src/modules/quality/actions.ts
(recordFabricInspection, previewAqlPlan, submitFinalInspection, recordMeasuredPieces),
the inline_check offline write, docs/handoffs/HANDOFF-7-1-inline-endline-final-inspection.md
§5–§7, docs/UI-UX-ROLE-AUDIT.md §2 Quality and §3.3, MOBILE-CONTRACT §3 Walk,
docs/UI-UX-BUILD-PLAN.md 3.2 (measurement editor deferred — design it here so the build has a
target).

Density: floor. Desk and 390px. Dark only.

PAGES:
1. /quality/inline (landing) — the walk: line picker (all lines, the ones I walked today
   ticked), then a defect grid of the top 12 defect codes as ≥56px tap tiles, a running DHU
   for the line vs target as a ring, "repeat defect on this line" as a sentence. Row → drawer
   (Line today): hourly defect history, operators if known, the endline counts production
   entered.
2. /quality/fabric — rolls awaiting 4-point (from store's GRNs), each row: roll, item, shade
   group, metres, supplier. Row → drawer (4-point): the four point classes as NumpadInputs,
   points/100 yd² computed live, pass/fail against the item's threshold, the verdict sentence;
   Submit (recordFabricInspection) → push to whoever signed the GRN if failed.
3. /quality/final — lots newly inspectable (finished > 0, never inspected), failed awaiting
   re-inspection, passed. Row → drawer (Final): previewAqlPlan shows the plan as a sentence
   ("Lot 3,200 pcs → sample 125, accept ≤ 5 majors, level II") BEFORE the inspector starts;
   the defect tally; submitFinalInspection; the pass/fail sentence; the shipment's packing
   waits on this (say so).
4. /quality/measurements — the spec editor (the deferred piece): a size × POM grid with
   tolerance, filled by the measurement-chart door (MARBIM reads the buyer's chart → draft
   spec) or typed; then measured pieces (recordMeasuredPieces) against it with out-of-tol
   cells at-risk.
5. /quality — the board: DHU today by line vs target, 4-point backlog, finals due, the
   week's failed lots. /home — queues: newly inspectable, failed awaiting re-inspection, DHU
   above target yesterday.
6. /lines read-only (ReadOnlyNote), /sampling read-only (the sample board — quality sees PP
   status but the verdict is the merchandiser's).
7. /marbim, /approve (what routes to quality: measurement-chart drafts), /refused, /settings.

FLOWS:
F1. The walk: /quality/inline → L3 → tap "broken stitch" ×4, "skip stitch" ×1 → DHU ring 2.1
    vs 1.5 target → the repeat-defect sentence → offline queued → synced.
F2. A roll fails: /quality/fabric → roll drawer → points entered → 28/100 → fail → submit →
    the storekeeper is pushed → the roll in /store/rolls shows the verdict.
F3. Final inspection: /quality/final → lot → plan sentence → tally → 7 majors → fail → the
    re-inspection row appears → after rework, re-inspect → pass → shipment's packing unlocks.
F4. Spec from chart: /quality/measurements → drop the buyer's chart → draft spec grid with
    confidence per cell → approve → measure 5 pieces → two out of tolerance flagged.

STATES: all five, plus "nothing finished yet" on /quality/final with the sentence saying which
orders are in sewing.

Bengali pass on /quality/inline at phone width.
```

**Lock checklist (S4)**

- [ ] AQL plan is shown as a sentence before the inspector starts
- [ ] Defect tiles ≥56px; no ghost buttons in rows on the phone
- [ ] Spec editor grid designed with the chart door AND typed entry
- [ ] 4-point failure's push destination drawn (the storekeeper)

**VERIFY**

```
Check the Quality canvas against nav.ts and src/modules/quality/actions.ts plus the
inline_check sync handler. Note that /quality/measurements' spec editor is a build gap (plan
3.2) — record the canvas's design as the target in docs/UI-UX-BUILD-PLAN.md 3.2. Do not change
code.
```

---

### S5 — Cutting ("the table")

**Chair.** Lands on `/cutting`. Starts lays behind the PP gate and issued rolls, releases
markers, files cut reports (sheet photo → draft), tracks wastage, corrections via approval.
The tightest role; the audit says its shape should be the template for the floor. Mobile skin:
Table (Queue · Lay · Report).

**PROMPT**

```
Design the CUTTING experience: docs/01-design/canvases/roles/FabricX Role — Cutting.dc.html.

Read first: nav.ts (cutting: marbim, cutting, refused, alerts, settings, home),
src/app/(app)/cutting/**, src/modules/cutting/actions.ts (releaseMarker), the create_lay /
record_cut_report offline writes, docs/handoffs/HANDOFF-5-1-cutting-floor.md §5–§7 (the PP
gate, the tolerance trap), docs/UI-UX-ROLE-AUDIT.md §2 Cutting and §3.4, MOBILE-CONTRACT §3
Table.

Density: floor. Desk and 390px. Dark only.

PAGES:
1. /cutting (landing) — the queue: orders cuttable and not, each card with the gate strip
   drawn as chips BEFORE the button: PP ✓/✗ (with the sample's stage if ✗), rolls issued
   ✓/✗ (metres), marker released ✓/✗. Cuttable cards have "Start lay"; the others have the
   refusal sentence on the card, and tapping it opens the Gate drawer (what would clear it:
   "PP is with H&M since 3 Sep; the merchandiser is Nusrat").
2. /cutting/lay — the open lay: order, colour, marker (releaseMarker from the drawer),
   plies, rolls used (picked from issued rolls, shade group shown), size ratio, expected
   pieces per size computed live. Lays open past N days flagged.
3. /cutting/report — the cut report against a lay: the size × colour grid, the sheet photo
   → draft with confidence per cell and "the sheet lacks size XS" said rather than zeroed,
   the tolerance trap (a cell over ±2% of expected turns at-risk and needs a reason), submit;
   a correction after submit goes through approval (draft to production's/owner's inbox —
   say where).
4. /cutting/wastage — per order: fabric issued vs cut vs wasted, in metres and %, the
   worst three markers.
5. /home — queues: newly cuttable (PP flipped, rolls issued, no open lay), lays open past
   N days, cut reports awaiting correction approval. /refused — my refusals. /marbim.

FLOWS:
F1. PP flips: push "ST-2610 PP approved — cutting can start" → /cutting → card now cuttable →
    Start lay → /cutting/lay.
F2. Lay to report: lay → rolls picked (shade group A only) → marker released → plies 60 →
    expected pieces → cut → /cutting/report → sheet photo → draft → White/L 1216 over
    tolerance → reason → submit.
F3. Refused: card with PP ✗ → tap → Gate drawer → "Open the sample" (to /sampling?open=…,
    read-only for cutting).
F4. Correction: submitted report → "Correct" → draft → pending badge → approved → grid updates
    with a Rev 2 diff overlay.

STATES: all five; empty queue says "Nothing cuttable — 3 orders are waiting on PP".

Bengali pass on /cutting and /cutting/report at phone width.
```

**Lock checklist (S5)**

- [ ] Gate chips drawn on the card before Start lay, and the refusal is the same sentence
- [ ] Tolerance trap cell needs a reason; the sheet's missing sizes are said, not zeroed
- [ ] Correction path shows where the draft goes

**VERIFY**

```
Check the Cutting canvas against nav.ts, src/modules/cutting/actions.ts, the create_lay and
record_cut_report sync handlers, and HANDOFF-5-1 §7. Every gate in §7 must be drawn as a chip
on the queue card. Do not change code.
```

---

### S6 — Maintenance ("the ticket")

**Chair.** Lands on `/maintenance`. Claims and resolves tickets (auto-raised from downtime,
line-down first), completes PM, keeps the machine registry (nameplate photo → draft). Mobile
skin: Ticket (Tickets · PM · Registry).

**PROMPT**

```
Design the MAINTENANCE experience:
docs/01-design/canvases/roles/FabricX Role — Maintenance.dc.html.

Read first: nav.ts (maintenance: home, marbim, maintenance, refused, alerts, settings),
src/app/(app)/maintenance/**, src/modules/maintenance/actions.ts (reportMachine, takeTicket,
resolveMachineTicket, dropTicket, markPmDone, addMachine, moveMachine, savePmSchedule),
docs/UI-UX-ROLE-AUDIT.md §2 Maintenance and §3.5, MOBILE-CONTRACT §3 Ticket.

Density: floor. Desk and 390px.

PAGES:
1. /maintenance (landing) — tickets: unclaimed (line-down first, with the line and the
   minutes down counting), mine, resolved today. Row → Ticket drawer: machine (code + type +
   line), the downtime that raised it (who, when, reason), Take / Drop / Resolve (resolution
   note, parts used), the history; a manual ticket (reportMachine) from a + button.
2. /maintenance/pm — the PM schedule: machines due this week, overdue (red, days), done;
   row → drawer: the checklist, markPmDone, next due computed; savePmSchedule from the
   machine drawer.
3. /maintenance/machines — the registry: by line, then type; row → Machine drawer: nameplate
   facts (addMachine via nameplate photo → draft), moveMachine (line picker), open tickets,
   PM history. The Bengali nameplate case.
4. /home — unclaimed tickets, PM overdue, claimed by me. /refused, /marbim (prompts: "which
   machine stops most", "what is due for PM on L3").

FLOWS:
F1. Line-down: push (loud) "L1 M-14 down, 4 min" → /maintenance → Take → walk → Resolve with
    note → production's downtime closes → the line's push.
F2. PM: /maintenance/pm → overdue row → drawer → checklist ticked → done → next due.
F3. New machine: registry → + → nameplate photo → draft (make, model, serial, year, SMV class)
    with confidence → approve → placed on L2.
F4. Move: machine drawer → move to L4 → the line boards update.

STATES: all five; empty tickets: "Nothing is down. 2 machines are due for PM this week."

Bengali pass on /maintenance at phone width.
```

**Lock checklist (S6)**

- [ ] Line-down tickets sort first with minutes counting
- [ ] Ticket row actions are drawer footer buttons, never row ghosts under 44px
- [ ] Nameplate draft shows confidence per field

**VERIFY**

```
Check the Maintenance canvas against nav.ts and src/modules/maintenance/actions.ts. Every
action must be a drawn button. Confirm production's reportMachine is drawn in S3, not here.
Do not change code.
```

---

### S7 — Shipment ("the carton")

**Chair.** Lands on `/shipment`. Runs an order from finished goods to vessel to bank through a
visible pipeline: pack → ex-factory → EXP → documents → bank. Ten operations, stage-local.
Mobile skin: Carton (Pipeline · Packing). Desk density on the board, floor on packing.

**PROMPT**

```
Design the SHIPMENT experience: docs/01-design/canvases/roles/FabricX Role — Shipment.dc.html.

Read first: nav.ts (shipment: home, marbim, orders(read), shipment, refused, alerts,
settings), src/app/(app)/shipment/**, src/modules/shipment/actions.ts (openShipment,
loadOrderCartons, regeneratePackingList, lockPackingList, confirmShipmentLeft,
recordExpNumber, buildShipmentDocChecklist, markShipmentDoc, sendDocsToBank,
requestToleranceException, acceptLcDateBreach), docs/UI-UX-BUILD-PLAN.md 2.2 (the stage rail
decision), docs/UI-UX-ROLE-AUDIT.md §2 Shipment and §3.6, MOBILE-CONTRACT §3 Carton.

PAGES:
1. /shipment (landing) — the pipeline board: one row per shipment with the stage rail
   PACK → EX-FACTORY → EXP → DOCUMENTS → BANK (done ticked, current highlighted, blocked
   greyed with the reason). Filters: stalled, LC closing ≤7d, missing EXP. Row → Shipment
   drawer with tabs Stage · Cartons · Documents · LC · History; the footer holds only the
   current stage's actions (pack: lock packing list; ex-factory: confirm left; EXP: record
   number; documents: checklist + mark; bank: send). Gate strip: EXP present, LC latest
   shipment vs ex-factory, tolerance vs order qty.
2. /shipment/packing (floor density) — cartons against the order's finished goods: carton
   builder (size × colour per carton), the packing list draft (regeneratePackingList; the
   packing-list AI door reads a buyer's carton spec), lock; the over-pack gate ("nothing
   finished for Navy/L yet — the gate is working").
3. New shipment — openShipment from an order with finished goods above the packable
   threshold (push).
4. Exceptions as drawers: requestToleranceException (qty outside ±tolerance → draft to
   commercial), acceptLcDateBreach (ex-factory later than LC latest shipment → ConfirmDialog
   with the sentence and who is accepting — commercial/merchandiser also may).
5. /orders read-only with the ReadOnlyNote (dates, breakdown, LC chip).
6. /home — shipments by stage with the stalled one flagged, EXP missing on confirmed
   ex-factory. /refused, /marbim ("which shipments can go to the bank today").

FLOWS:
F1. Pack to bank: threshold push → open shipment → packing floor → cartons → packing list
    locked → confirm left → EXP recorded → doc checklist (invoice, packing list, BL, COO, EXP
    form) → all marked → send to bank → the drawer's bank stage ticked → finance sees the
    invoice door.
F2. Blocked at bank: no EXP → bank stage greyed "needs EXP" → record EXP → unblocked.
F3. LC date breach: ex-factory 14 Dec, LC latest shipment 12 Dec → red banner → accept with
    reason (ConfirmDialog) → commercial pushed.
F4. Over tolerance: 3% over → request exception → commercial's inbox → approved → lock.

STATES: all five; packing offline-queued.

Bengali pass on /shipment/packing at phone width.
```

**Lock checklist (S7)**

- [ ] All ten operations reachable, each on its own stage of the rail
- [ ] A shipment mid-pack shows bank greyed with the reason
- [ ] Packing floor has zero sub-44px taps

**VERIFY**

```
Check the Shipment canvas against nav.ts and src/modules/shipment/actions.ts: enumerate the
ten action names and the artboard/stage each appears on. Do not change code.
```

---

### S8 — Merchandiser ("the desk", part 1)

**Chair.** The busiest desk. Books orders (PO → draft), keeps breakdowns and TNAs, runs samples
through to PP approval, works leads and RFQs, costs styles, closes orders into memory. Lands on
`/home`. Mobile skin: Desk (Order book · Capture · Confirm). Desk density.

**PROMPT**

```
Design the MERCHANDISER experience, part 1 (orders, sampling, memory):
docs/01-design/canvases/roles/FabricX Role — Merchandiser.dc.html.

Read first: nav.ts (merchandiser: home, approve, marbim, orders, memory, sampling, buyers,
rfq, costing, planning, shipment, refused, alerts, settings), src/app/(app)/orders/**,
src/app/(app)/sampling/**, src/app/(app)/memory, src/modules/orders/actions.ts
(createOrder, previewMilestoneRipple, actualizeMilestone, saveOrderBreakdown,
proposeOrderRevision, generateOrderTna, setOrderStatus, setOrderInputCell,
recordOrderShipDate, setOrderFabricLeg, saveOrderDrops, setOrderColourApproval,
orderTnaPeek), src/modules/sampling/actions.ts (raiseSampleRequest, moveSampleStage,
recordBuyerVerdict, markSampleDispatched, addCostToSample, closeSample,
saveSampleRequisition, markRequisitionUsage), src/modules/memory/actions.ts
(saveCloseOutNote, findSimilarStyles), docs/handoffs/HANDOFF-1-4-sampling.md,
HANDOFF-orders-dossier-additions.md, HANDOFF-sampling-requisition.md,
docs/UI-UX-ROLE-AUDIT.md §2 Merchandiser and §3.7, MOBILE-CONTRACT §3 Desk.

PAGES:
1. /home (landing) — My work: milestones due this week grouped by day (orderTnaPeek), PP
   verdicts waiting on buyers, samples due to dispatch, drafts I raised (Confirm/Discard),
   RFQs due. Phone: Order book · Capture · Confirm.
2. /orders — the book: PO (mono), buyer, styles, qty, value $, ex-factory, LC chip (number +
   days, red when conflicting), TNA health selvage. KPI row. Row → Order drawer (720):
   tabs TNA · Breakdown · LC · Files · History; footer: the next milestone's actualize,
   "Open full page". New order: the PO drop → draft (createOrder) → the form pre-filled.
3. /orders/[orderId] — full page (this is one of the three): TNA tab (MilestoneTimeline with
   planned/actual, owner, dependency, critical-path thicker selvage; slipped milestone shows
   the ripple preview "pushes ex-factory +4d" before confirm — previewMilestoneRipple then
   actualizeMilestone; generateOrderTna for a fresh order), Breakdown tab (BreakdownGrid
   colour × size, live totals, mismatch at-risk, Rev N diff overlay — saveOrderBreakdown /
   proposeOrderRevision), LC tab (master + BTB headroom bar, docs checklist, the conflict
   banner), Dossier tab (setOrderFabricLeg, saveOrderDrops, setOrderColourApproval,
   recordOrderShipDate — each a section with its own save), Files, History.
4. /orders/inputs — the inputs grid (setOrderInputCell): orders × inputs (fabric, trims,
   labels, packaging) with each cell's state; cell → drawer with the input's PO/PR and dates.
5. /sampling — the board by stage; row → Sample drawer: stage mover (moveSampleStage per the
   §6 machine), buyer verdict (recordBuyerVerdict — the PP verdict is what flips cutting;
   say so in the drawer), dispatch (markSampleDispatched — courier, AWB), cost
   (addCostToSample), close; the link to the order's TNA milestone this sample gates (audit
   friction: today there is no path — draw it). /sampling/[sampleId] full page for the
   requisition (saveSampleRequisition, markRequisitionUsage) and the sample's history.
   /sampling/library (past samples, findable by style/buyer) and /sampling/load (the room's
   week).
6. /memory — closed orders' compiled memory: what went wrong, what to repeat; the close-out
   note (saveCloseOutNote) as a form at order close; "similar styles" (findSimilarStyles) as
   a drawer from any order or RFQ.
7. /planning as merchandiser (write: allocate their own orders — draw allocate only, the
   rest ReadOnly), /shipment (write: openShipment, acceptLcDateBreach), /approve (what
   routes to them: order revisions, PP verdicts read from mail), /refused, /marbim (prompts:
   "what is due this week", "which orders conflict with their LC").

FLOWS:
F1. Book an order: PO PDF → draft (buyer, styles, qty, dates, price) with confidence → correct
    the ex-factory → save → TNA generated → the book shows it on-track.
F2. Slip: /orders/[id] → milestone "fabric in-house" actualized 4 days late → ripple preview →
    confirm → ex-factory moves → the LC chip turns red → the conflict banner → "Ask commercial
    for an amendment" (a draft to commercial).
F3. Buyer revision: revised PO drop → diff draft ("Navy/L +2,000; ship −5d") → approve → Rev 2
    → grid diff overlay.
F4. Sample to PP: raise request → stage mover → dispatch (AWB) → buyer verdict from mail
    (draft in inbox) → approve → PP ✓ → cutting pushed → the order's TNA milestone actual set.
F5. Close-out: order shipped and paid → close-out note → /memory compiles it → next RFQ for the
    same buyer shows "similar styles" with the note.

STATES: all four; the empty book on Test Textile: "No orders yet — drop a buyer PO or book one
by hand".

Bengali pass on /orders and the Order drawer.
```

**Lock checklist (S8)**

- [ ] Order drawer has the five tabs and "Open full page"; the full page exists only for orders
- [ ] Ripple preview precedes every milestone date change
- [ ] Sample drawer links to the TNA milestone it gates
- [ ] LC conflict banner appears on the book row, the drawer and the full page identically

**VERIFY**

```
Check the Merchandiser canvas against nav.ts and src/modules/{orders,sampling,memory}/
actions.ts. Every action must be a drawn button with its artboard named. List the sampling
state machine's transitions (HANDOFF-1-4 §6) and confirm each is a drawn stage move. Do not
change code.
```

---

### S9 — Merchandiser and Commercial, the front door (buyers, RFQ, costing)

**Chair.** Shared between merchandiser and commercial (both have write on buyers, rfq,
costing; finance also writes costing). Leads to buyers, RFQs to quotes, styles to cost sheets
and BOMs. Lands from `/home`. Desk density.

**PROMPT**

```
Design the FRONT DOOR shared by merchandiser and commercial:
docs/01-design/canvases/roles/FabricX Role — Front Door (Buyers, RFQ, Costing).dc.html.

Read first: nav.ts (buyers, rfq, costing entries), src/app/(app)/buyers/**,
src/app/(app)/rfq/**, src/app/(app)/costing/**, src/modules/buyers/actions.ts (addLead,
moveLeadStage, logLeadActivity, findConversionDuplicates, convertLeadToBuyer, setBuyerTerms),
src/modules/rfq/actions.ts (createRfq, draftQuote, sendQuote, markRfqWon, markRfqLost,
askClarification, answerClarification), src/modules/costing/actions.ts (previewSheet,
saveCostSheet, approveSheet, saveBom), docs/UI-UX-BUILD-PLAN.md 2.3 (costing lands on the
sheet list), docs/UI-UX-ROLE-AUDIT.md §2 Merchandiser/Commercial.

PAGES:
1. /buyers — the desk: buyers with terms, open orders, on-time record, the scorecard link.
   Row → Buyer drawer: terms (setBuyerTerms — payment, tolerance, inspection level), contacts,
   open orders, the scorecard summary, History. /buyers/waiting — leads by stage (Kanban or
   list; list on phone): addLead, moveLeadStage, logLeadActivity from the Lead drawer;
   convert (convertLeadToBuyer) with the duplicate check (findConversionDuplicates) shown as
   a sentence "This looks like Bestseller (Dhaka office) — merge or create new?".
   /buyers/scorecard — per buyer: OTD, claims, payment days; names, never ids.
2. /rfq — the RFQ list by due date; /rfq/due — this week's. Row → RFQ drawer (dense, matches
   the job): the ask (buyer, style, qty, target price, due), clarifications thread
   (askClarification / answerClarification), the quote (draftQuote from a cost sheet — pick
   or "Cost a style"), sendQuote (the sent copy as a document), won/lost (markRfqWon opens
   "Book the order" pre-filled; markRfqLost asks the reason as a picker). "Similar styles"
   from memory as a section.
3. /costing — the sheet list (plan 2.3): style, buyer, version, FOB $, margin %, state
   (draft / approved), who; "Cost a style" opens the studio. The studio (full-page form —
   this is a top-to-bottom form, so a page not a drawer): the 31 inputs grouped (fabric,
   trims, CM, wash/print, overheads, commercial), previewSheet recomputes live, saveCostSheet,
   approveSheet (owner/finance/commercial — say who). /costing/bom — the BOM per style
   (saveBom): consumption per size, wastage %, the store's items linked.
4. Role variants: commercial sees the same three with full write; finance sees /costing only,
   with approveSheet; merchandiser cannot approveSheet if the policy says so — draw the
   ReadOnly footer sentence.

FLOWS:
F1. Lead to buyer: add lead from a LinkedIn message (MARBIM reads it → draft) → stage moves
    → convert → duplicate check → new buyer with terms.
F2. RFQ to order: RFQ from mail (draft) → clarification asked → answered → cost a style (studio)
    → quote drafted from the sheet → sent → won → Book the order (S8 F1 continues).
F3. Cost a style: list → Cost a style → 31 inputs, live FOB and margin → save v1 → approve
    (finance) → the RFQ picks it.
F4. Lost: markRfqLost → reason → the buyer's scorecard shows the lost-on-price count.

STATES: all four; the empty RFQ list says where RFQs come from (mail intake) and offers "New
RFQ".

Bengali pass on the RFQ drawer.
```

**Lock checklist (S9)**

- [ ] `/costing` lands on the list; the studio is one click behind "Cost a style"
- [ ] Duplicate check on convert is a sentence with merge/create
- [ ] Won opens the pre-filled order booking
- [ ] Approve-sheet footer differs by role as drawn

**VERIFY**

```
Check the Front Door canvas against nav.ts (buyers, rfq, costing roles/writeRoles) and
src/modules/{buyers,rfq,costing}/actions.ts. Every action is a drawn button; approveSheet's
role gate matches the code's check (read src/modules/costing/service.ts). Do not change code.
```

---

### S10 — Commercial ("the desk", part 2: LC, BTB, UD, bank)

**Chair.** Lands on `/lcs`. Records master LCs from SWIFT (draft), opens BTBs within headroom,
records amendments, works UDs, prepares bank submissions, sees realizations. Approves UD
overdraws and tolerance exceptions. Reads procurement, finance, orders. Mobile: Desk with
commercial tabs (push: LC countdowns, headroom crossings, realization landed).

**PROMPT**

```
Design the COMMERCIAL experience:
docs/01-design/canvases/roles/FabricX Role — Commercial.dc.html.

Read first: nav.ts (commercial: home, approve, marbim, orders, memory, buyers, rfq, costing,
lcs, finance, procurement, ud, shipment, alerts, settings), src/app/(app)/lcs/**,
src/app/(app)/ud/**, src/app/(app)/finance, src/modules/commercial/actions.ts (createLc,
linkLcToOrder, createUd, requestUdOverride, generateUdReconciliation, checkUdDraw,
udBalancePreview, recordLcAmendment, openBtbCredit, createSubmission,
updateSubmissionStatus, postLcRealization), docs/handoffs/HANDOFF-2-1-lc-register-bank-docs.md §5–§7, docs/UI-UX-ROLE-AUDIT.md §2 Commercial, docs/UI-UX-BUILD-PLAN.md 2.7a.

PAGES:
1. /lcs (landing) — the register: master LCs with number (mono), buyer, amount $, expiry and
   latest-shipment countdowns (≤7d at-risk, conflicting late), BTB used % with over-limit
   colouring on the ROW (2.7a), linked orders. KPI: float, expiring this month, headroom
   below threshold. Row → LC drawer (tabs Credit · BTBs · Orders · Submissions · History):
   recordLcAmendment, openBtbCredit (headroom bar live before the amount is typed),
   linkLcToOrder, "Open full page". New LC: SWIFT MT700 drop → draft (createLc) with
   confidence — the fastest data entry in the product; keep it one screen.
2. /lcs/[lcId] — full page (second of three): the credit's facts, amendments timeline, BTBs
   with the headroom arithmetic explained ("BTB limit 75% of $412,000 = $309,000; used
   $246,000; free $63,000"), orders linked with their ex-factory vs latest shipment, the
   docs-required checklist, submissions, realizations.
3. /lcs/submissions — bank submissions by state (preparing → submitted → accepted /
   discrepant → realized): createSubmission from a shipment (EXP gate shown), the
   discrepancy notes, updateSubmissionStatus; a discrepant one's drawer shows what the bank
   said and the resubmit path.
4. /ud and /ud/[udId] — the UD workbench: declarations with balance per item, draws (from
   store issues), the reconciliation (generateUdReconciliation → the customs-format
   statement as a document); createUd from the customs paper (draft); the overdraw requests
   awaiting me (approve/reject via /approve — link there). udBalancePreview as a drawer
   from any bonded PO.
5. /finance as commercial (write: postLcRealization from the bank advice — the advice photo
   → draft, value date off the paper; shortfall computed and its reason human).
6. /procurement as commercial — read plus the BTB headroom chip on any import PO (the PO
   form shows remaining headroom BEFORE submit; the refusal is the same sentence). /orders
   with the LC tab writable (link). /shipment with sendDocsToBank and acceptLcDateBreach.
7. /home — LC countdowns ≤7d, headroom below threshold, submissions in preparing,
   realizations unposted past N days, overdraw requests waiting. /approve — what routes here:
   UD overrides, LC drafts, tolerance exceptions, amendment asks from merchandising.

FLOWS:
F1. SWIFT to register: MT700 PDF → draft → check 31D expiry and 44C latest shipment → save →
    the row with countdowns.
F2. Open a BTB: LC drawer → BTBs → headroom bar → amount typed → bar fills → within limit →
    open → the import PO in procurement now has headroom.
F3. UD overdraw: /approve → the store's request (draft drawer: the balance, the draw, the
    shortfall, the storekeeper's reason) → approve with a note → store pushed.
F4. Submission: shipment sent docs → /lcs/submissions preparing → checklist → submitted →
    bank says discrepant (notes) → fix → resubmitted → accepted → realization posted from
    the advice → finance sees it.
F5. Reconciliation: /ud/[id] → generate → the statement document → download for customs.

STATES: all four.

Bengali pass on /lcs and the LC drawer.
```

**Lock checklist (S10)**

- [ ] BTB headroom on the register row and live in the open-BTB form before submit
- [ ] Both LC countdowns on the row with the conflict state
- [ ] Submission machine's states drawn per HANDOFF-2-1 §6
- [ ] The UD reconciliation is a document, not a table dump

**VERIFY**

```
Check the Commercial canvas against nav.ts and src/modules/commercial/actions.ts and
HANDOFF-2-1 §5–§7. Every action a drawn button; every §7 gate a drawn strip. Do not change
code.
```

---

### S11 — Procurement

**Chair.** Lands on `/procurement`. Requisitions → quotes (compared on landed cost) → POs behind
the BTB gate for imports → receipts (store records) → supplier scorecard. Reads store. Writes
suppliers and items in setup.

**PROMPT**

```
Design the PROCUREMENT experience:
docs/01-design/canvases/roles/FabricX Role — Procurement.dc.html.

Read first: nav.ts (procurement: home, approve, marbim, procurement, store(read), setup,
alerts, settings), src/app/(app)/procurement/**, src/modules/procurement/actions.ts
(createSupplier, createPurchaseRequisition, recordQuote, compareQuotes, issuePurchaseOrder,
updatePoStatus, recordReceipt), docs/UI-UX-ROLE-AUDIT.md §2 Procurement, UI-UX-BUILD-PLAN 1.1.

PAGES:
1. /procurement (landing) — the board in three lanes or tabs: Requisitions (urgent ≤7d to
   needed first; from orders' inputs and store's low-stock), Quotes (PRs quoted, awaiting
   comparison), POs (issued → confirmed → shipped → received; overdue red). Row → PR drawer:
   the need (order, item, qty, needed-by), quotes (recordQuote — supplier quote PDF → draft),
   compare (compareQuotes ranks on landed cost with the arithmetic shown: price + freight +
   duty unless bonded), issue PO (issuePurchaseOrder — import POs show the BTB headroom chip
   BEFORE the button; local POs don't), updatePoStatus. /procurement/[prId] full page only
   if the drawer cannot hold the comparison — try 720 first.
2. /procurement/receipts — POs expecting delivery and what store received (recordReceipt is
   store's write; procurement sees the GRN and its inspection).
3. /procurement/scorecard — suppliers: on-time %, 4-point failure rate, price drift; names.
4. /setup — Suppliers (createSupplier; supplier drawer) and Items writable; rest absent.
5. /store read-only (ReadOnlyNote), /home — urgent PRs, overdue POs, quotes awaiting
   comparison, receipts pending; /approve (supplier-quote drafts, PO drafts if routed);
   /marbim ("which POs are late", "cheapest landed for 40s poplin last year").

FLOWS:
F1. PR to PO (local): PR from an order's input → three quotes read from PDFs (drafts) →
    compare → pick → issue → confirmed → store receives → scorecard updates.
F2. Import PO behind BTB: PR for shell fabric → compare → issue → headroom chip shows $63,000
    free, PO $70,000 → refused with the sentence → "Ask commercial" (draft: open BTB or
    amend) → approved → issue succeeds.
F3. Overdue: PO shipped, delivery date passed → red → drawer → update status with the
    supplier's new date → the order's input cell updates.

STATES: all four; empty board on Test Textile says requisitions come from orders' inputs
and store's low stock.

Bengali pass on the PR drawer.
```

**Lock checklist (S11)**

- [ ] BTB headroom visible on import PO before issue; absent on local
- [ ] Landed-cost comparison shows its arithmetic
- [ ] Receipts page makes clear the write is store's

**VERIFY**

```
Check the Procurement canvas against nav.ts and src/modules/procurement/actions.ts. Confirm
recordReceipt is drawn as store's (S2) and only read here. Do not change code.
```

---

### S12 — Planner

**Chair.** Lands on `/planning`. The working week per line, allocations with overload
arithmetic, SMV capture, scenario fork/compare/apply through approval. Reads lines, cutting,
orders. Writes lines and calendars.

**PROMPT**

```
Design the PLANNER experience: docs/01-design/canvases/roles/FabricX Role — Planner.dc.html.

Read first: nav.ts (planner: home, approve, marbim, orders, memory, planning, cutting(read),
lines(read), setup, alerts, settings), src/app/(app)/planning, src/modules/planning/actions.ts
(saveLine, setLineCalendar, allocate, moveAllocation, setAllocationStatus, forkScenario,
compareScenario, proposeScenarioApply, recordSmv), docs/UI-UX-ROLE-AUDIT.md §2 Planner,
UI-UX-BUILD-PLAN 1.2.

PAGES:
1. /planning (landing) — the board: lines × days (14 columns × N lines; on phone, one line
   per screen with a day scroller — the audit says the board is read-heavy on mobile), each
   cell an allocation chip (order, colour, pcs, % of capacity; overload at-risk). Unallocated
   confirmed orders as a side list (the picker's own filter). Cell → Allocation drawer:
   the run (order, qty, SMV, target/day computed, start/end), move (moveAllocation — a date
   and line picker with the overload preview), status (setAllocationStatus: planned →
   running → done per §6), the cutting state feeding it, History. Book a line: allocate from
   the unallocated list → one dialog with the run previewed and the overload sentence.
2. Scenarios: fork (forkScenario) → a second board tab → compare (compareScenario: OTD
   change, overload days, idle days as a diff strip) → propose apply (proposeScenarioApply →
   a draft to the owner/merchandiser — say who) → applied.
3. SMV: recordSmv from the allocation drawer or the style; history of SMVs per style.
4. Lines and calendars (also in /setup): saveLine (name, machines, operators, hours),
   setLineCalendar (working days, holidays, Eid closures — draw the Eid case).
5. /orders (write: dates — draw only what planning may change), /cutting and /lines
   read-only with the ReadOnlyNote, /home — runs starting today, lines idle tomorrow,
   confirmed but unallocated; /approve (scenario applies if routed to planner); /marbim
   ("which line is free next week for 12,000 pcs of ST-2610").

FLOWS:
F1. Book: unallocated order → Book a line → L3 from 12 Oct, 9 days at 1,340/day → overload
    preview "L3 is at 112% on 14 Oct" → adjust → allocate.
F2. Move: allocation drawer → move to L4 → preview → confirm → production's /planning read
    updates.
F3. Scenario: fork → move three runs → compare (OTD +2 orders, 1 overload day) → propose →
    owner approves → applied.
F4. Eid: calendar → mark 4 closed days → the board greys them and runs slide.

STATES: all four; empty board on Test Textile: "No lines yet — add them in setup".

Bengali pass on the Allocation drawer.
```

**Lock checklist (S12)**

- [ ] Overload arithmetic previewed before allocate and before move
- [ ] Scenario apply goes through a draft; who approves is named
- [ ] Phone board is one line per screen

**VERIFY**

```
Check the Planner canvas against nav.ts and src/modules/planning/actions.ts. Every action a
drawn button. Confirm which orders fields planner may change (src/modules/orders/service.ts
role checks) and that the canvas draws only those. Do not change code.
```

---

### S13 — Finance, HR, Compliance (the three quiet desks)

**Chair.** Three narrow roles, one session. Finance lands on `/finance` (invoices from
shipments, payables, realizations, costing approval). HR lands on `/workforce` (gazette →
attendance → compute → approve, the best guided flow; workers). Compliance lands on
`/compliance` (audits, findings, CAPs, certificates, training; UD reconciliation).

**PROMPT**

```
Design FINANCE, HR and COMPLIANCE as one canvas with three sections:
docs/01-design/canvases/roles/FabricX Role — Finance, HR, Compliance.dc.html.

Read first: nav.ts (their entries), src/app/(app)/finance, src/app/(app)/workforce,
src/app/(app)/compliance, src/modules/finance/actions.ts (raiseInvoice,
requestPayablePayment), src/modules/commercial/actions.ts (postLcRealization — finance also),
src/modules/costing/actions.ts (approveSheet), src/modules/workforce/actions.ts (runPayroll,
approveRun, recordGazette, makeGazetteActive, importAttendance, saveWorker),
src/modules/compliance/actions.ts (logAudit, raiseCap, progressCap, attachCapEvidence,
closeCorrectiveAction, saveCertificate, logTraining), HANDOFF-10-1-workforce-wage-engine.md,
docs/UI-UX-ROLE-AUDIT.md §2 Finance/HR/Compliance, UI-UX-BUILD-PLAN 1.5, 2.7b, 3.1,
CLAUDE.md rule 9 (payroll: hr+owner; 403 without body; reads audited).

FINANCE
1. /finance (landing) — receivables (invoices by due, overdue first, "chase today" ranked),
   payables (payment requests by due), realizations (posted / unposted by shipment), accruals.
   Row → Invoice drawer: raiseInvoice picks from SHIPMENTS not orders (the shipment, its
   packing list, the LC), the invoice document, its bank submission state, History. Payable
   drawer: requestPayablePayment (PO, supplier, amount ৳/$, due) → draft to the owner if
   above the policy threshold — say so.
2. Realization from advice: the bank advice photo → draft (amount, value date off the paper,
   deductions as notes, shortfall computed) → post (postLcRealization).
3. /costing with approveSheet; /lcs read with the realization door only. /home — overdue
   receivables ranked, unposted realizations, payables due this week; /approve (payables above
   threshold, if routed).

HR
4. /workforce (landing) — the four doors in sequence as a stepper: 1 Gazette (recordGazette
   from the gazette PDF → draft grade table; makeGazetteActive with the effective date) →
   2 Attendance (importAttendance from the device CSV; the "days with no device rows" gap
   list; it never guesses punches — say so) → 3 Compute (runPayroll for a period; the
   run's totals: basic, OT at 2× basic/208, festival bonus pro-rata, deductions; per-worker
   drawer with the arithmetic) → 4 Approve (approveRun — hr proposes, owner approves; the
   ConfirmDialog; the parallel-run note from CLAUDE.md). Roster: workers with grade, line,
   join date; the worker door (saveWorker) HERE, linked from setup (2.7b). Every read here
   is audited — a quiet line says so.
5. Admin's view of /workforce (from S1): roster visible, payroll doors absent with the
   sentence. /home — payroll run state (which door is next), attendance gaps, gazette
   awaiting activation.

COMPLIANCE
6. /compliance (landing) — CAPs by deadline (filter: needs evidence / awaiting closure —
   audit friction), findings with no CAP, audits with no findings. Audit drawer: logAudit
   from the audit report (draft findings read out of it), findings list → raiseCap per
   finding (owner desk, deadline). CAP drawer: progressCap (open → in progress → evidence →
   closed), attachCapEvidence (photo/document), closeCorrectiveAction; the owner desk's
   person. Certificates (saveCertificate: BSCI, WRAP, Oeko-Tex with expiry countdowns) and
   Training (logTraining: fire drill, first aid — attendance count) as sections.
7. /ud as compliance — read plus generateUdReconciliation. /home — CAPs by deadline,
   findings with no CAP, certificates expiring ≤60d. /approve (CAP closures if routed).

FLOWS:
F1. Invoice: shipment sent to bank → /finance → raise invoice from it → document → submission
    accepted → realization from advice → posted; receivable closes.
F2. Payroll month: gazette active → CSV imported, 2 gap days named → compute → 3 workers with
    unusual OT flagged as sentences → hr proposes → owner approves → payslips.
F3. Audit to CAP: report PDF → draft findings (5) → approve → 5 CAPs raised with owners →
    one progresses with photo evidence → closed → the audit's row shows 4/5 open.
F4. Certificate expiry: 45 days → /home → drawer → renewal noted.

STATES: all four for each landing; HR's empty: "No gazette yet — record one to start".

Bengali pass on /workforce (the roster reads Bangla names).
```

**Lock checklist (S13)**

- [ ] Payroll stepper shows which door is next; approve is the owner's and says so
- [ ] Invoice picker is shipments, not orders
- [ ] CAP list has the two filters
- [ ] Every payroll read carries the "audited" line

**VERIFY**

```
Check the Finance/HR/Compliance canvas against nav.ts and src/modules/{finance,workforce,
compliance}/actions.ts plus postLcRealization and approveSheet. Every action a drawn button
with role gate matching the code (workforce: hr+owner). Do not change code.
```

---

### S14 — Viewer and Member

**Chair.** Viewer: a buying-house guest; reads the order book, asks MARBIM, sees alerts.
Member: a person awaiting a desk. Both small; one session.

**PROMPT**

```
Design VIEWER and MEMBER: docs/01-design/canvases/roles/FabricX Role — Viewer and Member.dc.html.

Read first: nav.ts (viewer: orders(read), marbim, alerts, settings; member: marbim, alerts,
settings; landings — viewer /orders, member /marbim), UI-UX-BUILD-PLAN 1.7,
docs/UI-UX-ROLE-AUDIT.md §2 Viewer/Member.

VIEWER
1. /orders (landing) — the book read-only: ReadOnlyNote first ("You can read the order book.
   Changes are the merchandiser's."); rows open the Order drawer with TNA · Breakdown · Files
   only — no LC tab (redaction: money and LC are not a guest's), no footer, no full page.
   Filter to "my buyer" if the viewer is tied to one.
2. /marbim — the panel with viewer prompts ("where is PO-BF-2044", "when does ST-2610 ship");
   answers redact what the viewer may not read and say so in a sentence.
3. /alerts (their buyer's), /settings (profile, language). No /home, no /approve — the
   phone has no tabs for them (they would point at locked doors).

MEMBER
4. /marbim (landing) — the surface says, first: "You don't have a desk yet — ask Kamrul (your
   admin) to assign one." with the admin's name when resolvable. The panel still answers
   general questions. /settings.
5. The transition: admin grants a role (S1 F3) → the member's next sign-in lands on that
   role's landing.

STATES: populated / empty / loading / error; the locked card when either follows a link to a
module they cannot open (LockedState naming the module).

Bengali pass on both landings.
```

**Lock checklist (S14)**

- [ ] Viewer's order drawer has no LC tab and no footer
- [ ] Member's landing sentence names the admin
- [ ] Neither has phone tabs

**VERIFY**

```
Check the Viewer/Member canvas against nav.ts: no artboard shows an entry outside their
roles; the Order drawer redacts per the LC/money rule. Do not change code.
```

---

### S15 — Cross-role handshakes and the mobile skins

**Why last.** The product's best moments are hand-offs between desks. Each is a numbered
artboard sequence across two or three role canvases, with the push notification and the
drawer it lands in. Also the eight mobile skins side by side, so the tab sets are consistent.

**PROMPT**

```
Design the HANDSHAKES canvas: docs/01-design/canvases/roles/FabricX Role — Handshakes and
Mobile Skins.dc.html. Reuse artboards from the role canvases (reference them by name), draw
only the joins: the event, the push, the drawer it opens, the state change on both sides.

HANDSHAKES (one row each, left-to-right across roles):
H1. Downtime → ticket: production opens downtime → maintenance pushed (loud) → takes →
    resolves → production's downtime closes.
H2. PP verdict → cutting: buyer mail → merchandiser's inbox draft → approve → PP ✓ → cutting
    pushed → the queue card turns cuttable.
H3. Requisition → issue → lay: cutting raises a material requisition → store's issue list →
    issued (UD gate) → cutting's lay shows the rolls.
H4. UD overdraw: store refused → request → commercial's inbox → approved → store pushed →
    issue completes.
H5. Import PO → BTB: procurement refused → ask commercial → BTB opened → PO issues.
H6. GRN → 4-point: store receives → quality's fabric list → verdict → store pushed → roll
    state.
H7. Finished goods → final → packing → bank → invoice → realization: quality passes →
    shipment packs → EXP → docs → commercial submits → finance invoices → realization posted.
H8. TNA slip → LC conflict → amendment: merchandiser actualizes late → LC chip red → asks
    commercial → amendment recorded → chip clears.
H9. Scenario → approval: planner proposes → owner approves → board applies → production's
    read updates.
H10. Audit → CAP → owner desk: compliance raises a CAP on maintenance → maintenance's /home
    shows it → evidence → closed.
H11. Mail intake → any desk: a buyer mail lands in /marbim/intake → claimUnfiled → the draft
    routes by kind to the right inbox (draw three kinds: PO, PP verdict, RFQ).

MOBILE SKINS (one artboard, eight phones side by side, from MOBILE-CONTRACT §3): Truck, Hour,
Walk, Table, Ticket, Carton, Desk (merchandiser tabs and commercial tabs), Pulse. Each: the
tab bar, the home tab populated, one push notification and the bottom sheet it opens. Viewer
and member: no phone artboard, one sentence why.

Bengali pass on the Hour and Truck phones.
```

**Lock checklist (S15)**

- [ ] Every handshake names the push and the drawer it opens on the receiving side
- [ ] Both sides' state change is drawn
- [ ] Eight skins have ≤3 tabs and identical tab-bar geometry

**VERIFY**

```
Check the Handshakes canvas against src/modules/*/events.ts and jobs.ts (the outbox events
and the push producers): every handshake's push must correspond to an existing producer, or
be listed as a gap for docs/UI-UX-BUILD-PLAN.md. Do not change code.
```

---

## 4 · After all sessions — from canvases to build

Once the sixteen canvases pass, run this once in Claude Code. It turns the design into work
the build plan can tick, without inventing module contracts (screens change here, not
contracts; a contract change gets a HANDOFF first, per CLAUDE.md).

```
Read every canvas in docs/01-design/canvases/roles/ and the VERIFY findings recorded in this
conversation. Produce docs/UI-UX-BUILD-PLAN.md "Phase 5 — Role canvases" as a ticked list,
one task per screen or drawer that differs from what src/app/(app) renders today, sized to a
session, ordered floor roles first, each with a *Verify:* line naming the browser test in
__tests__/browser/ that will assert it. Group drawer-family work (S0) as core tasks that come
before any role task that depends on them. Any finding that needs a new action, a new state
or a new gate is NOT a Phase 5 task — list it separately under "Needs a HANDOFF first".
```

## 5 · Session ledger

Tick as each canvas is committed. A canvas is done when its lock checklist passes and the
VERIFY findings are either fixed on the canvas or recorded in the build plan.

| # | Session | Canvas | Locked | Verified | Commit |
|---|---|---|---|---|---|
| S0 | Shell and drawers | Shell and Drawers | ☐ | ☐ | |
| S1 | Owner and Admin | Owner and Admin | ☐ | ☐ | |
| S2 | Store | Store | ☐ | ☐ | |
| S3 | Production | Production | ☐ | ☐ | |
| S4 | Quality | Quality | ☐ | ☐ | |
| S5 | Cutting | Cutting | ☐ | ☐ | |
| S6 | Maintenance | Maintenance | ☐ | ☐ | |
| S7 | Shipment | Shipment | ☐ | ☐ | |
| S8 | Merchandiser | Merchandiser | ☐ | ☐ | |
| S9 | Front door | Front Door (Buyers, RFQ, Costing) | ☐ | ☐ | |
| S10 | Commercial | Commercial | ☐ | ☐ | |
| S11 | Procurement | Procurement | ☐ | ☐ | |
| S12 | Planner | Planner | ☐ | ☐ | |
| S13 | Finance, HR, Compliance | Finance, HR, Compliance | ☐ | ☐ | |
| S14 | Viewer and Member | Viewer and Member | ☐ | ☐ | |
| S15 | Handshakes and skins | Handshakes and Mobile Skins | ☐ | ☐ | |
