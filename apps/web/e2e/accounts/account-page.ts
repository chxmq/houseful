/**
 * What the account specs do on the app's own pages: the account menu in the header, and the wallet list on /account.
 */
import { expect, type Locator, type Page } from "@playwright/test";
import type { Address } from "viem";
import { deviceWalletAddress } from "../support/page";

/** The account menu: "Sign in" when signed out, "Account" or "Host console" and "Sign out" when signed in. */
export const accountMenu = (page: Page): Locator => page.getByRole("banner");

/**
 * Presses "Sign out" in the account menu. On a 375px phone the signed-in header is wider than the window and the
 * "Account" link covers the button, so a tap cannot land on it. That is recorded as a soft failure, and the press is
 * sent to the button itself so the rest of the spec still runs.
 */
export async function signOut(page: Page) {
  const button = accountMenu(page).getByRole("button", { name: "Sign out" });
  const tappable = await button.click({ trial: true, timeout: 3_000 }).then(
    () => true,
    () => false,
  );
  expect.soft(tappable, "the account menu's Sign out can be tapped").toBe(true);
  if (tappable) await button.click();
  else await button.dispatchEvent("click");
}

/** The row of one linked wallet. The page shows the address in lower case, cut to its first 8 and last 6 characters. */
export function walletRow(page: Page, address: Address): Locator {
  const lower = address.toLowerCase();
  return page.getByRole("listitem").filter({ hasText: `${lower.slice(0, 8)}…${lower.slice(-6)}` });
}

/** Links an address from the form on /account and waits until the wallet is in the list. */
export async function linkWallet(page: Page, address: Address) {
  await page.getByLabel("Link a wallet address").fill(address);
  await page.getByRole("button", { name: "Link", exact: true }).click();
  await expect(walletRow(page, address)).toBeVisible();
}

/** The red line the sign-in pages show under their button when a sign-in did not go through. */
export const signInMessage = (page: Page, button: "Sign in with World ID" | "Sign in with wallet"): Locator =>
  page.getByRole("button", { name: button }).locator("xpath=following-sibling::p[1]");

/** Opens the wallet page, which makes the wallet built into this phone if there is none yet, and returns its address. */
export async function openPhoneWallet(page: Page): Promise<Address> {
  await page.goto("/tickets");
  await expect(page.getByText(/^This phone's wallet 0x/)).toBeVisible();
  return deviceWalletAddress(page);
}
