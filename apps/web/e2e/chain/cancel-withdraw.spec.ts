/**
 * Done-means 9: when the host cancels, every fan refunds themselves from the contract, and once a show has ended
 * the host withdraws the proceeds in USDT.
 *
 * Both tests list a show of their own from a host phone and buy from another phone, so they do not touch seed data.
 */
import { housefulAbi } from "@houseful/contracts";
import { signInFan } from "../support/auth";
import { test, expect } from "../support/fixtures";
import { deviceWalletAddress } from "../support/page";
import { buyTicket, choosePay, openShow, openTickets, pickSeat } from "./helpers";
import { cancelHostedShow, hostPhone, listShow, withdrawHostedProceeds } from "./host";

test.describe("cancel and withdraw", () => {
  test.describe("with motion allowed", () => {
    // The wallet page confirms a refund only from the end of the stub's tearing animation, which does not run when the
    // phone asks for reduced motion, the default for these runs. waitlist-refund.spec.ts keeps that gap in view.
    test.use({ reducedMotion: "no-preference" });

    test("the host cancels and the fan claims the refund in USDT", async ({ page, world, device, chain }) => {
      const host = await hostPhone(device);
      const show = await listShow(host.page, chain, { priceUsd: 9, capacity: 5 });

      await signInFan(page, world);
      await openShow(page, show.slug);
      await pickSeat(page);
      await choosePay(page, "usdt");
      await buyTicket(page);
      const fan = await deviceWalletAddress(page);
      expect((await chain.read.ledger(show.chainEventId)).proceeds).toBe(show.price);

      await cancelHostedShow(host.page, show.title);
      expect((await chain.read.eventInfo(show.chainEventId)).cancelled).toBe(true);

      // The fan's ticket is marked cancelled and offers the refund. Nobody else has to do anything.
      await openTickets(page);
      await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
      const before = await chain.usdtBalanceOf(fan);
      await page.getByRole("button", { name: "Claim $9" }).click();
      await expect(page.getByText(`${show.title} was cancelled. $9 is back in this phone's wallet.`)).toBeVisible();

      // The face value is in the fan's USDT, the ticket is gone, and the contract holds nothing for the show.
      expect(await chain.usdtBalanceOf(fan)).toBe(before + show.price);
      expect(await chain.read.ticketOf(show.chainEventId, fan)).toBeNull();
      expect(await chain.read.ledger(show.chainEventId)).toEqual({ proceeds: 0n, escrow: 0n });
    });
  });

  test("after the show ends the host withdraws the proceeds in USDT", async ({ page, world, device, chain }) => {
    test.setTimeout(150_000);
    const host = await hostPhone(device);
    // A show that is over about half an hour from now, with one ticket sold.
    const show = await listShow(host.page, chain, { priceUsd: 9, capacity: 5, endsSoon: true });
    await signInFan(page, world);
    await openShow(page, show.slug);
    await pickSeat(page);
    await choosePay(page, "usdt");
    await buyTicket(page);
    expect((await chain.read.ledger(show.chainEventId)).proceeds).toBe(show.price);

    // While the show is still to come the host console offers no withdrawal, only the cancel link, and the
    // contract itself refuses the call.
    await host.page.goto("/host");
    await expect(host.page.getByRole("link", { name: show.title })).toBeVisible();
    await expect(host.page.getByRole("button", { name: "Withdraw proceeds" })).toHaveCount(0);
    await expect(host.page.getByRole("button", { name: "Cancel this show" })).toBeVisible();
    await expect(
      chain.publicClient.simulateContract({
        account: show.host,
        address: chain.contract,
        abi: housefulAbi,
        functionName: "withdrawProceeds",
        args: [BigInt(show.chainEventId)],
      }),
    ).rejects.toThrow("EventNotEnded");

    // The show ends. The chain clock is moved for this part only and put back afterwards.
    const { endsAt } = await chain.read.eventInfo(show.chainEventId);
    await chain.atTime(endsAt + 60n, async () => {
      const before = await chain.usdtBalanceOf(show.host);
      await withdrawHostedProceeds(host.page, show.title);

      // The proceeds of the one ticket reached the host in USDT, and there is nothing left to take.
      expect(await chain.usdtBalanceOf(show.host)).toBe(before + show.price);
      expect((await chain.read.eventInfo(show.chainEventId)).proceedsWithdrawn).toBe(true);
      expect((await chain.read.ledger(show.chainEventId)).proceeds).toBe(0n);
    });
  });
});
