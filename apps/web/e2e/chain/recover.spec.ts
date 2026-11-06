/**
 * Done-means 10: a ticket moves to a new phone, and the code on the old phone stops working at the door.
 *
 * The app's way to do this is on the wallet page: export the wallet on the old phone, import it on the new one, and
 * press "Move it to this phone", which puts the new phone's key on the ticket. The contract also has `recoverTicket`
 * for a brand new wallet proved with World ID, but no page calls it (ticket-actions.ts defines it, and the verify
 * route only signs buy, join and claim), so there is nothing to drive for that.
 */
import { test, expect } from "../support/fixtures";
import { deviceWalletAddress, deviceWalletKey } from "../support/page";
import { answer, copyDoorCode, scan, syncDoor } from "./door";
import { buyTicket, choosePay, openShow, openTickets, pickSeat } from "./helpers";
import { listShow } from "./host";

test("moving a ticket to a new phone stops the old code and admits the new one", async ({ page, context, device, chain }) => {
  test.setTimeout(150_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  // The fan buys on the old phone and copies the code the door would be shown.
  const show = await listShow((await device()).page, chain, { capacity: 5 });
  await openShow(page, show.slug);
  await pickSeat(page);
  await choosePay(page, "usdt");
  await buyTicket(page);
  const wallet = await deviceWalletAddress(page);
  const ticketId = await chain.read.ticketOf(show.chainEventId, wallet);
  expect(ticketId).not.toBeNull();
  const ticketNo = `No. ${String(ticketId! + 1).padStart(4, "0")}`;
  expect(await chain.read.generationOf(show.chainEventId, ticketId!)).toBe(0);
  await openTickets(page);
  const oldCode = await copyDoorCode(page);

  // The old phone exports its wallet.
  await page.getByRole("button", { name: "Export wallet" }).click();
  const secret = (await page.locator("pre").innerText()).trim();
  expect(secret).toBe(await deviceWalletKey(page));

  // The new phone has its own wallet and sees nothing, until it imports the old phone's.
  const newPhone = await device();
  await newPhone.context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openTickets(newPhone.page);
  await expect(newPhone.page.getByText("Nothing booked yet")).toBeVisible();
  await newPhone.page.getByLabel("Import on this phone").fill(secret);
  await newPhone.page.getByRole("button", { name: "Import and reload" }).click();
  await expect(newPhone.page.getByText("The door key on this ticket belongs to another phone.")).toBeVisible();
  expect(await deviceWalletAddress(newPhone.page)).toBe(wallet);

  // Moving the ticket puts the new phone's key on it, and the new phone shows a live code.
  await newPhone.page.getByRole("button", { name: "Move it to this phone" }).click();
  await expect(newPhone.page.getByText("This phone is now the key for your ticket.")).toBeVisible();
  await expect(newPhone.page.getByText(/^New code in \d+s$/)).toBeVisible();
  expect(await chain.read.generationOf(show.chainEventId, ticketId!)).toBe(1);

  // The door syncs after the move, so it knows the old key is out. The old code is turned away and the new one is let in.
  const door = await device();
  await syncDoor(door.page, show.slug);
  const newCode = await copyDoorCode(newPhone.page);
  expect(newCode).not.toBe(oldCode);

  await scan(door.page, oldCode);
  await expect(answer(door.page)).toContainText(/No\s*entry/);
  await expect(answer(door.page)).not.toContainText("Code expired"); // refused because the key moved, not because the code is old
  await expect(answer(door.page)).toBeHidden();

  await scan(door.page, newCode);
  await expect(answer(door.page)).toContainText("Admit");
  await expect(answer(door.page)).toContainText(ticketNo);
});
