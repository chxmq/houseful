/**
 * Done-means 7: the ticket shows its seat and a door code that rotates, and the door admits it once, turns away
 * a repeat, turns away a code that is too old, and goes on doing so with no network.
 */
import { DOOR_PAYLOAD_LENGTH } from "@houseful/pass";
import { signInFan } from "../support/auth";
import { test, expect } from "../support/fixtures";
import { deviceWalletAddress, expectNoHorizontalScroll } from "../support/page";
import { answer, copyDoorCode, scan, syncDoor } from "./door";
import { buyTicket, choosePay, openShow, openTickets, pickSeat } from "./helpers";
import { hostPhone, listShow } from "./host";

test("the ticket shows its seat and a rotating code, and the door admits it once", async ({ page, world, context, device, chain }) => {
  test.setTimeout(150_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  // A seated show of its own, and a signed-in fan with seat 4. The door scanner is open to staff without an account.
  const show = await listShow((await hostPhone(device)).page, chain, { seated: true, capacity: 10 });
  await signInFan(page, world);
  await openShow(page, show.slug);
  await pickSeat(page, 4);
  await choosePay(page, "usdt");
  await buyTicket(page);

  const fan = await deviceWalletAddress(page);
  const ticketId = await chain.read.ticketOf(show.chainEventId, fan);
  expect(ticketId).not.toBeNull();
  const ticketNo = `No. ${String(ticketId! + 1).padStart(4, "0")}`;

  // The wallet page has the seat and the code, and fits the screen.
  await openTickets(page);
  await expect(page.getByText("Seat 4", { exact: true })).toBeVisible();
  await expect(page.getByText(/^New code in \d+s$/)).toBeVisible();
  // Soft, so the door still gets checked: signed in, the header's account menu is wider than a 375px phone.
  await expectNoHorizontalScroll(page, { soft: true });
  const code = await copyDoorCode(page);
  expect(code).toMatch(new RegExp(`^[A-Za-z0-9_-]{${DOOR_PAYLOAD_LENGTH}}$`));

  // The door is another phone. It syncs the show while it has signal.
  const door = await device();
  await syncDoor(door.page, show.slug);

  // The first scan lets the ticket in.
  await scan(door.page, code);
  await expect(answer(door.page)).toContainText("Admit");
  await expect(answer(door.page)).toContainText(ticketNo);
  await expect(answer(door.page)).toBeHidden();

  // The same code a second time is a repeat entry.
  await scan(door.page, code);
  await expect(answer(door.page)).toContainText("Already admitted");
  await expect(answer(door.page)).toContainText(`${ticketNo} came in at`);
  await expect(answer(door.page)).toBeHidden();

  // With no network the scanner still checks every code on the phone, even after a reload. The service worker has
  // to hold the page by then, so reload once with signal first.
  await door.page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await door.page.reload();
  await expect(door.page.getByRole("heading", { name: "Ready to scan offline" })).toBeVisible();
  await door.context.setOffline(true);
  await door.page.reload();
  await expect(door.page.getByText(/^No network\. Still checking codes on this device/)).toBeVisible();
  await scan(door.page, code);
  await expect(answer(door.page)).toContainText("Already admitted");
  await expect(answer(door.page)).toBeHidden();

  // The ticket's code rotates, so a screenshot of this one does not last.
  await expect.poll(() => copyDoorCode(page), { timeout: 30_000 }).not.toBe(code);

  // A code from long ago is turned away as a screenshot. The scanner's clock is set a minute and a half ahead,
  // which is the same as the code being that old.
  await door.page.clock.setFixedTime(new Date(Date.now() + 90_000));
  await scan(door.page, code);
  await expect(answer(door.page)).toContainText("Code expired");
  await expect(answer(door.page)).toContainText("Codes change every 20 seconds");
});
