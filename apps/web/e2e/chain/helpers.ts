/**
 * Steps the chain specs share. Each one waits for what the app shows when the step is really done, so a spec
 * cannot move on while a purchase is still on its way.
 */
import { expect, type Locator, type Page } from "@playwright/test";

/** Opens a show and waits until the page has read the chain: the seats left, or the line, is showing. */
export async function openShow(page: Page, slug: string) {
  await page.goto(`/e/${slug}`);
  await expect(page.getByText(/^(left|in line)$/)).toBeVisible({ timeout: 30_000 });
}

/** Takes general admission when `seat` is left out, or the seat with that number. */
export async function pickSeat(page: Page, seat?: number) {
  if (seat === undefined) {
    const standing = page.getByRole("button", { name: /Continue · standing|Continue without a seat/ });
    if (await standing.isVisible().catch(() => false)) {
      await standing.click();
      return;
    }
    // Seated demo shows: pick the first free seat if the caller omitted a number.
    await page.getByRole("button", { name: /^Seat \d+$/ }).first().click();
    return;
  }
  await page.getByRole("button", { name: `Seat ${seat}`, exact: true }).click();
  await expect(page.getByText(`Seat ${seat} selected`)).toBeVisible();
}

/** Checkout is USDT-only in the UI. Kept so older specs still compile. */
export async function choosePay(_page: Page, _method: "usdt" | "eth" = "usdt") {
  // no-op
}

/** After Get tickets / Join, pick a wallet from the pay sheet. */
export async function chooseWallet(page: Page) {
  await expect(page.getByRole("heading", { name: "Pay with which wallet?" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /^(This phone|Linked wallet)/ }).first().click();
}

/** The words the panel shows when a purchase did not go through. */
export function refusal(page: Page): Locator {
  return page.getByRole("button", { name: "Try again" }).locator("xpath=ancestor::div[1]").locator("p").first();
}

/** Waits for `done`, and fails with the app's own words if the panel refuses instead. */
async function expectDoneOrRefused(page: Page, done: Locator) {
  const tryAgain = page.getByRole("button", { name: "Try again" });
  await expect(done.or(tryAgain)).toBeVisible({ timeout: 120_000 });
  if (await tryAgain.isVisible()) throw new Error(`The app refused: ${await refusal(page).innerText()}`);
}

/** Clicks the buy button of a show with seats left and waits for the ticket. */
export async function buyTicket(page: Page) {
  await page.getByRole("button", { name: /^(Buy |Get |Take )/ }).click();
  await chooseWallet(page);
  await expectDoneOrRefused(page, page.getByRole("link", { name: "Open your ticket" }));
}

/** Clicks the button of a sold out show and waits for a place in line. */
export async function joinWaitlist(page: Page) {
  await page.getByRole("button", { name: /Join waitlist/i }).click();
  await chooseWallet(page);
  await expectDoneOrRefused(page, page.getByText("You are on the waitlist"));
}

/** Opens the wallet page and waits until it has read the contract. */
export async function openTickets(page: Page) {
  await page.goto("/tickets");
  await expect(page.getByText("Reading your tickets from the contract")).toBeHidden({ timeout: 30_000 });
}

/** Hands the ticket back from the wallet page, which calls it "Resell at face value". The seat goes to the next person in line, or back on sale. */
export async function handBack(page: Page) {
  await page.getByRole("button", { name: "Cannot make it? Resell at face value" }).click();
  await page.getByRole("button", { name: /^Resell for \$\d+$/ }).click();
  await expect(page.getByText(/^Refunded \$\d+\./)).toBeVisible({ timeout: 60_000 });
}
