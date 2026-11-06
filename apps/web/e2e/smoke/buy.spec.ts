import { SHOWS } from "../support/catalog";
import { expect, test } from "../support/fixtures";
import { deviceWalletAddress } from "../support/page";

test("a fan buys a ticket, with World ID answered by the stub", async ({ page, world, worldVerify, chain }) => {
  const show = SHOWS.open;
  await page.goto(`/e/${show.slug}`);

  // The button appears once the panel has read the contract. The wallet in this browser is new and empty.
  const buy = page.getByRole("button", { name: "Verify and buy" });
  await expect(buy).toBeVisible();
  const wallet = await deviceWalletAddress(page);
  expect(await chain.balanceOf(wallet)).toBe(0n);
  const from = await chain.blockNumber();

  await buy.click();
  await expect(page.getByRole("link", { name: /Open your ticket/ })).toBeVisible({ timeout: 60_000 });

  // The chain agrees: this wallet holds a ticket, and this person's one place for the show is used.
  expect(await chain.read.ticketOf(show.chainEventId, wallet)).not.toBeNull();
  expect(await chain.read.nullifierUsed(show.chainEventId, world.person)).toBe(true);
  expect(await chain.balanceOf(wallet)).toBeGreaterThan(0n);

  // The prompt the app opened asked for a Selfie Check, and the app's server checked the proof with World once.
  expect(world.requests).toHaveLength(1);
  expect(world.requests[0].asked?.credentials.map((c) => c.identifier)).toEqual(["selfie"]);
  expect(world.requests[0].asked?.action).toBe(`ticket:${show.slug}`);
  expect(await worldVerify.calls(world.person)).toHaveLength(1);

  // The event page shows the ticket once it reads the chain again.
  await chain.untilShown(
    page,
    { eventName: "TicketBought", fromBlock: from, where: (log) => log.args.owner?.toLowerCase() === wallet.toLowerCase() },
    () => expect(page.getByText("You have a ticket for this show")).toBeVisible(),
    { reload: true },
  );
});
