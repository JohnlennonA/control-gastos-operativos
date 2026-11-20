const CACHE_NAME = "control-gastos-v66";
const APP_ASSETS = [
  "./manifest.webmanifest",
  "./banner-ops.jpg?v=58",
  "./img/opex-app-icon.png",
  "./img/opex-favicon.svg",
  "./img/UnionDataServicios.png",
  "./img/UV%20SERVICES%20-%20Logo%20vectorial%20sin%20fondo.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  if (request.destination === "document" || request.destination === "script" || request.destination === "style") {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        return networkResponse;
      })
      .catch(() => caches.match(request))
  );
});
