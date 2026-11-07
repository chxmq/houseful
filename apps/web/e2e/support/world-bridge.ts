import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import type { BrowserContext, Request, Route } from "@playwright/test";

/**
 * A stand-in for the World App, at the network edge.
 *
 * IDKit, which the app uses for "Verify and buy", talks to World's bridge at bridge.worldcoin.org: it posts an
 * encrypted request, shows a QR code and a link carrying the request id and the key, then polls for the answer.
 * This class intercepts those calls with Playwright's route interception and plays the phone. Like World's
 * simulator, it reads the key from the link on screen, decrypts the request to see what was asked, and answers
 * with a proof that carries the nullifier a test picked, or with an error, or never. The app and IDKit run
 * unchanged, and the app's server still has to accept the proof through its own verify call (see world-verify.ts).
 *
 * Install it on each browser context before the page opens the prompt. One context is one phone, and a
 * phone belongs to one person, identified by a nullifier. Two contexts with the same person are the same
 * human on two wallets.
 */

const BRIDGE_ORIGIN = "https://bridge.worldcoin.org";
const FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const ZERO_FIELD = `0x${"0".repeat(64)}`;
const PROOF = `${"0".repeat(63)}1`.repeat(5);
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

/** Errors the World App can send back. IDKit passes these on to the app, which words them for the fan. */
export const WORLD_APP_ERRORS = [
  "user_rejected",
  "verification_rejected",
  "credential_unavailable",
  "feature_unavailable",
  "world_id_4_not_available",
  "world_id_3_not_available",
  "malformed_request",
  "invalid_network",
  "inclusion_proof_pending",
  "inclusion_proof_failed",
  "unexpected_response",
  "connection_failed",
  "max_verifications_reached",
  "failed_by_host_app",
  "user_presence_failed",
  "invalid_rp_signature",
  "nullifier_replayed",
  "duplicate_nonce",
  "unknown_rp",
  "inactive_rp",
  "timestamp_too_old",
  "timestamp_too_far_in_future",
  "invalid_timestamp",
  "rp_signature_expired",
  "identity_attributes_not_matched",
  "generic_error",
] as const;
export type WorldAppError = (typeof WORLD_APP_ERRORS)[number];

/** The form World uses on the wire: nil_ and 64 lowercase hex digits. Accepts that, 0x hex, decimal or a bigint. */
export function toCanonicalNullifier(value: string | bigint): string {
  const text = typeof value === "bigint" ? value.toString() : value.trim();
  const number = text.startsWith("nil_") ? BigInt(`0x${text.slice(4)}`) : BigInt(text);
  if (number < 0n || number >= FIELD_MODULUS) throw new RangeError("A nullifier must be inside the World ID field.");
  return `nil_${number.toString(16).padStart(64, "0")}`;
}

/** A new person. 31 random bytes stay well inside the field. */
export function randomNullifier(): string {
  return toCanonicalNullifier(BigInt(`0x${randomBytes(31).toString("hex")}`));
}

export type BridgeBehaviour =
  /** The person approves in World App. */
  | { kind: "complete"; nullifier: string }
  /** World App answers with an error, for instance the person declined or has no credential yet. */
  | { kind: "fail"; code: WorldAppError }
  /** Nobody answers. `waiting` shows the QR code, `connecting` shows that the phone has opened the request. */
  | { kind: "wait"; stage: "waiting" | "connecting" };

type Asked = {
  action: string | null;
  appId: string | null;
  /** What the app wants proved, such as proof_of_human or selfie. */
  credentials: { identifier: string; issuerSchemaId: number }[];
  proofRequestId: string | null;
};

export type BridgeRequest = {
  id: string;
  behaviour: BridgeBehaviour;
  /** Filled in once the stub has read the key from the link on screen. Not available for requests that were only held. */
  asked?: Asked;
};

type Entry = BridgeRequest & { iv: string; payload: string; key?: Buffer };

type Payload = {
  action?: string;
  app_id?: string;
  proof_request?: { id?: string; proof_requests?: { identifier: string; issuer_schema_id: number }[] };
};

function seal(key: Buffer, plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), payload: Buffer.concat([body, cipher.getAuthTag()]).toString("base64") };
}

function open(key: Buffer, iv: string, payload: string): string {
  const data = Buffer.from(payload, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(data.subarray(data.length - 16));
  return Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]).toString("utf8");
}

type Once = { once?: boolean };

export class WorldBridge {
  /** Every request the app made, in order. */
  readonly requests: BridgeRequest[] = [];
  /** Things the stub could not do. A test that sees any of these has a harness problem, not an app problem. */
  readonly errors: string[] = [];

  private fallback: BridgeBehaviour;
  private readonly queue: BridgeBehaviour[] = [];
  private readonly entries = new Map<string, Entry>();

  private constructor(readonly person: string) {
    this.fallback = { kind: "complete", nullifier: person };
  }

  /**
   * Starts answering for this browser context. By default the phone's person approves every request.
   * `person` is a nullifier in any common spelling, and a new one is made when it is left out.
   */
  static async install(context: BrowserContext, options: { person?: string | bigint } = {}): Promise<WorldBridge> {
    const bridge = new WorldBridge(toCanonicalNullifier(options.person ?? randomNullifier()));
    await context.route(`${BRIDGE_ORIGIN}/**`, (route) => bridge.handle(route));
    return bridge;
  }

  /** From now on this phone belongs to `person` (or only for the next request, with `once`). */
  completeAs(person: string | bigint, options: Once = {}): this {
    return this.set({ kind: "complete", nullifier: toCanonicalNullifier(person) }, options);
  }

  /** The person approves again as the phone's own person. Useful after a failure or a hold. */
  complete(options: Once = {}): this {
    return this.set({ kind: "complete", nullifier: this.person }, options);
  }

  failWith(code: WorldAppError, options: Once = {}): this {
    return this.set({ kind: "fail", code }, options);
  }

  /** The person declines in World App. */
  cancel(options: Once = {}): this {
    return this.failWith("user_rejected", options);
  }

  /** Nobody answers, so the prompt stays open. Close it from the page to test walking away. */
  hold(stage: "waiting" | "connecting" = "waiting", options: Once = {}): this {
    return this.set({ kind: "wait", stage }, options);
  }

  /** Throws when the stub hit a problem of its own. The fixtures call this when a test ends. */
  assertClean() {
    if (this.errors.length > 0) throw new Error(`The World bridge stub failed:\n${this.errors.join("\n")}`);
  }

  private set(behaviour: BridgeBehaviour, options: Once): this {
    if (options.once) this.queue.push(behaviour);
    else this.fallback = behaviour;
    return this;
  }

  private async handle(route: Route) {
    const request = route.request();
    const url = new URL(request.url());
    try {
      if (request.method() === "OPTIONS") return await route.fulfill({ status: 204, headers: CORS });
      if (request.method() === "POST" && url.pathname === "/request") return await this.create(route, request);
      const poll = request.method() === "GET" ? /^\/response\/([^/]+)$/.exec(url.pathname) : null;
      if (poll) return await this.answer(route, request, poll[1]);
      return await this.reply(route, 404, { error: `The stub has no route for ${request.method()} ${url.pathname}.` });
    } catch (error) {
      this.errors.push(`${request.method()} ${url.pathname}: ${error instanceof Error ? error.message : String(error)}`);
      await this.reply(route, 500, { error: "World bridge stub error" }).catch(() => {});
    }
  }

  private reply(route: Route, status: number, body: unknown) {
    return route.fulfill({ status, headers: CORS, contentType: "application/json", body: JSON.stringify(body) });
  }

  private async create(route: Route, request: Request) {
    const sent = JSON.parse(request.postData() ?? "{}") as { iv?: string; payload?: string };
    if (!sent.iv || !sent.payload) throw new Error("The request had no encrypted payload.");
    const behaviour = this.queue.shift() ?? this.fallback;
    const entry: Entry = { id: randomUUID(), behaviour, iv: sent.iv, payload: sent.payload };
    this.entries.set(entry.id, entry);
    this.requests.push(entry);
    await this.reply(route, 200, { request_id: entry.id });
  }

  private async answer(route: Route, request: Request, id: string) {
    const entry = this.entries.get(id);
    if (!entry) return this.reply(route, 404, { error: "Unknown request." });

    const { behaviour } = entry;
    if (behaviour.kind === "wait") {
      return this.reply(route, 200, { status: behaviour.stage === "waiting" ? "initialized" : "retrieved" });
    }

    // The key travels in the link the phone scans, so read it from the link on screen.
    entry.key ??= await this.readKey(request, id);
    if (!entry.key) return this.reply(route, 200, { status: "initialized" });

    const asked = this.decode(entry, entry.key);
    const plain =
      behaviour.kind === "fail"
        ? { error_code: behaviour.code }
        : {
            id: asked.proofRequestId ?? randomUUID(),
            version: 1,
            responses: [this.proofFor(asked, behaviour.nullifier)],
          };
    await this.reply(route, 200, { status: "completed", response: seal(entry.key, JSON.stringify(plain)) });
  }

  private async readKey(request: Request, id: string): Promise<Buffer | undefined> {
    const href = await request
      .frame()
      .locator(`a[href*="i=${id}"], a[href*="i%3D${id}"]`)
      .first()
      .getAttribute("href", { timeout: 4000 })
      .catch(() => null);
    const link = href ? new URL(href) : null;
    const connection = link?.searchParams.get("connect_url");
    const key = connection ? new URL(connection).searchParams.get("k") : link?.searchParams.get("k");
    return key ? Buffer.from(key, "base64") : undefined;
  }

  private decode(entry: Entry, key: Buffer): Asked {
    if (entry.asked) return entry.asked;
    const payload = JSON.parse(open(key, entry.iv, entry.payload)) as Payload;
    entry.asked = {
      action: payload.action ?? null,
      appId: payload.app_id ?? null,
      proofRequestId: payload.proof_request?.id ?? null,
      credentials: (payload.proof_request?.proof_requests ?? []).map((item) => ({
        identifier: item.identifier,
        issuerSchemaId: item.issuer_schema_id,
      })),
    };
    return entry.asked;
  }

  /** The World App proves the first credential the request will accept. */
  private proofFor(asked: Asked, nullifier: string) {
    const credential = asked.credentials[0];
    if (!credential) throw new Error("The request did not ask for any credential, so there is nothing to prove.");
    return {
      identifier: credential.identifier,
      issuer_schema_id: credential.issuerSchemaId,
      proof: PROOF,
      nullifier,
      expires_at_min: 0,
      // A Selfie Check proof (schema 11) carries a sybil score, here the best one.
      ...(credential.issuerSchemaId === 11 ? { claims: [ZERO_FIELD] } : {}),
    };
  }
}
