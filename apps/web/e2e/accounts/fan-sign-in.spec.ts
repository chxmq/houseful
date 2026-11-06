/**
 * A fan's account is a World ID. These specs sign in through the real screens, with the World App played by the
 * harness, and check the account menu, signing out, and that one person always reaches the same account.
 */
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";
import { signInFan } from "../support/auth";
import { test, expect } from "../support/fixtures";
import { expectNoHorizontalScroll } from "../support/page";
import { accountMenu, linkWallet, signOut, walletRow } from "./account-page";

test("a fan signs in with World ID, sees the account menu, signs out and signs back in", async ({ page, world }) => {
  // Signed out, the login page says what the account is and the header offers "Sign in".
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();
  await expect(
    page.getByText("Your World ID is the account. No email, no password. One human, one place to keep tickets and wallets."),
  ).toBeVisible();
  await expect(accountMenu(page).getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(accountMenu(page).getByRole("button", { name: "Sign out" })).toHaveCount(0);

  // The fan approves in World App. The page asked for a Selfie Check and nothing else.
  const first = await signInFan(page, world);
  expect(world.requests).toHaveLength(1);
  expect(world.requests[0].asked?.action).toBe("houseful-login");
  expect(world.requests[0].asked?.credentials.map((credential) => credential.identifier)).toEqual(["selfie"]);

  // The account page says how the fan is signed in, and the menu has swapped "Sign in" for "Account" and "Sign out".
  await expect(page.getByText("Signed in with World ID. Credential: selfie. Tickets follow this person, not a phone.")).toBeVisible();
  await expect(accountMenu(page).getByRole("link", { name: "Account" })).toHaveAttribute("href", "/account");
  await expect(accountMenu(page).getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(accountMenu(page).getByRole("link", { name: "Sign in" })).toHaveCount(0);
  const cookies = await page.context().cookies();
  expect(cookies.find((cookie) => cookie.name === "hf_session")).toMatchObject({ httpOnly: true, sameSite: "Lax" });
  // Soft: on a 375px phone the signed-in header is wider than the window, and the menu is part of it.
  await expectNoHorizontalScroll(page, { soft: true });

  // Signing out ends the session and sends the fan to the sign-in page, where the account pages are closed again.
  await signOut(page);
  await expect(page).toHaveURL(/\/login$/);
  await expect(accountMenu(page).getByRole("link", { name: "Sign in" })).toBeVisible();
  expect((await page.context().cookies()).some((cookie) => cookie.name === "hf_session")).toBe(false);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login\?next=%2Faccount&reason=signin$/);
  await expect(page.getByText("Sign in with World ID to continue.")).toBeVisible();

  // Signing in again as the same person opens the same account.
  const again = await signInFan(page, world);
  expect(again.accountId).toBe(first.accountId);
  await expect(accountMenu(page).getByRole("button", { name: "Sign out" })).toBeVisible();
});

test("the same World person reaches the same account on another phone, and another person gets another", async ({
  page,
  world,
  device,
}) => {
  const linked = privateKeyToAddress(generatePrivateKey());
  const first = await signInFan(page, world);
  // The app names the account after the person's nullifier, so the id is that number in hex.
  expect(first.accountId).toBe(`0x${BigInt(`0x${first.person.slice(4)}`).toString(16)}`);
  await linkWallet(page, linked);

  // The same person on a second phone signs in to the account the first phone is in, and finds its wallet.
  const second = await device({ person: world.person });
  const onSecondPhone = await signInFan(second.page, second.world);
  expect(onSecondPhone.person).toBe(first.person);
  expect(onSecondPhone.accountId).toBe(first.accountId);
  await expect(walletRow(second.page, linked)).toBeVisible();

  // Another person is another account, with nothing linked yet.
  const stranger = await device();
  const other = await signInFan(stranger.page, stranger.world);
  expect(other.person).not.toBe(first.person);
  expect(other.accountId).not.toBe(first.accountId);
  await expect(stranger.page.getByText("No wallets linked yet.")).toBeVisible();
  await expect(walletRow(stranger.page, linked)).toHaveCount(0);

  // One phone can also change person: the next World prompt on the first phone is answered by the stranger, and the
  // sign-in replaces the first person's session with the stranger's account.
  await signOut(page);
  const switched = await signInFan(page, world, { person: other.person });
  expect(switched.accountId).toBe(other.accountId);
  await expect(page.getByText("No wallets linked yet.")).toBeVisible();
});
