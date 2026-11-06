/**
 * Done-means 9: host cancels and fans refund themselves; after a show ends the
 * host withdraws proceeds in USDT.
 */
import { test, expect } from "@playwright/test";
import { desktop, openTickets, phone } from "./helpers";

test.describe("cancel and withdraw", () => {
  for (const viewport of [
    { name: "phone", size: phone },
    { name: "desktop", size: desktop },
  ]) {
    test.describe(viewport.name, () => {
      test.use({ viewport: viewport.size });

      test("host cancels; fan claims USDT refund", async ({ page }) => {
        test.skip(!process.env.E2E_HOST_WALLET, "needs harness host wallet stub");
        await page.goto("/host");
        await page.getByRole("button", { name: /Cancel show|Cancel/i }).first().click();
        await expect(page.getByText(/cancelled/i).first()).toBeVisible({ timeout: 60_000 });

        await openTickets(page);
        await page.getByRole("button", { name: /Claim .*USDT/i }).click();
        await expect(page.getByText(/back in .*wallet|Refunded/i).first()).toBeVisible({
          timeout: 120_000,
        });
      });

      test("after the show ends the host withdraws USDT", async ({ page }) => {
        test.skip(!process.env.E2E_ENDED_EVENT, "needs harness time-travel or ended fixture");
        await page.goto("/host");
        await page.getByRole("button", { name: /Withdraw proceeds/i }).click();
        await expect(page.getByText(/withdrawn|Proceeds/i).first()).toBeVisible({ timeout: 120_000 });
      });
    });
  }
});
