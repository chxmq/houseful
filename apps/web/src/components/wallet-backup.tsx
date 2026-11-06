"use client";

import { useState } from "react";
import { exportDeviceWallet, importDeviceWallet } from "@/lib/device-wallet";

/**
 * Lets someone move the device wallet to another phone. Without this, a new browser
 * creates a new key and World ID correctly refuses a second ticket for the same person.
 */
export function WalletBackup() {
  const [secret, setSecret] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  function reveal() {
    setSecret(exportDeviceWallet());
    setMessage("Copy this once. Anyone with it can spend this phone's tickets.");
  }

  function restore() {
    try {
      importDeviceWallet(draft.trim());
      window.location.reload();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  return (
    <section className="border-t border-ink/10 pt-10">
      <h2 className="font-display text-3xl font-black uppercase leading-none">Move this wallet</h2>
      <p className="mt-3 text-sm text-ink-soft">
        Tickets stay with the person who verified. The wallet on this phone only pays and holds the door key. Export it
        before you switch phones, or the new browser will look empty and World ID will refuse a second purchase.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reveal}
          className="rounded-full border border-ink/20 px-5 py-2.5 text-sm font-semibold"
        >
          Export wallet
        </button>
      </div>
      {secret ? (
        <pre className="mt-4 overflow-x-auto rounded-[2px] bg-ink px-4 py-3 font-mono text-xs text-paper">{secret}</pre>
      ) : null}
      <label className="mt-8 block text-sm font-semibold">
        Import on this phone
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="0x…"
          spellCheck={false}
          className="mt-2 w-full border border-ink/15 bg-transparent px-3 py-2 font-mono text-sm"
        />
      </label>
      <button
        type="button"
        onClick={restore}
        disabled={draft.trim().length < 10}
        className="mt-3 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper disabled:opacity-40"
      >
        Import and reload
      </button>
      {message ? <p className="mt-3 text-sm text-ink-soft">{message}</p> : null}
    </section>
  );
}
