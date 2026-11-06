import { describe, expect, it } from "vitest";
import { keccak256, toBytes } from "viem";
import {
  CATEGORIES,
  chainParams,
  draftHash,
  draftSchedule,
  draftSchema,
  INKS,
  slugify,
  type EventDraft,
} from "../src/lib/event-draft";
import { usdToUnits } from "../src/lib/pricing";

const F: EventDraft = {
  slug: "the-last-local-abcd",
  title: "The Last Local",
  subtitle: "One night only",
  category: "music",
  venueId: "nsci-dome",
  hostName: "Kaali Peeli",
  startsAt: 1795271400,
  doorsBeforeMins: 60,
  durationMins: 150,
  priceUsd: 999,
  capacity: 300,
  seated: false,
  surrenderCutoffHours: 24,
  ageLimit: 18,
  language: "Hindi, English",
  description: "A long enough description of the show.",
  lineup: ["Asha", "Ravi"],
  posterVariant: 2,
  posterInk: "stamp",
};

const F_HASH = "0x7d8f450026919267b1d41b63c158b4fce9a0993f1caeba6757a6703f8391244a";

const F_SORTED_JSON = [
  '{"ageLimit":18',
  '"capacity":300',
  '"category":"music"',
  '"description":"A long enough description of the show."',
  '"doorsBeforeMins":60',
  '"durationMins":150',
  '"hostName":"Kaali Peeli"',
  '"language":"Hindi, English"',
  '"lineup":["Asha","Ravi"]',
  '"posterInk":"stamp"',
  '"posterVariant":2',
  '"priceUsd":999',
  '"seated":false',
  '"slug":"the-last-local-abcd"',
  '"startsAt":1795271400',
  '"subtitle":"One night only"',
  '"surrenderCutoffHours":24',
  '"title":"The Last Local"',
  '"venueId":"nsci-dome"}',
].join(",");

const SCHEMA_KEYS = Object.keys(draftSchema.shape) as (keyof EventDraft)[];

const CHANGED: EventDraft = {
  slug: "the-last-local-abce",
  title: "The Last Locals",
  subtitle: "Two nights only",
  category: "comedy",
  venueId: "jio-world-garden",
  hostName: "Kaali Peelii",
  startsAt: 1795271401,
  doorsBeforeMins: 61,
  durationMins: 151,
  priceUsd: 1000,
  capacity: 301,
  seated: true,
  surrenderCutoffHours: 25,
  ageLimit: 17,
  language: "Hindi",
  description: "A longer description of the same show.",
  lineup: ["Asha"],
  posterVariant: 3,
  posterInk: "marigold",
};

const PADDED: [keyof EventDraft, string | string[]][] = [
  ["title", "  The Last Local  "],
  ["subtitle", " One night only "],
  ["hostName", "\tKaali Peeli\n"],
  ["language", " Hindi, English "],
  ["description", "  A long enough description of the show.  "],
  ["lineup", [" Asha ", "Ravi  "]],
];

type SchemaCase = [keyof EventDraft, string, unknown];

const REJECTED: SchemaCase[] = [
  ["slug", "uppercase and underscore", "Bad_Slug"],
  ["slug", "leading hyphen", "-x"],
  ["slug", "trailing hyphen", "x-"],
  ["slug", "double hyphen", "a--b"],
  ["slug", "81 characters", "a".repeat(81)],
  ["title", "1 character after trimming", "  a "],
  ["title", "61 characters", "x".repeat(61)],
  ["subtitle", "91 characters", "x".repeat(91)],
  ["category", "unknown value", "opera"],
  ["venueId", "empty", ""],
  ["hostName", "1 character", "x"],
  ["hostName", "61 characters", "x".repeat(61)],
  ["startsAt", "fractional", 1.5],
  ["startsAt", "NaN", Number.NaN],
  ["startsAt", "string", "1795271400"],
  ["startsAt", "2**53", 2 ** 53],
  ["doorsBeforeMins", "-1", -1],
  ["doorsBeforeMins", "241", 241],
  ["durationMins", "14", 14],
  ["durationMins", "1441", 1441],
  ["priceUsd", "-1", -1],
  ["priceUsd", "100001", 100_001],
  ["priceUsd", "1.5", 1.5],
  ["capacity", "0", 0],
  ["capacity", "100001", 100_001],
  ["surrenderCutoffHours", "-1", -1],
  ["surrenderCutoffHours", "337", 337],
  ["ageLimit", "-1", -1],
  ["ageLimit", "22", 22],
  ["language", "1 character", "x"],
  ["language", "41 characters", "x".repeat(41)],
  ["description", "19 characters after trimming", `  ${"x".repeat(19)}  `],
  ["description", "1201 characters", "x".repeat(1201)],
  ["lineup", "13 items", Array(13).fill("x")],
  ["lineup", "empty item", [""]],
  ["lineup", "blank item", ["   "]],
  ["lineup", "61-character item", ["x".repeat(61)]],
  ["posterVariant", "-1", -1],
  ["posterVariant", "6", 6],
  ["posterInk", "unknown value", "blue"],
];

const ACCEPTED: SchemaCase[] = [
  ["slug", "single character", "a"],
  ["slug", "single hyphens between segments", "a-b-c"],
  ["slug", "80 characters", "a".repeat(80)],
  ["title", "2 characters after trimming", "  ab "],
  ["title", "60 characters after trimming", `  ${"x".repeat(60)}  `],
  ["subtitle", "empty", ""],
  ["subtitle", "90 characters", "x".repeat(90)],
  ...CATEGORIES.map((category): SchemaCase => ["category", category, category]),
  ["venueId", "1 character", "x"],
  ["hostName", "2 characters", "xy"],
  ["hostName", "60 characters", "x".repeat(60)],
  ["startsAt", "-1, as the schema sets no lower bound", -1],
  ["startsAt", "largest safe integer", Number.MAX_SAFE_INTEGER],
  ["doorsBeforeMins", "0", 0],
  ["doorsBeforeMins", "240", 240],
  ["durationMins", "15", 15],
  ["durationMins", "1440", 1440],
  ["priceUsd", "0", 0],
  ["priceUsd", "100000", 100_000],
  ["capacity", "1", 1],
  ["capacity", "100000", 100_000],
  ["surrenderCutoffHours", "0", 0],
  ["surrenderCutoffHours", "336", 336],
  ["ageLimit", "0", 0],
  ["ageLimit", "21", 21],
  ["language", "2 characters", "xy"],
  ["language", "40 characters", "x".repeat(40)],
  ["description", "20 characters after trimming", `  ${"x".repeat(20)}  `],
  ["description", "1200 characters", "x".repeat(1200)],
  ["lineup", "no items", []],
  ["lineup", "12 items", Array(12).fill("x")],
  ["lineup", "60-character item", ["x".repeat(60)]],
  ["posterVariant", "0", 0],
  ["posterVariant", "5", 5],
  ...INKS.map((ink): SchemaCase => ["posterInk", ink, ink]),
];

function rejectedKeys(input: unknown) {
  const result = draftSchema.safeParse(input);
  return result.success ? [] : [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
}

describe("draftHash", () => {
  it("pins the hash of fixture F", () => {
    expect(draftHash(F)).toBe(F_HASH);
  });

  it("is keccak256 of hand-written key-sorted JSON", () => {
    expect(draftHash(F)).toBe(keccak256(toBytes(F_SORTED_JSON)));
  });

  it("gives reversed keys the same hash", () => {
    const reversed = Object.fromEntries(Object.entries(F).reverse()) as EventDraft;
    expect(Object.keys(reversed)).not.toEqual(Object.keys(F));
    expect(draftHash(reversed)).toBe(F_HASH);
  });

  it("gives parsed reversed keys the same hash", () => {
    const reversed = Object.fromEntries(Object.entries(F).reverse());
    expect(draftHash(draftSchema.parse(reversed))).toBe(F_HASH);
  });

  it("changes when the lineup order changes", () => {
    expect(draftHash({ ...F, lineup: ["Ravi", "Asha"] })).not.toBe(F_HASH);
  });

  it("has a changed value for every schema key", () => {
    expect(Object.keys(CHANGED).sort()).toEqual(Object.keys(draftSchema.shape).sort());
  });

  it.each(SCHEMA_KEYS)("changes when %s changes", (key) => {
    const changed = draftSchema.parse({ ...F, [key]: CHANGED[key] });
    expect(changed[key]).not.toEqual(F[key]);
    expect(draftHash(changed)).not.toBe(F_HASH);
  });

  it("gives every single-key change its own hash", () => {
    const hashes = SCHEMA_KEYS.map((key) => draftHash({ ...F, [key]: CHANGED[key] }));
    expect(new Set([F_HASH, ...hashes]).size).toBe(SCHEMA_KEYS.length + 1);
  });

  it.each(PADDED)("gives a padded %s the same hash once parsed", (key, padded) => {
    const raw = { ...F, [key]: padded };
    expect(draftHash(raw)).not.toBe(F_HASH);
    expect(draftHash(draftSchema.parse(raw))).toBe(F_HASH);
  });
});

describe("draftSchedule", () => {
  it("derives doors, end and cutoff from fixture F", () => {
    expect(draftSchedule(F)).toEqual({ doorsAt: 1795267800, endsAt: 1795280400, surrenderCutoff: 1795181400 });
  });

  it("keeps the doors-based cutoff at the shortest schema-valid duration", () => {
    const draft = { ...F, surrenderCutoffHours: 0, doorsBeforeMins: 0, durationMins: 15 };
    expect(draftSchema.safeParse(draft).success).toBe(true);
    expect(draftSchedule(draft)).toEqual({ doorsAt: 1795271400, endsAt: 1795272300, surrenderCutoff: 1795271400 });
  });

  it("clamps the cutoff to a minute before the end", () => {
    const draft = { ...F, surrenderCutoffHours: 0, doorsBeforeMins: 0, durationMins: 0 };
    expect(draftSchedule(draft)).toEqual({ doorsAt: 1795271400, endsAt: 1795271400, surrenderCutoff: 1795271340 });
  });
});

describe("chainParams", () => {
  it("builds the exact createEvent arguments for fixture F", () => {
    expect(chainParams(F, 1795000000)).toEqual({
      faceValue: 999000000n,
      capacity: 300n,
      seated: false,
      saleStart: 1795000000n,
      surrenderCutoff: 1795181400n,
      endsAt: 1795280400n,
      metadataURI: "houseful:event/the-last-local-abcd",
      metadataHash: F_HASH,
    });
  });

  it("gives a free show a zero face value", () => {
    expect(chainParams({ ...F, priceUsd: 0 }, 1795000000).faceValue).toBe(0n);
  });

  it("refuses a price that is not a whole rupee amount", () => {
    expect(() => chainParams({ ...F, priceUsd: 1.5 }, 1795000000)).toThrow("Invalid USDT price");
  });
});

describe("usdToUnits", () => {
  it.each([
    [0, "0"],
    [1, "1000000"],
    [999, "999000000"],
    [100000, "100000000000"],
  ])("turns $%s into %s units", (dollars, units) => {
    expect(usdToUnits(dollars)).toBe(units);
  });

  it.each([[-1], [1.5], [Number.NaN]])("throws on %s", (dollars) => {
    expect(() => usdToUnits(dollars)).toThrow("Invalid USDT price");
  });
});

describe("slugify", () => {
  it.each([
    ["The Last Local", "the-last-local"],
    ["  --Hello, World!--  ", "hello-world"],
    ["A&B", "a-b"],
    ["Café", "cafe"],
    ["!!!", ""],
  ])("turns %j into %j", (text, slug) => {
    expect(slugify(text)).toBe(slug);
  });

  it("cuts a long run to 60 characters", () => {
    expect(slugify("a".repeat(70))).toBe("a".repeat(60));
  });

  it("never returns more than 60 characters", () => {
    expect(slugify(`${"a".repeat(59)} bc`).length).toBeLessThanOrEqual(60);
  });

  it.each(["The Last Local", "Café Déjà Vu", "Stand-up @ 9pm!", "A&B"])("makes a valid draft slug from %j", (title) => {
    expect(draftSchema.shape.slug.safeParse(`${slugify(title)}-ab12`).success).toBe(true);
  });
});

describe("draftSchema", () => {
  it("accepts fixture F unchanged", () => {
    expect(draftSchema.parse(F)).toEqual(F);
  });

  it.each(REJECTED)("rejects %s: %s", (key, _label, value) => {
    expect(rejectedKeys({ ...F, [key]: value })).toEqual([key]);
  });

  it.each(ACCEPTED)("accepts %s: %s", (key, _label, value) => {
    expect(rejectedKeys({ ...F, [key]: value })).toEqual([]);
  });

  it("rejects an extra key", () => {
    const result = draftSchema.safeParse({ ...F, extra: 1 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.code).toBe("unrecognized_keys");
  });

  it.each(SCHEMA_KEYS)("rejects a draft without %s", (key) => {
    const rest = Object.fromEntries(Object.entries(F).filter(([k]) => k !== key));
    expect(rejectedKeys(rest)).toEqual([key]);
  });
});
