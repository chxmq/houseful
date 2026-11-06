import { SHOWS } from "../support/catalog";
import { expect, test } from "../support/fixtures";
import { deviceWalletAddress } from "../support/page";

test("the same person on a second wallet is refused, and nothing is charged", async ({ page, world, device, chain }) => {
  const show = SHOWS.open;

  // One person buys on this phone.
  await page.goto(`/e/${show.slug}`);
  await page.getByRole("button", { name: "Verify and buy" }).click();
  await expect(page.getByRole("link", { name: /Open your ticket/ })).toBeVisible({ timeout: 60_000 });

  // The same human opens the show on another phone, which has its own built-in wallet.
  const other = await device({ person: world.person });
  await other.page.goto(`/e/${show.slug}`);
  await other.page.getByRole("button", { name: "Verify and buy" }).click();

  await expect(other.page.getByText(/This person already holds a ticket or a waitlist place for this show/)).toBeVisible({
    timeout: 30_000,
  });
  await expect(other.page.getByText(/Each person gets one ticket or one waitlist place per show/)).toBeVisible();
  await expect(other.page.getByRole("button", { name: "Try again" })).toBeVisible();

  // The refusal came before any money moved: the second wallet has no ticket and was never topped up.
  const second = await deviceWalletAddress(other.page);
  expect(second).not.toBe(await deviceWalletAddress(page));
  expect(await chain.read.ticketOf(show.chainEventId, second)).toBeNull();
  expect(await chain.balanceOf(second)).toBe(0n);
});
