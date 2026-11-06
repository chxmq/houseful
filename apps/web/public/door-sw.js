/* Caches the door shell so a reload of /door stays usable without a network. */
const CACHE = "houseful-door-v1";
const PRECACHE = ["/door", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() =>
      self.clients.claim(),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!(url.pathname === "/door" || url.pathname.startsWith("/door/") || url.pathname.startsWith("/_next/"))) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      try {
        const fresh = await fetch(request);
        if (fresh.ok) cache.put(request, fresh.clone());
        return fresh;
      } catch {
        const cached = await cache.match(request);
        if (cached) return cached;
        if (url.pathname.startsWith("/door")) {
          const shell = await cache.match("/door");
          if (shell) return shell;
        }
        throw new Error("offline");
      }
    }),
  );
});
