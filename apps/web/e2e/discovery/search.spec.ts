import type { Page } from "@playwright/test";
import { SHOWS } from "../support/catalog";
import { expect, test } from "../support/fixtures";
import { expectNoHorizontalScroll } from "../support/page";

const results = (page: Page) => page.getByRole("region", { name: /shows? found/ });
const rows = (page: Page) => results(page).getByRole("listitem");
const form = (page: Page) => page.getByRole("search", { name: "Find shows" });

async function submit(page: Page) {
  await form(page).getByRole("button", { name: "Find shows", exact: true }).click();
  await expect(results(page)).toBeVisible();
}

test("search finds titles, artists and venues through the visible form", async ({ page }) => {
  await page.goto("/search");
  await expect(page.getByRole("heading", { level: 1, name: "Find a show" })).toBeVisible();
  for (const [query, title] of [
    ["second shelf", SHOWS.open.title],
    ["Meera Joglekar", "Tatkaar"],
    ["Mehboob", SHOWS.open.title],
  ]) {
    await form(page).getByRole("searchbox", { name: "Search shows, artists or venues", exact: true }).fill(query);
    await submit(page);
    await expect(results(page).getByRole("link", { name: new RegExp(title, "i") })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("q")).toBe(query);
  }
  await expectNoHorizontalScroll(page);
});

test("combined filters survive sharing the URL and reloading", async ({ page, device }) => {
  await page.goto("/search");
  await form(page).getByRole("searchbox", { name: "Search shows, artists or venues", exact: true }).fill("Second Shelf");
  await form(page).getByRole("combobox", { name: "City", exact: true }).selectOption("mumbai");
  await form(page).getByRole("combobox", { name: "Category", exact: true }).selectOption("food");
  await form(page).getByRole("combobox", { name: "Date", exact: true }).selectOption("month");
  await form(page).getByRole("spinbutton", { name: "Maximum price", exact: true }).fill("4");
  await form(page).getByRole("combobox", { name: "Sort by", exact: true }).selectOption("price-desc");
  await submit(page);
  const sharedUrl = page.url();
  const params = new URL(sharedUrl).searchParams;
  expect(Object.fromEntries(params)).toMatchObject({
    q: "Second Shelf", city: "mumbai", category: "food", date: "month", maxPrice: "4", sort: "price-desc",
  });
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText(SHOWS.open.title);
  await expect(rows(page).first()).toContainText("Food · Mumbai");
  await expect(rows(page).first()).toContainText("$4");
  const before = await rows(page).allTextContents();
  await page.reload();
  await expect(rows(page)).toHaveText(before);

  // A second context has no local storage from the first: the URL carries every filter.
  const recipient = await device();
  await recipient.page.goto(sharedUrl);
  await expect(rows(recipient.page)).toHaveText(before);
  await expect(form(recipient.page).getByRole("searchbox", { name: "Search shows, artists or venues", exact: true })).toHaveValue("Second Shelf");
  for (const [label, value] of [["City", "mumbai"], ["Category", "food"], ["Date", "month"], ["Sort by", "price-desc"]]) {
    await expect(form(recipient.page).getByRole("combobox", { name: label, exact: true })).toHaveValue(value);
  }
  await expect(form(recipient.page).getByRole("spinbutton", { name: "Maximum price", exact: true })).toHaveValue("4");
  await expectNoHorizontalScroll(recipient.page);
});

test("each combined constraint can exclude an otherwise matching show", async ({ page }) => {
  const matching = new URLSearchParams({ q: "Second Shelf", city: "mumbai", category: "food", date: "month", maxPrice: "4", sort: "price-asc" });
  for (const [key, value] of [["city", "delhi"], ["category", "music"], ["date", "today"], ["maxPrice", "3"]]) {
    const params = new URLSearchParams(matching);
    params.set(key, value);
    await page.goto(`/search?${params}`);
    await expect(results(page).getByRole("heading", { name: "No shows match yet" })).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
  }
  await expectNoHorizontalScroll(page);
});

test("price sorting orders the rendered shows in both directions", async ({ page }) => {
  for (const sort of ["price-asc", "price-desc"]) {
    await page.goto(`/search?city=mumbai&sort=${sort}`);
    await expect(rows(page).first()).toBeVisible();
    const prices = await rows(page).evaluateAll(elements => elements.map(element => {
      const price = [...element.querySelectorAll("p")].find(p => /^\$[\d,]+(?:\.\d+)?$/.test(p.textContent?.trim() ?? ""));
      if (!price) throw new Error(`Missing visible price in ${element.textContent}`);
      return Number(price.textContent!.replace(/[$,]/g, ""));
    }));
    expect(prices.length).toBeGreaterThan(1);
    expect(new Set(prices).size).toBeGreaterThan(1);
    expect(prices).toEqual([...prices].sort((a, b) => sort === "price-asc" ? a - b : b - a));
  }
  await expectNoHorizontalScroll(page);
});

test("empty results offer a city reset and a global reset", async ({ page }) => {
  await page.goto("/search?city=mumbai&q=no-such-houseful-show-90837&category=music&maxPrice=0");
  await expect(results(page).getByRole("heading", { name: "0 shows found" })).toBeVisible();
  await expect(results(page).getByRole("heading", { name: "No shows match yet" })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await results(page).getByRole("link", { name: "Clear filters", exact: true }).click();
  await expect(page).toHaveURL(/\/search\?city=mumbai$/);
  await expect(form(page).getByRole("searchbox", { name: "Search shows, artists or venues", exact: true })).toHaveValue("");
  await expect(form(page).getByRole("combobox", { name: "City", exact: true })).toHaveValue("mumbai");
  await expect(form(page).getByRole("combobox", { name: "Category", exact: true })).toHaveValue("");
  await expect(rows(page).first()).toBeVisible();

  await page.goto("/search?city=mumbai&q=no-such-houseful-show-90837");
  await results(page).getByRole("link", { name: "Browse all cities", exact: true }).click();
  await expect(page).toHaveURL(/\/search$/);
  await expect(form(page).getByRole("combobox", { name: "City", exact: true })).toHaveValue("");
  await expect(rows(page).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("country grouped city options and keyboard submission remain usable", async ({ page }, testInfo) => {
  await page.goto("/search");
  const city = form(page).getByRole("combobox", { name: "City", exact: true });
  await expect(city).toBeVisible();
  const countries = await city.locator("optgroup").evaluateAll(groups => groups.map(group => ({
    label: group.getAttribute("label"),
    cities: [...group.querySelectorAll("option")].map(option => ({ name: option.textContent, value: option.value })),
  })));
  expect(countries.length).toBeGreaterThan(1);
  expect(countries.find(country => country.label === "India")?.cities).toContainEqual({ name: "Mumbai", value: "mumbai" });
  for (const country of countries) {
    expect(country.label).toBeTruthy();
    expect(country.cities.length).toBeGreaterThan(0);
  }

  await form(page).getByRole("searchbox", { name: "Search shows, artists or venues", exact: true }).focus();
  await page.keyboard.type("Second Shelf");
  await page.keyboard.press("Tab");
  await expect(city).toBeFocused();
  await page.keyboard.press("Home");
  await expect(city).toHaveValue("");
  await page.keyboard.press("Tab");
  await expect(form(page).getByRole("combobox", { name: "Category", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(form(page).getByRole("combobox", { name: "Date", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(form(page).getByRole("spinbutton", { name: "Maximum price", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(form(page).getByRole("combobox", { name: "Sort by", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(form(page).getByRole("button", { name: "Find shows", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(rows(page).getByRole("heading", { name: SHOWS.open.title })).toBeVisible();
  expect(await page.evaluate(() => innerWidth)).toBe(testInfo.project.name === "phone" ? 375 : 1280);
  await expectNoHorizontalScroll(page);
});

test("the city directory opens both Mumbai and an international city", async ({ page }) => {
  await page.goto("/search");
  const cityOptions = form(page).getByRole("combobox", { name: "City", exact: true });
  await expect(cityOptions).toBeVisible();
  const international = await cityOptions.locator("optgroup").evaluateAll(groups => {
    const group = groups.find(item => item.getAttribute("label") !== "India");
    const option = group?.querySelector("option");
    return option ? { slug: option.value, name: option.textContent!.trim() } : null;
  });
  expect(international, "The worldwide catalog must offer a city outside India").not.toBeNull();
  for (const city of [{ slug: "mumbai", name: "Mumbai" }, international!]) {
    await page.goto("/cities");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.locator(`main a[href='/${city.slug}']`).click();
    await expect(page).toHaveURL(new RegExp(`/${city.slug}$`));
    await expect(page.getByRole("heading", { level: 1 })).toContainText(city.name);
    await expectNoHorizontalScroll(page);
  }
});

test.describe("published event details", () => {
  test.use({ timezoneId: "America/Los_Angeles" });

  test("a London show uses its own city time rather than the phone clock zone", async ({ page }) => {
    await page.goto("/e/the-nutcracker-royal-ballet-royal-opera-house-2026-12-03");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(main).toContainText("starts 7:30pm");
    await expect(main).toContainText("Thursday, 3 December, 2026");
    await expect(main.getByRole("link", { name: "Official event and tickets (opens a new tab)", exact: true })).toHaveAttribute("href", /^https:\/\//);
    await expect(main).toContainText("Test listing, not affiliated");
    await expectNoHorizontalScroll(page);
  });

  test("unpublished official details do not become test booking facts", async ({ page }) => {
    await page.goto("/e/web-summit-qatar-2027-doha");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
    for (const text of ["Age rules: Not published", "Doors Not published", "starts Not published", "Official end time: Not published", "Venue capacity: Not published", "Duration: Not published", "Test booking settings:"]) {
      await expect(main).toContainText(text);
    }
    await expect(main).not.toContainText("starts 12:00am");
    await expectNoHorizontalScroll(page);
  });
});

test("public pages fit the window and expose a keyboard skip link", async ({ page }) => {
  for (const path of ["/mumbai", "/cities", "/search", "/how-it-works", "/v/nsci-dome", "/h/platform-4-live", "/no-such-houseful-page"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content", exact: true });
    await expect(skip).toBeFocused();
    await skip.press("Enter");
    await expect(page).toHaveURL(/#main$/);
    await expect(page.locator("main#main")).toBeVisible();
  }
});
