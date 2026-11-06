import { describe, expect, it } from "vitest";
import { CATEGORIES } from "../src/lib/event-draft";
import {
  categoryLabel,
  formatDayMonth,
  formatDayNum,
  formatEth,
  formatInr,
  formatLongDate,
  formatMonShort,
  formatTime,
  formatWeekday,
  shortHex,
} from "../src/lib/format";

const IST_DAY_START = 1795199400;
const ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

const LABELS: Record<(typeof CATEGORIES)[number], string> = {
  music: "Music",
  comedy: "Comedy",
  theatre: "Theatre",
  sports: "Sports",
  food: "Food",
  workshops: "Workshops",
  nightlife: "Nightlife",
};

describe("formatInr", () => {
  it.each([
    [0, "₹0"],
    [1000, "₹1,000"],
    [100000, "₹1,00,000"],
    [1234567, "₹12,34,567"],
    [10000000, "₹1,00,00,000"],
    [1499.5, "₹1,500"],
    [-500, "-₹500"],
  ])("formats %s as %s", (rupees, text) => {
    expect(formatInr(rupees)).toBe(text);
  });
});

describe.each([
  {
    name: "Sat 21 Nov, 8:00pm IST",
    at: 1795271400,
    time: "8:00pm",
    weekday: "Sat",
    dayMonth: "21 Nov",
    longDate: "Saturday, 21 November",
    dayNum: "21",
    monShort: "NOV",
  },
  {
    name: "Sun 22 Nov, 1:30am IST, still Sat 21 Nov in UTC and Los Angeles",
    at: 1795291200,
    time: "1:30am",
    weekday: "Sun",
    dayMonth: "22 Nov",
    longDate: "Sunday, 22 November",
    dayNum: "22",
    monShort: "NOV",
  },
  {
    name: "Tue 1 Dec, 8:00pm IST",
    at: 1796135400,
    time: "8:00pm",
    weekday: "Tue",
    dayMonth: "1 Dec",
    longDate: "Tuesday, 1 December",
    dayNum: "01",
    monShort: "DEC",
  },
])("date formatters at $name", ({ at, time, weekday, dayMonth, longDate, dayNum, monShort }) => {
  it("formatTime", () => {
    expect(formatTime(at)).toBe(time);
  });

  it("formatWeekday", () => {
    expect(formatWeekday(at)).toBe(weekday);
  });

  it("formatDayMonth", () => {
    expect(formatDayMonth(at)).toBe(dayMonth);
  });

  it("formatLongDate", () => {
    expect(formatLongDate(at)).toBe(longDate);
  });

  it("formatDayNum", () => {
    expect(formatDayNum(at)).toBe(dayNum);
  });

  it("formatMonShort", () => {
    expect(formatMonShort(at)).toBe(monShort);
  });
});

describe("formatTime", () => {
  it.each([
    [1795285800, "12:00am"],
    [1795242600, "12:00pm"],
    [1795271700, "8:05pm"],
    [1795282500, "11:05pm"],
  ])("formats %s as %s", (at, text) => {
    expect(formatTime(at)).toBe(text);
  });

  it("matches the compact pattern for every half hour of an IST day", () => {
    for (let halfHour = 0; halfHour < 48; halfHour++) {
      expect(formatTime(IST_DAY_START + halfHour * 1800)).toMatch(/^\d{1,2}:\d{2}(am|pm)$/);
    }
  });
});

describe("formatEth", () => {
  it.each([
    [0n, "0 ETH"],
    [3330000000000000n, "0.00333 ETH"],
    [1000000000000000000n, "1 ETH"],
    [25000000000000000000n, "25 ETH"],
  ])("formats %s wei as %s", (wei, text) => {
    expect(formatEth(wei)).toBe(text);
  });

  it("truncates instead of rounding", () => {
    expect(formatEth(1999999999999999999n)).toBe("1.99999 ETH");
  });

  it("shows an amount below the last digit as 0 ETH", () => {
    expect(formatEth(9999999999999n)).toBe("0 ETH");
  });

  it("accepts a decimal string", () => {
    expect(formatEth("1500000000000000000")).toBe("1.5 ETH");
    expect(formatEth("0")).toBe("0 ETH");
  });

  it("throws SyntaxError on a string that is not a number", () => {
    expect(() => formatEth("abc")).toThrow(SyntaxError);
  });

  it.each([
    [0, "1 ETH"],
    [2, "1.23 ETH"],
    [8, "1.23456789 ETH"],
  ])("keeps %i digits", (digits, text) => {
    expect(formatEth(1234567890000000000n, digits)).toBe(text);
  });

  it("can show every one of the 18 decimals", () => {
    expect(formatEth(1n, 18)).toBe("0.000000000000000001 ETH");
  });
});

describe("shortHex", () => {
  it("shortens an address to 6 and 4 characters", () => {
    expect(shortHex(ADDRESS)).toBe("0x5FbD…0aa3");
  });

  it("leaves 12 characters unchanged", () => {
    expect(shortHex("0x1234567890")).toBe("0x1234567890");
  });

  it("shortens from 13 characters", () => {
    expect(shortHex("0x12345678901")).toBe("0x1234…8901");
  });

  it("takes a custom lead and tail", () => {
    expect(shortHex(ADDRESS, 10, 8)).toBe("0x5FbDB231…64180aa3");
  });

  it("moves the threshold with a custom lead and tail", () => {
    expect(shortHex("0x123456789012345678", 10, 8)).toBe("0x123456789012345678");
    expect(shortHex("0x1234567890123456789", 10, 8)).toBe("0x12345678…23456789");
  });
});

describe("categoryLabel", () => {
  it.each(CATEGORIES)("has a label for %s", (category) => {
    expect(categoryLabel[category]).toBe(LABELS[category]);
  });

  it("has exactly the keys of CATEGORIES", () => {
    expect(Object.keys(categoryLabel).sort()).toEqual([...CATEGORIES].sort());
  });
});
