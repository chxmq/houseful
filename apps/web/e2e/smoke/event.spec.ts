import { SHOWS } from "../support/catalog";
import { expect, test } from "../support/fixtures";
import { expectNoHorizontalScroll } from "../support/page";

test("an event page shows the show, its price and the seats the contract reports", async ({ page, chain }) => {
  const show = SHOWS.flagship;
  await page.goto(`/e/${show.slug}`);

  await expect(page).toHaveTitle(new RegExp(show.title));
  await expect(page.getByRole("heading", { level: 1 })).toContainText(show.title);
  await expect(page.getByText(show.price).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "The rules on this ticket" })).toBeVisible();

  // The ticket panel reads the contract from the browser. The flagship is sold out but for one seat.
  await expect(page.getByRole("button", { name: "Verify and buy" })).toBeVisible();
  await expect(page.getByText("seats left")).toBeVisible();
  const info = await chain.read.eventInfo(show.chainEventId);
  expect(info.capacity - info.minted + info.returned).toBeGreaterThan(0n);

  await expectNoHorizontalScroll(page);
});
