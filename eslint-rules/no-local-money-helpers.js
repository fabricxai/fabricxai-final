/**
 * `no-local-money-helpers` — CLAUDE.md rule 4, the structural half (audit BE-M8).
 *
 * `lib/money.ts` and `lib/quantity.ts` are the sanctioned scaled-BigInt conversions.
 * Fifteen files carry a private copy of the same two functions: each individually exact,
 * none sharing the tests, none carrying a currency, and every one of them a place to miss
 * when a rounding convention changes.
 *
 * A SHRINK-ONLY exemption list lives in `eslint.config.mjs`. Converting fifteen modules is
 * module-by-module work; a sixteenth copy is banned from today.
 *
 * Its own rule rather than a `no-restricted-syntax` selector because that rule is already
 * configured for the UTC-date ban, and ESLint flat config REPLACES a rule's options when a
 * later block sets the same name — so the two bans silently cancelled each other out. Found
 * by red-testing, which is the only reason it is not still silently off.
 */
const BANNED = new Set(['toMinor', 'fromMinor', 'mulMinor', 'toMinorScaled', 'fromMinorScaled'])

const noLocalMoneyHelpers = {
  meta: {
    type: 'problem',
    docs: { description: 'money conversion lives in lib/money.ts (CLAUDE.md rule 4)' },
    schema: [],
    messages: {
      localCopy:
        '`{{name}}` duplicates lib/money.ts / lib/quantity.ts. A local copy is exact today and diverges the first time a rounding rule changes — import the shared one.',
    },
  },

  create(context) {
    const report = (node, name) => {
      if (BANNED.has(name)) context.report({ node, messageId: 'localCopy', data: { name } })
    }

    return {
      FunctionDeclaration(node) {
        if (node.id) report(node.id, node.id.name)
      },
      // `const toMinor = (v) => ...` is the same copy in a different hat.
      VariableDeclarator(node) {
        if (
          node.id?.type === 'Identifier' &&
          (node.init?.type === 'ArrowFunctionExpression' || node.init?.type === 'FunctionExpression')
        ) {
          report(node.id, node.id.name)
        }
      },
    }
  },
}

export default noLocalMoneyHelpers
