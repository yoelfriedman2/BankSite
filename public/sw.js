// Minimal service worker — enables installability without caching any
// authenticated content (every request passes straight through to the network).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("fetch", () => {
  // Intentionally no-op: let the browser handle requests normally.
});
