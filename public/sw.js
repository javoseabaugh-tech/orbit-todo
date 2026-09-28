// Orbit offline support — caches the app shell so it loads even with no
// signal. Firestore handles data offline separately (see firebase.js);
// this just makes sure the app itself (HTML/JS/CSS) opens without a network.

// Bumping this name is what makes phones install a new service worker; the
// old cache is deleted on activate.
const CACHE_NAME = "orbit-shell-v2";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Only handle same-origin GET requests; let everything else (Firestore,
  // Gemini, Google auth) pass through untouched.
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  // Content-hashed files under /assets never change, so the normal HTTP
  // cache is fine for them. Everything else (index.html, version.json, icons)
  // skips the HTTP cache while online, so a new deploy is picked up on the
  // very next load instead of up to an hour later.
  const hashed = new URL(request.url).pathname.startsWith("/assets/");

  event.respondWith(
    fetch(request, hashed ? undefined : { cache: "no-store" })
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/index.html")))
  );
});
