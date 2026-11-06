"use client";

import { buildRevocationMap, DOOR_PAYLOAD_LENGTH, Verifier, type RejectReason } from "@houseful/pass";
import jsQR from "jsqr";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import type { DoorSync } from "@/app/api/door/[chainEventId]/sync/route";
import { ArrowLeft, CameraIcon, CheckIcon, SyncIcon } from "@/components/icons";
import { SplitFlap } from "@/components/motion/split-flap";
import { formatLongDate, formatTime, shortHex } from "@/lib/format";
import { playCue } from "@/lib/sounds";

export type ScannerShow = {
  slug: string;
  chainEventId: number;
  title: string;
  venue: string;
  startsAt: number;
  doorsAt: number;
};

type SyncRecord = DoorSync & { savedAt: number };

type ScanEntry = { at: number; ok: boolean; ticket: number | null; reason: RejectReason | null };

type DoorLog = { rejected: number; admittedAt: Record<string, number>; recent: ScanEntry[] };

type Flash = { id: number; at: number; ok: boolean; ticket: number | null; gen: number | null; reason: RejectReason | null; firstIn: number | null };

type CameraState = "off" | "starting" | "on" | "denied" | "unavailable" | "insecure";

const HOLD_MS = 1600;
const WIPE_S = 0.38;
const STALE_SYNC_S = 30 * 60;
const RESYNC_MS = 2 * 60 * 1000;
const EMPTY_LOG: DoorLog = { rejected: 0, admittedAt: {}, recent: [] };

const reasonCopy: Record<RejectReason, { title: string; detail: string; short: string }> = {
  stale: {
    title: "Code expired",
    detail: "Codes change every 20 seconds. After this scanner has synced, older codes stop working. Ask to see the live ticket on their phone.",
    short: "Expired",
  },
  "already-admitted": {
    title: "Already admitted",
    detail: "This door has already let this ticket in.",
    short: "Already in",
  },
  revoked: {
    title: "Ticket was handed back to the waitlist",
    detail: "This holder returned the seat. It now belongs to the next person in line.",
    short: "Handed back",
  },
  "wrong-event": {
    title: "Not for this show",
    detail: "This is a real Houseful ticket, but for a different show.",
    short: "Other show",
  },
  "bad-issuer-signature": {
    title: "Signature does not match",
    detail: "Houseful did not issue this ticket, or something on it was changed.",
    short: "Forged",
  },
  "bad-holder-signature": {
    title: "Signature does not match",
    detail: "The code was not made on the phone this ticket is bound to.",
    short: "Wrong phone",
  },
  expired: {
    title: "This pass has expired",
    detail: "The holder can open the ticket while online to get a fresh pass.",
    short: "Pass expired",
  },
  malformed: {
    title: "Not a Houseful code",
    detail: "Scan the code on the Houseful ticket screen.",
    short: "Unknown code",
  },
};

const storageKeys = (chainEventId: number) => ({
  sync: `houseful.door.v1.${chainEventId}.sync`,
  state: `houseful.door.v1.${chainEventId}.state`,
  log: `houseful.door.v1.${chainEventId}.log`,
});

const storageListeners = new Set<() => void>();

function subscribeStorage(callback: () => void) {
  storageListeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    storageListeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function writeStorage(key: string, value: string | null) {
  if (value === null) window.localStorage.removeItem(key);
  else window.localStorage.setItem(key, value);
  storageListeners.forEach((listener) => listener());
}

function useStored(key: string): string | null {
  return useSyncExternalStore(
    subscribeStorage,
    () => window.localStorage.getItem(key),
    () => null,
  );
}

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

const noopSubscribe = () => () => {};

function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

function useClock() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now() / 1000);
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
  return now;
}

function parseSync(raw: string | null, event: string): SyncRecord | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as SyncRecord;
    if (s.event !== event || typeof s.issuerPublicKey !== "string" || !Array.isArray(s.revocations)) return null;
    return s;
  } catch {
    return null;
  }
}

function parseLog(raw: string | null): DoorLog {
  if (!raw) return EMPTY_LOG;
  try {
    const log = JSON.parse(raw) as DoorLog;
    return Array.isArray(log.recent) ? log : EMPTY_LOG;
  } catch {
    return EMPTY_LOG;
  }
}

function admittedCount(raw: string | null): number {
  if (!raw) return 0;
  try {
    const state = JSON.parse(raw) as { admitted?: unknown };
    return Array.isArray(state.admitted) ? state.admitted.length : 0;
  } catch {
    return 0;
  }
}

const payloadPattern = new RegExp(`(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{${DOOR_PAYLOAD_LENGTH}}(?![A-Za-z0-9_-])`);

/** Accepts the bare payload or any text that wraps it, such as a link. */
function extractPayload(text: string): string {
  const trimmed = text.trim();
  return trimmed.match(payloadPattern)?.[0] ?? trimmed;
}

/** Reads the ticket id from bytes 9..12. Only trust it after the verifier has checked both signatures. */
function ticketFromPayload(payload: string): number | null {
  try {
    const b = atob(payload.slice(0, 20).replace(/-/g, "+").replace(/_/g, "/"));
    return ((b.charCodeAt(9) << 24) | (b.charCodeAt(10) << 16) | (b.charCodeAt(11) << 8) | b.charCodeAt(12)) >>> 0;
  } catch {
    return null;
  }
}

const ticketNo = (ticket: number) => `No. ${String(ticket + 1).padStart(4, "0")}`;

const clockFormat = new Intl.DateTimeFormat("en-IN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "Asia/Kolkata",
});
const formatClock = (seconds: number) => clockFormat.format(new Date(seconds * 1000));

function formatAge(seconds: number) {
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min ago`;
}

type BarcodeDetectorLike = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };
type BarcodeDetectorCtor = {
  new (options: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};
type Detect = (video: HTMLVideoElement) => Promise<string | null>;

async function createDetector(): Promise<Detect> {
  const Native = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (Native) {
    try {
      const formats = await Native.getSupportedFormats?.();
      if (!formats || formats.includes("qr_code")) {
        const detector = new Native({ formats: ["qr_code"] });
        return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
      }
    } catch {}
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return async (video) => {
    if (!ctx || !video.videoWidth || !video.videoHeight) return null;
    const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.round(video.videoWidth * scale);
    const h = Math.round(video.videoHeight * scale);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    ctx.drawImage(video, 0, 0, w, h);
    const image = ctx.getImageData(0, 0, w, h);
    return jsQR(image.data, w, h, { inversionAttempts: "attemptBoth" })?.data ?? null;
  };
}

export function Scanner({ show }: { show: ScannerShow }) {
  const event = String(show.chainEventId);
  const keys = useMemo(() => storageKeys(show.chainEventId), [show.chainEventId]);

  const hydrated = useHydrated();
  const online = useOnline();
  const now = useClock();

  const syncRaw = useStored(keys.sync);
  const stateRaw = useStored(keys.state);
  const logRaw = useStored(keys.log);
  const sync = useMemo(() => parseSync(syncRaw, event), [syncRaw, event]);
  const log = useMemo(() => parseLog(logRaw), [logRaw]);
  const admitted = useMemo(() => admittedCount(stateRaw), [stateRaw]);

  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);

  const verifierRef = useRef<{ raw: string; verifier: Verifier } | null>(null);
  const pausedRef = useRef(false);
  const lastCameraRef = useRef<{ text: string; until: number }>({ text: "", until: 0 });
  const flashIdRef = useRef(0);

  const runSync = useCallback(
    async (quiet: boolean) => {
      if (!quiet) {
        setSyncing(true);
        setSyncError(null);
      }
      try {
        const res = await fetch(`/api/door/${show.chainEventId}/sync`, { cache: "no-store" });
        const body = (await res.json()) as DoorSync | { error: string };
        if (!res.ok || "error" in body) throw new Error("error" in body ? body.error : "Sync failed.");
        if (body.event !== event) throw new Error("The server sent a list for a different show.");
        const record: SyncRecord = { ...body, savedAt: Math.floor(Date.now() / 1000) };
        writeStorage(keys.sync, JSON.stringify(record));
      } catch (err) {
        if (!quiet) {
          setSyncError(
            navigator.onLine ? (err as Error).message : "No network. Connect once to sync, then you can scan offline.",
          );
        }
      } finally {
        if (!quiet) setSyncing(false);
      }
    },
    [show.chainEventId, event, keys.sync],
  );

  const hasSync = sync !== null;
  useEffect(() => {
    if (!online || !hasSync) return;
    const first = setTimeout(() => runSync(true), 0);
    const timer = setInterval(() => runSync(true), RESYNC_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [online, hasSync, runSync]);

  const verifierFor = useCallback((): Verifier | null => {
    const raw = window.localStorage.getItem(keys.sync);
    const record = parseSync(raw, event);
    if (!raw || !record) return null;
    if (verifierRef.current?.raw !== raw) {
      verifierRef.current = {
        raw,
        verifier: new Verifier({
          issuerPublicKey: record.issuerPublicKey,
          event: record.event,
          minGenerations: buildRevocationMap(record.revocations),
        }),
      };
    }
    const verifier = verifierRef.current.verifier;
    const saved = window.localStorage.getItem(keys.state);
    if (saved) {
      try {
        verifier.importState(JSON.parse(saved));
      } catch {}
    }
    return verifier;
  }, [keys, event]);

  const checkCode = useCallback(
    (text: string): Flash | null => {
      const verifier = verifierFor();
      if (!verifier) return null;
      const at = Date.now() / 1000;
      const payload = extractPayload(text);
      const result = verifier.check(payload, at);
      writeStorage(keys.state, JSON.stringify(verifier.exportState()));

      const current = parseLog(window.localStorage.getItem(keys.log));
      const ticket = result.ok ? result.ticket : result.reason === "already-admitted" ? ticketFromPayload(payload) : null;
      const firstIn = !result.ok && ticket !== null ? (current.admittedAt[String(ticket)] ?? null) : null;
      const entry: ScanEntry = { at, ok: result.ok, ticket, reason: result.ok ? null : result.reason };
      const next: DoorLog = {
        rejected: current.rejected + (result.ok ? 0 : 1),
        admittedAt: result.ok ? { ...current.admittedAt, [String(result.ticket)]: at } : current.admittedAt,
        recent: [entry, ...current.recent].slice(0, 40),
      };
      writeStorage(keys.log, JSON.stringify(next));

      navigator.vibrate?.(result.ok ? 70 : [110, 70, 110]);
      playCue(result.ok ? "admit" : "reject");
      pausedRef.current = true;
      const shown: Flash = {
        id: ++flashIdRef.current,
        at,
        ok: result.ok,
        ticket,
        gen: result.ok ? result.gen : null,
        reason: result.ok ? null : result.reason,
        firstIn,
      };
      setFlash(shown);
      return shown;
    },
    [verifierFor, keys],
  );

  const onCameraCode = useCallback(
    (text: string) => {
      if (pausedRef.current) return;
      const last = lastCameraRef.current;
      if (text === last.text && Date.now() < last.until) return;
      const shown = checkCode(text);
      if (shown) lastCameraRef.current = { text, until: Date.now() + HOLD_MS + (shown.ok ? 20_000 : 3_000) };
    },
    [checkCode],
  );

  useEffect(() => {
    if (!flash) {
      const resume = setTimeout(() => {
        pausedRef.current = false;
      }, WIPE_S * 1000 + 50);
      return () => clearTimeout(resume);
    }
    const hold = setTimeout(() => setFlash(null), HOLD_MS);
    return () => clearTimeout(hold);
  }, [flash]);

  function resetDoor() {
    if (!window.confirm("Clear who this door has let in? Use this only between rehearsals.")) return;
    verifierRef.current = null;
    lastCameraRef.current = { text: "", until: 0 };
    writeStorage(keys.state, null);
    writeStorage(keys.log, null);
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-paper/10 bg-ink">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 md:px-6">
          <Link href="/door" aria-label="All shows" className="-ml-2 p-2 text-paper/70">
            <ArrowLeft size={20} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-xl font-extrabold uppercase leading-none">{show.title}</p>
            <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.14em] text-paper/55">
              {show.venue} · Doors {formatTime(show.doorsAt)}
            </p>
          </div>
          <NetworkBadge online={!hydrated || online} />
        </div>
        <AnimatePresence initial={false}>
          {hydrated && !online ? (
            <motion.p
              key="offline"
              initial={{ height: 0 }}
              animate={{ height: "auto" }}
              exit={{ height: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden bg-marigold text-ink"
            >
              <span className="mx-auto block max-w-5xl px-4 py-2 text-sm font-medium md:px-6">
                {sync
                  ? `No network. Still checking codes on this device, against the list synced at ${formatTime(sync.savedAt)}.`
                  : "No network. Connect once to sync this show before doors."}
              </span>
            </motion.p>
          ) : null}
        </AnimatePresence>
      </header>

      <div className="border-b border-paper/10">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3 md:px-6">
          <Tally label="Admitted" value={admitted} />
          <Tally label="Turned away" value={log.rejected} />
          <div className="ml-auto text-right">
            <p className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.16em] text-paper/50">Clock IST</p>
            <p className="font-mono text-sm tabular-nums text-paper/80">{now ? formatClock(now) : "--:--:--"}</p>
          </div>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-5xl flex-1 gap-8 px-4 pb-16 pt-6 md:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-12">
        {!hydrated ? (
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-paper/50">Opening the door</p>
        ) : !sync ? (
          <SyncFirst show={show} online={online} syncing={syncing} error={syncError} onSync={() => runSync(false)} />
        ) : (
          <>
            <div className="min-w-0 space-y-6">
              <Viewfinder paused={flash !== null} onCode={onCameraCode} />
              <PasteCode onCheck={checkCode} />
            </div>
            <aside className="min-w-0 space-y-8">
              <SyncStatus
                sync={sync}
                now={now}
                online={online}
                syncing={syncing}
                error={syncError}
                onSync={() => runSync(false)}
              />
              <RecentScans entries={log.recent} />
              <button
                type="button"
                onClick={resetDoor}
                className="font-mono text-[11px] uppercase tracking-[0.14em] text-paper/45 underline underline-offset-4"
              >
                Reset this door
              </button>
            </aside>
          </>
        )}
      </div>

      <ResultFlood flash={flash} onDismiss={() => setFlash(null)} />
    </>
  );
}

function NetworkBadge({ online }: { online: boolean }) {
  return (
    <span
      role="status"
      className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] ${
        online ? "border border-paper/20 text-paper/75" : "bg-marigold text-ink"
      }`}
    >
      <span aria-hidden="true" className={`size-2 ${online ? "bg-paper/60" : "bg-ink"}`} />
      {online ? "Online" : "Offline"}
    </span>
  );
}

function Tally({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.16em] text-paper/50">{label}</p>
      <SplitFlap
        value={String(value).padStart(3, "0")}
        className="mt-1 text-xl"
        cellClassName="bg-paper/10 text-paper"
      />
    </div>
  );
}

function SyncFirst({
  show,
  online,
  syncing,
  error,
  onSync,
}: {
  show: ScannerShow;
  online: boolean;
  syncing: boolean;
  error: string | null;
  onSync: () => void;
}) {
  return (
    <section className="max-w-xl lg:col-span-2" aria-labelledby="sync-first">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-marigold">Step 1 of 2</p>
      <h1 id="sync-first" className="mt-3 font-display text-[clamp(3rem,12vw,5.5rem)] font-black uppercase leading-[0.85]">
        Sync before doors
      </h1>
      <p className="mt-4 text-paper/75">
        This downloads the Houseful signing key and the latest hand-backs for {show.title} on{" "}
        {formatLongDate(show.startsAt)}. After that, this device checks every code itself and needs no network.
      </p>
      <button
        type="button"
        onClick={onSync}
        disabled={syncing || !online}
        className="mt-8 inline-flex items-center gap-3 rounded-full bg-paper px-6 py-4 font-semibold text-ink disabled:opacity-50"
      >
        <SyncIcon size={18} />
        {syncing ? "Syncing" : online ? "Sync this show" : "Connect to sync"}
      </button>
      {error ? <p className="mt-4 border-l-[3px] border-stamp pl-3 text-sm text-paper/85">{error}</p> : null}
    </section>
  );
}

function SyncStatus({
  sync,
  now,
  online,
  syncing,
  error,
  onSync,
}: {
  sync: SyncRecord;
  now: number | null;
  online: boolean;
  syncing: boolean;
  error: string | null;
  onSync: () => void;
}) {
  const blocked = sync.revocations.reduce((n, r) => n + r.generation, 0);
  const age = now ? Math.max(0, now - sync.savedAt) : 0;

  return (
    <section aria-labelledby="sync-status">
      <p className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-marigold">
        <CheckIcon size={14} /> Synced
      </p>
      <h2 id="sync-status" className="mt-2 font-display text-4xl font-black uppercase leading-[0.9]">
        Ready to scan offline
      </h2>
      <dl className="mt-5 divide-y divide-paper/10 border-y border-paper/10 font-mono text-[13px]">
        <Row label="Tickets on chain" value={`${sync.minted} of ${sync.capacity}`} />
        <Row label="Old codes blocked" value={String(blocked)} />
        <Row label="Synced" value={`${formatTime(sync.savedAt)}, ${formatAge(age)}`} />
        <Row label="Issuer key" value={shortHex(sync.issuerPublicKey, 6, 4)} />
      </dl>
      <p className="mt-3 text-sm text-paper/60">
        Each hand-back retires the previous holder&apos;s code. Codes are checked here, with no network.
      </p>
      {age > STALE_SYNC_S ? (
        <p className="mt-3 border-l-[3px] border-marigold pl-3 text-sm text-paper/85">
          Last sync was {formatAge(age)}. Sync again close to doors so recent hand-backs are blocked.
        </p>
      ) : null}
      <button
        type="button"
        onClick={onSync}
        disabled={syncing || !online}
        className="mt-5 inline-flex items-center gap-2 rounded-full border border-paper/25 px-4 py-2 text-sm font-medium disabled:opacity-45"
      >
        <SyncIcon size={16} />
        {syncing ? "Syncing" : online ? "Sync again" : "Sync needs a network"}
      </button>
      {error ? <p className="mt-3 border-l-[3px] border-stamp pl-3 text-sm text-paper/85">{error}</p> : null}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-[11px] uppercase tracking-[0.14em] text-paper/55">{label}</dt>
      <dd className="text-right tabular-nums text-paper">{value}</dd>
    </div>
  );
}

function Viewfinder({ paused, onCode }: { paused: boolean; onCode: (text: string) => void }) {
  const reduce = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCodeRef = useRef(onCode);
  const [camera, setCamera] = useState<CameraState>("off");
  const [wanted, setWanted] = useState(false);

  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    const video = videoRef.current;
    if (!wanted || !video) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setCamera("insecure");
        setWanted(false);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (stopped) return;
        video.srcObject = stream;
        await video.play();
        const detect = await createDetector();
        if (stopped) return;
        setCamera("on");

        const tick = async () => {
          if (stopped) return;
          if (video.readyState >= 2) {
            const text = await detect(video).catch(() => null);
            if (text && !stopped) onCodeRef.current(text);
          }
          timer = setTimeout(tick, 120);
        };
        tick();
      } catch (err) {
        if (stopped) return;
        setCamera((err as DOMException).name === "NotAllowedError" ? "denied" : "unavailable");
        setWanted(false);
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    };
  }, [wanted]);

  function start() {
    setCamera("starting");
    setWanted(true);
  }

  function stop() {
    setWanted(false);
    setCamera("off");
  }

  const live = camera === "on";
  const notice: Partial<Record<CameraState, string>> = {
    denied: "Camera access was blocked. Allow it in the browser settings, or paste a code below.",
    unavailable: "No camera could be opened on this device. Paste a code below instead.",
    insecure: "The camera needs a secure page (https or localhost). Paste a code below instead.",
  };

  return (
    <section aria-label="Camera">
      <div className="relative aspect-square w-full overflow-hidden rounded-[4px] bg-paper/[0.06] sm:aspect-[4/3]">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`absolute inset-0 size-full object-cover ${live ? "opacity-100" : "opacity-0"}`}
        />

        <div aria-hidden="true" className="pointer-events-none absolute inset-[12%]">
          <span className="absolute left-0 top-0 size-10 border-l-[3px] border-t-[3px] border-paper" />
          <span className="absolute right-0 top-0 size-10 border-r-[3px] border-t-[3px] border-paper" />
          <span className="absolute bottom-0 left-0 size-10 border-b-[3px] border-l-[3px] border-paper" />
          <span className="absolute bottom-0 right-0 size-10 border-b-[3px] border-r-[3px] border-paper" />
          {live && !paused && !reduce ? (
            <motion.span
              className="absolute inset-x-3 h-[2px] bg-marigold"
              initial={{ top: "8%" }}
              animate={{ top: ["8%", "92%"] }}
              transition={{ duration: 1.6, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
            />
          ) : null}
        </div>

        {!live ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
            <button
              type="button"
              onClick={start}
              disabled={camera === "starting"}
              className="inline-flex items-center gap-3 rounded-full bg-paper px-6 py-4 font-semibold text-ink disabled:opacity-60"
            >
              <CameraIcon size={20} />
              {camera === "starting" ? "Opening camera" : "Start scanning"}
            </button>
            {notice[camera] ? <p className="max-w-[34ch] text-sm text-paper/75">{notice[camera]}</p> : null}
          </div>
        ) : (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-ink/80 px-4 py-2.5">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-paper/80">
              {paused ? "Hold" : "Point at the ticket code"}
            </span>
            <button type="button" onClick={stop} className="font-mono text-[11px] uppercase tracking-[0.16em] text-paper underline underline-offset-4">
              Stop
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function PasteCode({ onCheck }: { onCheck: (text: string) => Flash | null }) {
  const [value, setValue] = useState("");

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!value.trim()) return;
    onCheck(value);
    setValue("");
  }

  return (
    <form onSubmit={submit} aria-labelledby="paste-label">
      <label id="paste-label" htmlFor="paste-code" className="font-mono text-[11px] uppercase tracking-[0.16em] text-paper/55">
        No camera? Paste a door code
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="paste-code"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Paste the code from a ticket screen"
          className="min-w-0 flex-1 rounded-[4px] border border-paper/20 bg-transparent px-3 py-3 font-mono text-sm text-paper placeholder:text-paper/35 focus:border-paper/60 focus:outline-none"
        />
        <button type="submit" disabled={!value.trim()} className="shrink-0 rounded-[4px] bg-paper px-5 font-semibold text-ink disabled:opacity-40">
          Check
        </button>
      </div>
    </form>
  );
}

function RecentScans({ entries }: { entries: ScanEntry[] }) {
  return (
    <section aria-labelledby="recent-scans">
      <h2 id="recent-scans" className="font-mono text-[11px] uppercase tracking-[0.16em] text-paper/55">
        Recent at this door
      </h2>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-paper/55">Nothing scanned yet.</p>
      ) : (
        <ol className="mt-3 divide-y divide-paper/10 border-y border-paper/10 font-mono text-[13px]">
          {entries.slice(0, 8).map((entry) => (
            <li key={`${entry.at}-${entry.reason ?? "ok"}`} className="flex items-center gap-3 py-2">
              <span aria-hidden="true" className={`size-2.5 shrink-0 ${entry.ok ? "bg-admit" : "bg-reject"}`} />
              <span className="tabular-nums text-paper/55">{formatClock(entry.at)}</span>
              <span className="min-w-0 flex-1 truncate text-paper">
                {entry.ok ? "Admitted" : reasonCopy[entry.reason ?? "malformed"].short}
              </span>
              {entry.ticket !== null ? <span className="tabular-nums text-paper/70">{ticketNo(entry.ticket)}</span> : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ResultFlood({ flash, onDismiss }: { flash: Flash | null; onDismiss: () => void }) {
  const reduce = useReducedMotion();
  const wipe = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { clipPath: "inset(100% 0% 0% 0%)" },
        animate: { clipPath: "inset(0% 0% 0% 0%)" },
        exit: { clipPath: "inset(0% 0% 100% 0%)" },
      };

  return (
    <AnimatePresence>
      {flash ? (
        <motion.div
          key={flash.id}
          role="alert"
          aria-live="assertive"
          onClick={onDismiss}
          {...wipe}
          transition={{ duration: reduce ? 0.12 : WIPE_S, ease: [0.76, 0, 0.24, 1] }}
          className={`fixed inset-0 z-50 flex cursor-pointer flex-col justify-between overflow-hidden p-6 text-paper md:p-10 ${
            flash.ok ? "bg-admit" : "bg-reject"
          }`}
        >
          <div className="flex items-start justify-between gap-4 font-mono text-xs uppercase tracking-[0.16em] text-paper/80">
            <span>{flash.ticket !== null ? `Ticket ${ticketNo(flash.ticket)}` : "Turned away"}</span>
            <span className="tabular-nums">{formatClock(flash.at)}</span>
          </div>

          <motion.div
            initial={reduce ? false : { y: 48, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.42, delay: reduce ? 0 : 0.12, ease: [0.22, 1, 0.36, 1] }}
          >
            {flash.ok ? (
              <p className="font-display text-[clamp(7rem,34vw,22rem)] font-black uppercase leading-[0.78]">Admit</p>
            ) : (
              <p className="font-display text-[clamp(5.5rem,27vw,17rem)] font-black uppercase leading-[0.86]">
                No
                <br />
                entry
              </p>
            )}
          </motion.div>

          <div className="max-w-3xl">
            {flash.ok ? (
              <>
                <p className="font-display text-4xl font-extrabold uppercase leading-none md:text-5xl">
                  {flash.ticket !== null ? ticketNo(flash.ticket) : "Ticket"}
                </p>
                <p className="mt-3 text-lg text-paper/85">
                  {flash.gen
                    ? "A returned seat, now held by the next person from the waitlist. Live code from their phone."
                    : "One verified person. Live code from the phone this ticket is bound to."}
                </p>
              </>
            ) : flash.reason ? (
              <>
                <p className="font-display text-4xl font-extrabold uppercase leading-[0.95] md:text-5xl">
                  {reasonCopy[flash.reason].title}
                </p>
                <p className="mt-3 text-lg text-paper/85">
                  {flash.reason === "already-admitted" && flash.ticket !== null && flash.firstIn !== null
                    ? `${ticketNo(flash.ticket)} came in at ${formatClock(flash.firstIn)} through this door.`
                    : reasonCopy[flash.reason].detail}
                </p>
              </>
            ) : null}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
