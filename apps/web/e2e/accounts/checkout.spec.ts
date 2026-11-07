/**
 * What a purchase needs from the account. A signed-in fan's World ID covers a show that asks for a Selfie Check, so
 * checkout opens no World prompt. A fan who is not signed in is asked at checkout. One person gets one place per show,
 * whichever phone they buy on.
 */
import { buyTicket, choosePay, openShow, pickSeat, refusal } from "../chain/helpers";
import { hostPhone, listShow } from "../chain/host";
import { signInFan } from "../support/auth";
import { test, expect } from "../support/fixtures";
import { deviceWalletAddress } from "../support/page";

test("a signed-in fan buys with the account, and World is not asked again at checkout", async ({
  page,
  world,
  worldVerify,
  device,
  chain,
}) => {
  const show = await listShow((await hostPhone(device)).page, chain, { capacity: 5 });
  const { person } = await signInFan(page, world);

  const attested = page.waitForResponse((res) => new URL(res.url()).pathname === "/api/attest");
  await openShow(page, show.slug);
  await pickSeat(page);
  await choosePay(page, "usdt");
  await buyTicket(page);

  // The attestation came from the session, and the only World prompt the phone saw was the sign-in.
  expect(await (await attested).json()).toMatchObject({ fromSession: true, credential: "selfie" });
  expect(world.requests).toHaveLength(1);
  expect((await worldVerify.calls(person)).map((call) => call.action)).toEqual(["houseful-login"]);

  // The ticket is on chain for the built-in wallet, and the person's nullifier is spent for this show.
  expect(await chain.read.ticketOf(show.chainEventId, await deviceWalletAddress(page))).not.toBeNull();
  expect(await chain.read.nullifierUsed(show.chainEventId, person)).toBe(true);
});

test("a fan who is not signed in is asked for World at checkout", async ({ page, world, worldVerify, device, chain }) => {
  const show = await listShow((await hostPhone(device)).page, chain, { capacity: 5 });

  await openShow(page, show.slug);
  await pickSeat(page);
  await choosePay(page, "usdt");
  await buyTicket(page);

  // One prompt, for this show's own action, and the verify call carried the same action.
  expect(world.requests).toHaveLength(1);
  expect(world.requests[0].asked?.action).toBe(`ticket:${show.slug}`);
  expect((await worldVerify.calls(world.person)).map((call) => call.action)).toEqual([`ticket:${show.slug}`]);
  expect(await chain.read.ticketOf(show.chainEventId, await deviceWalletAddress(page))).not.toBeNull();
});

test("the same person is refused a second place for a show on another phone", async ({ page, world, device, chain }) => {
  const show = await listShow((await hostPhone(device)).page, chain, { capacity: 5 });
  await signInFan(page, world);
  await openShow(page, show.slug);
  await pickSeat(page);
  await choosePay(page, "usdt");
  await buyTicket(page);

  // The same person signs in on a second phone, with a built-in wallet of its own, and tries for another ticket.
  const second = await device({ person: world.person });
  await signInFan(second.page, second.world);
  await openShow(second.page, show.slug);
  await pickSeat(second.page);
  await choosePay(second.page, "usdt");
  await second.page.getByRole("button", { name: "Get tickets" }).click();

  await expect(refusal(second.page)).toHaveText("This person already holds a ticket or a waitlist place for this show.");
  await expect(second.page.getByText("Each person gets one ticket or one waitlist place per show.")).toBeVisible();
  expect(await chain.read.ticketOf(show.chainEventId, await deviceWalletAddress(second.page))).toBeNull();
});
