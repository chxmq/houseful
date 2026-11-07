/**
 * Done-means 8: a sold out show has a line. Joining it locks the price, leaving gives it back in USDT, and when
 * the holder hands the seat back it moves to the first person in line in the same transaction.
 */
import type { Page } from "@playwright/test";
import { signInFan } from "../support/auth";
import { SHOWS } from "../support/catalog";
import { test, expect } from "../support/fixtures";
import { deviceWalletAddress } from "../support/page";
import { buyTicket, choosePay, handBack, joinWaitlist, openShow, openTickets, pickSeat } from "./helpers";
import { hostPhone, listShow } from "./host";

/** The row of the public line that belongs to the phone looking at it, marked "you". */
const myPlace = (page: Page) => page.getByRole("listitem").filter({ has: page.getByText("you", { exact: true }) });

test.describe("waitlist and USDT refund", () => {
  test("a fan joins the line of a sold out show and leaves it for a full refund", async ({ page, world, chain }) => {
    const show = SHOWS.soldOut;
    const price = BigInt(show.priceUsd) * 1_000_000n;
    // The seed has moved if this is not the show the catalog says it is.
    expect((await chain.read.eventInfo(show.chainEventId)).metadataURI).toBe(`houseful:event/${show.slug}`);
    const escrowBefore = (await chain.read.ledger(show.chainEventId)).escrow;

    // A sold out show asks for Proof of Human, which a Selfie Check sign-in does not cover, so joining still opens World.
    await signInFan(page, world);
    await openShow(page, show.slug);
    await choosePay(page, "usdt");
    await joinWaitlist(page);

    // The face value left the fan for the contract's escrow, and the fan has a place in the public line.
    const fan = await deviceWalletAddress(page);
    expect(await chain.read.waitlistPositionOf(show.chainEventId, fan)).not.toBeNull();
    expect((await chain.read.ledger(show.chainEventId)).escrow).toBe(escrowBefore + price);
    await page.goto(`/e/${show.slug}/waitlist`);
    await expect(page.getByText("Order checks out")).toBeVisible();
    await expect(myPlace(page)).toContainText("Waiting");

    // Leaving from the wallet page puts the face value back in the fan's USDT.
    const before = await chain.usdtBalanceOf(fan);
    await openTickets(page);
    await page.getByRole("button", { name: "Leave and get a refund" }).click();
    await expect(
      page.getByText(`You left the waitlist for ${show.title}. $${show.priceUsd} is back in your wallet.`),
    ).toBeVisible();
    expect(await chain.usdtBalanceOf(fan)).toBe(before + price);
    expect(await chain.read.waitlistPositionOf(show.chainEventId, fan)).toBeNull();
    expect((await chain.read.ledger(show.chainEventId)).escrow).toBe(escrowBefore);
  });

  test.describe("with motion allowed", () => {
    // The wallet page reports a hand-back only from the end of the stub's tearing animation (onAnimationComplete in
    // ticket-stub.tsx), which does not run when the phone asks for reduced motion, the default for these runs.
    // The last test in this file shows that gap with reduced motion left on.
    test.use({ reducedMotion: "no-preference" });

    test("when the holder hands the seat back it moves to the first in line and the holder is refunded", async ({
      page,
      world,
      device,
      chain,
    }) => {
      test.setTimeout(150_000);
      // A show of its own with one seat, so the line starts empty and the fan is first in it.
      const show = await listShow((await hostPhone(device)).page, chain, { capacity: 1, priceUsd: 6 });

      const holder = await device();
      await signInFan(holder.page, holder.world);
      await openShow(holder.page, show.slug);
      await pickSeat(holder.page);
      await choosePay(holder.page, "usdt");
      await buyTicket(holder.page);
      const holderWallet = await deviceWalletAddress(holder.page);

      // The only seat is gone, so the fan joins the line.
      await signInFan(page, world);
      await openShow(page, show.slug);
      await choosePay(page, "usdt");
      await joinWaitlist(page);
      const fan = await deviceWalletAddress(page);
      expect(await chain.read.waitlistPositionOf(show.chainEventId, fan)).toBe(0);
      expect(await chain.read.ledger(show.chainEventId)).toEqual({ proceeds: show.price, escrow: show.price });

      // The holder hands the ticket back and is told where the seat went.
      const before = await chain.usdtBalanceOf(holderWallet);
      await openTickets(holder.page);
      await handBack(holder.page);
      await expect(
        holder.page.getByText(
          /^Refunded \$6\. Your seat went to 0x[0-9a-fA-F]{4}…[0-9a-fA-F]{4}, next in line, in the same transaction\.$/,
        ),
      ).toBeVisible();

      // The holder got the face value back in USDT and the seat is the fan's. The fan's deposit became the sale.
      expect(await chain.usdtBalanceOf(holderWallet)).toBe(before + show.price);
      expect(await chain.read.ticketOf(show.chainEventId, holderWallet)).toBeNull();
      expect(await chain.read.ticketOf(show.chainEventId, fan)).not.toBeNull();
      expect(await chain.read.waitlistPositionOf(show.chainEventId, fan)).toBeNull();
      expect(await chain.read.ledger(show.chainEventId)).toEqual({ proceeds: show.price, escrow: 0n });

      // The fan's page moves from the line to the ticket, and the line says the seat was given.
      await page.reload();
      await expect(page.getByRole("link", { name: /You have a ticket for this show/ })).toBeVisible();
      await page.goto(`/e/${show.slug}/waitlist`);
      await expect(myPlace(page)).toContainText("Got a seat");

      // A seat that changed hands has no door key yet. Binding this phone gives the fan a live code.
      await openTickets(page);
      await page.getByRole("button", { name: "Bind this phone" }).click();
      await expect(page.getByText("This phone is now the key for your ticket.")).toBeVisible();
      await expect(page.getByText(/^New code in \d+s$/)).toBeVisible();
    });
  });

  test("a hand-back is confirmed on a phone that asks for reduced motion", async ({ device, chain }) => {
    const show = await listShow((await hostPhone(device)).page, chain, { capacity: 1, priceUsd: 6 });
    const holder = await device();
    await signInFan(holder.page, holder.world);
    await openShow(holder.page, show.slug);
    await pickSeat(holder.page);
    await choosePay(holder.page, "usdt");
    await buyTicket(holder.page);
    const holderWallet = await deviceWalletAddress(holder.page);
    const before = await chain.usdtBalanceOf(holderWallet);

    await openTickets(holder.page);
    await holder.page.getByRole("button", { name: "Cannot make it? Resell at face value" }).click();
    await holder.page.getByRole("button", { name: /^Resell for \$\d+$/ }).click();

    // The hand-back itself works: nobody was waiting, so the seat is back on sale and the face value is back in USDT.
    await expect.poll(() => chain.usdtBalanceOf(holderWallet)).toBe(before + show.price);
    expect(await chain.read.ticketOf(show.chainEventId, holderWallet)).toBeNull();

    await expect(holder.page.getByText("Refunded $6. Nobody was waiting, so the seat is back on sale.")).toBeVisible({
      timeout: 8_000,
    });
  });
});
