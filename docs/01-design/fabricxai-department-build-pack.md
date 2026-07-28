# FabricXAI — Department Build Pack
### Backend briefs + Claude Design frontend prompts, organized by factory department

**How this works.** A garments factory isn't organized by "modules" — it's organized by departments, each with its own room, its own boss, and its own paper. This pack maps FabricXAI onto that reality. For every module you get:

- **BACKEND BRIEF** — entities, key operations, events/jobs, roles, and Bangladesh-specific rules. This is the contract the backend must fulfill; you'll finalize it *after* the frontend is designed, adjusting fields to what the screens proved they need.
- **FRONTEND PROMPT** — paste-ready for Claude Design. Each prompt assumes the Shared Design Preamble (below) is pasted first.

**Build sequence per module:** Frontend prompt → Claude Design output → review with the department's real user → lock screens → finalize backend brief against the locked screens → build.

---

## NAME INDEX (original Module Prompt Pack → this document)

| Original module name | Here (build pack & backend briefs) |
|---|---|
| Lead Management + Buyer Management | 1.1 Buyer & Lead Desk |
| RFQ & Quotation | 1.2 RFQ & Quotation Desk |
| Costing | 1.5 Costing Studio |
| Order Management / Merchandising (TNA) | 1.3 Order Desk & TNA |
| Sampling | 1.4 Sampling Room |
| Inventory & Stores | 3.1 Fabric & Trims Store + 2.2 Bonded Warehouse & UD (split) |
| Procurement & Supplier Management | 3.2 Procurement & Suppliers |
| Production Planning | 4.1 Capacity & Line Planning |
| Production Tracking | 6.1 Line Tracking & Hourly Production |
| Quality Control | 7.1 Inline, Endline & Final Inspection |
| Machine Maintenance | 9.1 Machines & Tickets |
| Workforce & Payroll | 10.1 Workforce & Wage Engine |
| Compliance | 10.2 Compliance & Audit |
| Shipment & Export | 8.1 Finishing, Cartons & Shipment |
| Finance (Commercial) | 11.1 Commercial Finance |
| Analytics & Reporting | 11.2 Owner Dashboard & Analytics |
| (new) Order Memory | 1.6 Order Memory |
| Sustainability | not carried into v1 build pack (later wave) |
| MARBIM Copilot | X.2 MARBIM Surface |
| Approve Inbox | X.1 Approve Inbox |
| Settings & Admin | X.3 Settings & Admin |

---

## SHARED DESIGN PREAMBLE (paste before every frontend prompt)

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

---
---

# DEPT 1 — MERCHANDISING
*The factory's cockpit. Merchandisers own buyers end-to-end: inquiry → quote → order → follow-up to shipment. Power users, 10 hrs/day, keyboard-heavy, desk density.*

---

## 1.1 Buyer & Lead Desk

**BACKEND BRIEF**
- Entities: `leads` (source, agent + commission %, stage, contact_log[]), `buyers` (profile, brands, country), `buyer_contacts` (role-typed), `buyer_terms` (payment LC/TT, incoterms, tolerance %, AQL level, nominated banks/forwarders/labs), `buyer_documents` (S3 refs), `buyer_requirements` (compliance checklist extracted from manuals).
- Operations: convert lead→buyer (carries contacts + log, closes lead), duplicate detection on create (fuzzy name+domain), log communication, terms versioning (terms changes go through pending_changes — they affect money).
- Events/jobs: follow-up reminder job (leads quiet >N days), buyer-manual extraction job (PDF → requirements checklist draft).
- Roles: merchandiser CRUD own accounts; manager all; viewer read.
- BD rules: agent/buying-house commission modeled on lead AND carried to orders; nominated third parties (bank, forwarder, lab) are buyer-level defaults every downstream module reads.
- Feeds: RFQ (terms defaults), Orders (terms, nominated parties), Shipment (forwarder), QC (AQL level).

**FRONTEND PROMPT**
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

---

## 1.2 RFQ & Quotation Desk

**BACKEND BRIEF** *(exists as Wave 1 — this brief is the target state)*
- Entities: `rfqs` (buyer, style, product_type, qty + size-ratio json, target_price, currency, deadline, status: open→clarifying→quoted→won/lost/cancelled, source), `rfq_attachments`, `rfq_clarifications` (question, asked_at, answered_at), `quotes` (versioned, fob build-up json from cost sheet, validity), `loss_reasons` (coded).
- Operations: extract-from-text/PDF/photo → pending_changes draft (built); draft quote from approved cost sheet; win → create order hand-off (payload: buyer, style, qty breakdown, price, target dates); loss capture with reason code mandatory.
- Events/jobs: deadline reminder (quote due in 48h), stale-clarification nudge.
- BD rules: quote stores USD FOB + computed CM-per-piece BDT equivalent (owners think in CM); buyer target currency preserved separately.
- Feeds: Costing (quote pulls cost sheet), Orders (win hand-off), Analytics (win/loss by buyer/reason).

**FRONTEND PROMPT**
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

---

## 1.3 Order Desk & TNA (the flagship)

**BACKEND BRIEF**
- Entities: `orders` (buyer, po_numbers[], value, currency, status), `order_styles` (style, unit_price), `order_breakdowns` (style × color × size → qty; versioned for buyer revisions), `lcs` (master LC: number, value, tolerance, expiry, latest_shipment_date, docs_required json) + `btb_lcs` (linked to master, limit tracking), `tna_templates` (per product type), `tna_milestones` (order, name, planned, actual, owner, depends_on[], critical flag), `order_revisions` (diff json, buyer-confirmed date), `order_files`.
- Operations: create from RFQ win or PO extraction; breakdown grid bulk edit with validation (sums must reconcile to order qty ± tolerance); TNA generate from template with backward scheduling from ex-factory; milestone actualize → auto-recalc critical path → flag at-risk milestones; revision apply with diff; LC linkage + conflict detection (planned ex-factory > LC latest shipment ⇒ red alert event).
- Events/jobs: nightly TNA risk scan (emits at-risk/late transitions → notifications + owner digest), LC expiry countdown alerts (21/14/7 days), PP-approval gate (blocks cutting milestone until Sampling says approved).
- BD rules: LC discipline is the spine — every order surfaces LC headroom, expiry vs plan conflicts everywhere; partial shipments per LC terms; agent commission carried from buyer.
- Feeds: everything — Planning (qty + dates), Inventory (material requirements), Production (targets), Shipment (LC docs), Finance (LC register).

**FRONTEND PROMPT**
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

## 1.4 Sampling Room

**BACKEND BRIEF**
- Entities: `sample_requests` (type: proto/fit/SMS/PP/TOP/shipment, rfq_or_order ref, due, courier awb, status), `sample_stages` (pattern→cut→sew→finish→QC→dispatched), `sample_feedback` (round, verdict: approved/comments/rejected, comment_doc ref), `sample_costs`, `sample_library` (photos, searchable attrs).
- Operations: request → stage advance (floor density quick-tap) → dispatch (AWB) → feedback capture; PP approval writes the gate flag the Order TNA reads.
- Events/jobs: due-date reminders; "PP blocking cutting" escalation.
- Feeds: Orders (PP gate), Costing (sample cost center), Buyers (approval history).

**FRONTEND PROMPT**
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

---

## 1.5 Costing Studio

**BACKEND BRIEF** *(full version in fabricxai-backend-briefs.md §1.5)*
- Entities: `boms` (style, lines from tech-pack extraction: item spec, consumption, wastage %, source ref), `cost_sheets` ⚖ (versioned, rfq/style ref, sections: fabric, trims, CM, embellishment, commercial, margin; status draft→approved), `consumption_templates` (product-type library, updated from actuals), CM supports both methods (SMV × efficiency × labor rate, and per-dozen rate).
- Operations: build sheet from BOM + template; margin scenario compute (pure fn); approval via pending_changes (manager; margin below company floor → owner); estimated-vs-actual comparison (reads 11.1 accruals); template refresh from closed-order actuals (via 1.6).
- Feeds: 1.2 quotes, 1.3 requisition lines (the BOM is the requisition's source), 3.2 supplier specs, 11.1 variance baseline.

**FRONTEND PROMPT**
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

---

## 1.6 Order Memory

**BACKEND BRIEF** *(full version in fabricxai-backend-briefs.md §1.6)*
- Entities: `style_fingerprints` (pgvector embedding of style attributes + tech-pack text), `order_outcomes` (compiled at order close: actual consumption/pc, efficiency curve achieved, top defects, delay events + reasons, actual vs quoted margin, merchandiser's learned note), similarity queries via cosine.
- Operations: embed on style create; `findSimilar(styleId | rfqId)` ranked matches with outcome summaries; `seedCostSheet(fromOrderId)`; outcome compiler job on order close (auto-assembles from production/QC/finance + prompts merchandiser for a 2-line note).
- Feeds: 1.2 (similar-orders panel on every RFQ), 1.5 (seeding + template refresh), MARBIM ("have we made this before?" answers with real outcomes).

**FRONTEND PROMPT**
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
---

# DEPT 2 — COMMERCIAL
*The LC and customs department. Precision people; a wrong document costs bank fees and payment delays. Desk density, bilingual documents.*

---

## 2.1 LC Register & Bank Docs

**BACKEND BRIEF**
- Entities: `lcs` + `btb_lcs` (shared with Orders — Commercial owns them), `lc_amendments` (versioned terms), `doc_submissions` (shipment ref, docs json, submitted_at, bank_status: submitted→accepted/discrepant→realized, discrepancy_notes, realized_amount, realized_at), `bank_charges`.
- Operations: LC create/amend (amendments versioned with diff); BTB open against master (headroom validation ≤ allowed %); submission lifecycle with aging; realization posts to Finance receivables.
- Events/jobs: expiry + latest-shipment countdown alerts; discrepancy aging escalation; realization-lag report job.
- BD rules: BTB limit as % of master LC enforced at open time; EXP number required per shipment before submission; UD linkage visible (Commercial reconciles customs).
- Feeds: Orders (LC facts), Shipment (docs checklist), Finance (realizations, charges).

**FRONTEND PROMPT**
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

---

## 2.2 Bonded Warehouse & UD

**BACKEND BRIEF**
- Entities: `uds` (number, issue date, authorized_items json: fabric/trim × qty, validity), `ud_consumption` (issue-to-production refs → auto-drawn from Inventory issues), `ud_reconciliations` (period snapshot matching customs format), `bond_licenses` (registry + audit trail).
- Operations: UD create from import docs; consumption auto-accrues from store issues tagged bonded; reconciliation report generation (customs format PDF); balance alerts.
- BD rules: this module exists because of Bangladesh customs — quantity discipline is legal exposure. Every bonded GRN and issue must reference a UD; blocked issue if UD balance insufficient (override = pending_changes with owner approval).
- Feeds: Inventory (bonded stock), Commercial docs, Compliance (bond license).

**FRONTEND PROMPT**
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

---
---

# DEPT 3 — STORE (INVENTORY)
*Store keepers at a desk by the warehouse door, barcode scanner, dusty keyboard, connection drops. Floor density. Fastest data entry in the product.*

---

## 3.1 Fabric & Trims Store

**BACKEND BRIEF**
- Entities: `items` (fabric: construction/composition/gsm/width; trims: spec), `grns` (supplier_po ref, challan, qty, inspection_status, bonded flag + ud ref), `rolls` (grn ref, roll_no, lot/dye_lot, shade_group, qty, location), `locations` (bonded/general/floor), `issues` (requisition ref, order ref, item, qty, rolls[]), `returns`, `adjustments` (reason-coded, via pending_changes), `requisitions` (auto-computed from order material requirements).
- Operations: GRN entry (fast, barcode-friendly, offline-queued); roll intake with shade grouping; issue against requisition with roll picking (shade-consistency warning across an order); stock by item/location/roll; reorder alerts from order pipeline vs stock; dead stock report.
- Events/jobs: pending-inspection reminder (GRN → QC fabric inspection); low-stock scan against upcoming cutting dates; offline sync queue.
- BD rules: bonded vs general segregation absolute; bonded issues draw UD (see 2.2 block pattern); consumption per order accrues to actual costing.
- Feeds: Procurement (GRN closes PO lines), QC (fabric inspection), Orders/Costing (actual consumption), UD.

**FRONTEND PROMPT**
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

---

## 3.2 Procurement & Suppliers

**BACKEND BRIEF** *(full version in fabricxai-backend-briefs.md §3.2)*
- Entities: `suppliers` (type: fabric_mill/trims/embellishment/subcontract, origin local/import, payment terms, contacts), `purchase_requisitions` (from order material plans), `supplier_quotes` (per PR, unit price + leadtime), `supplier_pos` ⚖ (numbered, versioned, PDF-rendered, import POs require btb_lc link before issue), `supplier_scores` (derived monthly from GRN/QC data: on-time %, quality reject %, price index — never manually entered).
- Operations: PR auto-generate from order requisitions; quote comparison; PO issue (letterhead PDF + email); PO↔GRN line matching; import path enforces BTB LC gate.
- Jobs: monthly score compute; PO overdue alerts vs cutting dates.
- Feeds: Store (GRN closes PO lines), Commercial (BTB LCs), Costing (actual material prices).

**FRONTEND PROMPT**
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
---

# DEPT 4 — PLANNING & IE
*Industrial engineers and the planning manager. They answer the owner's #1 question: "Can we take this order?" Desk density, chart-heavy.*

---

## 4.1 Capacity & Line Planning

**BACKEND BRIEF**
- Entities: `factory_units` → `floors` → `lines` (machines, manpower), `line_calendars` (working days, shifts, planned downtime), `allocations` (order × line × date-range, planned qty/day honoring learning curve), `learning_curves` (per product type: day → efficiency %), `smv_records` (style → SMV, source: IE study or estimate), `whatif_scenarios` (draft allocations, never live).
- Operations: allocation with overload detection (allocated minutes > available); backward scheduling from ex-factory; learning-curve ramp auto-applied on style changeover; capacity query API ("free capacity in pieces of X between dates"); scenario fork/compare/apply (apply via pending_changes — allocations move real commitments).
- Events/jobs: nightly plan-vs-actual variance (reads Production actuals) → replan suggestions; changeover-heavy week warning.
- Feeds: Orders (dates/qty), Production (targets per line/day), Workforce (operator availability), Analytics.

**FRONTEND PROMPT**
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

---
---

# DEPT 5 — CUTTING
*First floor department. Lay sheets and cut reports, all paper today. Floor density, shared tablet.*

## 5.1 Cutting Floor

**BACKEND BRIEF**
- Entities: `markers` (style, sizes ratio, efficiency %, fabric width), `lays` (order, marker, plies, fabric drawn: rolls[] from Store, lay length), `cut_reports` (lay → qty by size-color actually cut), `bundles` (cut qty split into numbered bundles → sewing feed), `cut_wastage` (computed: drawn fabric vs cut consumption).
- Operations: lay entry (floor-fast); cut report reconciling against order breakdown (over/under-cut % vs tolerance); bundle generation with printed tickets (QR); fabric-drawn auto-links Store issues; wastage % per order live.
- Events/jobs: cut-vs-breakdown completion tracker feeding TNA "cutting complete" milestone; wastage anomaly alert (>N% over marker plan).
- BD rules: cutting cannot start unless PP gate approved (from Sampling) AND fabric issued — surface both as preconditions.
- Feeds: TNA, Production (bundles = sewing input), Costing (actual fabric consumption).

**FRONTEND PROMPT**
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
---

# DEPT 6 — SEWING (PRODUCTION)
*The heart. Line chiefs and floor supervisors, hourly boards, shared tablets on pillars. Floor density, the highest data volume in the system.*

## 6.1 Line Tracking & Hourly Production

**BACKEND BRIEF**
- Entities: `daily_line_plans` (line × date × order: target/hr, manpower planned), `hourly_outputs` (line × hour: target, actual, entered_by), `endline_counts` (checked/passed/defective/rework — shared with QC), `wip_snapshots` (order: cut vs sewn vs finished — derived job, not manual), `downtimes` (line, span, reason code: machine/feeding/absent/power/other, machine ref optional), `efficiency_daily` (derived: earned minutes SMV×output / available minutes).
- Operations: hourly entry API optimized for burst writes + offline queue (idempotent by line-hour key); day close → efficiency compute → owner digest; downtime one-tap logging (machine reason auto-opens Maintenance ticket); run-rate forecast per order ("sewing completes ~14 Sep at current rate").
- Events/jobs: WIP snapshot job (hourly); efficiency digest (day close); at-risk order run-rate alert vs TNA sewing milestone. **This module is the load-testing target: size for 50 lines × 10 hrs × entry bursts + dashboard reads.**
- Feeds: TNA (sewing milestones), Planning (actuals), QC (endline), Maintenance (downtime→ticket), Workforce (absenteeism correlation), Analytics.

**FRONTEND PROMPT**
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
---

# DEPT 7 — QUALITY (QC/QA)
*Roving inline QCs with tablets, final inspection under buyer protocols. Floor density inline; desk density reports.*

## 7.1 Inline, Endline & Final Inspection

**BACKEND BRIEF**
- Entities: `defect_codes` (standard garment taxonomy, customizable), `inline_checks` (line, operation, operator ref, defects[]), `endline_checks` (shared with Production), `dhu_daily` (derived per line), `fabric_inspections` (4-point vs GRN/rolls), `measurement_checks` (style spec ref, points[], tolerance flags), `final_inspections` (order/lot, AQL level from buyer terms, sample size auto, defects, verdict, photos), `third_party_inspections` (SGS/Intertek/BV schedule + result docs).
- Operations: AQL calculator (lot size + level → sample size, accept/reject numbers — table-driven, versioned); inline capture ≤3 taps per defect; measurement entry against spec with auto out-of-tolerance flags; buyer-ready PDF report pack per PO (inline history, DHU trend, final AQL).
- Events/jobs: DHU compute (day close); repeat-defect pattern alert (same defect+operation 3 days running); pre-final-inspection readiness check (TNA).
- Feeds: TNA (final inspection milestone), Production (endline), Store/GRN (fabric inspection), Buyers (AQL level), Analytics.

**FRONTEND PROMPT**
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

---
---

# DEPT 8 — FINISHING & PACKING → SHIPMENT
*End of the physical line; feeds Commercial's documents. Floor density on the floor, desk for docs.*

## 8.1 Finishing, Cartons & Shipment

**BACKEND BRIEF**
- Entities: `finishing_outputs` (order, qty by size-color), `cartons` (order, carton_no, contents json size×color×qty, weights/dims), `packing_lists` (versioned, validated vs order breakdown), `shipments` (order, partial no, planned/actual ex-factory, forwarder booking, exp_number, bl_awb, port status), `shipment_docs` (per-LC checklist instantiation: invoice, packing list, CO/GSP, inspection cert, BL — each with status).
- Operations: carton build with live validation vs remaining-to-pack; packing list auto-generate + mismatch detection (mismatch = money); booking with nominated forwarder; docs checklist from LC clauses (see 2.1); ex-factory confirm → TNA final milestone; EXP number mandatory gate before docs submission.
- Events/jobs: LC latest-shipment countdown on unshipped balance; short/over-shipment tolerance check.
- Feeds: Commercial (docs → bank), TNA, Finance (invoice value), Analytics (OTD).

**FRONTEND PROMPT**
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
---

# DEPT 9 — MAINTENANCE (MECHANICAL)
*Mechanics with a ticket queue; the in-charge with schedules. Floor density.*

## 9.1 Machines & Tickets

**BACKEND BRIEF**
- Entities: `machines` (type, brand, serial, purchase, line assignment history), `pm_schedules` (type-based checklists, cadence), `pm_completions`, `tickets` (source: downtime auto or manual, machine, priority, mechanic, parts[], resolved span), `spare_parts` (mini stock), `downtime_costs` (derived: downtime × line SMV value).
- Operations: downtime → auto-ticket (from 6.1); PM due-list generation; ticket lifecycle; utilization + breakdown analytics.
- Feeds: Production (downtime), Analytics (cost of downtime).

**FRONTEND PROMPT**
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
---

# DEPT 10 — HR, PAYROLL & COMPLIANCE (ADMIN)
*The most sensitive department: wages and audits. Strict role gating. Desk density; Bengali-first payslips.*

## 10.1 Workforce & Wage Engine

**BACKEND BRIEF**
- Entities: `workers` (id_card, photo, designation, grade, section/line, join_date, disbursement account type+ref), `attendance` (device import + exceptions), `leaves` (earned/casual/sick per labor law), `wage_grades` (gazette-versioned: grade → basic/house/medical/transport/food), `payroll_runs` (period, computed lines, status: draft→approved→disbursed), `payroll_lines` (worker: gross components, OT hrs × 2×basic-hourly, attendance bonus, deductions, net), `festival_bonus_runs` (pro-rated by service), `skill_matrix` (worker × operation × grade), `exits_joins`.
- Operations: attendance import + exception queue; payroll compute (pure function, unit-tested against gazette rules — this is the most audited code in the product); payslip PDF (Bengali+English); bank/MFS disbursement sheet export; run approval via pending_changes (owner approves — wage runs are money).
- Events/jobs: monthly run scheduler; turnover report; operator-shortage query for Planning.
- Roles: HR role + owner ONLY. Payroll invisible to every other role at the API level, not just UI.
- Feeds: Production (absenteeism), Planning (skill availability), Compliance (labor records).

**FRONTEND PROMPT**
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

## 10.2 Compliance & Audit

**BACKEND BRIEF**
- Entities: `audits` (regime: Accord-RSC/BSCI/Sedex/buyer, date, findings[]), `findings` (severity, evidence refs), `caps` (finding ref, owner, deadline, closure evidence, status — supports multi-year RSC items), `certificates` (type, expiry), `trainings` (fire drills etc., attendance), `compliance_docs` (auditor-ordered repository).
- Operations: audit report PDF → MARBIM findings extraction draft; CAP lifecycle; expiry alert ladder (90/60/30); audit-pack export per regime.
- Feeds: Buyers (regime requirements), owner dashboard (open criticals).

**FRONTEND PROMPT**
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

---
---

# DEPT 11 — ACCOUNTS & OWNER
*Commercial finance (not a GL) and the owner's truth screens. Desk density; owner also gets a phone-first view.*

## 11.1 Commercial Finance

**BACKEND BRIEF**
- Entities: `invoices` (shipment ref, value), `receivables` (doc_submission realizations feed), `payables` (supplier POs/GRNs), `order_costs_actual` (accrued: materials from Store issues, CM from payroll allocation, commercial from LC charges), `profitability` (derived per order: realized − actuals vs quoted margin).
- Operations: realization posting (from 2.1); payables aging; per-order P&L compute; cash timeline (expected realizations vs payables).
- Explicit non-goal: no general ledger — export hooks for Tally.
- Feeds: owner dashboard.

**FRONTEND PROMPT**
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

## 11.2 Owner Dashboard & Analytics

**BACKEND BRIEF**
- Entities: none new — read-only aggregation layer + `saved_reports`, `scheduled_exports`, `exceptions_feed` (materialized: LC conflicts, at-risk TNA, critical CAPs, run-rate misses, payroll anomalies awaiting).
- Operations: dashboard aggregates (cached, refreshed by the nightly jobs), NL report requests via MARBIM (read-only tool access), drill-through everywhere, Eid-adjusted period comparisons.
- Rule: this layer never writes.

**FRONTEND PROMPT**
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
---

# CROSS-CUTTING (design once, every department uses)

## X.1 Approve Inbox
**BACKEND BRIEF** — exists (`pending_changes`); harden: target_table whitelist, per-module Zod payload validation, approval routing rules (role × module matrix from Settings), aging escalation job, full audit trail query.

**FRONTEND PROMPT**
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

## X.2 MARBIM Surface
**BACKEND BRIEF** — exists (streaming agent); extend: per-module tool packs (read tools + draft tools only), context injection (current module/record), Bengali I/O, rate limiting + queue for extraction jobs, correction-rate logging on draft edits.

**FRONTEND PROMPT**
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

## X.3 Settings & Admin
As specified previously (company, factory structure, users/roles matrix, module toggles, master data managers incl. gazette-versioned wage grades and TNA templates, localization, data export, audit log). Design prompt: a quiet, dense settings surface — the one place amber is common, because everything here is deliberate action.

---

# RECOMMENDED SEQUENCE

Design (Claude Design) in this order — each locks patterns the next reuses:

1. **1.3 Order Desk & TNA** — hardest; locks the breakdown grid, milestone timeline, LC chip patterns
2. **X.1 Approve Inbox + X.2 MARBIM** — locks the trust layer used by every prompt
3. **3.1 Store + 6.1 Line Tracking** — locks floor density, offline queue, numpad entry
4. **1.2 RFQ (refine) + 4.1 Planning** — desk patterns, charts, what-if
5. **7.1 Quality + 5.1 Cutting + 8.1 Shipment + 3.2 Procurement** — reuse grids/steppers/gate patterns
6. **2.1 LC + 2.2 UD + 11.x Finance/Owner** — precision + aggregate patterns
7. **10.x HR/Compliance + 9.1 Maintenance + X.3 Settings**

Then finalize each backend brief against the locked screens (fields the design proved it needs, states the flows actually produce) and build backend module-by-module in the same order.
