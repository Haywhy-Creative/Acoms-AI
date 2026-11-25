/*
 * Defensive no-cache service worker.
 *
 * The app does not rely on offline caching. This worker is intentionally a
 * transparent pass-through so it cannot intercept Groq, Firebase, Cloudflare or
 * avatar requests. It only handles same-origin GET requests and every
 * respondWith promise is explicitly caught.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Non-GET requests (POST/PUT/etc.) must never be intercepted or replayed.
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Only http(s) URLs have a meaningful origin. Skip data:, blob:, extension
  // schemes and every external origin, including Firestore/Groq/Cloudflare.
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request).catch((error) => {
      console.warn("[service-worker] passthrough fetch failed:", error);
      // Never leave a rejected promise unhandled inside respondWith.
      return Response.error();
    })
  );
});
