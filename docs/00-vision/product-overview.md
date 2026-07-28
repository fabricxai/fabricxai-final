# FabricXAI — Product Overview

## The thesis
Scattered inputs (a buyer's email, a supervisor's tally, a bank advice) crossed into one fabric a factory can hold — the warp-and-weft X in the logo IS the product. Launch market: Bangladeshi garment export factories (500–5,000 workers), then the workflow generalizes (Vietnam, India, Cambodia, Pakistan) via pluggable country modules.

## Two products, one platform
1. Full ERP for factories with nothing but Excel.
2. AI layer over existing ERPs (later wave — same propose→approve loop targeting external APIs).

## The flow (order-to-cash spine)
Inquiry → Quote (RFQ+costing) → Order+TNA (PO, LC, plan) → Materials in (PO→GRN, bonded/UD) → Cut and sew → Quality pass → Pack and ship (EXP) → Docs to bank → Paid.
Alongside: the LC money spine, four hard gates (PP→cutting, UD balance, BTB headroom, EXP→bank), planning above the floor, maintenance beside it, and the MARBIM trust loop (draft → human approves → committed) under every step.

## 23 modules, 11 departments (index)
Merchandising: 1.1 Buyer/Lead · 1.2 RFQ/Quotation · 1.3 Order Desk & TNA (flagship) · 1.4 Sampling · 1.5 Costing Studio · 1.6 Order Memory (pgvector repeat-order intelligence)
Commercial: 2.1 LC Register & Bank Docs · 2.2 Bonded Warehouse/UD
Store: 3.1 Fabric & Trims Store · 3.2 Procurement & Suppliers
Planning: 4.1 Capacity & Line Planning · Cutting: 5.1 · Sewing: 6.1 Line Tracking (load target) · Quality: 7.1 · Shipment: 8.1 · Maintenance: 9.1
HR/Compliance: 10.1 Workforce & Wage Engine (locked-down) · 10.2 Compliance & Audit
Accounts/Owner: 11.1 Commercial Finance · 11.2 Owner Dashboard (read-only)
Cross-cutting: X.1 Approve Inbox · X.2 MARBIM · X.3 Settings
Full contracts: 02-backend/briefs/ · screens: 01-design/department-build-pack.md

## Deliberate boundaries (as designed as the modules)
No CAD/pattern-making (records marker results; import bridge later) · no general ledger (Tally export) · no supplier/buyer portals in v1 (email-mediated documents; portals are year-two) · attendance hardware imported, not built · Sustainability parked for a later wave.

## Who uses it
Merchandisers (desk, power users) · commercial officers (precision) · storekeepers, supervisors, QC, mechanics (floor density, offline-tolerant, Bengali) · HR (locked payroll) · the owner (phone: exceptions, approvals, ask — see 05-owner-app).

## Why factories will trust it
Every AI action is a draft a human approves, with per-field measured confidence and click-to-source. Gates prevent the mistakes that cost real money. Amber always means "you must act." The system's memory compounds: every closed order teaches the next quote.
