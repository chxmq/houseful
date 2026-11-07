/**
 * A host's account is a wallet. These specs sign in through the real screen with an injected wallet that signs the
 * app's challenge, and check what the host sees afterwards and what happens when the wallet will not sign.
 */
import { hexToString, type Address, type Hex } from "viem";
import { generatePrivateKey } from "viem/accounts";
import { signInHost } from "../support/auth";
import { test, expect } from "../support/fixtures";
import { accountMenu, signInMessage, signOut } from "./account-page";

/** The way the host console writes an address: the first 6 and last 4 characters. */
const shortAddress = (address: Address) => `${address.slice(0, 6)}…${address.slice(-4)}`;

test("a host signs in by signing the app's challenge with a wallet", async ({ page, wallet }) => {
  const injected = await wallet();

  await page.goto("/host/login");
  await expect(page.getByRole("heading", { name: "Host sign in", level: 1 })).toBeVisible();
  await expect(page.getByText("Hosts sign a message with the payout wallet. Fans use World ID on a separate login.")).toBeVisible();
  await expect(accountMenu(page).getByRole("link", { name: "Sign in" })).toBeVisible();

  const { accountId } = await signInHost(page, injected);

  // The wallet was asked to connect and then to sign one plain message that carries a one-time challenge.
  const signing = injected.requests.filter((request) => request.method === "personal_sign");
  expect(injected.requests.map((request) => request.method)).toContain("eth_requestAccounts");
  expect(signing).toHaveLength(1);
  const [signed, signer] = signing[0].params as [Hex, Address];
  expect(hexToString(signed)).toMatch(
    /^Houseful host sign-in\nURI: https?:\/\/[^\n]+\nAddress: 0x[0-9a-f]{40}\nNonce: [0-9a-f]{48}\nIssued At: \S+\nExpiration Time: \S+$/,
  );
  expect(signer.toLowerCase()).toBe(injected.address.toLowerCase());

  // The host account is the wallet, and the menu says "Host console", with no fan account behind it.
  expect(accountId).toBe(injected.address.toLowerCase());
  await expect(accountMenu(page).getByRole("link", { name: "Host console" })).toHaveAttribute("href", "/host");
  await expect(accountMenu(page).getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(accountMenu(page).getByRole("link", { name: "Account" })).toHaveCount(0);
  expect((await page.context().cookies()).find((cookie) => cookie.name === "hf_session")).toMatchObject({ httpOnly: true });
});

test("signing out closes the console, and the same wallet signs back in to the same host account", async ({ page }) => {
  const key = generatePrivateKey();
  const first = await signInHost(page, { privateKey: key });

  await signOut(page);
  await expect(page).toHaveURL(/\/host\/login$/);
  await page.goto("/host");
  await expect(page).toHaveURL(/\/host\/login\?next=%2Fhost&reason=signin$/);
  await expect(page.getByText("Sign the host challenge with your wallet.")).toBeVisible();

  // The context already holds the wallet, so it signs again. A challenge is made for each sign-in.
  const again = await signInHost(page, first.wallet);
  expect(again.accountId).toBe(first.accountId);
  expect(first.wallet.requests.filter((request) => request.method === "personal_sign")).toHaveLength(2);
});

test("another wallet is another host account", async ({ page, device }) => {
  const first = await signInHost(page);
  const otherPhone = await device();
  const second = await signInHost(otherPhone.page);
  expect(second.accountId).not.toBe(first.accountId);
  expect(second.accountId).toBe(second.wallet.address.toLowerCase());
});

test("the host console says it is hosting as the wallet that signed in", async ({ page }) => {
  const { wallet } = await signInHost(page);

  await expect(page.getByText(`Hosting as ${shortAddress(wallet.address)}`)).toBeVisible({ timeout: 8_000 });
});

test.describe("when the wallet does not sign", () => {
  test("a browser with no wallet is told to connect one", async ({ page }) => {
    await page.goto("/host/login");
    await page.getByRole("button", { name: "Sign in with wallet" }).click();

    await expect(signInMessage(page, "Sign in with wallet")).toHaveText("Connect a browser wallet to sign in as a host.");
    await expect(page).toHaveURL(/\/host\/login$/);
    expect((await page.context().cookies()).some((cookie) => cookie.name === "hf_session")).toBe(false);
  });

  test("turning the signature down leaves the host signed out, and trying again works", async ({ page, wallet }) => {
    const injected = await wallet();
    await page.goto("/host/login");

    injected.rejectNext("personal_sign");
    await page.getByRole("button", { name: "Sign in with wallet" }).click();
    await expect(signInMessage(page, "Sign in with wallet")).toHaveText(
      "The wallet did not sign. Try again when you are ready.",
    );
    await expect(page).toHaveURL(/\/host\/login$/);
    expect((await page.context().cookies()).some((cookie) => cookie.name === "hf_session")).toBe(false);
    await page.goto("/host");
    await expect(page).toHaveURL(/\/host\/login\?next=%2Fhost&reason=signin$/);

    // The same wallet then signs, and the host gets in.
    await signInHost(page, injected);
  });

  test("turning the connection down leaves the host signed out", async ({ page, wallet }) => {
    const injected = await wallet();
    await page.goto("/host/login");

    injected.rejectNext("eth_requestAccounts");
    await page.getByRole("button", { name: "Sign in with wallet" }).click();
    await expect(signInMessage(page, "Sign in with wallet")).toHaveText(
      "The wallet did not sign. Try again when you are ready.",
    );
    expect(injected.requests.some((request) => request.method === "personal_sign")).toBe(false);
    expect((await page.context().cookies()).some((cookie) => cookie.name === "hf_session")).toBe(false);
  });
});
