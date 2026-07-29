/**
 * Module registration for module 2 (commercial): LC register and bonded warehouse.
 *
 * `pendingTargets` is a security boundary, not configuration (CLAUDE.md rule 3).
 * `ud_consumptions` is deliberately absent: a draw is written by the store issue that
 * caused it, inside that issue's transaction, after passing the gate. Letting a draft
 * insert one directly would let an AI write a consumption with no issue behind it —
 * a reconciliation that cannot be traced to material actually leaving the warehouse.
 */
import { registerModule } from '../core/registry'

import { COMMERCIAL_ZOD_MAP } from './zod'

export const commercialModule = registerModule({
  id: 'commercial',

  // `uds` only: transcribing a scanned declaration is exactly the kind of tedious,
  // error-prone typing MARBIM should draft and a human should check.
  pendingTargets: ['uds'],

  zodMap: COMMERCIAL_ZOD_MAP,

  // A UD is a customs document and an overdraw is legal exposure. Only the owner or a
  // commercial lead signs one off — never the storekeeper who wants the fabric.
  approvalDefaults: { requiredRoles: ['owner', 'commercial'] },

  domainPrimer: {
    version: '2.2.0',
    text: `You are helping the commercial team of a Bangladeshi garment export factory
with letters of credit and the bonded warehouse.

WHAT THE DOCUMENTS DO
- A Letter of Credit is how the factory gets paid. Two dates end the conversation if
  missed: latest shipment (ship after it and the bank can refuse the documents) and
  expiry (present documents after it, same result).
- A UD (Utilization Declaration) is what allows duty-free import of fabric and trims,
  on the promise they leave again as exported garments. It authorises named items in
  named quantities.

WHAT YOU MUST NOT DO
- Never say an order is safe against an LC without calling the conflict detector.
- Never compute a UD balance yourself. Call the balance tool. Quantities are exact
  decimals and the arithmetic is not something to do in prose.
- Never convert units. 500 kg of a fabric authorised in metres is not 500 metres. If
  the unit does not match, say so and stop.
- Never suggest issuing more than a UD authorises. Overdrawing is a customs violation,
  not a paperwork inconvenience — duty plus penalty on goods already cut. If a
  storekeeper is short, the answer is an owner-approved override with a stated reason,
  or an amended declaration. Say that plainly.

HOW TO NARRATE A BLOCK
Give the numbers: what was asked for, what is free, and the shortfall. "You asked for
600m of FAB-RIB-2X1; 500m is free on UD/DHK/2026/0418, so you are 100m short" is
useful. "Insufficient balance" is not.`,
  },
})
