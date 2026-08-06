/**
 * `no-invented-confidence` — enforcement for CLAUDE.md rule 3.
 *
 * "Confidence is per-field and comes from the extractor — constants are forbidden." That
 * sentence has been in CLAUDE.md since the trust layer was written, enforced by exactly one
 * runtime check (`assertExtractionConfidence`) that catches only the crude fake: every field
 * scored identically.
 *
 * Eight modules shipped the sophisticated one. `store.propose_stock_adjustment` returned
 * `{ itemId: 0.95, qtyDelta: 0.62, unit: 0.9, reasonCode: 0.85, note: 0.8 }` — varied,
 * per-field, each value with a comment arguing for it, and the *same numbers on every draft
 * the tool ever produced*. Nothing measured anything. It passed the uniform check precisely
 * because somebody had thought carefully about which fields feel shakier, which is a
 * judgement about the domain and not a measurement of an extraction.
 *
 * Those numbers are not decoration. `confidence_min` orders the approve inbox, clears (or
 * fails to clear) the auto-approve floor in `pending_changes.propose`, and buckets the
 * correction-rate report that X.2 uses to say whether the extractor is any good. A constant
 * makes all three report on which tool ran rather than on how reliable the row is.
 *
 * ## What this bans
 *
 * A numeric literal as a value inside a `fieldConfidence` object literal — the whole shape,
 * `fieldConfidence: { a: 0.9 }`, and the spread-in-a-conditional dialect the tools used,
 * `...(x ? { rollId: 0.93 } : {})`.
 *
 * ## What it deliberately allows
 *
 * Anything computed. `fieldConfidence[field] = CONFIDENCE[found.how]` in the mock provider
 * is a real reading of HOW a value was matched; `seededLineConfidence({basis, pieces})` in
 * `memory` is monotone in the evidence behind the line. Both are constants somewhere at the
 * bottom, and both are fine, because the number MOVES with the thing it describes. That is
 * the whole distinction, and a rule that could not express it would be turned off.
 *
 * `1` and `0` are allowed as well: they are not estimates. A field the user picked from a
 * list of their own records carries no reading risk at all, which `extract` already scores
 * as 1 with its reasoning written out, and 0 is "could not read this".
 *
 * Tests and seeds are exempt in `eslint.config.mjs` — a fixture's whole job is to be a
 * plausible extraction result, and a seeded approve inbox with no confidence spread would
 * demo nothing.
 */

const FIELD = 'fieldConfidence'

/** Not estimates: certain, and not-at-all. Everything between them is a guess. */
const ALLOWED = new Set([0, 1])

const noInventedConfidence = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'confidence must come from a measurement, not a literal (CLAUDE.md rule 3, audit AI-B2)',
    },
    schema: [],
    messages: {
      literal:
        '`{{field}}: {{value}}` is a number somebody typed, not one anything measured — and it will be the same on every draft this produces. It orders the approve inbox and clears the auto-approve floor. Derive it from the extractor (see `memory.seededLineConfidence`), or propose the draft unscored so every field reads "no confidence" and a human always sees it.',
    },
  },

  create(context) {
    /**
     * Report every numeric-literal value in an object literal, following spreads of the
     * `cond ? {a: 0.9} : {}` form — the dialect all eight sites used for optional fields,
     * and one a naive property walk misses entirely.
     */
    function checkObject(node) {
      if (node?.type !== 'ObjectExpression') return

      for (const property of node.properties) {
        if (property.type === 'SpreadElement') {
          const spread = property.argument
          if (spread.type === 'ConditionalExpression') {
            checkObject(spread.consequent)
            checkObject(spread.alternate)
          } else if (spread.type === 'LogicalExpression') {
            checkObject(spread.right)
          } else {
            checkObject(spread)
          }
          continue
        }

        if (property.type !== 'Property') continue

        // `a: 0.9` and `a: -0.9`; the unary form is nonsense as confidence but is still a
        // typed-in number, and saying so here beats a runtime range error.
        const value = property.value
        const literal =
          value.type === 'Literal'
            ? value
            : value.type === 'UnaryExpression' && value.argument.type === 'Literal'
              ? value.argument
              : null

        if (!literal || typeof literal.value !== 'number') continue
        if (ALLOWED.has(literal.value) && value.type === 'Literal') continue

        const name =
          property.key.type === 'Identifier'
            ? property.key.name
            : property.key.type === 'Literal'
              ? String(property.key.value)
              : 'a field'

        context.report({
          node: property,
          messageId: 'literal',
          data: { field: name, value: context.sourceCode.getText(value) },
        })
      }
    }

    return {
      // `fieldConfidence: { … }` — a property, wherever it appears: a tool proposal, a
      // `propose()` call, a service building one inline.
      Property(node) {
        const key = node.key
        const name =
          key.type === 'Identifier' ? key.name : key.type === 'Literal' ? key.value : null
        if (name !== FIELD || node.shorthand) return
        checkObject(node.value)
      },

      // `const fieldConfidence = { … }` — the same object, one line earlier, which is how
      // it would be written the moment the property form started erroring.
      VariableDeclarator(node) {
        if (node.id.type !== 'Identifier' || node.id.name !== FIELD) return
        checkObject(node.init)
      },
    }
  },
}

export default noInventedConfidence
