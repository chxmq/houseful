/**
 * Done-means 10: ticket recovery moves a ticket to a new wallet; the old door
 * code stops working.
 */
import { test, expect } from "@playwright/test";
import { choosePay, desktop, openShow, openTickets, phone, pickSeat, verifyAndBuy } from "./helpers";

const SLUG = process.env.E2E_RECOVER_SLUG ?? "tatkaar-ncpa";

test.describe("ticket recovery", () => {
  for (const viewport of [
    { name: "phone", size: phone },
    { name: "desktop", size: desktop },
  ]) {
    test.describe(viewport.name, () => {
      test.use({ viewport: viewport.size });

      test("recover moves the ticket and invalidates the old door code", async ({ page, context }) => {
        test.skip(!process.env.E2E_RECOVER_READY, "needs product account recovery + World stub");

        await openShow(page, SLUG);
        await pickSeat(page);
        await choosePay(page, "usdt");
        await verifyAndBuy(page);
        await openTickets(page);
        const oldCode = page.locator("[data-door-code], .door-code").first();
        await expect(oldCode).toBeVisible({ timeout: 30_000 });
        const stale = (await oldCode.innerText()).trim();

        // Product harness: sign in on a fresh wallet / clear device key, then recover.
        await page.goto("/account");
        await page.getByRole("button", { name: /Recover ticket|Move ticket/i }).click();
        await expect(page.getByText(/moved|recovered|new wallet/i).first()).toBeVisible({
          timeout: 120_000,
        });

        await openTickets(page);
        await expect(page.getByText(/Seat \d+|General admission/i).first()).toBeVisible();

        const door = await context.newPage();
        await door.goto("/door");
        await door.locator("input").first().fill(stale);
        await door.getByRole("button", { name: /Admit|Check|Scan/i }).click();
        await expect(door.getByText(/reject|invalid|stale|not found/i).first()).toBeVisible({
          timeout: 15_000,
        });
      });
    });
  }
});
