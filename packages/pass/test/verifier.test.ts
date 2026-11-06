import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDoorPayload,
  buildRevocationMap,
  DOOR_PAYLOAD_LENGTH,
  issueCredential,
  Verifier,
  WINDOW,
  windowOf,
  type CheckResult,
  type RejectReason,
} from "../src";
import { base64urlEncode } from "../src/bytes";
import { DAY, EVENT, issue, mutate, resignHolder, setWindow, T0, world } from "./fixtures";

const rejected = (reason: RejectReason): CheckResult => ({ ok: false, reason });

describe("Verifier: happy path", () => {
  it("admits a live payload and reports ticket and generation", () => {
    const w = world();
    const payload = buildDoorPayload(issue(w, w.alice), w.alice.secretKey, T0 + 5);
    expect(w.verifier().check(payload, T0 + 5)).toEqual({ ok: true, ticket: 7, gen: 0 });
  });

  it("admits at the exact expiry second", () => {
    const w = world();
    const exp = T0 + 100;
    const payload = buildDoorPayload(issue(w, w.alice, { exp }), w.alice.secretKey, exp);
    expect(w.verifier().check(payload, exp).ok).toBe(true);
  });

  it("works with every network API removed", () => {
    vi.stubGlobal("fetch", () => {
      throw new Error("network used");
    });
    vi.stubGlobal("XMLHttpRequest", undefined);
    vi.stubGlobal("WebSocket", undefined);
    const w = world();
    const payload = buildDoorPayload(issue(w, w.alice), w.alice.secretKey, T0);
    expect(w.verifier().check(payload, T0).ok).toBe(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects construction with an invalid issuer key or event id", () => {
    const w = world();
    expect(() => new Verifier({ issuerPublicKey: "00", event: EVENT })).toThrow();
    expect(() => new Verifier({ issuerPublicKey: w.issuer.publicKey, event: "" })).toThrow();
  });
});

describe("Verifier: malformed", () => {
  const w = world();
  const good = buildDoorPayload(issue(w, w.alice), w.alice.secretKey, T0);

  it.each([
    ["empty string", ""],
    ["random text", "hello world"],
    ["one char short", good.slice(1)],
    ["one char long", `${good}A`],
    ["standard base64 characters", `${good.slice(0, -2)}+/`],
    ["base64 padding", `${good.slice(0, -2)}==`],
    ["non-canonical trailing bits", `${good.slice(0, -1)}${good.at(-1) === "B" ? "C" : "B"}`],
    ["legacy JSON spike payload", base64urlEncode(new TextEncoder().encode(JSON.stringify({ c: {}, cs: "", t: 0, s: "" })))],
  ])("%s", (_, payload) => {
    expect(w.verifier().check(payload, T0)).toEqual(rejected("malformed"));
  });

  it("unknown payload version byte", () => {
    const payload = mutate(good, (b) => {
      b[0] = 2;
    });
    expect(w.verifier().check(payload, T0)).toEqual(rejected("malformed"));
  });

  it("non-string input from an untyped scanner callback", () => {
    for (const input of [null, undefined, 42, {}, new Uint8Array(185)]) {
      expect(w.verifier().check(input as unknown as string, T0)).toEqual(rejected("malformed"));
    }
  });

  it("never throws and never admits on random input", () => {
    const v = w.verifier();
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    for (let i = 0; i < 500; i++) {
      const len = i % 2 === 0 ? DOOR_PAYLOAD_LENGTH : Math.floor(Math.random() * 400);
      let s = "";
      for (let j = 0; j < len; j++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
      expect(v.check(s, T0).ok).toBe(false);
    }
    expect(v.admittedCount).toBe(0);
  });
});

describe("Verifier: wrong event", () => {
  it("rejects a valid ticket for a different event", () => {
    const w = world();
    const payload = buildDoorPayload(issue(w, w.alice, { event: "pune-fest" }), w.alice.secretKey, T0);
    expect(w.verifier().check(payload, T0)).toEqual(rejected("wrong-event"));
  });
});

describe("Verifier: forged credential", () => {
  it("rejects a credential whose holder key was swapped to the attacker's", () => {
    const w = world();
    const signed = issue(w, w.alice);
    const forged = { ...signed, credential: { ...signed.credential, holderKey: w.mallory.publicKey } };
    const payload = buildDoorPayload(forged, w.mallory.secretKey, T0);
    expect(w.verifier().check(payload, T0)).toEqual(rejected("bad-issuer-signature"));
  });

  it("rejects a credential self-issued with an attacker issuer key", () => {
    const w = world();
    const signed = issueCredential(w.credentialFor(w.mallory), w.mallory.secretKey);
    const payload = buildDoorPayload(signed, w.mallory.secretKey, T0);
    expect(w.verifier().check(payload, T0)).toEqual(rejected("bad-issuer-signature"));
  });

  it("rejects a generation bumped to dodge revocation", () => {
    const w = world();
    const signed = issue(w, w.alice);
    const bumped = { ...signed, credential: { ...signed.credential, gen: 5 } };
    const payload = buildDoorPayload(bumped, w.alice.secretKey, T0);
    expect(w.verifier(buildRevocationMap([{ ticket: 7, generation: 1 }])).check(payload, T0)).toEqual(
      rejected("bad-issuer-signature"),
    );
  });

  it("rejects an extended expiry", () => {
    const w = world();
    const signed = issue(w, w.alice, { exp: T0 - 1 });
    const extended = { ...signed, credential: { ...signed.credential, exp: T0 + DAY } };
    const payload = buildDoorPayload(extended, w.alice.secretKey, T0);
    expect(w.verifier().check(payload, T0)).toEqual(rejected("bad-issuer-signature"));
  });
});

describe("Verifier: expired", () => {
  it("rejects one second after expiry", () => {
    const w = world();
    const exp = T0 + 100;
    const payload = buildDoorPayload(issue(w, w.alice, { exp }), w.alice.secretKey, exp + 1);
    expect(w.verifier().check(payload, exp + 1)).toEqual(rejected("expired"));
  });

  it("rejects the spike scenario a day later", () => {
    const w = world();
    const now = T0 + 90_000;
    const payload = buildDoorPayload(issue(w, w.alice), w.alice.secretKey, now);
    expect(w.verifier().check(payload, now)).toEqual(rejected("expired"));
  });
});

describe("Verifier: surrender revocation", () => {
  const surrender = () => {
    const w = world();
    const old = issue(w, w.alice, { gen: 0 });
    const next = issue(w, w.bob, { gen: 1 });
    const minGenerations = buildRevocationMap([{ ticket: 7n, generation: 1n }]);
    return { w, old, next, minGenerations };
  };

  it("rejects the surrendered generation on a synced scanner", () => {
    const { w, old, minGenerations } = surrender();
    const payload = buildDoorPayload(old, w.alice.secretKey, T0);
    expect(w.verifier(minGenerations).check(payload, T0)).toEqual(rejected("revoked"));
  });

  it("admits the new holder's generation on a synced scanner", () => {
    const { w, next, minGenerations } = surrender();
    const payload = buildDoorPayload(next, w.bob.secretKey, T0);
    expect(w.verifier(minGenerations).check(payload, T0)).toEqual({ ok: true, ticket: 7, gen: 1 });
  });

  it("KNOWN LIMIT: an unsynced scanner admits the surrendered generation", () => {
    const { w, old } = surrender();
    const payload = buildDoorPayload(old, w.alice.secretKey, T0);
    expect(w.verifier().check(payload, T0).ok).toBe(true);
  });

  it("syncRevocations applies to a running scanner and never lowers a minimum", () => {
    const { w, old, minGenerations } = surrender();
    const v = w.verifier();
    v.syncRevocations(minGenerations);
    v.syncRevocations(buildRevocationMap([{ ticket: 7, generation: 0 }]));
    expect(v.minGenerationOf(7)).toBe(1);
    expect(v.check(buildDoorPayload(old, w.alice.secretKey, T0), T0)).toEqual(rejected("revoked"));
  });

  it("does not affect other tickets", () => {
    const { w, minGenerations } = surrender();
    const other = issue(w, w.alice, { ticket: 8 });
    expect(w.verifier(minGenerations).check(buildDoorPayload(other, w.alice.secretKey, T0), T0).ok).toBe(true);
  });
});

describe("Verifier: stolen credential", () => {
  it("rejects a stolen credential signed with the attacker's key", () => {
    const w = world();
    const signed = issue(w, w.alice);
    const genuine = buildDoorPayload(signed, w.alice.secretKey, T0);
    const stolen = resignHolder(genuine, w.mallory.secretKey, 7, 0, T0 + 60);
    expect(w.verifier().check(stolen, T0 + 60)).toEqual(rejected("bad-holder-signature"));
  });

  it("rejects a screenshot re-dated to the current window", () => {
    const w = world();
    const shot = buildDoorPayload(issue(w, w.alice), w.alice.secretKey, T0);
    const redated = setWindow(shot, windowOf(T0 + 300));
    expect(w.verifier().check(redated, T0 + 300)).toEqual(rejected("bad-holder-signature"));
  });

  it("rejects a corrupted holder signature", () => {
    const w = world();
    const payload = mutate(buildDoorPayload(issue(w, w.alice), w.alice.secretKey, T0), (b) => {
      b[b.length - 1]! ^= 1;
    });
    expect(w.verifier().check(payload, T0)).toEqual(rejected("bad-holder-signature"));
  });
});

describe("Verifier: screenshot replay", () => {
  it("KNOWN LIMIT: a screenshot replayed inside the window on a fresh device is admitted", () => {
    const w = world();
    const shot = buildDoorPayload(issue(w, w.alice), w.alice.secretKey, T0);
    const door1 = w.verifier();
    const door2 = w.verifier();
    expect(door1.check(shot, T0 + 2).ok).toBe(true);
    expect(door2.check(shot, T0 + 10).ok).toBe(true);
  });

  it("the same device rejects the replay", () => {
    const w = world();
    const shot = buildDoorPayload(issue(w, w.alice), w.alice.secretKey, T0);
    const door = w.verifier();
    expect(door.check(shot, T0 + 2).ok).toBe(true);
    expect(door.check(shot, T0 + 10)).toEqual(rejected("already-admitted"));
  });

  it.each([2 * WINDOW, 95, 3600])("a screenshot replayed %i seconds later is stale", (delay) => {
    const w = world();
    const shot = buildDoorPayload(issue(w, w.alice), w.alice.secretKey, T0);
    expect(w.verifier().check(shot, T0 + delay)).toEqual(rejected("stale"));
  });

  it("a payload pre-generated for a future window is stale", () => {
    const w = world();
    const future = buildDoorPayload(issue(w, w.alice), w.alice.secretKey, T0 + 2 * WINDOW);
    expect(w.verifier().check(future, T0)).toEqual(rejected("stale"));
  });
});

describe("Verifier: clock skew", () => {
  const w = world();
  const signed = issue(w, w.alice);
  const payloadAt = (phoneNow: number) => buildDoorPayload(signed, w.alice.secretKey, phoneNow);

  it("accepts a phone one window behind the scanner", () => {
    expect(w.verifier().check(payloadAt(T0), T0 + 2 * WINDOW - 0.001).ok).toBe(true);
  });

  it("accepts a phone one window ahead of the scanner", () => {
    expect(w.verifier().check(payloadAt(T0 + WINDOW), T0).ok).toBe(true);
    expect(w.verifier().check(payloadAt(T0 + WINDOW), T0 - 0.001)).toEqual(rejected("stale"));
  });

  it("rejects two windows of skew in either direction", () => {
    expect(w.verifier().check(payloadAt(T0), T0 + 2 * WINDOW)).toEqual(rejected("stale"));
    expect(w.verifier().check(payloadAt(T0 + 2 * WINDOW), T0)).toEqual(rejected("stale"));
  });
});

describe("Verifier: already admitted", () => {
  it("rejects a second fresh payload for the same ticket on the same device", () => {
    const w = world();
    const signed = issue(w, w.alice);
    const door = w.verifier();
    expect(door.check(buildDoorPayload(signed, w.alice.secretKey, T0 + 5), T0 + 5).ok).toBe(true);
    expect(door.check(buildDoorPayload(signed, w.alice.secretKey, T0 + 6), T0 + 6)).toEqual(rejected("already-admitted"));
    expect(door.check(buildDoorPayload(signed, w.alice.secretKey, T0 + 600), T0 + 600)).toEqual(rejected("already-admitted"));
  });

  it("tracks admission per ticket, so a surrender after entry cannot admit a second person", () => {
    const w = world();
    const door = w.verifier();
    expect(door.check(buildDoorPayload(issue(w, w.alice), w.alice.secretKey, T0), T0).ok).toBe(true);
    door.syncRevocations(buildRevocationMap([{ ticket: 7, generation: 1 }]));
    const bobPayload = buildDoorPayload(issue(w, w.bob, { gen: 1 }), w.bob.secretKey, T0 + 30);
    expect(door.check(bobPayload, T0 + 30)).toEqual(rejected("already-admitted"));
  });

  it("does not mark a ticket admitted on a failed check", () => {
    const w = world();
    const door = w.verifier();
    const shot = buildDoorPayload(issue(w, w.alice), w.alice.secretKey, T0);
    expect(door.check(shot, T0 + 3600).ok).toBe(false);
    expect(door.isAdmitted(7)).toBe(false);
    expect(door.check(buildDoorPayload(issue(w, w.alice), w.alice.secretKey, T0 + 3600), T0 + 3600).ok).toBe(true);
  });
});

describe("Verifier: state merge", () => {
  it("merges admitted sets so a ticket used at one door is rejected at another", () => {
    const w = world();
    const doorA = w.verifier();
    const doorB = w.verifier();
    const alice = buildDoorPayload(issue(w, w.alice, { ticket: 1 }), w.alice.secretKey, T0);
    const bob = buildDoorPayload(issue(w, w.bob, { ticket: 2 }), w.bob.secretKey, T0);
    expect(doorA.check(alice, T0).ok).toBe(true);
    expect(doorB.check(bob, T0).ok).toBe(true);

    expect(doorB.importState(JSON.parse(JSON.stringify(doorA.exportState())))).toBe(1);
    expect(doorA.importState(doorB.exportState())).toBe(1);
    expect(doorA.importState(doorB.exportState())).toBe(0);

    const aliceLater = buildDoorPayload(issue(w, w.alice, { ticket: 1 }), w.alice.secretKey, T0 + 100);
    expect(doorB.check(aliceLater, T0 + 100)).toEqual(rejected("already-admitted"));
    expect(doorA.exportState()).toEqual(doorB.exportState());
    expect(doorA.exportState().admitted).toEqual([1, 2]);
  });

  it("merges revocations by taking the highest minimum generation", () => {
    const w = world();
    const synced = w.verifier(buildRevocationMap([{ ticket: 7, generation: 2 }, { ticket: 9, generation: 1 }]));
    const stale = w.verifier(buildRevocationMap([{ ticket: 7, generation: 1 }]));
    stale.importState(synced.exportState());
    expect(stale.minGenerationOf(7)).toBe(2);
    expect(stale.minGenerationOf(9)).toBe(1);
    synced.importState(w.verifier(buildRevocationMap([{ ticket: 7, generation: 0 }])).exportState());
    expect(synced.minGenerationOf(7)).toBe(2);
  });

  it("refuses state from a different event", () => {
    const w = world();
    const other = new Verifier({ issuerPublicKey: w.issuer.publicKey, event: "pune-fest" });
    expect(() => w.verifier().importState(other.exportState())).toThrow(/pune-fest/);
  });

  it.each([
    ["null", null],
    ["wrong version", { v: 2, event: EVENT, admitted: [], minGenerations: [] }],
    ["admitted not an array", { v: 1, event: EVENT, admitted: "1,2", minGenerations: [] }],
    ["admitted with a negative id", { v: 1, event: EVENT, admitted: [1, -2], minGenerations: [] }],
    ["minGenerations bad pair", { v: 1, event: EVENT, admitted: [], minGenerations: [[1]] }],
  ])("rejects %s without applying any of it", (_, state) => {
    const w = world();
    const door = w.verifier();
    expect(() => door.importState(state)).toThrow(TypeError);
    expect(door.admittedCount).toBe(0);
  });

  it("rejects a partially valid state atomically", () => {
    const w = world();
    const door = w.verifier();
    expect(() => door.importState({ v: 1, event: EVENT, admitted: [1, 2, "3"], minGenerations: [] })).toThrow();
    expect(door.isAdmitted(1)).toBe(false);
  });
});

describe("buildRevocationMap", () => {
  it("accepts bigint values from chain reads and keeps the highest duplicate", () => {
    const map = buildRevocationMap([
      { ticket: 7n, generation: 2n },
      { ticket: 7n, generation: 1n },
      { ticket: 8, generation: 0 },
    ]);
    expect([...map]).toEqual([
      [7, 2],
      [8, 0],
    ]);
  });

  it.each([
    [{ ticket: -1, generation: 0 }],
    [{ ticket: 1, generation: 1.5 }],
    [{ ticket: 2n ** 32n, generation: 0n }],
    [{ ticket: 1n, generation: -1n }],
  ])("rejects out of range entries %o", (entry) => {
    expect(() => buildRevocationMap([entry])).toThrow(RangeError);
  });
});
