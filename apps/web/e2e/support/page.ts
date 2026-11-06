import { expect, type Page } from "@playwright/test";
import type { Address, Hex } from "viem";
import { privateKeyToAddress } from "viem/accounts";

/**
 * Fails when the page scrolls sideways. The message names the elements that reach furthest, the usual culprits.
 * With `soft` the test is marked failed but goes on, for a spec that has more to check after this.
 */
export async function expectNoHorizontalScroll(page: Page, options: { soft?: boolean } = {}) {
  const measured = await page.evaluate(() => {
    const clientWidth = document.documentElement.clientWidth;
    const wide = [...document.body.querySelectorAll("*")]
      .map((element) => ({ element, right: Math.round(element.getBoundingClientRect().right) }))
      .filter(({ right }) => right > clientWidth + 1)
      .sort((a, b) => b.right - a.right)
      .slice(0, 5)
      .map(({ element, right }) => {
        const classes = typeof element.className === "string" ? element.className.split(/\s+/).filter(Boolean).slice(0, 3) : [];
        return `${element.tagName.toLowerCase()}${classes.map((name) => `.${name}`).join("")} reaches ${right}px`;
      });
    return { scrollWidth: document.documentElement.scrollWidth, clientWidth, wide };
  });
  const check = options.soft ? expect.soft : expect;
  check(
    measured.scrollWidth,
    `The page scrolls sideways: ${measured.scrollWidth}px of content in a ${measured.clientWidth}px window. Widest: ${measured.wide.join("; ") || "none found"}`,
  ).toBeLessThanOrEqual(measured.clientWidth);
}

/** Where the current app keeps the key of the wallet built into the browser. v2 replaces this with accounts. */
const DEVICE_WALLET_STORAGE_KEY = "houseful.wallet.v1";

/** The key of the browser's built-in wallet. The page must already be on the app, because storage is per origin. */
export async function deviceWalletKey(page: Page): Promise<Hex> {
  const key = await page.evaluate((name) => window.localStorage.getItem(name), DEVICE_WALLET_STORAGE_KEY);
  if (!key) throw new Error("This browser has no built-in wallet yet. Open a page that makes one first.");
  return key as Hex;
}

export async function deviceWalletAddress(page: Page): Promise<Address> {
  return privateKeyToAddress(await deviceWalletKey(page));
}
