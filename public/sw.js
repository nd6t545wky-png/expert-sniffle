// Build stamps these two. `__BUILD_ID__` is the current bundle hash, so a
// deploy always lands in a fresh cache; `__NEXT_PRECACHE__` is the list of
// /next/ assets emitted by Vite, which cannot be known when this file is
// written because the filenames carry content hashes.
const BUILD = "__BUILD_ID__";
const CACHE = `pitching-os-${BUILD}`;
const CORE = ["/", "/index.html", "/styles.css?v=46", "/training-history.js?v=46", "/auth-client.js?v=46", "/app.js?v=46", "/mark.svg", "/assets/norths-baseball-logo.jpg", "/assets/coomera-cubs-logo.png", "/manifest.webmanifest", "/privacy.html", "/terms.html", "/legal.css"];
const NEXT_CORE = ["__NEXT_PRECACHE__"];

const NEXT_SHELL = "/next/index.html";

function isNext(url) {
  return url.pathname === "/next" || url.pathname.startsWith("/next/");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      // The two app shells are cached separately so a failure to fetch one of
      // the rebuilt app's bundles cannot abort the whole install and leave the
      // prototype without a cache either.
      caches.open(CACHE).then((cache) => cache.addAll(CORE)),
      caches.open(CACHE).then((cache) => cache.addAll(NEXT_CORE)).catch(() => {}),
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

  // The rebuilt app's bundles carry a content hash in the filename, so a given
  // URL's bytes can never change. Cache-first is therefore not a staleness
  // risk, and it is what makes the app open instantly and work with no signal.
  if (url.pathname.startsWith("/next/assets/")) {
    event.respondWith(
      caches.match(event.request).then((cached) =>
        cached ||
        fetch(event.request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
          }
          return response;
        })
      )
    );
    return;
  }

  // The rebuilt app's shell is network-first, so a deploy is picked up on the
  // next load rather than after a cache eviction.
  if (isNext(url)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(NEXT_SHELL, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => {
            if (cached) return cached;
            // A navigation inside /next/ falls back to the *rebuilt* app's
            // shell. Falling back to "/index.html" here would answer with the
            // prototype — a different app, silently, whenever the network
            // dropped.
            if (event.request.mode === "navigate") return caches.match(NEXT_SHELL);
            return Response.error();
          })
        )
    );
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
