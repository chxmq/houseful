import { expect, test } from "../support/fixtures";
import { expectNoHorizontalScroll } from "../support/page";

const head = '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0}</style>';

test("the sideways scroll check passes a page that fits and fails one that does not", async ({ page }) => {
  await page.setContent(`${head}<p>Fits.</p>`);
  await expectNoHorizontalScroll(page);

  await page.setContent(`${head}<div class="banner" style="width:3000px;height:10px"></div>`);
  await expect(expectNoHorizontalScroll(page)).rejects.toThrow(/scrolls sideways[\s\S]*div\.banner reaches 3000px/);
});
