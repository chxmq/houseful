"use server";

import { redirect } from "next/navigation";
import { isAddress } from "viem";
import { db } from "@/server/db/client";
import { walletHoldsLiveTicket } from "./live-tickets";
import { endSession, getSession, requireFan, requireHost } from "./session";
import { delinkWallet, linkWallet, listWallets, setActiveWallet } from "./store";

export type AccountFormState = { error?: string } | null;

export async function signOutAction(formData?: FormData): Promise<void> {
  const kind = formData?.get("kind") === "host" ? "host" : "fan";
  await endSession();
  redirect(kind === "host" ? "/host/login" : "/login");
}

export async function linkWalletAction(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const session = await requireFan();
  const address = String(formData.get("address") ?? "").trim();
  const kind = String(formData.get("kind") ?? "external");
  if (!isAddress(address)) return { error: "That is not a wallet address." };
  if (kind !== "device" && kind !== "external") return { error: "Unknown wallet kind." };
  try {
    await linkWallet(db, {
      accountId: session.account.id,
      address: address.toLowerCase() as `0x${string}`,
      kind,
      label: kind === "device" ? "This phone" : "Linked wallet",
    });
  } catch (err) {
    return { error: (err as Error).message };
  }
  redirect("/account");
}

export async function chooseWalletAction(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const session = await requireFan();
  const walletId = String(formData.get("walletId") ?? "");
  try {
    await setActiveWallet(db, session.account.id, walletId);
  } catch (err) {
    return { error: (err as Error).message };
  }
  redirect("/account");
}

export async function delinkWalletAction(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const session = await requireFan();
  const walletId = String(formData.get("walletId") ?? "");
  const linked = await listWallets(db, session.account.id);
  const target = linked.find((w) => w.id === walletId);
  if (!target) return { error: "That wallet is not on this account." };
  if (await walletHoldsLiveTicket(target.address as `0x${string}`)) {
    return {
      error: "That wallet still holds a live ticket. Resell at face value or wait until the show ends before delinking.",
    };
  }
  try {
    await delinkWallet(db, session.account.id, walletId);
  } catch (err) {
    return { error: (err as Error).message };
  }
  redirect("/account");
}

export async function accountWallets() {
  const session = await getSession();
  if (!session) return [];
  return listWallets(db, session.account.id);
}

export { requireFan, requireHost, getSession };
