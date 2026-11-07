import { signInFan } from "../support/auth";
import { test, expect } from "../support/fixtures";

for (const [method, schema, credential] of [
  ["human", 1, "orb"], ["passport", 9303, "document"], ["selfie", 11, "selfie"],
] as const) {
  test(`sign-in requests the selected ${method} proof and creates a verified session`, async ({ page, world }) => {
    await signInFan(page, world, { method });
    expect(world.requests[0].asked?.credentials.map(item => item.issuerSchemaId)).toEqual([schema]);
    await expect(page.getByText(new RegExp(`Credential: ${credential}`))).toBeVisible();
    expect((await page.context().cookies()).some(cookie => cookie.name === "hf_session")).toBe(true);
  });
}

test("a fresh page defaults to Human and offers a simulator link even on a phone", async ({ page, world }) => {
  world.hold();
  await page.goto("/login");
  await expect(page.getByRole("combobox", { name: "Verification method" })).toHaveValue("human");
  await page.getByRole("button", { name: "Sign in with World ID", exact: true }).click();
  const launch = page.getByRole("link", { name: "Open simulator", exact: true });
  await expect(launch).toBeVisible();
  const url = new URL((await launch.getAttribute("href"))!);
  expect(url.origin).toBe("https://simulator.worldcoin.org");
  expect(new URL(url.searchParams.get("connect_url")!).origin).toBe("https://staging.world.org");
  await page.getByRole("button", { name: "Cancel sign-in", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Sign-in was cancelled.");
  expect((await page.context().cookies()).some(cookie => cookie.name === "hf_session")).toBe(false);
});

test("a server-rejected proof stays on sign-in and does not create a session", async ({ page, world, worldVerify }) => {
  await worldVerify.reject(world.person, { code: "verification_error", detail: "Proof refused for this test" });
  await page.goto("/login");
  const answer = page.waitForResponse(response => new URL(response.url()).pathname === "/api/account/login");
  await page.getByRole("button", { name: "Sign in with World ID", exact: true }).click();
  expect((await answer).ok()).toBe(false);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.context().cookies()).some(cookie => cookie.name === "hf_session")).toBe(false);
});


test("server confirmation cannot be cancelled or replaced by another sign-in", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/account/login", async route => {
    await held;
    await route.continue();
  });
  await page.goto("/login");
  const pending = page.waitForRequest(request => new URL(request.url()).pathname === "/api/account/login");
  await page.getByRole("button", { name: "Sign in with World ID", exact: true }).click();
  await pending;
  try {
    await expect(page.getByRole("button", { name: "Cancel sign-in", exact: true })).toBeDisabled();
    await expect(page.getByRole("combobox", { name: "Verification method" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Signing in…", exact: true })).toBeDisabled();
  } finally {
    release();
  }
  await expect(page).toHaveURL(/\/account$/);
});
