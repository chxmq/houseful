/**
 * Done-means 6: pick a seat and pay in USDT, another fan pays in ETH through the swap, and a seat that was just
 * taken is refused in plain words. Each test lists a seated show of its own, so no test runs out of seats.
 * A host phone lists it and each fan signs in with World ID first, as the app now requires.
 */
import { signInFan } from "../support/auth";
import { test, expect } from "../support/fixtures";
import { deviceWalletAddress, expectNoHorizontalScroll } from "../support/page";
import { buyTicket, choosePay, openShow, openTickets, pickSeat, refusal } from "./helpers";
import { hostPhone, listShow } from "./host";

test.describe("seat and pay", () => {
  test("a fan picks a seat and pays in USDT", async ({ page, world, device, chain }) => {
    const show = await listShow((await hostPhone(device)).page, chain, { seated: true, capacity: 12 });

    await signInFan(page, world);
    await openShow(page, show.slug);
    await expectNoHorizontalScroll(page);
    await pickSeat(page, 7);
    await choosePay(page, "usdt");
    await buyTicket(page);
    await expect(page.getByText("Seat 7", { exact: true })).toBeVisible();

    const fan = await deviceWalletAddress(page);
    const bought = await chain.waitForEvent({
      eventName: "TicketBought",
      where: (log) => log.args.owner?.toLowerCase() === fan.toLowerCase(),
    });
    expect(bought.args.eventId).toBe(BigInt(show.chainEventId));
    expect(bought.args.seat).toBe(7);
    // Paid with the plain button: the buy function, no ETH sent, and the face value in the contract's USDT ledger.
    expect(await chain.callOf(bought.transactionHash)).toEqual({ functionName: "buy", ethSent: 0n });
    expect((await chain.read.ledger(show.chainEventId)).proceeds).toBe(show.price);

    // The wallet page shows the seat as well.
    await openTickets(page);
    await expect(page.getByText("Seat 7", { exact: true })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("another fan pays in ETH through the swap", async ({ page, world, device, chain }) => {
    const show = await listShow((await hostPhone(device)).page, chain, { seated: true, capacity: 12 });

    await signInFan(page, world);
    await openShow(page, show.slug);
    await pickSeat(page, 3);
    await choosePay(page, "eth");
    await buyTicket(page);
    await expect(page.getByText("Seat 3", { exact: true })).toBeVisible();

    const fan = await deviceWalletAddress(page);
    const bought = await chain.waitForEvent({
      eventName: "TicketBought",
      where: (log) => log.args.owner?.toLowerCase() === fan.toLowerCase(),
    });
    expect(bought.args.seat).toBe(3);
    // Paid with the swap button: the ETH function, ETH sent along, and the swap still put the exact face value in the ledger.
    const call = await chain.callOf(bought.transactionHash);
    expect(call.functionName).toBe("buyWithEth");
    expect(call.ethSent).toBeGreaterThan(0n);
    expect((await chain.read.ledger(show.chainEventId)).proceeds).toBe(show.price);
  });

  test("a seat that was just taken is refused in plain words", async ({ page, world, device, chain }) => {
    const show = await listShow((await hostPhone(device)).page, chain, { seated: true, capacity: 12 });
    const rival = await device();
    await signInFan(page, world);
    await signInFan(rival.page, rival.world);

    // The fan picks seat 5 while it is still free.
    await openShow(page, show.slug);
    await pickSeat(page, 5);

    // Someone else takes it first.
    await openShow(rival.page, show.slug);
    await pickSeat(rival.page, 5);
    await buyTicket(rival.page);

    // The fan pays for the seat the page still shows as free.
    await page.getByRole("button", { name: "Get Seat 5" }).click();
    await expect(refusal(page)).toHaveText("Seat 5 was just taken. Pick another.");
    const fan = await deviceWalletAddress(page);
    expect(await chain.read.ticketOf(show.chainEventId, fan)).toBeNull();

    // Trying again shows the seat as taken, and another seat can be bought.
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("button", { name: "Seat 5, taken" })).toBeDisabled();
    await pickSeat(page, 6);
    await buyTicket(page);
    expect(await chain.read.ticketOf(show.chainEventId, fan)).not.toBeNull();
  });
});
