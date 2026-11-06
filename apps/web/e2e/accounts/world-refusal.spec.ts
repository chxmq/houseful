/**
 * When World says no at sign-in, the fan stays signed out and the page says why. Each case below makes the World App
 * or World's verify API refuse in one way and records the exact line the sign-in page shows, so a change to the words
 * shows up here. The last two cases replay a proof the fan really made.
 */
import { signInFan } from "../support/auth";
import { test, expect } from "../support/fixtures";
import type { WorldBridge, WorldVerify } from "../support/fixtures";
import { randomNullifier } from "../support/world-bridge";
import { accountMenu, signInMessage } from "./account-page";

type Refusal = {
  name: string;
  /** Makes the next sign-in fail. The person is the phone's own, so a rule for `world.person` reaches the verify call. */
  arrange: (world: WorldBridge, worldVerify: WorldVerify) => Promise<void> | void;
  /** The exact line under the sign-in button. */
  message: string;
};

const refusals: Refusal[] = [
  {
    name: "the person declines in World App",
    arrange: (world) => void world.cancel({ once: true }),
    message: "Sign-in was cancelled.",
  },
  {
    name: "the person has no Selfie Check yet",
    arrange: (world) => void world.failWith("credential_unavailable", { once: true }),
    message: "Your World ID does not have a Selfie Check yet.",
  },
  {
    name: "World App says World ID 4 is not available to the person",
    arrange: (world) => void world.failWith("world_id_4_not_available", { once: true }),
    message: "Your World ID does not have a Selfie Check yet.",
  },
  {
    name: "World App does not answer in time",
    arrange: (world) => void world.failWith("connection_failed", { once: true }),
    message: "World App did not respond in time.",
  },
  {
    name: "World App reports a proof that was already used",
    arrange: (world) => void world.failWith("nullifier_replayed", { once: true }),
    message: "World could not verify this request (nullifier_replayed).",
  },
  {
    name: "World App reports too many verifications",
    arrange: (world) => void world.failWith("max_verifications_reached", { once: true }),
    message: "World could not verify this request (max_verifications_reached).",
  },
  {
    name: "World's verify API rejects the proof with a reason",
    arrange: (world, worldVerify) => worldVerify.reject(world.person, { code: "invalid_proof", detail: "The proof did not verify." }),
    message: "The proof did not verify.",
  },
  {
    name: "World's verify API rejects the proof with a code and no reason",
    arrange: (world, worldVerify) => worldVerify.reject(world.person, { status: 400, code: "max_verifications_reached", detail: null }),
    message: "max_verifications_reached",
  },
  {
    name: "World's verify API refuses and says nothing",
    arrange: (world, worldVerify) => worldVerify.reject(world.person, { status: 500, code: null, detail: null }),
    message: "World rejected the proof (HTTP 500).",
  },
  {
    name: "World's verify API cannot be reached",
    arrange: (world, worldVerify) => worldVerify.unreachable(world.person),
    message: "Could not reach World to check the proof.",
  },
  {
    name: "World vouches for a different person than the proof names",
    arrange: (world, worldVerify) => worldVerify.rule(world.person, { kind: "ok", nullifier: randomNullifier() }),
    message: "The verified nullifier did not match the proof that was submitted.",
  },
];

test.describe("a refused sign-in leaves the fan signed out", () => {
  for (const refusal of refusals) {
    test(refusal.name, async ({ page, world, worldVerify }) => {
      await refusal.arrange(world, worldVerify);
      await page.goto("/login");
      await page.getByRole("button", { name: "Sign in with World ID" }).click();

      // The page shows the words and nothing signs the fan in.
      await expect(signInMessage(page, "Sign in with World ID")).toHaveText(refusal.message);
      await expect(page).toHaveURL(/\/login$/);
      expect((await page.context().cookies()).some((cookie) => cookie.name === "hf_session")).toBe(false);
      await expect(accountMenu(page).getByRole("link", { name: "Sign in" })).toBeVisible();
      await page.goto("/account");
      await expect(page).toHaveURL(/\/login\?next=%2Faccount&reason=signin$/);

      // The fan can try again from the sign-in page. World approves this time.
      await worldVerify.release();
      await page.getByRole("button", { name: "Sign in with World ID" }).click();
      await expect(page).toHaveURL(/\/account$/);
      await expect(page.getByRole("heading", { name: "You", level: 1 })).toBeVisible();
    });
  }
});

test.describe("a prompt nobody answers", () => {
  test("the person closes the World prompt, and the fan is told it was cancelled", async ({ page, world }) => {
    world.hold("waiting", { once: true });
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in with World ID" }).click();
    const prompt = page.getByRole("dialog");
    await expect(prompt.getByText("Connect your World ID")).toBeVisible();

    await prompt.getByRole("button", { name: "Close" }).click();
    await expect(signInMessage(page, "Sign in with World ID")).toHaveText("Sign-in was cancelled.");
    await expect(page).toHaveURL(/\/login$/);
    expect((await page.context().cookies()).some((cookie) => cookie.name === "hf_session")).toBe(false);

    // The next prompt is answered, and the fan gets in.
    await page.getByRole("button", { name: "Sign in with World ID" }).click();
    await expect(page).toHaveURL(/\/account$/);
  });
});

test.describe("a proof that was already used", () => {
  test("replayed after the fan signed out, it is refused because its challenge is spent", async ({ page, world }) => {
    const sentProof = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/account/login");
    await signInFan(page, world);
    const proof = (await sentProof).postDataJSON();

    await page.context().clearCookies();
    const replay = await page.request.post("/api/account/login", { data: proof });
    expect(replay.status()).toBe(400);
    expect(await replay.json()).toEqual({ code: "stale-challenge", error: "Start World ID again. The login challenge expired." });

    // The replay did not sign anyone in.
    await page.goto("/account");
    await expect(page).toHaveURL(/\/login\?next=%2Faccount&reason=signin$/);
  });

  test("a second person who presents the first person's proof is refused, even with a challenge of their own", async ({
    page,
    world,
    device,
  }) => {
    const sentProof = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/account/login");
    await signInFan(page, world);
    const proof = (await sentProof).postDataJSON();

    // Another phone, another person, with a real login challenge of its own: that is a cookie in its context.
    const intruder = await device();
    const started = await intruder.page.request.post("/api/account/request", { data: { kind: "fan" } });
    expect(started.ok()).toBe(true);
    const replay = await intruder.page.request.post("/api/account/login", { data: proof });
    expect(replay.status()).toBe(422);
    expect(await replay.json()).toEqual({ code: "signal-mismatch", error: "This proof is bound to a different signal." });

    // The intruder has no session, and the first person's session is untouched.
    await intruder.page.goto("/account");
    await expect(intruder.page).toHaveURL(/\/login\?next=%2Faccount&reason=signin$/);
    await page.goto("/account");
    await expect(page.getByRole("heading", { name: "You", level: 1 })).toBeVisible();
  });
});
