import { describe, expect, it } from "vitest";
import { base64urlDecode, base64urlEncode } from "../src/bytes";
import { buildDoorPayload, DOOR_PAYLOAD_LENGTH, secondsUntilRotation, WINDOW, windowOf } from "../src";
import { issue, T0, world } from "./fixtures";

describe("buildDoorPayload", () => {
  it("is a fixed length base64url string well under 300 characters", () => {
    const w = world();
    const payload = buildDoorPayload(issue(w, w.alice), w.alice.secretKey, T0);
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(payload.length).toBe(DOOR_PAYLOAD_LENGTH);
    expect(DOOR_PAYLOAD_LENGTH).toBe(247);
    expect(DOOR_PAYLOAD_LENGTH).toBeLessThan(300);
  });

  it("does not grow with the event id length or large field values", () => {
    const w = world();
    const signed = issue(w, w.alice, { event: "e".repeat(255), ticket: 2 ** 32 - 1, gen: 2 ** 32 - 1, exp: 2 ** 32 - 1 });
    expect(buildDoorPayload(signed, w.alice.secretKey, T0).length).toBe(DOOR_PAYLOAD_LENGTH);
  });

  it("is stable within a window and changes at the boundary", () => {
    const w = world();
    const signed = issue(w, w.alice);
    const a = buildDoorPayload(signed, w.alice.secretKey, T0);
    expect(buildDoorPayload(signed, w.alice.secretKey, T0 + WINDOW - 0.001)).toBe(a);
    expect(buildDoorPayload(signed, w.alice.secretKey, T0 + WINDOW)).not.toBe(a);
  });

  it("refuses a holder key that does not match the credential", () => {
    const w = world();
    expect(() => buildDoorPayload(issue(w, w.alice), w.mallory.secretKey, T0)).toThrow(/does not match/);
  });

  it("refuses a malformed issuer signature", () => {
    const w = world();
    const signed = { ...issue(w, w.alice), issuerSignature: "abcd" };
    expect(() => buildDoorPayload(signed, w.alice.secretKey, T0)).toThrow(TypeError);
  });
});

describe("rotation clock", () => {
  it("counts down from WINDOW to just above zero", () => {
    expect(WINDOW).toBe(20);
    expect(secondsUntilRotation(T0)).toBe(20);
    expect(secondsUntilRotation(T0 + 5)).toBe(15);
    expect(secondsUntilRotation(T0 + 19.5)).toBeCloseTo(0.5);
    expect(secondsUntilRotation(T0 + 20)).toBe(20);
  });

  it("maps seconds to windows", () => {
    expect(windowOf(T0)).toBe(T0 / WINDOW);
    expect(windowOf(T0 + 19.999)).toBe(T0 / WINDOW);
    expect(windowOf(T0 + 20)).toBe(T0 / WINDOW + 1);
  });
});

describe("base64url codec", () => {
  it("round trips every length remainder", () => {
    for (let n = 0; n < 40; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + n) & 0xff);
      expect(base64urlDecode(base64urlEncode(bytes))).toEqual(bytes);
    }
  });

  it("rejects padding, foreign characters, impossible lengths and non-canonical trailing bits", () => {
    expect(base64urlDecode("AA==")).toBeNull();
    expect(base64urlDecode("AA+/")).toBeNull();
    expect(base64urlDecode("AAAAA")).toBeNull();
    expect(base64urlDecode("AB")).toBeNull();
    expect(base64urlDecode("AA")).toEqual(Uint8Array.of(0));
    expect(base64urlDecode("é")).toBeNull();
  });
});
