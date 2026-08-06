const CACHE = "pitching-os-v46";
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
  if (new URL(event.request.url).pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request));
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
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/index.html")))
  );
});
