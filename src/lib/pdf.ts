/**
 * PDF rendering. One pipeline for every document the factory sends out: PO, payslip,
 * packing list, QC pack, UD reconciliation. HTML→PDF via a Playwright chromium pool,
 * and it runs in the WORKER only — never in a request path.
 *
 * ⚠ First consumer is the PO pipeline in Phase 6.
 */
export type PdfTemplate =
  | 'purchase_order'
  | 'payslip'
  | 'packing_list'
  | 'qc_pack'
  | 'ud_reconciliation'
