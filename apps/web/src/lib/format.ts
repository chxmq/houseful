const DEFAULT_TIMEZONE = "Asia/Kolkata";

const usdt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Cache by city timezone, never by the browser or server's local timezone. */
function dateFormatter(options: Intl.DateTimeFormatOptions) {
  const byTimezone = new Map<string, Intl.DateTimeFormat>();
  return (seconds: number, timezone = DEFAULT_TIMEZONE) => {
    let formatter = byTimezone.get(timezone);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat("en-IN", { ...options, timeZone: timezone });
      byTimezone.set(timezone, formatter);
    }
    return formatter.format(new Date(seconds * 1000));
  };
}

export const formatUsdt = (dollars: number) => usdt.format(dollars);
export const formatWeekday = dateFormatter({ weekday: "short" });
export const formatDayMonth = dateFormatter({ day: "numeric", month: "short" });
export const formatLongDate = dateFormatter({ weekday: "long", day: "numeric", month: "long" });
const time = dateFormatter({ hour: "numeric", minute: "2-digit", hour12: true });
export const formatTime = (seconds: number, timezone = DEFAULT_TIMEZONE) => time(seconds, timezone).toLowerCase().replace(" ", "");
export const formatDayNum = dateFormatter({ day: "2-digit" });
const month = dateFormatter({ month: "short" });
export const formatMonShort = (seconds: number, timezone = DEFAULT_TIMEZONE) => month(seconds, timezone).toUpperCase();
export const formatClock = dateFormatter({ hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

export function formatEth(wei: bigint | string, digits = 5) {
  const value = typeof wei === "string" ? BigInt(wei) : wei;
  const whole = value / 10n ** 18n;
  const frac = (value % 10n ** 18n).toString().padStart(18, "0").slice(0, digits).replace(/0+$/, "");
  return `${whole}${frac ? `.${frac}` : ""} ETH`;
}

export function shortHex(value: string, lead = 6, tail = 4) {
  return value.length <= lead + tail + 2 ? value : `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

export const categoryLabel: Record<string, string> = {
  music: "Music",
  comedy: "Comedy",
  theatre: "Theatre",
  sports: "Sports",
  food: "Food",
  workshops: "Workshops",
  nightlife: "Nightlife",
};
