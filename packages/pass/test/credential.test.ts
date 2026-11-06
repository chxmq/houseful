import { describe, expect, it } from "vitest";
import { encodeCredential, generateHolderKey, issueCredential, publicKeyFromSecret, verifyCredential } from "../src";
import { issue, world } from "./fixtures";

describe("keys", () => {
  it("generates 32 byte hex keys whose public half derives from the secret", () => {
    const k = generateHolderKey();
    expect(k.secretKey).toMatch(/^[0-9a-f]{64}$/);
    expect(k.publicKey).toMatch(/^[0-9a-f]{64}$/);
    expect(publicKeyFromSecret(k.secretKey)).toBe(k.publicKey);
    expect(generateHolderKey().secretKey).not.toBe(k.secretKey);
  });

  it("rejects malformed secret keys", () => {
    expect(() => publicKeyFromSecret("abcd")).toThrow(TypeError);
    expect(() => publicKeyFromSecret("zz".repeat(32))).toThrow(TypeError);
  });
});

describe("encodeCredential", () => {
  it("is deterministic and independent of property order and hex case", () => {
    const w = world();
    const c = w.credentialFor(w.alice);
    const reordered = { exp: c.exp, holderKey: c.holderKey.toUpperCase(), gen: c.gen, ticket: c.ticket, event: c.event, v: 1 as const };
    expect(encodeCredential(reordered)).toEqual(encodeCredential(c));
  });

  it("changes when any field changes", () => {
    const w = world();
    const base = encodeCredential(w.credentialFor(w.alice));
    const variants = [
      w.credentialFor(w.alice, { event: "mumbai-fest-2" }),
      w.credentialFor(w.alice, { ticket: 8 }),
      w.credentialFor(w.alice, { gen: 1 }),
      w.credentialFor(w.bob),
      w.credentialFor(w.alice, { exp: w.credentialFor(w.alice).exp + 1 }),
    ];
    for (const v of variants) expect(encodeCredential(v)).not.toEqual(base);
  });

  it("does not let field boundaries shift between event id and ticket", () => {
    const w = world();
    const a = encodeCredential(w.credentialFor(w.alice, { event: "ab" }));
    const b = encodeCredential(w.credentialFor(w.alice, { event: "a" }));
    expect(a).not.toEqual(b);
  });
});

describe("issueCredential", () => {
  it("produces a credential that verifies under the issuer key only", () => {
    const w = world();
    const signed = issue(w, w.alice);
    expect(signed.issuerSignature).toMatch(/^[0-9a-f]{128}$/);
    expect(verifyCredential(signed, w.issuer.publicKey)).toBe(true);
    expect(verifyCredential(signed, w.mallory.publicKey)).toBe(false);
  });

  it("fails verification when any signed field is tampered with", () => {
    const w = world();
    const signed = issue(w, w.alice);
    expect(verifyCredential({ ...signed, credential: { ...signed.credential, gen: 1 } }, w.issuer.publicKey)).toBe(false);
    expect(verifyCredential({ ...signed, credential: { ...signed.credential, holderKey: w.mallory.publicKey } }, w.issuer.publicKey)).toBe(false);
    expect(verifyCredential({ ...signed, issuerSignature: "00" }, w.issuer.publicKey)).toBe(false);
  });

  it("normalizes the holder key to lowercase", () => {
    const w = world();
    const signed = issueCredential(w.credentialFor(w.alice, { holderKey: w.alice.publicKey.toUpperCase() }), w.issuer.secretKey);
    expect(signed.credential.holderKey).toBe(w.alice.publicKey);
  });

  it.each([
    ["ticket negative", { ticket: -1 }],
    ["ticket fractional", { ticket: 1.5 }],
    ["ticket above uint32", { ticket: 2 ** 32 }],
    ["gen above uint32", { gen: 2 ** 32 }],
    ["exp NaN", { exp: Number.NaN }],
    ["empty event", { event: "" }],
    ["event over 255 bytes", { event: "x".repeat(256) }],
    ["holder key wrong length", { holderKey: "ab" }],
    ["holder key not hex", { holderKey: "zz".repeat(32) }],
  ])("rejects %s", (_, overrides) => {
    const w = world();
    expect(() => issueCredential(w.credentialFor(w.alice, overrides), w.issuer.secretKey)).toThrow();
  });

  it("rejects an unknown credential version", () => {
    const w = world();
    const c = { ...w.credentialFor(w.alice), v: 2 } as unknown as Parameters<typeof issueCredential>[0];
    expect(() => issueCredential(c, w.issuer.secretKey)).toThrow(RangeError);
  });
});
