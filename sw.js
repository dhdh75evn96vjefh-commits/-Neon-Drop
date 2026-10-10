"use strict";

const CACHE_NAME = "neon-match-shell-v6";
const APP_SHELL = [
  new URL("./", self.registration.scope).href,
  new URL("./index.html", self.registration.scope).href,
  new URL("./style.css", self.registration.scope).href,
  new URL("./script.js", self.registration.scope).href,
  new URL("./manifest.json", self.registration.scope).href,
  new URL("./icon-192.png", self.registration.scope).href,
  new URL("./icon-512.png", self.registration.scope).href
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith("neon-match-shell-") && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cachedResponse = await caches.match(event.request);
    if (cachedResponse) return cachedResponse;

    try {
      const networkResponse = await fetch(event.request);
      if (networkResponse.ok && networkResponse.type === "basic") {
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, networkResponse.clone());
      }
      return networkResponse;
    } catch (error) {
      if (event.request.mode === "navigate") {
        return (await caches.match(new URL("./index.html", self.registration.scope))) || Response.error();
      }
      return Response.error();
    }
  })());
});
