/**
 * /tickets and /account open for a signed-in fan, /host and /host/new for a signed-in host. Someone who is not
 * signed in goes to the login of the right role and, once signed in, on to where they were headed. Someone signed
 * in as the other role never reaches the page.
 */
import { signInFan, signInHost } from "../support/auth";
import { test, expect } from "../support/fixtures";
import { accountMenu } from "./account-page";

test.describe("signed out", () => {
  const fanPages = [
    { path: "/tickets", next: "%2Ftickets" },
    { path: "/account", next: "%2Faccount" },
  ];
  const hostPages = [
    { path: "/host", next: "%2Fhost" },
    { path: "/host/new", next: "%2Fhost%2Fnew" },
  ];

  for (const { path, next } of fanPages) {
    test(`${path} sends a visitor to the fan sign-in and says why`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${next}&reason=signin$`));
      await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();
      await expect(page.getByText("Sign in with World ID to continue.")).toBeVisible();
    });
  }

  for (const { path, next } of hostPages) {
    test(`${path} sends a visitor to the host sign-in and says why`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/host/login\\?next=${next}&reason=signin$`));
      await expect(page.getByRole("heading", { name: "Host sign in", level: 1 })).toBeVisible();
      await expect(page.getByText("Sign the host challenge with your wallet.")).toBeVisible();
    });
  }

  test("a fan who signs in from the wallet page lands on the wallet page", async ({ page }) => {
    await page.goto("/tickets");
    await expect(page).toHaveURL(/\/login\?next=%2Ftickets&reason=signin$/);
    await page.getByRole("button", { name: "Sign in with World ID" }).click();

    await expect(page).toHaveURL(/\/tickets$/);
    await expect(page.getByRole("heading", { name: "Your tickets", level: 1 })).toBeVisible();
  });

  test("a host who signs in from the listing form lands on the listing form", async ({ page, wallet }) => {
    await wallet();
    await page.goto("/host/new");
    await expect(page).toHaveURL(/\/host\/login\?next=%2Fhost%2Fnew&reason=signin$/);
    await page.getByRole("button", { name: "Sign in with wallet" }).click();

    await expect(page).toHaveURL(/\/host\/new$/);
    await expect(page.getByRole("heading", { name: "List a show", level: 1 })).toBeVisible();
  });
});

test.describe("signed in as the other role", () => {
  test("a fan never reaches the host console", async ({ page, world }) => {
    await signInFan(page, world);

    for (const path of ["/host", "/host/new"]) {
      await page.goto(path);
      await expect(page).not.toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("heading", { name: /^(Host a show|List a show)$/ })).toHaveCount(0);
    }
    // The fan is still signed in as a fan.
    await expect(accountMenu(page).getByRole("link", { name: "Account" })).toBeVisible();
    await page.goto("/account");
    await expect(page.getByRole("heading", { name: "You", level: 1 })).toBeVisible();
  });

  test("a host never reaches the wallet page or the account page", async ({ page }) => {
    await signInHost(page);

    for (const path of ["/tickets", "/account"]) {
      await page.goto(path);
      await expect(page).not.toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("heading", { name: /^(Your tickets|You)$/, level: 1 })).toHaveCount(0);
    }
    // The host is still signed in as a host.
    await expect(accountMenu(page).getByRole("link", { name: "Host console" })).toBeVisible();
  });

  test("a fan sent away from /host is told it is a fan session", async ({ page, world }) => {
    await signInFan(page, world);
    await page.goto("/host");

    await expect(page.getByText("That session is a fan World ID. Sign in here with the host wallet.")).toBeVisible();
  });

  test("a host sent away from /tickets is told it is a host session", async ({ page }) => {
    await signInHost(page);
    await page.goto("/tickets");

    await expect(page.getByText("That session is a host wallet. Sign in here as a fan.")).toBeVisible();
  });
});

test.describe("where sign-in sends you next", () => {
  test("a sign-in ignores a next that leads to another site", async ({ page, baseURL }) => {
    // Another site's answer is made up here, so nothing leaves the machine whatever the app does.
    await page.route("https://evil.example/**", (route) => route.fulfill({ contentType: "text/html", body: "<main>another site</main>" }));

    await page.goto("/login?next=https%3A%2F%2Fevil.example%2Fafter-login");
    await page.getByRole("button", { name: "Sign in with World ID" }).click();
    await page.waitForURL((url) => url.hostname === "evil.example" || url.pathname === "/account");

    const stayed = new URL(page.url()).origin === new URL(baseURL!).origin;
    expect(stayed, `still on the app after signing in with a next that points elsewhere (landed on ${page.url()})`).toBe(true);
  });
});
