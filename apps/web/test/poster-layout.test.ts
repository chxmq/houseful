import { describe, expect, it } from "vitest";
import drafts from "../scripts/data/catalog-drafts.json";
import { POSTER_ROOM, posterFontSize, posterLines, posterTitleSize } from "../src/lib/poster-layout";

const SAMPLE_TITLES = [
  "The Last Local",
  "Chawl No. 9",
  "Shaam-e-Ghazal",
  "Kaali Peeli Sound System Choti Diwali",
  "YOASOBI Asia 10-City Dome & Stadium Tour",
  "Melbourne International Comedy Festival Gala 2027",
  "The Grand Final Of The Annual International Festival Of Folk Music And Dance Tonight",
];

describe("posterLines", () => {
  it("keeps one word per line for short titles", () => {
    expect(posterLines("The Last Local")).toEqual(["THE", "LAST", "LOCAL"]);
    expect(posterLines("Chawl No. 9")).toEqual(["CHAWL", "NO.", "9"]);
  });

  it("groups the words of a long title into lines of at most 12 characters", () => {
    expect(posterLines("YOASOBI Asia 10-City Dome & Stadium Tour")).toEqual([
      "YOASOBI ASIA",
      "10-CITY DOME",
      "& STADIUM",
      "TOUR",
    ]);
  });

  it("gives a word longer than a line its own line instead of cutting it", () => {
    expect(posterLines("Melbourne International Comedy Festival Gala 2027")).toEqual([
      "MELBOURNE",
      "INTERNATIONAL",
      "COMEDY",
      "FESTIVAL",
      "GALA 2027",
    ]);
  });

  it("ignores extra spaces", () => {
    expect(posterLines("  one   two ")).toEqual(["ONE", "TWO"]);
  });
});

describe("posterFontSize", () => {
  it("keeps the usual sizes for short titles", () => {
    expect(posterFontSize(posterLines("The Last Local"))).toBe(17);
    expect(posterFontSize(posterLines("Shaam-e-Ghazal"))).toBe(13);
  });

  it("keeps a long title at the usual size when it fits", () => {
    expect(posterFontSize(posterLines("YOASOBI Asia 10-City Dome & Stadium Tour"))).toBe(13);
  });

  it("makes a title that is too long for the poster smaller", () => {
    const title = "The Grand Final Of The Annual International Festival Of Folk Music And Dance Tonight";
    expect(posterFontSize(posterLines(title))).toBeLessThan(13);
  });

  it("always returns a positive size", () => {
    expect(posterFontSize([])).toBeGreaterThan(0);
    expect(posterFontSize(["A".repeat(60)])).toBeGreaterThan(0);
  });
});

describe("every title in the catalog fits its poster", () => {
  const titles = [...SAMPLE_TITLES, ...drafts.map((draft) => draft.title)];

  it.each(titles)("%s", (title) => {
    const fit = posterTitleSize(posterLines(title));
    expect(fit.height).toBeLessThanOrEqual(POSTER_ROOM.height + 0.001);
    expect(fit.width).toBeLessThanOrEqual(POSTER_ROOM.width + 0.001);
  });
});
