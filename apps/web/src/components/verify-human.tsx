"use client";

import {
  IDKitRequestWidget,
  proofOfHuman,
  selfieCheck,
  type IDKitErrorCodes,
  type IDKitResult,
  type RpContext,
} from "@worldcoin/idkit";
import { useRef, useState } from "react";
import type { Assurance } from "@/lib/assurance";
import { PersonCheckIcon } from "./icons";

export type Attestation = {
  nullifier: string;
  deadline: number;
  signature: `0x${string}`;
  credential: string;
};

type WorldRequest = {
  appId: `app_${string}`;
  action: string;
  environment: "production" | "staging";
  rpContext: RpContext;
};

export type VerifyFailure = {
  kind: "no-credential" | "cancelled" | "already-holds" | "rejected" | "unavailable";
  message: string;
};

type VerifyHumanProps = {
  eventId: string;
  wallet: `0x${string}`;
  purpose: "buy" | "join" | "claim";
  assurance: Assurance;
  label: string;
  onVerified: (attestation: Attestation) => void;
  onFailed: (failure: VerifyFailure) => void;
  /** Optional classes for the primary CTA. */
  className?: string;
};

function failureFromIdkit(code: IDKitErrorCodes): VerifyFailure {
  switch (code as string) {
    case "credential_unavailable":
    case "world_id_4_not_available":
      return {
        kind: "no-credential",
        message: "Your World ID does not have the credential this show asks for yet.",
      };
    case "user_rejected":
    case "cancelled":
      return { kind: "cancelled", message: "Verification was cancelled. Nothing was charged." };
    case "max_verifications_reached":
    case "nullifier_replayed":
      return { kind: "already-holds", message: "This person has already used their one ticket for this show." };
    case "timeout":
    case "connection_failed":
      return { kind: "unavailable", message: "World App did not respond in time. Nothing was charged." };
    default:
      return { kind: "rejected", message: `World could not verify this request (${code}).` };
  }
}

export function VerifyHuman({
  eventId,
  wallet,
  purpose,
  assurance,
  label,
  onVerified,
  onFailed,
  className = "",
}: VerifyHumanProps) {
  const [request, setRequest] = useState<WorldRequest | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const settled = useRef(false);

  async function start() {
    setBusy(true);
    try {
      const res = await fetch("/api/world/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRequest(data);
      settled.current = false;
      setOpen(true);
    } catch (err) {
      onFailed({ kind: "unavailable", message: (err as Error).message || "World ID is not reachable right now." });
    } finally {
      setBusy(false);
    }
  }

  async function verifyOnServer(result: IDKitResult) {
    settled.current = true;
    const res = await fetch("/api/world/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventId, wallet, purpose, result }),
    });
    const data = await res.json();
    if (!res.ok) {
      const failure: VerifyFailure =
        data.code === "already-holds"
          ? { kind: "already-holds", message: data.error }
          : data.code === "weak-credential" || data.code === "credential_unavailable"
            ? { kind: "no-credential", message: data.error }
            : { kind: "rejected", message: data.error ?? "The proof did not check out." };
      // Resolve the host check without throwing. IDKit treats a thrown error as
      // failed_by_host_app and replaces our already-holds / weak-credential copy.
      onFailed(failure);
      return;
    }
    onVerified(data as Attestation);
  }

  const preset = assurance === "human" ? proofOfHuman({ signal: wallet.toLowerCase() }) : selfieCheck({ signal: wallet.toLowerCase() });

  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className={`inline-flex w-full items-center justify-center gap-3 rounded-full bg-stamp px-6 py-4 text-base font-semibold text-paper shadow-[0_12px_28px_-14px_rgba(226,64,27,0.9)] transition hover:bg-stamp-deep disabled:opacity-60 ${className}`}
      >
        <PersonCheckIcon />
        {busy ? "Opening World ID" : label}
      </button>

      {request ? (
        <IDKitRequestWidget
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (next) return;
            // Closing the modal, or declining in World App, does not always reach onError.
            setTimeout(() => {
              if (settled.current) return;
              settled.current = true;
              onFailed({ kind: "cancelled", message: "Verification was cancelled. Nothing was charged." });
            }, 300);
          }}
          app_id={request.appId}
          action={request.action}
          rp_context={request.rpContext}
          environment={request.environment}
          allow_legacy_proofs={false}
          preset={preset}
          handleVerify={verifyOnServer}
          onSuccess={() => setOpen(false)}
          onError={(code) => {
            settled.current = true;
            onFailed(failureFromIdkit(code));
          }}
        />
      ) : null}
    </>
  );
}
