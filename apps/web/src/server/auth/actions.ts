"use server";

import { redirect } from "next/navigation";
import { endSession, getSession, requireFan, requireHost } from "./session";
import { db } from "@/server/db/client";
import { delinkWallet, linkWallet, listWallets, setActiveWallet } from "./store";
import { isAddress } from "viem";

export async function signOutAction(formData?: FormData): Promise<void> {
  const kind = formData?.get("kind") === "host" ? "host" : "fan";
  await endSession();
  redirect(kind === "host" ? "/host/login" : "/login");
}

export async function linkWalletAction(formData: FormData): Promise<void> {
  const session = await requireFan();
  const address = String(formData.get("address") ?? "").trim();
  const kind = String(formData.get("kind") ?? "external");
  if (!isAddress(address)) throw new Error("That is not a wallet address.");
  if (kind !== "device" && kind !== "external") throw new Error("Unknown wallet kind.");
  await linkWallet(db, {
    accountId: session.account.id,
    address: address.toLowerCase() as `0x${string}`,
    kind,
    label: kind === "device" ? "This phone" : "Linked wallet",
  });
  redirect("/account");
}

export async function chooseWalletAction(formData: FormData): Promise<void> {
  const session = await requireFan();
  const walletId = String(formData.get("walletId") ?? "");
  await setActiveWallet(db, session.account.id, walletId);
  redirect("/account");
}

export async function delinkWalletAction(formData: FormData): Promise<void> {
  const session = await requireFan();
  const walletId = String(formData.get("walletId") ?? "");
  // Live-ticket check lands with the recover/ticket stream; refuse beyond ownership for now.
  await delinkWallet(db, session.account.id, walletId);
  redirect("/account");
}

export async function accountWallets() {
  const session = await getSession();
  if (!session) return [];
  return listWallets(db, session.account.id);
}

export { requireFan, requireHost, getSession };
