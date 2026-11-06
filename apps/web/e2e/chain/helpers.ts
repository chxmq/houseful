/**
 * Chain-stream helpers for done-means 6 to 10.
 * Prefer the product harness when it lands; these keep the specs runnable against
 * a stubbed World edge and the device wallet until then.
 */
import { expect, type Page } from "@playwright/test";

export const phone = { width: 375, height: 812 };
export const desktop = { width: 1280, height: 800 };

export async function openShow(page: Page, slug: string) {
  await page.goto(`/e/${slug}`);
  await expect(page.getByText(/\$\d+|Paid |Pay now|Pay with Ethereum/i).first()).toBeVisible({ timeout: 30_000 });
}

export async function pickSeat(page: Page, seatLabel?: string) {
  const ga = page.getByRole("button", { name: /Continue without a seat/i });
  if (await ga.isVisible().catch(() => false)) {
    await ga.click();
    return;
  }
  if (seatLabel) {
    await page.getByRole("button", { name: seatLabel, exact: true }).click();
    return;
  }
  const open = page.locator('button[aria-label^="Seat "]:not([disabled])').first();
  await expect(open).toBeVisible({ timeout: 15_000 });
  await open.click();
}

export async function choosePay(page: Page, method: "usdt" | "eth") {
  const label = method === "usdt" ? /Pay now/i : /Pay with Ethereum/i;
  const btn = page.getByRole("button", { name: label });
  if (await btn.isVisible().catch(() => false)) await btn.click();
}

export async function verifyAndBuy(page: Page) {
  const verify = page.getByRole("button", { name: /Verify and buy|Verify and take a returned seat/i });
  await expect(verify).toBeVisible({ timeout: 30_000 });
  await verify.click();
  // World stub in the product harness completes IDKit; wait for pay/bind progress or ticket.
  await expect(
    page.getByText(/Open your ticket|Paid face value|Bound this phone|Seat \d+ selected|General admission/i).first(),
  ).toBeVisible({ timeout: 120_000 });
}

export async function expectSeatTakenMessage(page: Page) {
  await expect(page.getByText(/was just taken|Pick another/i)).toBeVisible({ timeout: 15_000 });
}

export async function openTickets(page: Page) {
  await page.goto("/tickets");
  await expect(page.getByText(/Admit one|Nothing booked yet|Reading your tickets/i).first()).toBeVisible({
    timeout: 30_000,
  });
}

export async function handBack(page: Page) {
  await page.getByRole("button", { name: /Cannot make it\? Hand it back/i }).click();
  await page.getByRole("button", { name: /Hand back for/i }).click();
  await expect(page.getByText(/Refunded|Your seat went/i)).toBeVisible({ timeout: 120_000 });
}
