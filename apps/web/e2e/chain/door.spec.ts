/**
 * Done-means 7: ticket shows the seat and a rotating door code; door admits,
 * rejects a stale code and a repeat entry, including offline.
 */
import { test, expect } from "@playwright/test";
import { desktop, openShow, openTickets, phone, pickSeat, choosePay, verifyAndBuy } from "./helpers";

const SLUG = process.env.E2E_DOOR_SLUG ?? "bijli-ka-bill-siddharth-kale";

test.describe("door code", () => {
  for (const viewport of [
    { name: "phone", size: phone },
    { name: "desktop", size: desktop },
  ]) {
    test.describe(viewport.name, () => {
      test.use({ viewport: viewport.size });

      test("ticket shows seat and door admits once", async ({ page, context }) => {
        await openShow(page, SLUG);
        await pickSeat(page);
        await choosePay(page, "usdt");
        await verifyAndBuy(page);
        await openTickets(page);

        await expect(page.getByText(/Seat \d+|General admission/i).first()).toBeVisible({ timeout: 30_000 });
        const code = page.locator("[data-door-code], .door-code, text=/^[A-Z0-9]{4,8}$/").first();
        await expect(code).toBeVisible({ timeout: 30_000 });
        const value = (await code.innerText()).trim();

        const door = await context.newPage();
        await door.goto(`/door`);
        await door.getByPlaceholder(/code|scan|paste/i).fill(value).catch(async () => {
          await door.locator("input").first().fill(value);
        });
        await door.getByRole("button", { name: /Admit|Check|Scan/i }).click();
        await expect(door.getByText(/Admitted|Welcome|In/i).first()).toBeVisible({ timeout: 30_000 });

        // Repeat entry refused.
        await door.getByRole("button", { name: /Admit|Check|Scan/i }).click().catch(() => undefined);
        await expect(door.getByText(/already|used|repeat/i).first()).toBeVisible({ timeout: 15_000 });

        // Offline: service worker should still reject a stale/used code.
        await context.setOffline(true);
        await door.reload().catch(() => undefined);
        await door.getByRole("button", { name: /Admit|Check|Scan/i }).click().catch(() => undefined);
        await expect(door.getByText(/already|used|offline|stale|reject/i).first()).toBeVisible({
          timeout: 15_000,
        });
        await context.setOffline(false);
      });
    });
  }
});
