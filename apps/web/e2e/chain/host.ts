/**
 * The host's side, driven through the app: sign in as a host, list a show on /host/new, then cancel it or take its
 * proceeds on /host. /host and /host/new open only for a signed-in host. Listing and console actions use the same
 * injected wallet the host signed in with.
 */
import { randomBytes } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import type { Address } from "viem";
import { signInHost } from "../support/auth";
import type { Chain, Device } from "../support/fixtures";

export type ShowTerms = {
  seated?: boolean;
  capacity?: number;
  /** Whole dollars. */
  priceUsd?: number;
  /** A show that is over about 30 minutes from now, for specs that need to see it end. The form's own date is days away. */
  endsSoon?: boolean;
};

export type ListedShow = {
  slug: string;
  title: string;
  priceUsd: number;
  /** The face value in USDT units. */
  price: bigint;
  chainEventId: number;
  host: Address;
};

/** Opens another phone and signs it in as a host, with an injected wallet of its own. */
export async function hostPhone(device: () => Promise<Device>): Promise<Device> {
  const phone = await device();
  await signInHost(phone.page);
  return phone;
}

/** The form takes its date and time in IST. */
function istFields(unixSeconds: number) {
  const iso = new Date((unixSeconds + 5.5 * 3600) * 1000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

async function signedInHostAddress(page: Page): Promise<Address> {
  return page.evaluate(async () => {
    const eth = (window as unknown as { ethereum?: { request: (args: { method: string }) => Promise<string[]> } }).ethereum;
    if (!eth) throw new Error("No injected wallet on this page.");
    const accounts = await eth.request({ method: "eth_accounts" });
    if (!accounts[0]) throw new Error("The host wallet is not connected.");
    return accounts[0] as Address;
  });
}

/** Lists a new show from the signed-in host wallet and returns once the contract and the guide both have it. */
export async function listShow(page: Page, chain: Chain, terms: ShowTerms = {}): Promise<ListedShow> {
  const { seated = false, capacity = 10, priceUsd = 8, endsSoon = false } = terms;
  const title = `E2E show ${randomBytes(3).toString("hex")}`;
  const host = await signedInHostAddress(page);

  await page.goto("/host/new");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Hosted by").fill("E2E Hosts");
  await page.getByLabel("What people should know").fill("A throwaway show listed by an end to end test on a local chain.");
  await page.getByLabel("Face value").fill(String(priceUsd));
  await page.getByLabel("Seats").fill(String(capacity));
  if (seated) await page.getByRole("button", { name: "Assigned seats" }).click();

  if (endsSoon) {
    // The form refuses a show whose hand-back window closes within ten minutes, so start 12 to 13 minutes out and run 15.
    // Count from the later of the chain's clock and the real one, so a chain that is ahead still gets a future show.
    const chainNow = Number((await chain.publicClient.getBlock()).timestamp);
    const startsAt = Math.ceil((Math.max(chainNow, Date.now() / 1000) + 12 * 60) / 60) * 60;
    const { date, time } = istFields(startsAt);
    await page.locator('input[type="date"]').fill(date);
    await page.locator('input[type="time"]').fill(time);
    await page.getByLabel("Doors open, minutes before").fill("0");
    await page.getByLabel("Runs for, minutes").fill("15");
    await page.getByLabel("Hand-backs close, hours before doors").fill("0");
  }

  await page.getByRole("button", { name: "List it on chain" }).click();
  await page.waitForURL(/\/e\/[^/]+$/, { timeout: 60_000 });

  const slug = new URL(page.url()).pathname.split("/").pop()!;
  const created = await chain.waitForEvent({
    eventName: "EventCreated",
    where: (log) => log.args.host?.toLowerCase() === host.toLowerCase(),
  });
  return { slug, title, priceUsd, price: BigInt(priceUsd) * 1_000_000n, chainEventId: Number(created.args.eventId), host };
}

/** One show's row on the host console. */
function hostedRow(page: Page, title: string) {
  return page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: title }) });
}

export async function cancelHostedShow(page: Page, title: string) {
  await page.goto("/host");
  const row = hostedRow(page, title);
  await row.getByRole("button", { name: "Cancel this show" }).click();
  await row.getByRole("button", { name: "Cancel the show" }).click();
  await expect(row.getByText(/Cancelled, refunds open/)).toBeVisible({ timeout: 30_000 });
}

export async function withdrawHostedProceeds(page: Page, title: string) {
  await page.goto("/host");
  const row = hostedRow(page, title);
  await row.getByRole("button", { name: "Withdraw proceeds" }).click();
  await expect(row.getByText(/Ended, paid out/)).toBeVisible({ timeout: 30_000 });
}
