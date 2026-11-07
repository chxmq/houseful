import { bytesEqual, eventIdBytes, isU32 } from "./bytes";
import { CLOCK_SKEW_WINDOWS } from "./constants";
import { encodeCredentialParts } from "./credential";
import { publicKeyBytes, verify } from "./keys";
import { decodeDoorPayload, doorMessage, eventTag, windowOf } from "./payload";
import { mergeRevocationMaps, type RevocationMap } from "./revocation";

export type RejectReason =
  | "malformed"
  | "wrong-event"
  | "bad-issuer-signature"
  | "expired"
  | "revoked"
  | "stale"
  | "bad-holder-signature"
  | "already-admitted";

export type CheckResult = { ok: true; ticket: number; gen: number } | { ok: false; reason: RejectReason };

export interface VerifierOptions {
  /** Issuer ed25519 public key, 32 bytes hex. */
  issuerPublicKey: string;
  event: string;
  minGenerations?: RevocationMap;
}

export interface VerifierState {
  v: 1;
  event: string;
  admitted: number[];
  minGenerations: [ticket: number, generation: number][];
}

const reject = (reason: RejectReason): CheckResult => ({ ok: false, reason });

export class Verifier {
  readonly event: string;
  readonly #eventBytes: Uint8Array;
  readonly #eventTag: Uint8Array;
  readonly #issuerKey: Uint8Array;
  #minGenerations: Map<number, number>;
  readonly #admitted = new Set<number>();

  constructor(options: VerifierOptions) {
    this.event = options.event;
    this.#eventBytes = eventIdBytes(options.event);
    this.#eventTag = eventTag(this.#eventBytes);
    this.#issuerKey = publicKeyBytes(options.issuerPublicKey);
    this.#minGenerations = mergeRevocationMaps(options.minGenerations ?? new Map());
  }

  /** Verifies a door payload against the local clock and local state only. Admits the ticket on success. */
  check(payload: string, nowSeconds: number): CheckResult {
    const p = decodeDoorPayload(payload);
    if (p === null) return reject("malformed");
    if (!bytesEqual(p.eventTag, this.#eventTag)) return reject("wrong-event");

    const credentialBytes = encodeCredentialParts(this.#eventBytes, p.ticket, p.gen, p.holderKey, p.exp);
    if (!verify(p.issuerSignature, credentialBytes, this.#issuerKey)) return reject("bad-issuer-signature");

    if (nowSeconds > p.exp) return reject("expired");
    if (p.gen < (this.#minGenerations.get(p.ticket) ?? 0)) return reject("revoked");
    if (Math.abs(p.window - windowOf(nowSeconds)) > CLOCK_SKEW_WINDOWS) return reject("stale");

    const message = doorMessage(this.#eventBytes, p.ticket, p.gen, p.window);
    if (!verify(p.holderSignature, message, p.holderKey)) return reject("bad-holder-signature");

    if (this.#admitted.has(p.ticket)) return reject("already-admitted");
    this.#admitted.add(p.ticket);
    return { ok: true, ticket: p.ticket, gen: p.gen };
  }

  /** Raises minimum generations. Never lowers one, so a stale sync cannot un-revoke a ticket. */
  syncRevocations(minGenerations: RevocationMap): void {
    this.#minGenerations = mergeRevocationMaps(this.#minGenerations, minGenerations);
  }

  minGenerationOf(ticket: number): number {
    return this.#minGenerations.get(ticket) ?? 0;
  }

  isAdmitted(ticket: number): boolean {
    return this.#admitted.has(ticket);
  }

  get admittedCount(): number {
    return this.#admitted.size;
  }

  exportState(): VerifierState {
    return {
      v: 1,
      event: this.event,
      admitted: [...this.#admitted].sort((a, b) => a - b),
      minGenerations: [...this.#minGenerations].sort((a, b) => a[0] - b[0]),
    };
  }

  /**
   * Merges state from another scanner of the same event: union of admitted tickets, max of minimum generations.
   * Validates the whole input before applying any of it. Returns how many tickets were newly marked admitted.
   */
  importState(state: unknown): number {
    const parsed = parseState(state);
    if (parsed.event !== this.event) throw new Error(`state is for event "${parsed.event}", not "${this.event}"`);
    let added = 0;
    for (const ticket of parsed.admitted) {
      if (!this.#admitted.has(ticket)) {
        this.#admitted.add(ticket);
        added++;
      }
    }
    this.syncRevocations(new Map(parsed.minGenerations));
    return added;
  }
}

function parseState(state: unknown): VerifierState {
  if (typeof state !== "object" || state === null) throw new TypeError("state must be an object");
  const s = state as Record<string, unknown>;
  if (s.v !== 1) throw new TypeError("unsupported state version");
  if (typeof s.event !== "string") throw new TypeError("state.event must be a string");
  if (!Array.isArray(s.admitted) || !s.admitted.every(isU32)) {
    throw new TypeError("state.admitted must be an array of uint32 ticket ids");
  }
  if (
    !Array.isArray(s.minGenerations) ||
    !s.minGenerations.every((e) => Array.isArray(e) && e.length === 2 && isU32(e[0]) && isU32(e[1]))
  ) {
    throw new TypeError("state.minGenerations must be an array of [ticket, generation] uint32 pairs");
  }
  return {
    v: 1,
    event: s.event,
    admitted: s.admitted as number[],
    minGenerations: s.minGenerations as [number, number][],
  };
}
