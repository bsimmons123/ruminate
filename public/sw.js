const SHELL_CACHE = "ruminate-shell-v4";
const BIBLE_CACHE = "ruminate-scripture-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icons/ruminate.svg", "/icons/ruminate-maskable.svg", "/fonts/dm-sans-latin.woff2", "/fonts/dm-sans-latin-ext.woff2", "/fonts/gilda-display-latin.woff2", "/fonts/gilda-display-latin-ext.woff2"];
const TRANSLATIONS = ["web", "kjv", "asv", "ylt"];
const BIBLE_FILES = TRANSLATIONS.flatMap(translation => [...Array.from({ length: 66 }, (_, index) => `/bible/${translation}/${index + 1}.json`), `/bible/${translation}/manifest.json`, `/bible/${translation}/LICENSE.txt`]);
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    await shell.addAll(SHELL);
    const page = await shell.match("/");
    const html = await page.text();
    const assets = [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map(match => match[1]);
    await shell.addAll(assets);
    const scripture = await caches.open(BIBLE_CACHE);
    await scripture.addAll([...BIBLE_FILES, "/bible/manifest.json"]);
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("ruminate-") || key.startsWith("selah-")).filter(key => key !== SHELL_CACHE && key !== BIBLE_CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const request = event.request; const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) { const copy = response.clone(); caches.open(SHELL_CACHE).then(cache => cache.put("/", copy)); }
      return response;
    }).catch(() => caches.match("/")));
    return;
  }
  const cacheName = url.pathname.startsWith("/bible/") ? BIBLE_CACHE : SHELL_CACHE;
  event.respondWith(caches.match(request, { ignoreVary: true }).then(cached => cached || fetch(request).then(response => {
    if (response.ok) { const copy = response.clone(); caches.open(cacheName).then(cache => cache.put(request, copy)); }
    return response;
  })));
});
