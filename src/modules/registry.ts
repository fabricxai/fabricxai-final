/**
 * Registers every module, once, at server boot.
 *
 * `modules/<m>/register.ts` is where a module declares the three things the
 * core cannot infer: which tables an AI draft may target, which Zod schema
 * validates each payload, and which offline operations it handles. Importing
 * the file is what runs that registration — there is no discovery step.
 *
 * Until this existed, those files were imported only by their own integration
 * tests. Everything therefore passed in CI and would have failed in the running
 * app, silently and in three separate ways:
 *
 *   - `syncBatch` would find no handler for any floor write and reject the
 *     whole batch, on a device that had already told the operator it was saved.
 *   - `resolvePendingSchema` would refuse every approve, because no target
 *     table is whitelisted until its module registers.
 *   - MARBIM would assemble a prompt with no department primers and answer
 *     from the standing rules alone — the one failure with no error at all.
 *
 * Order does not matter; registration is idempotent per module id.
 */
import '@/modules/analytics/register'
import '@/modules/buyers/register'
import '@/modules/commercial/register'
import '@/modules/compliance/register'
import '@/modules/costing/register'
import '@/modules/cutting/register'
import '@/modules/finance/register'
import '@/modules/maintenance/register'
import '@/modules/marbim/register'
import '@/modules/memory/register'
import '@/modules/orders/register'
import '@/modules/planning/register'
import '@/modules/procurement/register'
import '@/modules/production/register'
import '@/modules/quality/register'
import '@/modules/rfq/register'
import '@/modules/sampling/register'
import '@/modules/settings/register'
import '@/modules/shipment/register'
import '@/modules/store/register'
import '@/modules/workforce/register'

import { listModules } from '@/modules/core/registry'
import { listSyncHandlers } from '@/modules/core/offline-sync'
import { assertIntakeKinds } from '@/modules/marbim/intake'
import { assertToolPacks } from '@/modules/marbim/tools'

// Every module is registered by the imports above, so this is the first moment the check
// can run — and the last moment before something offers a document intake that `propose`
// would refuse. A wrong entry fails the boot rather than one upload, once, in front of
// somebody who was told it works.
assertIntakeKinds()
assertToolPacks(listModules())

/** What actually got registered, for the boot log and the health check. */
export function registeredSummary(): { modules: number; syncHandlers: number } {
  return { modules: listModules().length, syncHandlers: listSyncHandlers().length }
}
