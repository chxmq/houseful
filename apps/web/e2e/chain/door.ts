/**
 * The door side of a ticket, driven through the app. The code on a ticket is a QR, "Copy code" puts the same text on
 * the clipboard, and the scanner has a box to paste it into, so a spec carries the code from one phone to another
 * the way a person would.
 */
import { expect, type Page } from "@playwright/test";

/** Copies the code on the ticket and returns it. The clipboard is emptied first, so an older copy is never mistaken for this one. */
export async function copyDoorCode(ticket: Page): Promise<string> {
  const clipboard = () => ticket.evaluate(() => navigator.clipboard.readText());
  await ticket.evaluate(() => navigator.clipboard.writeText(""));
  await ticket.getByRole("button", { name: "Copy code" }).click();
  await expect.poll(clipboard).not.toBe("");
  return clipboard();
}

/** Opens the scanner for a show and syncs it, as door staff do while they still have signal. */
export async function syncDoor(door: Page, slug: string) {
  await door.goto(`/door/${slug}`);
  await door.getByRole("button", { name: "Sync this show" }).click();
  await expect(door.getByRole("heading", { name: "Ready to scan offline" })).toBeVisible();
}

/** Pastes a code into the door's box and presses Check. */
export async function scan(door: Page, code: string) {
  await door.getByPlaceholder("Paste the code from a ticket screen").fill(code);
  await door.getByRole("button", { name: "Check" }).click();
}

/** The full screen answer the scanner gives for a moment after a check. (The page's route announcer is an empty alert.) */
export const answer = (door: Page) => door.getByRole("alert").filter({ hasText: /\S/ });
