const CACHE = "pitching-os-v47";
const CORE = ["/", "/index.html", "/styles.css?v=46", "/training-history.js?v=46", "/auth-client.js?v=46", "/app.js?v=46", "/mark.svg", "/assets/norths-baseball-logo.jpg", "/assets/coomera-cubs-logo.png", "/manifest.webmanifest", "/privacy.html", "/terms.html", "/legal.css"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE).then((cache) => cache.addAll(CORE)),
      self.skipWaiting()
    ])
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
      self.clients.claim()
    ])
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // The rebuilt app under /next/ ships its own content-hashed bundles and
  // must never be served from this cache. Leaving it to the network also
  // keeps the two apps independent while they run side by side.
  if (url.pathname === "/next" || url.pathname.startsWith("/next/")) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response.ok) return response;
        const copy = response.clone();
        return caches.open(CACHE)
          .then((cache) => cache.put(event.request, copy))
          .then(() => response)
          .catch(() => response);
      })
      .catch(() =>
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // Only a page navigation may fall back to the app shell. Doing this
          // for every request meant a failed script or stylesheet fetch was
          // answered with HTML, which the browser refuses under nosniff — the
          // page then died with a MIME type error rather than going offline
          // gracefully.
          if (event.request.mode === "navigate") return caches.match("/index.html");
          return Response.error();
        })
      )
  );
});
