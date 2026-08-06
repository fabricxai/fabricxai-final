import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { statePath } from "./support";

/**
 * WCAG on the screens used in gloves, under bad light (plan 7.2, audit TEST-H8).
 *
 * These five are the floor: a storekeeper at the gate, a cutting room, a sewing floor, a QC
 * table, and the inbox where what they record gets signed. They are used standing up, on a
 * shared tablet, by people who are not looking for a subtle affordance — so contrast and
 * names are not a compliance exercise here, they are whether the screen works at all.
 *
 * ## Scoped to serious, and why that is not a dodge
 *
 * `wcag2a` and `wcag2aa` only. Best-practice rules flag things like heading-order on a
 * dashboard that is a grid of independent cards, and a sweep that reports twenty
 * non-problems is one somebody adds an ignore list to and then stops reading.
 *
 * Runs in the `tablet` project too (768×1024). Plan 4.4 fixed the tablet layout structurally
 * and recorded in STUBS that nobody had opened it in a browser — this is that check, for the
 * part of it a machine can make.
 */
const FLOOR = [
  {
    path: "/store",
    as: "store",
    what: "the gate — receiving cloth against a challan",
  },
  { path: "/cutting", as: "production", what: "the cutting room" },
  { path: "/production", as: "production", what: "the sewing floor board" },
  { path: "/quality", as: "quality", what: "the QC table" },
  { path: "/approve", as: "owner", what: "where a draft gets signed" },
] as const;

for (const screen of FLOOR) {
  test.describe(`${screen.path}`, () => {
    // The session saved by the `setup` project. Signing in per screen would spend the whole
    // per-IP sign-in allowance on the sweep — see `auth.setup.ts`.
    test.use({ storageState: statePath(screen.as) });

    test(`${screen.path} — ${screen.what}`, async ({ page }) => {
      await page.goto(screen.path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();

      /*
       * Named, and with the numbers.
       *
       * "3 violations" sends somebody to a report. The rule, the element, and axe's own
       * failure summary — which for a contrast failure names both colours and the ratio it
       * measured — send them to the line and tell them what to change it to.
       */
      const summary = results.violations.map((v) => {
        const nodes = v.nodes
          .slice(0, 8)
          .map(
            (n) =>
              `      ${n.target.join(" ")}\n        ${n.failureSummary?.replace(/\n/g, " ")}`,
          )
          .join("\n");
        const more =
          v.nodes.length > 8 ? `\n      …and ${v.nodes.length - 8} more` : "";
        return `${v.id} (${v.impact}) — ${v.help}\n${nodes}${more}`;
      });

      expect(summary, `${screen.path}:\n${summary.join("\n")}`).toEqual([]);
    });
  });
}
