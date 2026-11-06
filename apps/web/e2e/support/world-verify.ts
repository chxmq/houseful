import { URLS } from "../stack/config";
import { nullifierKey, type VerifyCall, type VerifyRule } from "../stack/world-verify-stub";

export type { VerifyCall, VerifyRule };

/**
 * Test side of the World verify stub that the app's server calls (see stack/world-verify-stub.ts).
 *
 * Rules are keyed by nullifier, so a test that picks its own person never affects another test. Every
 * rule a test sets through `rule` is removed again by `release`, which the fixtures call at the end.
 */
export class WorldVerify {
  private readonly touched = new Set<string>();

  constructor(private readonly base: string = URLS.world) {}

  private async send(method: string, path: string, body?: unknown): Promise<unknown> {
    const res = await fetch(`${this.base}/__e2e${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`World verify stub answered ${res.status} to ${method} ${path}: ${await res.text()}`);
    return res.json();
  }

  /** Make World answer `rule` when the app checks a proof from this person. */
  async rule(nullifier: string | bigint, rule: VerifyRule): Promise<void> {
    const key = nullifierKey(nullifier);
    this.touched.add(key);
    await this.send("PUT", "/rules", { nullifier: key, rule });
  }

  /** World refuses this person's proof, the way it does for a proof that does not verify. */
  reject(nullifier: string | bigint, failure: { status?: number; code?: string | null; detail?: string | null } = {}) {
    return this.rule(nullifier, { kind: "reject", ...failure });
  }

  /** World cannot be reached when the app checks this person's proof. */
  unreachable(nullifier: string | bigint) {
    return this.rule(nullifier, { kind: "unreachable" });
  }

  /** A switch for everyone with no rule of their own. Prefer `rule`, which cannot touch other tests. Call `release` after. */
  async everyone(rule: VerifyRule): Promise<void> {
    this.touched.add("*");
    await this.send("PUT", "/default", rule);
  }

  /** Every check the app made, or only those for one person. */
  async calls(nullifier?: string | bigint): Promise<VerifyCall[]> {
    const query = nullifier === undefined ? "" : `?nullifier=${encodeURIComponent(nullifierKey(nullifier))}`;
    return (await this.send("GET", `/calls${query}`)) as VerifyCall[];
  }

  /** Remove the rules this test set. */
  async release(): Promise<void> {
    for (const key of this.touched) {
      if (key === "*") await this.send("DELETE", "/default");
      else await this.send("DELETE", `/rules?nullifier=${encodeURIComponent(key)}`);
    }
    this.touched.clear();
  }
}
