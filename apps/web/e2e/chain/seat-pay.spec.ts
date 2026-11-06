/**
 * Done-means 6: pick a seat, pay in USDT, another fan pays in ETH,
 * a just-taken seat is refused in plain words.
 */
import { test, expect } from "../support/fixtures";
import { choosePay, desktop, expectSeatTakenMessage, openShow, phone, pickSeat, verifyAndBuy } from "./helpers";

const FLAGSHIP = "the-last-local-nsci-dome";
const SEATED = process.env.E2E_SEATED_SLUG ?? FLAGSHIP;

test.describe("seat and pay", () => {
  for (const viewport of [
    { name: "phone", size: phone },
    { name: "desktop", size: desktop },
  ]) {
    test.describe(viewport.name, () => {
      test.use({ viewport: viewport.size });

      test("fan picks a seat and pays in USDT", async ({ page }) => {
        await openShow(page, SEATED);
        await pickSeat(page);
        await choosePay(page, "usdt");
        await verifyAndBuy(page);
        await expect(page.getByRole("link", { name: /Open your ticket/i })).toBeVisible();
      });

      test("another fan pays in ETH through the swap", async ({ page }) => {
        test.skip(process.env.NEXT_PUBLIC_PAY_WITH_ETH === "false", "ETH checkout disabled");
        await openShow(page, SEATED);
        await pickSeat(page);
        await choosePay(page, "eth");
        await verifyAndBuy(page);
        await expect(page.getByRole("link", { name: /Open your ticket/i })).toBeVisible();
      });

      test("a seat that was just taken is refused clearly", async ({ page, browser }) => {
        await openShow(page, SEATED);
        const seatBtn = page.locator('button[aria-label^="Seat "]:not([disabled])').first();
        const label = await seatBtn.getAttribute("aria-label");
        test.skip(!label, "no open seats left on this show");
        await seatBtn.click();

        const rival = await browser.newPage();
        await rival.setViewportSize(viewport.size);
        await openShow(rival, SEATED);
        await rival.getByRole("button", { name: label!, exact: true }).click();
        await choosePay(rival, "usdt");
        await verifyAndBuy(rival);

        await choosePay(page, "usdt");
        const verify = page.getByRole("button", { name: /Get tickets|Get Seat|Verify and buy/i });
        await verify.click();
        await expectSeatTakenMessage(page);
        await rival.close();
      });
    });
  }
});
