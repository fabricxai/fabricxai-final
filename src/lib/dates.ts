/**
 * Dates. The factory operates in Asia/Dhaka; buyers, LCs and shipping schedules do not.
 * Every date helper here is timezone-explicit for that reason — a shipment date that
 * drifts by a day across a timezone boundary is an LC latest-shipment breach.
 *
 * Also home to the Bangla calendar/numeral formatting the floor screens use.
 *
 * ⚠ Implementations land with the modules that need them (1.3 TNA first).
 */
export const FACTORY_TIMEZONE = 'Asia/Dhaka'
