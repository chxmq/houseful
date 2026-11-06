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
    await page.getByRole("button", { name: "Continue without a seat" }).click();
    return;
  }
  await page.getByRole("button", { name: `Seat ${seat}`, exact: true }).click();
  await expect(page.getByText(`Seat ${seat} selected`)).toBeVisible();
}

/** USDT is "Pay now". "Pay with Ethereum" swaps the ETH for the face value inside the same transaction. */
export async function choosePay(page: Page, method: "usdt" | "eth") {
  await page.getByRole("button", { name: method === "usdt" ? "Pay now" : "Pay with Ethereum" }).click();
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
  await page.getByRole("button", { name: /^Get (tickets|Seat \d+)$/ }).click();
  await expectDoneOrRefused(page, page.getByRole("link", { name: "Open your ticket" }));
}

/** Clicks the button of a sold out show and waits for a place in line. */
export async function joinWaitlist(page: Page) {
  await page.getByRole("button", { name: "Join the waitlist" }).click();
  await expectDoneOrRefused(page, page.getByText("You are on the waitlist"));
}

/** Opens the wallet page and waits until it has read the contract. */
export async function openTickets(page: Page) {
  await page.goto("/tickets");
  await expect(page.getByText("Reading your tickets from the contract")).toBeHidden({ timeout: 30_000 });
}

/** Hands the ticket back from the wallet page. The seat goes to the next person in line, or back on sale. */
export async function handBack(page: Page) {
  await page.getByRole("button", { name: "Cannot make it? Hand it back" }).click();
  await page.getByRole("button", { name: /^Hand back for \$\d+$/ }).click();
  await expect(page.getByText(/^Refunded \$\d+\./)).toBeVisible({ timeout: 60_000 });
}
