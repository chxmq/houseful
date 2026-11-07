import { describe, expect, it } from "vitest";
import { confirmLoginResponse, loginPreset, loginErrorMessage, loginMethods } from "../src/lib/world-login";

describe("World sign-in method requests", () => {
  it.each([
    ["human", "ProofOfHuman"], ["passport", "Passport"], ["selfie", "SelfieCheck"],
  ] as const)("requests only the selected %s credential with its challenge signal", (method, credential) => {
    expect(loginPreset(method, "houseful:login:challenge-123")).toEqual({ type: credential, signal: "houseful:login:challenge-123" });
  });
  it("defaults to Human and excludes device-only proofs", () => {
    expect(loginMethods[0].id).toBe("human");
    expect(loginMethods.some(method => (method.id as string) === "device")).toBe(false);
  });
  it("does not describe a version failure as a missing selfie", () => {
    expect(loginErrorMessage("world_id_4_not_available", "human")).toMatch(/World ID 4\.0/);
    expect(loginErrorMessage("world_id_4_not_available", "human")).not.toMatch(/Selfie/);
    expect(loginErrorMessage("credential_unavailable", "human")).toContain("Human");
    expect(loginErrorMessage("credential_unavailable", "passport")).toContain("Passport");
    expect(loginErrorMessage("credential_unavailable", "selfie")).toContain("Selfie Check");
  });
});

describe("server login confirmation", () => {
  it("rejects a failed server response so the widget cannot report success", async () => {
    await expect(confirmLoginResponse(Response.json({ error: "The login challenge expired." }, { status: 422 }))).rejects.toThrow("The login challenge expired.");
  });
  it("requires an explicit confirmed login, including for HTTP 200", async () => {
    await expect(confirmLoginResponse(Response.json({}))).rejects.toThrow("Sign-in could not be confirmed.");
    await expect(confirmLoginResponse(new Response("<html>Error</html>", { status: 502 }))).rejects.toThrow("Sign-in failed. Please try again.");
    await expect(confirmLoginResponse(Response.json({ ok: true }))).resolves.toBeUndefined();
  });
});

describe("simulator handoff", () => {
  it("carries the exact connection into a staging simulator link", async () => {
    const { simulatorLink } = await import("../src/lib/world-login");
    const connection = "https://staging.world.org/verify?t=wld&i=request-id&k=key%2Bvalue%3D";
    const link = new URL(simulatorLink(connection));
    expect(link.origin).toBe("https://simulator.worldcoin.org");
    expect(link.searchParams.get("connect_url")).toBe(connection);
  });
  it("does not send production connections or unexpected URLs to the simulator", async () => {
    const { simulatorLink } = await import("../src/lib/world-login");
    for (const connection of ["https://world.org/verify?t=wld", "https://example.com/verify", "javascript:alert(1)"]) {
      expect(() => simulatorLink(connection)).toThrow("This is not a staging World connection.");
    }
  });
});
