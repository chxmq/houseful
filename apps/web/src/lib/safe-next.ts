/**
 * Only same-site relative paths may be used as post-sign-in destinations.
 * Rejects absolute URLs, protocol-relative URLs, and other open-redirect shapes.
 */
export function safeNextPath(raw: unknown, fallback: string): string {
  if (typeof raw !== "string" || raw.length === 0) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (raw.includes("://") || raw.includes("\\") || raw.includes("@")) return fallback;
  try {
    const url = new URL(raw, "http://houseful.local");
    if (url.origin !== "http://houseful.local") return fallback;
    return `${url.pathname}${url.search}${url.hash}` || fallback;
  } catch {
    return fallback;
  }
}
