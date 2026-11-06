import type { Page } from "@playwright/test";
import { SHOWS } from "../support/catalog";
import type { Chain } from "../support/chain";
import { expect, test } from "../support/fixtures";
import { deviceWalletAddress } from "../support/page";

/**
 * Checks of the World stubs themselves, through the app's real "Verify and buy" button: the refusals a test can
 * ask for, and that each one stops the purchase before any money moves. These use the current ticket panel,
 * and will need new words when v2 changes it. The stubs do not.
 */

const show = SHOWS.open;

test.beforeEach(async ({ page }) => {
  await page.goto(`/e/${show.slug}`);
  await expect(page.getByRole("button", { name: "Verify and buy" })).toBeVisible();
});

async function expectNothingBought(args: { page: Page; chain: Chain; person: string }) {
  const wallet = await deviceWalletAddress(args.page);
  expect(await args.chain.read.ticketOf(show.chainEventId, wallet)).toBeNull();
  expect(await args.chain.read.nullifierUsed(show.chainEventId, args.person)).toBe(false);
  expect(await args.chain.balanceOf(wallet)).toBe(0n);
}

test("World App has no credential for the show", async ({ page, world, worldVerify, chain }) => {
  world.failWith("credential_unavailable");
  await page.getByRole("button", { name: "Verify and buy" }).click();

  await expect(page.getByText("Your World ID does not have the credential this show asks for yet.")).toBeVisible();
  await expect(page.getByText(/nothing was charged/i)).toBeVisible();
  await expectNothingBought({ page, chain, person: world.person });
  expect(await worldVerify.calls(world.person)).toHaveLength(0);
});

test("the person declines in World App", async ({ page, world, chain }) => {
  world.cancel();
  await page.getByRole("button", { name: "Verify and buy" }).click();

  await expect(page.getByText("Verification was cancelled. Nothing was charged.")).toBeVisible();
  await expectNothingBought({ page, chain, person: world.person });
});

test("the person walks away from the prompt", async ({ page, world, chain }) => {
  world.hold();
  await page.getByRole("button", { name: "Verify and buy" }).click();
  await expect(page.getByText("Connect your World ID")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByText("Verification was cancelled. Nothing was charged.")).toBeVisible();
  await expectNothingBought({ page, chain, person: world.person });
});

test("World says the proof does not verify", async ({ page, world, worldVerify, chain }) => {
  await worldVerify.reject(world.person, { code: "invalid_proof", detail: "That proof was not accepted." });
  await page.getByRole("button", { name: "Verify and buy" }).click();

  await expect(page.getByText("That proof was not accepted.")).toBeVisible();
  await expectNothingBought({ page, chain, person: world.person });
  const calls = await worldVerify.calls(world.person);
  expect(calls.map((call) => call.answered)).toEqual(["reject"]);
});

test("World cannot be reached", async ({ page, world, worldVerify, chain }) => {
  await worldVerify.unreachable(world.person);
  await page.getByRole("button", { name: "Verify and buy" }).click();

  await expect(page.getByText("Could not reach World to check the proof.")).toBeVisible();
  await expectNothingBought({ page, chain, person: world.person });
});

test("a declined prompt can be tried again", async ({ page, world, chain }) => {
  world.cancel({ once: true });
  await page.getByRole("button", { name: "Verify and buy" }).click();
  await expect(page.getByText("Verification was cancelled. Nothing was charged.")).toBeVisible();

  await page.getByRole("button", { name: "Try again" }).click();
  await page.getByRole("button", { name: "Verify and buy" }).click();
  await expect(page.getByRole("link", { name: /Open your ticket/ })).toBeVisible({ timeout: 60_000 });

  expect(world.requests.map((request) => request.behaviour.kind)).toEqual(["fail", "complete"]);
  expect(await chain.read.nullifierUsed(show.chainEventId, world.person)).toBe(true);
});
