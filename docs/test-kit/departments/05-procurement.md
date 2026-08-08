# Procurement — `procurement@fabricxai-fashion.test`

Suppliers, quotes and purchase orders — including the BTB wall. Password: `FabricXai-seed-2026`.

## Data already present
- Suppliers: **Ningbo Yuhua Textile** (import), **Square Textiles Ltd.** (local),
  **Dhaka Trims & Accessories**
- 3 supplier quotes (with lines), 1 purchase requisition

## Test steps
1. **Quote comparison**: compare the three quotes for the fabric requisition; award one.
2. **Local PO**: raise a PO on Square Textiles for `TRM-BTN-18L` against the requisition;
   receive it with `store@` to close the loop (PO → GRN → payable with `finance@`).
3. **Import PO / BTB gate**: raise an import PO on Ningbo Yuhua large enough to exceed the
   **back-to-back LC headroom** (a % of master LC-2026-517's USD 128,400). Must refuse
   server-side and state the headroom. Then a smaller PO that fits — accepted.
4. **Supplier lifecycle**: add a new supplier with terms; edit; deactivate.
5. For **PO-88410** (once intake-approved): create the fabric requisition from its BOM
   (tech-pack numbers × 18,000 pcs + wastage) — the arithmetic the costing sheet already
   shows.

## MARBIM prompts to try
- "How much 40s poplin do we need to buy for PO-88410 at 1.62 m/pc plus 3% wastage?"
- "Which supplier quoted lowest for the poplin, and what were the terms?"

## Must refuse
- Import PO beyond BTB headroom; receiving against a closed PO; procurement editing
  store stock directly (one-writer rule — stock moves only via store's GRN/issue).
