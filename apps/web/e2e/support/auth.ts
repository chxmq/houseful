/**
 * Signing in through the app's own screens, so a spec that needs a signed-in fan or host starts the way a person does.
 *
 * A fan signs in at /login with World ID. The harness plays the World App (support/world-bridge.ts) and answers as the
 * phone's person, or as another person when the spec says so. A host signs in at /host/login by signing the app's
 * challenge with an injected wallet (support/fake-wallet.ts). Neither helper sets a cookie or calls the API itself:
 * the page, IDKit, the stubs and the app's server all run, and the session is the cookie the app sets.
 */
import { expect, type Page, type Response } from "@playwright/test";
import type { Hex } from "viem";
import { FakeWallet } from "./fake-wallet";
import { toCanonicalNullifier, type WorldBridge } from "./world-bridge";

export type SignedInFan = {
  /** The nullifier that approved the sign-in, in World's nil_ form. */
  person: string;
  /** The account id the app answered with. One person always gets the same one. */
  accountId: string;
};

export type SignedInHost = {
  /** The injected wallet that signed the challenge. */
  wallet: FakeWallet;
  /** The account id the app answered with: the wallet's address in lower case. */
  accountId: string;
};

/** What the app's sign-in routes answer: an account on success, or the words shown to the person on failure. */
type LoginAnswer = { ok?: boolean; accountId?: string; error?: string };

async function accountIdFrom(answer: Promise<Response>, what: string): Promise<string> {
  const res = await answer;
  const body = (await res.json().catch(() => ({}))) as LoginAnswer;
  if (!res.ok() || !body.accountId) throw new Error(`The app refused the ${what} (HTTP ${res.status()}): ${body.error ?? "no reason given"}`);
  return body.accountId;
}

/**
 * Signs a fan in at /login and waits for the account page. `person` picks who approves in World App, for a spec
 * that needs two phones to be one human or a particular human. Without it the phone's own person approves, so each
 * test gets a new account. Only this prompt is answered as `person`: later prompts on the phone are answered
 * as the phone's own person again.
 */
export async function signInFan(page: Page, world: WorldBridge, options: { person?: string | bigint } = {}): Promise<SignedInFan> {
  const person = options.person === undefined ? world.person : toCanonicalNullifier(options.person);
  if (options.person !== undefined) world.completeAs(person, { once: true });

  await page.goto("/login");
  const answer = page.waitForResponse((res) => new URL(res.url()).pathname === "/api/account/login");
  await page.getByRole("button", { name: "Sign in with World ID" }).click();
  const accountId = await accountIdFrom(answer, "World ID sign-in");

  await page.waitForURL("**/account");
  await expect(page.getByRole("heading", { name: "You", level: 1 })).toBeVisible();
  return { person, accountId };
}

/**
 * Signs a host in at /host/login by signing the app's challenge with an injected wallet, and waits for the host
 * console. Pass the wallet when the spec made one with the `wallet` fixture or `device().wallet()`, or `{ privateKey }`
 * to have this phone get a wallet with that key (a new one when the key is left out). A browser context holds one
 * wallet, so a phone that already has one must be given it.
 */
export async function signInHost(page: Page, host: FakeWallet | { privateKey?: Hex } = {}): Promise<SignedInHost> {
  const wallet = host instanceof FakeWallet ? host : await FakeWallet.install(page.context(), host);

  await page.goto("/host/login");
  const answer = page.waitForResponse((res) => new URL(res.url()).pathname === "/api/account/host-login");
  await page.getByRole("button", { name: "Sign in with wallet" }).click();
  const accountId = await accountIdFrom(answer, "wallet sign-in");

  await page.waitForURL("**/host");
  await expect(page.getByRole("heading", { name: "Host a show", level: 1 })).toBeVisible();
  return { wallet, accountId };
}
