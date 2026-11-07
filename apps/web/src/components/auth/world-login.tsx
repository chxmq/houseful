"use client";

import {
  IDKitRequestWidget,
  useIDKitRequest,
  type IDKitResult,
  type RpContext,
} from "@worldcoin/idkit";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PersonCheckIcon } from "@/components/icons";
import { safeNextPath } from "@/lib/safe-next";
import { playCue } from "@/lib/sounds";
import { confirmLoginResponse, loginPreset, loginErrorMessage, loginMethods, simulatorLink, type LoginMethod } from "@/lib/world-login";

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

export function WorldLogin({ next = "/account", label = "Sign in with World ID" }: WorldLoginProps) {
  const router = useRouter();
  const [method, setMethod] = useState<LoginMethod>("human");
  const serverFailure = useRef<string | null>(null);
  const [request, setRequest] = useState<WorldRequest | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const activeRequest = useRef<WorldRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const settled = useRef(false);
  const destination = safeNextPath(next, "/account");

  async function start() {
    if (busy || open || confirming) return;
    playCue("tap");
    setBusy(true);
    setError(null);
    serverFailure.current = null;
    try {
      const res = await fetch("/api/account/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "fan" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start World ID.");
      activeRequest.current = data;
      setRequest(data);
      settled.current = false;
      setOpen(true);
    } catch (err) {
      playCue("reject");
      setError((err as Error).message || "Could not start World ID.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOnServer(result: IDKitResult) {
    if (!request || activeRequest.current !== request) return;
    const attempt = request;
    settled.current = true;
    setConfirming(true);
    try {
      const res = await fetch("/api/account/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ result }),
      });
      await confirmLoginResponse(res);
      if (activeRequest.current !== attempt) return;
      playCue("verify");
      setOpen(false);
      router.replace(destination);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign-in failed. Please try again.";
      if (activeRequest.current === attempt) {
        playCue("reject");
        serverFailure.current = message;
        setError(message);
      }
      throw err;
    } finally {
      if (activeRequest.current === attempt) setConfirming(false);
    }
  }

  function cancel() {
    if (confirming || activeRequest.current !== request) return;
    activeRequest.current = null;
    settled.current = true;
    setOpen(false);
    setError("Sign-in was cancelled.");
  }

  function fail(code: string) {
    if (activeRequest.current !== request) return;
    settled.current = true;
    setOpen(false);
    setError(serverFailure.current ?? loginErrorMessage(code, method));
  }

  const signal = request ? `houseful:login:${request.challenge}` : "";
  const preset = loginPreset(method, signal);

  return (
    <div>
      <label className="mb-2 block text-sm font-medium" htmlFor="world-login-method">Verification method</label>
      <select
        id="world-login-method"
        value={method}
        disabled={busy || open || confirming}
        onChange={event => { setMethod(event.target.value as LoginMethod); setRequest(null); setError(null); }}
        className="mb-2 min-h-11 w-full border border-ink/30 bg-paper px-3 py-2 text-base"
        aria-describedby="world-login-method-help"
      >
        {loginMethods.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
      <p id="world-login-method-help" className="mb-5 text-sm text-ink-soft">{loginMethods.find(option => option.id === method)?.description}</p>
      {request?.environment === "staging" ? <p className="mb-4 text-sm font-medium">Test connection: use the World simulator. This connection does not use your real World account.</p> : null}
      <button
        type="button"
        onClick={start}
        disabled={busy || open || confirming}
        className="inline-flex w-full items-center justify-center gap-3 rounded-full bg-stamp px-6 py-4 text-base font-semibold text-paper disabled:opacity-60"
      >
        <PersonCheckIcon />
        {confirming ? "Signing in…" : busy ? "Opening World ID" : label}
      </button>
      {error ? <p role="alert" className="mt-3 text-sm font-medium text-reject">{error}</p> : null}

      {request?.environment === "staging" && open ? (
        <StagingLogin
          request={request}
          method={method}
          onVerify={verifyOnServer}
          onCancel={cancel}
          onError={fail}
        />
      ) : null}
      {request?.environment === "production" ? (
        <IDKitRequestWidget
          open={open}
          onOpenChange={(nextOpen) => {
            if (activeRequest.current !== request || confirming) return;
            if (nextOpen) { setOpen(true); return; }
            setTimeout(() => {
              if (settled.current || activeRequest.current !== request) return;
              cancel();
            }, 300);
          }}
          app_id={request.appId}
          action={request.action}
          rp_context={request.rpContext}
          environment={request.environment}
          allow_legacy_proofs={false}
          preset={preset}
          handleVerify={verifyOnServer}
          onSuccess={() => { if (activeRequest.current === request) setOpen(false); }}
          onError={fail}
        />
      ) : null}
    </div>
  );
}


function StagingLogin({ request, method, onVerify, onCancel, onError }: {
  request: WorldRequest;
  method: LoginMethod;
  onVerify: (result: IDKitResult) => Promise<void>;
  onCancel: () => void;
  onError: (code: string) => void;
}) {
  const flow = useIDKitRequest({
    app_id: request.appId,
    action: request.action,
    rp_context: request.rpContext,
    environment: "staging",
    allow_legacy_proofs: false,
    preset: loginPreset(method, `houseful:login:${request.challenge}`),
    polling: { timeout: 120_000 },
  });
  const { open, reset, isSuccess, isError, result, errorCode, connectorURI } = flow;
  const handled = useRef(false);
  useEffect(() => { open(); return reset; }, [open, reset]);
  useEffect(() => {
    if (handled.current) return;
    if (isError && errorCode) {
      handled.current = true;
      onError(errorCode);
    } else if (isSuccess && result) {
      handled.current = true;
      void onVerify(result).catch(() => onError("failed_by_host_app"));
    }
  }, [isSuccess, isError, result, errorCode, onVerify, onError]);

  return (
    <section aria-label="Test verification" className="mt-5 border border-ink/25 bg-paper-deep p-5">
      <h2 className="font-display text-2xl font-bold uppercase">{method === "selfie" ? "Finish in World ID" : "Finish in the simulator"}</h2>
      <p className="mt-2 text-sm">{method === "selfie" ? "Use the sandbox World ID app for Selfie Check. The standard simulator does not offer this method." : `Use a test identity. Choose ${method === "human" ? "Human" : "Passport"} and World ID 4.0, then press Continue.`}</p>
      {connectorURI ? (
        <a href={method === "selfie" ? connectorURI : simulatorLink(connectorURI)} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center bg-ink px-5 py-3 font-semibold text-paper">{method === "selfie" ? "Open sandbox World ID app" : "Open simulator"}</a>
      ) : null}
      <p role="status" className="mt-3 text-sm text-ink-soft">{isSuccess ? "Checking your proof…" : connectorURI ? "Opens in another tab. Return here after approval; this page will update." : "Preparing the simulator connection…"}</p>
      <button type="button" onClick={onCancel} disabled={isSuccess} className="mt-4 min-h-11 px-2 py-2 text-sm underline disabled:opacity-60">Cancel sign-in</button>
    </section>
  );
}
