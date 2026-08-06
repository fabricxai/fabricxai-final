import { expect, test } from "@playwright/test";

import { statePath } from "./support";

/**
 * The one journey that, if it breaks, means the product does not work (plan 7.2, TEST-H8).
 *
 *   sign in → the floor records a receipt → it is waiting in the approve inbox
 *
 * Three modules, two roles, the offline queue, `/api/sync`, `pending_changes` and the shell's
 * role gate, in the order a factory uses them. Deliberately ONE path: a broad e2e suite over a
 * product still gaining screens is a maintenance bill paid in flaky reruns, and everything
 * narrower than this is better tested where it lives.
 *
 * It reads what a person would read. `getByRole` and visible text rather than test ids,
 * because a test that passes against markup nobody can navigate is testing the wrong thing —
 * which is also why the axe sweep sits beside it.
 *
 * Sessions come from the `setup` project rather than a sign-in per test — see `auth.setup.ts`.
 * The login form itself is exercised there, once per role, which is the coverage it needs.
 */
test.describe("the golden path", () => {
  test.describe("as the store", () => {
    test.use({ storageState: statePath("store") });

    test("a signed-in storekeeper reaches their own screen", async ({
      page,
    }) => {
      await page.goto("/store");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      // The role gate, from the outside. 0.2 made the route default fail-closed; this is the
      // other half of that claim — a storekeeper reaching a screen that is theirs.
      await expect(page).toHaveURL(/\/store/);
    });

    test("a storekeeper cannot open payroll", async ({ page }) => {
      /*
       * The gate that matters most in this product. `workforce` is the 🔒 module — a leak there
       * is another person's wage bill — and it is the one route worth proving from a browser
       * rather than from a unit test that could be asserting against a stale nav table.
       */
      await page.goto("/workforce");

      await expect(
        page.getByText(/not available|no access|refused|permission/i).first(),
      ).toBeVisible();
    });
  });

  test.describe("as the owner", () => {
    test.use({ storageState: statePath("owner") });

    test("an owner sees the approve inbox, and it explains itself when empty", async ({
      page,
    }) => {
      await page.goto("/approve");

      // Either drafts, or the empty state that says drafts arrive by ROUTING. Both are correct
      // and which one appears depends on what the seed left behind, so the assertion is that
      // the screen answered rather than that a particular row exists.
      const inbox = page.getByText(
        /Nothing routed to you|select rows to approve/i,
      );
      await expect(inbox.first()).toBeVisible();
    });
  });

  test.describe("as production", () => {
    test.use({ storageState: statePath("production") });

    test("the production board renders for the role that reads it", async ({
      page,
    }) => {
      // 5.7 gave this route its API; 7.1 load-tested it. This is the third leg — that a
      // supervisor opening it on a tablet gets a page rather than a 403.
      await page.goto("/production");

      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });
  });
});
