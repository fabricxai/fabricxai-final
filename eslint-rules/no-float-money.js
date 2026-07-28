/**
 * `no-float-money` — enforcement for CLAUDE.md rule 4.
 *
 * Money is a decimal STRING backed by `numeric(14,2)`. The moment an amount becomes a
 * JS number it is a float, and 0.1 + 0.2 = 0.30000000000000004 on a factory's margin is
 * a real invoice being wrong. `lib/money.ts` does the arithmetic on scaled BigInt;
 * everything else must go through it.
 *
 * The rule is a heuristic, and deliberately so. A type-aware version could be exact, but
 * it would need full type information on every lint run and would still miss values that
 * arrive as `unknown` from jsonb. A blunt "ban Number() everywhere" was the other option
 * and it is worse: it fires on confidence scores, row counts and pagination, gets
 * disabled reflexively, and then catches nothing. So this targets the two shapes that
 * actually cause the bug:
 *
 *   1. `parseFloat` / `parseInt` on anything — neither has a legitimate use in a module.
 *   2. `Number(x)` and arithmetic on a value whose NAME says it is money.
 *
 * False negatives are accepted. False positives are not, because a rule people silence
 * is worse than no rule at all.
 */

/** Word stems that mean "this is an amount of money". */
const MONEY_NAME =
  /(^|_)(amount|price|cost|total|subtotal|value|rate|wage|salary|balance|premium|freight|duty|margin|payable|receivable)s?($|_)/

/**
 * Names arrive in camelCase (`unitPrice`) and snake_case (`unit_price`) depending on
 * whether they came from TypeScript or straight off a row. Normalise to snake_case
 * first — matching on raw camelCase silently misses `unitPrice`, because there is no
 * word boundary between "unit" and "Price".
 */
const isMoneyName = (name) =>
  typeof name === 'string' &&
  MONEY_NAME.test(name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase())

/** Does this expression look like it holds money? `line.unitPrice`, `unitPrice`, … */
function looksLikeMoney(node) {
  if (!node) return false
  if (node.type === 'Identifier') return isMoneyName(node.name)
  if (node.type === 'MemberExpression' && !node.computed) return isMoneyName(node.property?.name)
  if (node.type === 'MemberExpression' && node.computed && node.property?.type === 'Literal') {
    return isMoneyName(node.property.value)
  }
  return false
}

const noFloatMoney = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Money is a decimal string; float arithmetic on it is banned (CLAUDE.md rule 4)',
    },
    schema: [],
    messages: {
      parseBanned:
        '`{{callee}}` is banned here. Money is a decimal string — use the helpers in lib/money.ts, which do exact BigInt arithmetic.',
      numberOnMoney:
        'Number() on `{{name}}` turns money into a float. Use lib/money.ts (add/subtract/multiply/compare) instead.',
      arithmeticOnMoney:
        'Arithmetic on `{{name}}` — money must not be added or multiplied as a float. Use lib/money.ts.',
      unaryPlusOnMoney:
        'Unary + on `{{name}}` coerces money to a float. Use lib/money.ts.',
    },
  },

  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee

        if (callee.type === 'Identifier' && (callee.name === 'parseFloat' || callee.name === 'parseInt')) {
          context.report({ node, messageId: 'parseBanned', data: { callee: callee.name } })
          return
        }

        if (callee.type === 'Identifier' && callee.name === 'Number' && node.arguments.length > 0) {
          const arg = node.arguments[0]
          if (looksLikeMoney(arg)) {
            const name = arg.type === 'Identifier' ? arg.name : (arg.property?.name ?? 'value')
            context.report({ node, messageId: 'numberOnMoney', data: { name } })
          }
        }
      },

      BinaryExpression(node) {
        if (!['+', '-', '*', '/', '%'].includes(node.operator)) return

        for (const side of [node.left, node.right]) {
          if (looksLikeMoney(side)) {
            const name = side.type === 'Identifier' ? side.name : (side.property?.name ?? 'value')
            context.report({ node, messageId: 'arithmeticOnMoney', data: { name } })
            return
          }
        }
      },

      UnaryExpression(node) {
        if (node.operator !== '+') return
        if (looksLikeMoney(node.argument)) {
          const arg = node.argument
          const name = arg.type === 'Identifier' ? arg.name : (arg.property?.name ?? 'value')
          context.report({ node, messageId: 'unaryPlusOnMoney', data: { name } })
        }
      },
    }
  },
}

export default noFloatMoney
