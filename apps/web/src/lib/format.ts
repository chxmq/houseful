const TZ = "Asia/Kolkata";

const usdt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const weekday = new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: TZ });
const dayMonth = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: TZ });
const longDate = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
const time = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: TZ });
const dayNum = new Intl.DateTimeFormat("en-IN", { day: "2-digit", timeZone: TZ });
const monShort = new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: TZ });

const at = (s: number) => new Date(s * 1000);

export const formatUsdt = (dollars: number) => usdt.format(dollars);
export const formatWeekday = (s: number) => weekday.format(at(s));
export const formatDayMonth = (s: number) => dayMonth.format(at(s));
export const formatLongDate = (s: number) => longDate.format(at(s));
export const formatTime = (s: number) => time.format(at(s)).toLowerCase().replace(" ", "");
export const formatDayNum = (s: number) => dayNum.format(at(s));
export const formatMonShort = (s: number) => monShort.format(at(s)).toUpperCase();

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
