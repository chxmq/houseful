"use client";

import {
  IDKitRequestWidget,
  selfieCheck,
  type IDKitErrorCodes,
  type IDKitResult,
  type RpContext,
} from "@worldcoin/idkit";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { PersonCheckIcon } from "@/components/icons";
import { safeNextPath } from "@/lib/safe-next";

type WorldRequest = {
  appId: `app_${string}`;
  action: string;
  environment: "production" | "staging";
  rpContext: RpContext;
  challenge: string;
};

type WorldLoginProps = {
  next?: string;
  label?: string;
};

function messageFor(code: IDKitErrorCodes): string {
  switch (code as string) {
    case "user_rejected":
    case "cancelled":
      return "Sign-in was cancelled.";
    case "credential_unavailable":
    case "world_id_4_not_available":
      return "Your World ID does not have a Selfie Check yet.";
    case "timeout":
    case "connection_failed":
      return "World App did not respond in time.";
    case "nullifier_replayed":
      return "This World ID proof was already used. Open World App and try again.";
    case "max_verifications_reached":
      return "World will not accept another check right now. Try again later.";
    case "generic_error":
      return "World could not finish this check. Try again.";
    default:
      return "World could not finish this check. Try again.";
  }
}

function plainServerError(error: string | undefined): string {
  if (!error) return "Sign-in failed.";
  if (/nullifier did not match|verified nullifier/i.test(error)) {
    return "World confirmed a different person than this proof. Try again.";
  }
  if (/max_verifications_reached/i.test(error)) {
    return "World will not accept another check right now. Try again later.";
  }
  if (/nullifier_replayed/i.test(error)) {
    return "This World ID proof was already used. Open World App and try again.";
  }
  if (/World is not responding/i.test(error)) return error;
  if (/^[a-z0-9_]+$/i.test(error.trim())) {
    return "World could not finish this check. Try again.";
  }
  return error;
}

export function WorldLogin({ next = "/account", label = "Sign in with World ID" }: WorldLoginProps) {
  const router = useRouter();
  const [request, setRequest] = useState<WorldRequest | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settled = useRef(false);
  const challenge = useRef("");
  const destination = safeNextPath(next, "/account");

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "fan" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start World ID.");
      challenge.current = data.challenge;
      setRequest(data);
      settled.current = false;
      setOpen(true);
    } catch (err) {
      setError(plainServerError((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function verifyOnServer(result: IDKitResult) {
    settled.current = true;
    const res = await fetch("/api/account/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ result }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(plainServerError(data.error));
      return;
    }
    setOpen(false);
    router.replace(destination);
    router.refresh();
  }

  const signal = request ? `houseful:login:${challenge.current}` : "";
  const preset = selfieCheck({ signal });

  return (
    <div>
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-3 rounded-full bg-stamp px-6 py-4 text-base font-semibold text-paper disabled:opacity-60"
      >
        <PersonCheckIcon />
        {busy ? "Opening World ID" : label}
      </button>
      {error ? <p className="mt-3 text-sm font-medium text-reject">{error}</p> : null}

      {request ? (
        <IDKitRequestWidget
          open={open}
          onOpenChange={(nextOpen) => {
            setOpen(nextOpen);
            if (nextOpen) return;
            setTimeout(() => {
              if (settled.current) return;
              settled.current = true;
              setError("Sign-in was cancelled.");
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
            setError(messageFor(code));
          }}
        />
      ) : null}
    </div>
  );
}
