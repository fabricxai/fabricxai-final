/** Outbox events for 11.1. */
export const FINANCE_EVENTS = {
  invoiceDrafted: 'finance.invoice.drafted',
  receivableOpened: 'finance.receivable.opened',
  receivableRealized: 'finance.receivable.realized',
  payableOpened: 'finance.payable.opened',
  payablePaid: 'finance.payable.paid',
  /** The week the cash forecast first goes negative. The one an owner must see. */
  cashShortfallForecast: 'finance.cash.shortfall_forecast',
  orderCostsAccrued: 'finance.order_costs.accrued',
  /** Actual margin below the quote by more than the company tolerates. */
  marginErosion: 'finance.margin.erosion',
} as const

export type FinanceEventName = (typeof FINANCE_EVENTS)[keyof typeof FINANCE_EVENTS]
