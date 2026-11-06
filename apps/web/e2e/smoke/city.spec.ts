import { SHOWS } from "../support/catalog";
import { expect, test } from "../support/fixtures";
import { expectNoHorizontalScroll } from "../support/page";

test("the city page lists shows and does not scroll sideways", async ({ page }, testInfo) => {
  await page.goto("/mumbai");

  await expect(page).toHaveTitle(/What's on in Mumbai/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Mumbai");
  await expect(page.getByText(/\d+ shows/)).toBeVisible();

  // Each show is a link to its own page, and the seeded ones are on it.
  const shows = page.locator("main a[href^='/e/']");
  await expect(shows.first()).toBeVisible();
  expect(await shows.count()).toBeGreaterThan(5);
  await expect(page.getByRole("link", { name: new RegExp(SHOWS.open.title, "i") }).first()).toBeVisible();

  // The project's window is the size it claims to be, and the page fits in it.
  const expectedWidth = testInfo.project.name === "phone" ? 375 : 1280;
  expect(await page.evaluate(() => window.innerWidth)).toBe(expectedWidth);
  await expectNoHorizontalScroll(page);
});
