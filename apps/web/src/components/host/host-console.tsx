"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatUsdt, formatLongDate, shortHex } from "@/lib/format";
import { cancelShow, hostedShows, withdrawProceeds, type HostedShow } from "@/lib/host-actions";
import { hostSigner } from "@/lib/pay-signer";
import { playCue } from "@/lib/sounds";
import { explainError } from "@/lib/ticket-actions";
import { PlusIcon } from "../icons";
import { SplitFlap } from "../motion/split-flap";
import { WorkingLock } from "../motion/working-lock";

export type CatalogShow = { chainEventId: number; slug: string; title: string; startsAt: number; timezone: string; priceUsd: number };

export function HostConsole({ catalog, hostAddress }: { catalog: CatalogShow[]; hostAddress: `0x${string}` }) {
  const [wallet, setWallet] = useState<`0x${string}` | null>(hostAddress);
  const [shows, setShows] = useState<HostedShow[] | null>(null);

  const refresh = useCallback(async () => {
    setWallet(hostAddress);
    setShows(await hostedShows(hostAddress));
  }, [hostAddress]);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, 8000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [refresh]);

  const byChainId = new Map(catalog.map((c) => [c.chainEventId, c]));

  return (
    <div>
      <Link href="/host/new" className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 font-semibold text-paper">
        <PlusIcon size={18} /> List a show
      </Link>

      <div className="mt-14">
        {shows === null ? (
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted">Reading the contract</p>
        ) : shows.length === 0 ? (
          <p className="max-w-[52ch] text-ink-soft">
            Shows listed from the wallet you signed in with appear here, with live sales, the waitlist and your proceeds.
          </p>
        ) : (
          <ul className="border-t-2 border-ink">
            {shows.map((show, i) => (
              <HostedRow
                key={show.chainEventId}
                show={show}
                meta={byChainId.get(show.chainEventId)}
                index={i}
                hostAddress={hostAddress}
                onChanged={refresh}
              />
            ))}
          </ul>
        )}
      </div>

      {wallet ? (
        <p className="mt-16 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Hosting as {shortHex(wallet)}</p>
      ) : null}
    </div>
  );
}

function HostedRow({
  show,
  meta,
  index,
  hostAddress,
  onChanged,
}: {
  show: HostedShow;
  meta?: CatalogShow;
  index: number;
  hostAddress: `0x${string}`;
  onChanged: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ended = show.ended;
  const held = show.sold;
  const proceeds = show.faceValue * BigInt(held);

  async function run(label: string, action: (signer: Awaited<ReturnType<typeof hostSigner>>) => Promise<unknown>) {
    if (busy) return;
    playCue("tap");
    setBusy(label);
    setError(null);
    try {
      const signer = await hostSigner(hostAddress);
      playCue("step");
      await action(signer);
      playCue("verify");
      setConfirming(false);
      setBusy(null);
      onChanged();
    } catch (err) {
      playCue("reject");
      setError(explainError(err));
      setBusy(null);
    }
  }

  const status = show.cancelled
    ? "Cancelled, refunds open"
    : ended
      ? show.proceedsWithdrawn
        ? "Ended, paid out"
        : "Ended"
      : show.sold >= show.capacity
        ? "Sold out"
        : "On sale";

  return (
    <motion.li
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="relative grid gap-5 border-b border-ink/15 py-6 md:grid-cols-[minmax(0,1fr)_auto]"
      aria-busy={Boolean(busy)}
    >
      {busy ? <WorkingLock label={busy} detail="On-chain · do not leave this page" /> : null}
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
          #{show.chainEventId} · {status}
          {meta ? ` · ${formatLongDate(meta.startsAt, meta.timezone)}` : ""}
        </p>
        <h3 className="mt-1 font-display text-3xl font-extrabold uppercase leading-none">
          {meta ? <Link href={`/e/${meta.slug}`}>{meta.title}</Link> : `Show #${show.chainEventId}`}
        </h3>
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 text-sm">
          <Stat label="Held" value={`${held} of ${show.capacity}`} />
          <Stat label="Handed back, unsold" value={String(show.returned)} />
          <Stat label="Waiting" value={String(show.waitlistActive)} />
          <Stat
            label={ended ? "Proceeds" : "Proceeds at the end"}
            value={
              meta
                ? formatUsdt(meta.priceUsd * held)
                : formatUsdt(Number(proceeds) / 1e6)
            }
          />
        </dl>
        {error ? <p className="mt-3 text-sm font-medium text-reject">{error}</p> : null}
      </div>

      <div className="flex flex-col items-start gap-3 md:items-end">
        <SplitFlap value={String(held).padStart(3, "0")} className="text-3xl" />
        {show.cancelled ? null : ended ? (
          show.proceedsWithdrawn ? null : (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => run("Withdrawing proceeds", (signer) => withdrawProceeds(show.chainEventId, signer))}
              className="rounded-full bg-admit px-5 py-2.5 text-sm font-semibold text-paper disabled:opacity-60"
            >
              {busy ? "Withdrawing" : "Withdraw proceeds"}
            </button>
          )
        ) : confirming ? (
          <div className="max-w-[300px] rounded-[4px] bg-paper-deep p-4 text-sm md:text-right">
            <p>Everyone holding or waiting can pull a full refund straight from the contract. This cannot be undone.</p>
            <div className="mt-3 flex gap-3 md:justify-end">
              <button type="button" onClick={() => { playCue("tap"); setConfirming(false); }} disabled={Boolean(busy)} className="font-medium">
                Keep it on
              </button>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => run("Cancelling the show", (signer) => cancelShow(show.chainEventId, signer))}
                className="rounded-full bg-stamp px-4 py-2 font-semibold text-paper disabled:opacity-60"
              >
                {busy ? "Cancelling" : "Cancel the show"}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => { playCue("tap"); setConfirming(true); }} className="text-sm font-medium text-ink-soft underline underline-offset-4">
            Cancel this show
          </button>
        )}
      </div>
    </motion.li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
    </div>
  );
}
