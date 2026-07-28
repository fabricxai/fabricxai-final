# FabricXAI — Claude Design Session Prompts
### The complete design program: 11 sessions, 23 modules, in dependency order

**How to run this file.** One session = one Claude Design conversation. For every
session: (1) attach the listed files, (2) paste BLOCK A (the shared preamble —
same every time), (3) paste that session's BLOCK B module prompt(s), (4) iterate
until the lock checklist passes, (5) export, then run the HANDOFF GENERATION
prompt in Claude Code (bottom of this file) once per module before any code.

Rhythm: design runs one phase ahead of code (S0–S1 while Claude Code does
backend Phase 0). Never design more than ~2 sessions ahead — later designs
should inherit lessons from built modules.

**Lock checklist (every session, before export):**
- [ ] Both modes shown where the module has desk screens; floor screens dark only
- [ ] Amber audit: amber appears ONLY on act-surfaces (buttons, focus, drafts, badges)
- [ ] Every screen has empty, loading (weave), error — and offline state if floor
- [ ] Status is always dot + word; money always carries $ or ৳; codes in mono
- [ ] Bengali sanity: at least one screen shown with bn strings at 1.4× length
- [ ] Reviewed with the department's real user (or champion) — their one change made
- [ ] The day-3 test answered honestly: faster than their Excel/paper?

---

## SESSION S0 — Design system foundation (run first, no module)

**Attach:** your real logo files — fabricxai wordmark SVG+PNG (both variants),
the X-mark SVG+PNG. Also attach 01-design/theme.css (v2) if the tool accepts it.

**Paste:** the foundation prompt from our design-system exchange — it specifies
both modes' tokens, the amber rule, all four signature elements including the
6-state animated MARBIM mark, and the full core component set. Replace its brand
description with: "The attached files are the official logo assets — use them
directly, never redraw or recolor. The X-mark SVG is the source for the MARBIM
mark and all icon derivatives."

**Locks:** the style guide every following session references. Expect one
revision round against theme-v2.css before calling it final.

---

## BLOCK A — SHARED PREAMBLE (paste first in EVERY module session)

```
You are designing a production screen set for FabricXAI, an AI-powered ERP
for Bangladeshi garment export factories. The design system already exists —
follow it exactly, do not invent styles:

TOKENS (from theme.css in the codebase):
- Dark-first. Canvas #0A0E17, surface #101725, raised #141C2C.
  Borders: 1px white @ 9% (default) / 16% (strong). Depth = borders, not shadows.
- Brand amber #EAB308 has ONE meaning: "a person must act" — primary buttons,
  focus rings, pending approvals, MARBIM drafts. NEVER use amber for status.
- Status colors: on-track #34D399, at-risk #FF8A3D, late #FB4E5E,
  info #60A5FA, done #808B9D. Status = dot + word, never color alone.
- Secondary: warp indigo #6B8AFF (links, selection, secondary chart series).
- Type: Archivo (page/section titles only), Inter (everything else),
  Anek Bangla (Bengali), JetBrains Mono (codes: PO numbers, LC numbers,
  style codes, roll IDs). Tabular numerals on every figure.
- Radius: 8 buttons/chips · 12 inputs · 16 cards · 20 drawers.
- Signature elements (use, don't reinvent):
  · selvage edge — 3px status stripe on the left rim of cards/rows
  · thread rule — dashed diagonal-thread divider under page headers
  · weave loader — replaces all spinners
- Density modes: data-density="desk" (44px rows) for office roles,
  data-density="floor" (56px rows, ≥48px touch targets) for floor screens.

ARCHITECTURE RULES:
- MARBIM (the AI) never writes data. AI output = a draft card (amber-bordered,
  per-field confidence bars, click-to-source) that a human approves/rejects.
- Multi-tenant with roles: owner, admin, manager, member, viewer. Say what
  each role sees on each screen.
- Every label is an i18n key; design with English but test 1.4× string length
  (Bengali runs longer). USD for buyer-facing money, BDT (৳) for local — every
  figure carries its currency and unit.

QUALITY BAR:
- Every screen: real sample data (Bangladeshi buyer names like H&M, Primark,
  C&A, Bestseller; style codes like ST-2610; realistic quantities 8,000–80,000
  pcs), a designed empty state (an instruction, not a sad icon), a loading
  state (weave loader), and an offline/queued state where relevant.
- The test before you finish: "Would a Gazipur factory person doing this job
  be faster here than in their current Excel/paper on day 3?" If not, simplify.
```

Also attach to every module session: the S0 style-guide export.


---

## SESSION S1 — The flagship — patterns everything reuses

**Modules:** 1.3 Order Desk & TNA (the flagship)
**Why this order:** Locks: BreakdownGrid, MilestoneTimeline, LC chips, full-page detail pattern.


### BLOCK B — 1.3 Order Desk & TNA (the flagship)

```
Design the ORDER DESK + TNA for merchandisers. This is the most important
screen set in the product — spend the effort here.

Screens:
1. Order book — SmartTable: PO (mono), buyer, styles, qty, value USD,
   ex-factory date, LC chip (number + days-to-expiry, turns late-red when
   conflicting with plan), TNA health (selvage edge: on-track/at-risk/late).
   KPI row: order book value, shipping this month, at-risk orders, LC conflicts.
2. Order detail — full page, tabbed:
   · TNA tab (default): vertical milestone timeline — each milestone a row
     with planned vs actual dates, owner avatar, dependency line, status chip.
     Critical-path milestones get a thicker selvage. Slipped milestone shows
     ripple preview ("pushes ex-factory +4d") before you confirm the new date.
   · Breakdown tab: the color × size qty matrix as an editable grid —
     row/column totals live-computed, mismatch vs order qty highlighted
     at-risk orange, revision history accessible ("Rev 2 diff" overlay
     coloring changed cells).
   · LC tab: master LC facts + linked BTB LCs with a headroom bar
     (used vs limit), docs-required checklist, and the conflict banner
     pattern when ex-factory > latest shipment date.
   · Files tab.
3. Cross-order TNA calendar — "my week": all milestones across all my orders
   due this week, grouped by day, each with order context. This is the screen
   a merchandiser opens every morning — make it scannable in 10 seconds.
4. Buyer revision flow — upload revised PO → MARBIM diff draft ("qty +2,000
   on Navy/L, ship date −5 days") → approve applies Rev N.

Owner view variant of screen 1: money + risk only, bigger numbers, no edit.
```

---

## SESSION S2 — The trust layer

**Modules:** X.1 Approve Inbox, X.2 MARBIM Surface
**Why this order:** Locks: DraftCard family, confidence bars, click-to-source, batch review, the MARBIM panel + animated mark placement.


### BLOCK B — X.1 Approve Inbox

```
Design the APPROVE INBOX — the trust organ of the product.

- Unified pending list, filterable by module/source/age/confidence; batch
  keyboard flow (J/K navigate, A approve, R reject) — a manager clears 30
  drafts in 5 minutes.
- Item view: creates = field list with confidence + click-to-source;
  updates = before/after diff (changed cells highlighted).
- Reject requires a reason (quick-pick + free text).
- Routing badges ("needs owner") and aging (at-risk >48h).
- Audit trail per item: drafted-by → approved-by → committed row link.
Design goal: feels like control, not bureaucracy.
```


### BLOCK B — X.2 MARBIM Surface

```
Design the MARBIM SURFACE: global slide-over panel (glass, 20 radius) +
in-context "Ask MARBIM" buttons + the universal drop-zone pattern.
- Streaming with tool-use visibility ("checking your RFQs… found 4").
- The draft card is already specified (amber border, confidence bars,
  click-to-source) — reuse identically everywhere.
- Failure states: extraction failed / timeout / rate-limited — each honest
  and retryable, never blank.
- Trust footer: "MARBIM drafted 214 records this month; you approved 196,
  corrected 31 fields" → links to the audit trail.
```

---

## SESSION S3 — The floor spine

**Modules:** 3.1 Fabric & Trims Store, 6.1 Line Tracking & Hourly Production
**Why this order:** Locks: floor density, NumpadInput, offline SyncPill, TV board variant. Review these on a real tablet.


### BLOCK B — 3.1 Fabric & Trims Store

```
Design the STORE screens (floor density, offline-tolerant, entry speed is
everything).

Screens:
1. GRN entry — single-column tall form optimized for tab-through and barcode
   scan: supplier PO picker (recent-first), challan no, item rows added by
   scan or search, qty, bonded toggle (when on: UD picker appears with live
   balance shown). Sticky footer: queued/synced status pill + Save. If
   connection drops mid-entry, the form banner says "Offline — entries queue
   and send when back" (info blue, not an error).
2. Roll intake — after fabric GRN: roll list entry (roll no, qty, lot) with
   shade-group assignment; visual: rolls as small cards grouped by shade
   with a swatch placeholder.
3. Issue screen — requisition-driven: pick requisition → required items with
   required-vs-issuing qty, roll picker showing shade groups; mixing shades
   across one order triggers an at-risk warning card ("Order ST-2610 already
   drew Shade A — you're picking Shade C"). Confirm = big target.
4. Stock overview (desk view for managers) — SmartTable by item: on-hand by
   location, reserved (against requisitions), free, reorder flag; roll-level
   drill-down drawer.
5. MARBIM: photo of a handwritten delivery challan → GRN draft.

Every list here must work with 8,000+ rows: virtualized, instant filter,
no pagination clicks for the keeper's common case (today's work on top).
```


### BLOCK B — 6.1 Line Tracking & Hourly Production

```
Design LINE TRACKING (floor density — the product's floor soul).

Screens:
1. Hourly entry — THE speed screen. One line selected (big line switcher
   tabs across top), rows = hours, columns = target / actual / cumulative.
   Current hour row is elevated (raised bg); actual entered on a large
   numpad; behind/ahead vs target colors the cumulative chip (status colors).
   Full-line entry must take <60 seconds. Offline queue pill in the sticky
   footer.
2. Floor board (wall display mode — design a TV variant): all lines as big
   tiles: line no, order, hour target vs actual as a bar pair, efficiency %,
   downtime badge if active. Auto-cycles nothing — glanceable, static, big
   type (this replaces the whiteboard).
3. Downtime log — one-tap from the entry screen: reason as big icon buttons
   (Machine / Feeding / Absent / Power / Other), machine picker appears only
   for Machine, duration auto-runs until "resolved" tap. Machine downtime
   shows "Maintenance ticket #M-412 created" confirmation.
4. Order run-rate card (desk view, merchandisers/planners consume): per
   order: cut vs sewn vs finished progress bars + "completes ~date" forecast
   with an assumption line; forecast beyond TNA milestone turns at-risk.

Sample data: line efficiencies 38–78%, one line with a power downtime,
one order behind run-rate — show the system telling the truth.
```

---

## SESSION S4 — Quote–cost–memory trio

**Modules:** 1.2 RFQ & Quotation Desk, 1.5 Costing Studio, 1.6 Order Memory
**Why this order:** Locks: extraction review flow refined, cost sheet cards, similar-order panels. These three interlock — design together.


### BLOCK B — 1.2 RFQ & Quotation Desk

```
Design the RFQ & QUOTATION DESK (desk density). Keep the existing inbox
mental model; this is the refined version.

Screens:
1. RFQ inbox — SmartTable grouped by status with counts in the group headers.
   Columns: RFQ id (mono), buyer, style summary, qty, target vs our-quote
   (two-currency cell: $ target / $ quoted), deadline with countdown chip
   (at-risk at 3 days), status. KPI row: open, quoted-awaiting, win rate 90d,
   avg response time.
2. RFQ detail — full page (too complex for a drawer). Left 60%: the RFQ facts
   + attachments viewer + clarifications thread (each Q shows asked/answered
   ages). Right 40%: quote panel — versions as stacked cards (Q1, Q2…) each
   showing FOB build-up rows (fabric/trims/CM/commercial/margin) and a diff
   badge vs previous version ("−$0.30 fabric"). "Draft quote with MARBIM"
   amber button when a cost sheet exists.
3. Extraction review — the drop-zone flow: source document rendered left,
   extracted fields right with confidence bars; clicking a field highlights
   its source region. Approve & create / Edit / Reject.
4. Win/Loss dialog — on Lost, reason code is required (radio list + note);
   on Won, shows the exact hand-off that will create the order.

MARBIM in-context: "Why did we lose the last 3 from this buyer?" example
response designed as an inline answer card with links to the RFQs.
```


### BLOCK B — 1.5 Costing Studio

```
Design the COSTING STUDIO (desk density; merchandisers + commercial manager).

Screens:
1. BOM editor — the tech-pack extraction lands here: line items grouped
   (fabric / trims / packing), each with spec, consumption, wastage %,
   source chip linking to the tech-pack page it came from. Editable grid;
   totals per group. "Seed from similar order" amber action when 1.6 finds
   a ≥80% match (shows the match card first).
2. Cost sheet builder — sections as stacked cards: Fabric (consumption ×
   price, dual currency), Trims, CM (method toggle: SMV-based vs per-dozen —
   both visible, active one highlighted, the arithmetic always expanded),
   Embellishment, Commercial, Margin. Sticky summary rail: FOB $ + CM ৳/pc
   + margin %, updating live.
3. Margin scenario strip — three sliders (price, efficiency, fabric price)
   with the resulting margin curve; screenshot-able card.
4. Estimated vs actual (post-shipment) — waterfall: quoted → actual with
   per-section variance bars; "update template from this order" action
   (files a pending change to the consumption template).
5. Template library — per product type: consumption params, last-updated-
   from order link, usage count.

Approval banner pattern: sheet locked once approved; new edits = new
version with diff vs approved.
```


### BLOCK B — 1.6 Order Memory

```
Design ORDER MEMORY surfaces (desk density — mostly embedded panels, not
a standalone app).

1. Similar-orders panel (lives inside RFQ detail and BOM editor) — top 3
   matches as cards: style photo, buyer, year, match % (mono), and the
   outcome line that matters: "actual 262 g/pc vs 255 quoted · 61% avg
   eff · margin 11.2% vs 12". One action per card: "Use as baseline"
   (seeds cost sheet + consumption).
2. Order outcome record — the compiled memory per closed order: header
   facts, efficiency curve sparkline vs learning-curve plan, top-3
   defects, delay timeline (what slipped and why), margin waterfall
   thumbnail, and the merchandiser note ("buyer strict on shade — book
   fabric one lot"). Read-optimized: 30-second scan.
3. Close-out prompt — when an order closes, a single dialog asks the
   merchandiser for the 2-line note; everything else auto-compiles.
   Make skipping possible but visibly discouraged (the note field is
   what makes memory human, not just numeric).
4. MARBIM answer card — "have we made ribbed polos for Bestseller?" →
   inline card listing matches with outcome one-liners, linking to
   outcome records.

Empty state (panel, no history yet): "Memory builds as orders close —
your first close-out is the seed."
```

---

## SESSION S5 — Planning and cutting

**Modules:** 4.1 Capacity & Line Planning, 5.1 Cutting Floor
**Why this order:** Locks: the allocation board (drag + ripple), scenario mode, stepper reuse, bundle ticket print pattern.


### BLOCK B — 4.1 Capacity & Line Planning

```
Design CAPACITY & LINE PLANNING (desk density; the planner's wall chart,
digital).

Screens:
1. The planning board — horizontal timeline (weeks) × vertical lines
   (grouped by floor). Orders are draggable blocks sized by duration;
   block shows PO, style, qty, and a thin efficiency-ramp gradient at its
   start (learning curve made visible). Overloaded line-days get a late-red
   hatched overlay. Today line vertical marker. Drag = live ripple preview
   ("PO-902 ex-factory +3d") before drop confirms.
2. Capacity answer card — the owner's question as a first-class UI: input
   (product type, qty, target month) → answer card: "Yes — lines 3, 7 free
   from 12 Aug, at risk if PO-889 slips" with the assumptions listed and
   editable. This card must be screenshot-able for WhatsApp.
3. What-if mode — board forks into scenario (surface shifts to raised bg +
   "SCENARIO" mono watermark chip); compare drawer shows scenario vs live
   deltas per order; Apply = amber (files pending_changes for approval).
4. Plan vs actual — per line: planned curve vs actual bars per day, variance
   chips; click a bad day → downtime reasons from Production.

Charts: viz palette (amber series 1, indigo series 2), never status colors
for series.
```


### BLOCK B — 5.1 Cutting Floor

```
Design the CUTTING screens (floor density, tablet, gloves-friendly targets).

Screens:
1. Cutting queue — orders ready to cut as cards: PO, style, qty, precondition
   chips (PP ✓/✗, Fabric issued ✓/✗ — unmet = late-red, and the card is
   visibly not startable). Selvage = TNA health of the cutting milestone.
2. Lay entry — stepper (WorkflowStepper): marker pick → rolls drawn (pulled
   from Store issue, shade shown) → plies + lay length → confirm. Numbers
   entered on a large in-screen numpad.
3. Cut report — the size×color grid again (same component as Order breakdown)
   but entry-mode: cut qty per cell, live column/row totals, cell turns
   at-risk when over/under tolerance vs ordered. Save prints bundle tickets
   (show the print-preview pattern: QR + bundle no + size + qty, ink-on-white
   for paper).
4. Wastage strip — per active order: drawn vs consumed vs waste % as a
   compact horizontal bar with the marker-plan % as a tick mark; over-plan
   turns at-risk.

Offline queue banner identical to Store's — one pattern everywhere.
```

---

## SESSION S6 — Quality and outbound

**Modules:** 7.1 Inline, Endline & Final Inspection, 8.1 Finishing, Cartons & Shipment
**Why this order:** Locks: tap-grid defect entry, AQL protocol screens, carton fill-up grid, docs checklist.


### BLOCK B — 7.1 Inline, Endline & Final Inspection

```
Design QUALITY screens. Inline capture = floor density; reports = desk.

Screens:
1. Inline check (tablet, roving QC) — line picker → operation strip →
   defect entry: defect codes as a tap-grid grouped by category, count
   steppers, operator tag optional. Three taps max per defect. Running
   DHU for the line updates live in the header.
2. Final inspection — protocol-driven stepper: lot facts → AQL card
   (level, computed sample size, accept/reject numbers shown as the rule,
   not hidden) → defect capture with photo attach → verdict screen
   (PASS on-track green / FAIL late-red, full-bleed clarity — this result
   gets shown to buyers). Generate report → PDF preview.
3. Measurement check — spec table: point, spec, tolerance ±, measured
   (numpad), auto flag out-of-tolerance cells at-risk/late by severity.
   MARBIM path: photo of a handwritten measurement sheet → draft-filled
   table for confirmation.
4. Quality dashboard (desk) — DHU trend by line (viz palette), top defects
   pareto, repeat-offender alerts, buyer report pack generator per PO
   ("everything QA asks for when they walk in — one click, print-ready").
```


### BLOCK B — 8.1 Finishing, Cartons & Shipment

```
Design FINISHING → PACKING → SHIPMENT.

Screens:
1. Packing progress (floor) — per order: finished vs packed by size-color
   as a fill-up grid; carton builder: scan/enter contents, live remaining
   counts, over-pack cell turns late-red immediately.
2. Packing list review (desk) — generated list vs order breakdown
   side-by-side with any mismatch rows flagged; approve locks version.
3. Shipment desk — per shipment: timeline (booked → ex-factory → port →
   on-board) with actual dates, LC countdown chip always visible, docs
   checklist with per-doc status chips; EXP number field gates the
   "Send to bank" handoff (disabled + explanation until filled).
4. MARBIM: forwarder's draft B/L PDF → discrepancy check card vs LC terms
   ("Port of loading says Chattogram; LC clause 44E says Chittagong —
   likely fine, flag for bank?") — honest uncertainty, human decides.
```

---

## SESSION S7 — Commercial precision + procurement

**Modules:** 2.1 LC Register & Bank Docs, 2.2 Bonded Warehouse & UD, 3.2 Procurement & Suppliers
**Why this order:** Locks: LC register, amendment diffs, UD blocked-issue pattern, BTB gate in PO flow, supplier scorecards.


### BLOCK B — 2.1 LC Register & Bank Docs

```
Design the LC REGISTER for commercial officers (desk density, precision UX).

Screens:
1. LC register — SmartTable: LC number (mono), buyer, value + tolerance,
   utilized bar, expiry countdown, latest-shipment countdown, open BTB count,
   status. KPI row: open LC value, expiring ≤21d, discrepant docs, unrealized
   value aging >30d. Countdown chips use status colors strictly (at-risk ≤21d,
   late = expired/conflict).
2. LC detail — full page: terms panel (amendment history as versioned diffs —
   "Amendment 2: latest shipment +10 days"), BTB panel with headroom bar,
   linked orders/shipments, docs-required checklist (from LC clauses).
3. Document submission tracker — kanban: Preparing → Submitted → Bank review
   → Accepted / Discrepant → Realized. Discrepant cards: red selvage +
   discrepancy note visible on card + days-stuck counter.
4. MARBIM: upload bank advice PDF → draft realization entry (amount, charges,
   value date, confidence per field). Upload LC SWIFT copy → draft docs
   checklist extracted from clauses 46A/47A, each item linked to its clause
   text.

This department distrusts software that hides details — every derived number
(headroom, aging) must expand to show its calculation on click.
```


### BLOCK B — 2.2 Bonded Warehouse & UD

```
Design the BONDED WAREHOUSE / UD screens (desk density; the commercial
officer's compliance workbench).

Screens:
1. UD register — SmartTable: UD number (mono), issue date, validity countdown,
   authorized vs consumed vs balance (three-figure cell with a thin utilization
   bar), linked import LCs, status. Late-red when overdrawn or expiring with
   balance.
2. UD detail — authorized items table with per-item consumption drill-down
   (each consumption row links to the store issue and the order it fed),
   reconciliation snapshot generator ("Generate customs report" → PDF preview
   in-drawer before export).
3. Blocked-issue pattern (design it here, used by Inventory): when a store
   issue would exceed UD balance, the issue screen shows a late-red block
   card explaining exactly which UD, the shortfall qty, and an "Request owner
   override" amber action that files a pending_change.

Tone: this is legal paperwork. No decoration; maximum traceability. Every
number clicks through to its source rows.
```


### BLOCK B — 3.2 Procurement & Suppliers

```
Design PROCUREMENT & SUPPLIERS (desk density — the commercial/merchandising
person who buys fabric and trims).

Screens:
1. Requisition board — PRs generated from order material plans as cards:
   order PO, items summary, required-by date (derived from the cutting
   milestone — show it as "needed 12 Aug for cutting 18 Aug"), status
   (Draft → Quoting → PO issued → Receiving → Closed). At-risk when
   required-by is inside supplier leadtime and no PO issued yet.
2. Quote comparison — per PR: suppliers as columns, items as rows, cells =
   unit price + leadtime; best-per-row highlighted (indigo, not amber —
   this is information, not an action); footer totals per supplier.
   "Issue PO to [supplier]" = the amber action.
3. PO issue flow — stepper: lines review → terms (payment, delivery,
   currency) → for IMPORT suppliers: BTB LC picker showing master-LC
   headroom bar; issue is BLOCKED (disabled + explanation card) until an
   LC with sufficient headroom is linked — reuse the blocked-gate pattern
   from UD (2.2). Final step renders the PO PDF preview (ink-on-white,
   company letterhead) before "Issue & email".
4. PO tracker — SmartTable: PO no (mono), supplier, order ref, value,
   status chips (Issued → Confirmed → In production → Shipped → Received
   partial/full), received-vs-ordered progress bar per line on expand,
   overdue = late selvage.
5. Supplier scorecard — per supplier: on-time %, quality reject %, price
   index, responsiveness — each with a 6-month sparkline and a "computed
   from N GRNs / M inspections" source line (the anti-vibes statement:
   every score clicks through to the deliveries that produced it).
6. MARBIM: supplier proforma-invoice PDF → "PI vs our PO" discrepancy
   card (price/qty/leadtime deltas flagged); "which supplier should get
   this PR?" → comparison answer citing the scorecard data.

Empty state (board): "No requisitions yet — they appear automatically
when an order's material plan is approved."

Sample data: one local trims supplier (BDT, no LC) and one Chinese fabric
mill (USD, BTB LC gate visible) so both document paths are designed.
```

---

## SESSION S8 — Money and the owner

**Modules:** 11.1 Commercial Finance, 11.2 Owner Dashboard & Analytics
**Why this order:** Locks: cash timeline, profitability waterfall, exceptions feed, and the PHONE-FIRST owner variant (design phone frames for 11.2 — see 05-owner-app/owner-app-spec.md; attach it).


### BLOCK B — 11.1 Commercial Finance

```
Design COMMERCIAL FINANCE (desk; owner + accounts roles).

Screens:
1. Cash timeline — horizontal: expected LC realizations (in, indigo) vs
   payables due (out, muted) across next 8 weeks; net position line.
   Every bar clicks to its documents.
2. Order profitability — SmartTable: PO, buyer, quoted margin % vs actual
   margin % (delta chip — negative = late-red), drill into the variance
   waterfall (fabric over-consumption? CM overrun? bank charges?).
3. Receivables aging — by buyer, aging buckets, realization-lag pattern
   per buyer ("Primark realizes at 12d avg; C&A at 31d").
```


### BLOCK B — 11.2 Owner Dashboard & Analytics

```
Design the OWNER DASHBOARD — two variants: desk and phone (the owner
checks at 11pm from home; design phone-first for variant B).

Content:
1. Exceptions feed FIRST — "the 5 things needing you today": each an
   actionable card (LC conflict, at-risk order, critical CAP, payroll run
   awaiting your approval — the approvals carry amber, everything else
   status colors). This ordering is the product opinion: exceptions before
   vanity numbers.
2. Then the numbers: order book value + coverage (3 months), OTD %, avg
   line efficiency trend, DHU trend, cash position — each a KPI card with
   sparkline, each tappable to its source module.
3. Buyer scorecards — volume, margin, claims, payment lag: "who is
   actually a good buyer" made visible.
4. MARBIM ask bar at top: "efficiency by line, June vs May, as a table I
   can WhatsApp" → generated shareable card. Every number answers "why?"
   on tap with its contributors.
```

---

## SESSION S9 — People, compliance, machines

**Modules:** 10.1 Workforce & Wage Engine, 10.2 Compliance & Audit, 9.1 Machines & Tickets
**Why this order:** Locks: payroll transparency pattern, bn-first payslip artifact, CAP tracker, mechanic queue.


### BLOCK B — 10.1 Workforce & Wage Engine

```
Design WORKFORCE & PAYROLL (desk density; HR + owner roles only — state
the lockout screen other roles see: a quiet "You don't have access to
payroll" card, no data shape leaked).

Screens:
1. Worker directory — SmartTable: ID (mono), photo, name (bn+en), grade,
   line, join date, status. Fast join/exit flows (garments turnover is
   5–8%/month — these are daily operations, 2 minutes max each; design
   the join form as a stepper with ID-card photo capture).
2. Attendance exceptions — the daily queue: device-import summary strip
   ("1,204 punched, 37 exceptions") then exception cards (missed punch,
   late, device mismatch) with one-tap resolutions.
3. Payroll run — the centerpiece: period → compute → review table (worker,
   gross breakdown expandable, OT hrs, deductions, net ৳) with anomaly
   chips MARBIM surfaces ("OT 96h — 2.4× their average"); Approve run =
   amber, files owner approval; then disbursement export + payslip batch.
   Show the calculation-transparency pattern: any net figure expands to
   its full gazette-grade arithmetic.
4. Payslip (artifact design) — Bengali-first, English secondary, ink-on-
   white print layout with the grade breakdown table. This paper is the
   worker's trust in the system — make it dignified and unambiguous.
```


### BLOCK B — 10.2 Compliance & Audit

```
Design COMPLIANCE (desk density).

Screens:
1. Compliance dashboard — open CAPs by severity (critical = late-red,
   counts click through), certificate expiry ladder (90/60/30 columns),
   next audits strip.
2. Audit detail — findings table (severity selvage) → each finding's CAP:
   owner, deadline, evidence uploads, status. Multi-year items show a
   milestone mini-timeline.
3. Certificate registry — SmartTable with expiry countdowns; renewal flow
   attaches the new doc and shifts the ladder.
4. MARBIM: audit report PDF → draft findings list with severity guesses
   (confidence bars), each linked to its page in the source.
```


### BLOCK B — 9.1 Machines & Tickets

```
Design MAINTENANCE (floor density).

Screens:
1. Mechanic queue — tickets as cards sorted by priority: machine, line,
   reported time, waiting-duration counter (at-risk >30min — a stopped
   machine is a stopped line). Claim → resolve flow with parts-used picker
   and a big "Machine running" confirm.
2. PM due-list — this week's preventive checklist by machine type; check-off
   with timestamp; overdue = late selvage.
3. Machine registry (desk) — SmartTable + detail drawer: identity, line
   history, breakdown frequency sparkline, downtime cost YTD (৳).
4. MARBIM: nameplate photo → machine record draft.
```

---

## SESSION S10 — Front door and admin

**Modules:** 1.1 Buyer & Lead Desk, 1.4 Sampling Room, X.3 Settings & Admin
**Why this order:** Locks: pipeline board, sample stage board, the settings matrix. Lowest-risk session — good for a junior reviewer to lead.


### BLOCK B — 1.1 Buyer & Lead Desk

```
Design the BUYER & LEAD DESK for merchandisers (desk density).

Screens:
1. Pipeline board — leads as Kanban across New → Contacted → Sampling talk →
   Negotiation → Won/Lost. Card: company, country flag, agent chip if via
   buying house, days-quiet counter (turns at-risk orange at 14). Selvage edge
   carries stage health. Drag between stages.
2. Buyer directory — SmartTable: buyer, country, active orders count, YTD value
   (USD), last shipment, payment behavior chip. Row click → drawer.
3. Buyer detail drawer (20px radius, glass) with tabs: Overview (terms summary
   as labeled facts, not a form), Contacts, Requirements (checklist extracted
   from their manual — each item shows source-page link), Documents, History
   (orders + claims timeline).
4. "Convert to buyer" flow from a won lead — 2-step dialog showing exactly
   what carries over.

MARBIM: drop zone on pipeline ("paste inquiry email / drop business card
photo") → amber draft card with per-field confidence. Buyer manual upload →
"MARBIM read 34 requirements" draft checklist for approval.

Empty state (no leads): "Paste your first buyer inquiry — MARBIM will file it."
```


### BLOCK B — 1.4 Sampling Room

```
Design the SAMPLING ROOM screens. Two densities: sample-room staff use
floor density; merchandisers see desk views.

Screens:
1. Sample board (floor) — columns = stages (Pattern → Cutting → Sewing →
   Finishing → QC → Dispatched). Card: sample type chip (PP cards get amber
   left-selvage ONLY if they're blocking a cutting start — "person must act"),
   style, buyer, due countdown. Tap to advance stage — big confirm target.
2. Sample detail drawer — request facts, stage history with timestamps,
   feedback rounds as a thread (verdict chips per round), photo strip.
3. Feedback capture — upload buyer comment sheet photo → MARBIM draft:
   structured comments list with measurements table if present; approve files
   the round.
4. Sample library — photo-grid search with filters (buyer, type, year,
   product). Designed for "show the buyer what we made before" moments —
   full-screen photo view two taps away.

Empty state (board): "No samples in work. New requests from merchandising
appear here automatically."
```


### BLOCK B — X.3 Settings & Admin

```
Design SETTINGS & ADMIN (desk density; admin/owner roles).

Screens:
1. Company profile — name, addresses, licenses, logo upload (feeds PDF
   letterheads; show the letterhead preview).
2. Factory structure — units → floors → lines tree editor with machine
   count and manpower per line (shared with Planning).
3. Users & roles — invite flow, and the role × module × permission matrix
   as a readable grid (view/create/approve columns), payroll row visibly
   locked to hr/owner.
4. Approval rules — module × action → required role table (this drives
   the Approve Inbox routing).
5. Module toggles — per-company on/off switches with dependency warnings
   ("Cutting requires Store").
6. Master data managers — tabbed: defect codes, TNA templates, consumption
   templates, loss reasons, wage grade table with gazette VERSION history
   (effective-from dates, diff between versions).
7. Localization — language bn/en, Bengali digits toggle, date format,
   fiscal year; Data export (full company export request + audit log viewer).

This is the one surface where amber is common — everything here is a
deliberate action. Quiet, dense, maximum clarity.
```

---

## AFTER EVERY SESSION — handoff generation (Claude Code)

Run once per module, immediately after export:

```
Read docs/01-design/design-handoff-template.md (template + filled example),
docs/02-backend/briefs/<module-file>.md, and the attached locked design export
for <module id>.
Create docs/handoffs/HANDOFF-<module-slug>.md filling every section of the
template. Rules: the design defines fields/screens/states (§1–§6); the brief's
Global conventions define invariants. Do NOT resolve disagreements between them
— list every one in §8 with your suggested resolution for me to decide.
Flag any screen element whose data source is unclear as a §8 item too.
Stop after writing the file and summarize §8 for me.
```

Then: you empty §8 (the human hour that matters), get the FE+BE review pass,
and the module is buildable — backend via 02-backend/PLAYBOOK.md §2, frontend
via 03-frontend/frontend-dev-plan.md §5.

## Session → build alignment

| Design session | Feeds backend phase |
|---|---|
| S0, S1 | Phase 3 (while code does Phase 0–1) |
| S2 | Phase 2 |
| S3 | Phase 4 |
| S4, S5 | Phase 5 |
| S6, S7 | Phase 6–7 |
| S8 | Phase 7 + owner app |
| S9 | Phase 8 |
| S10 | Phase 9 window |
