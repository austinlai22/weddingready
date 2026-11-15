/* WeddingReady service worker (SPEC §13). Hand-written: no build plugin.
 * - App pages: network first, falling back to the cached copy, then /offline.
 * - Hashed build assets (/_next/static: JS, CSS, fonts, bundled JSON): cache first.
 * - Exercise media (/media): cached after first view.
 * - /api: never cached; the app shows "Needs a connection" offline. */
const VERSION = 'v1';
const PAGES = `pages-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const MEDIA = `media-${VERSION}`;
const SHELL = ['/', '/train', '/eat', '/plan', '/settings', '/setup', '/privacy', '/terms', '/offline', '/manifest.webmanifest', '/icons/192.png', '/icons/512.png'];

async function precache() {
  const pages = await caches.open(PAGES);
  const assets = await caches.open(ASSETS);
  const assetUrls = new Set();
  await Promise.all(
    SHELL.map(async (url) => {
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) return;
        await pages.put(url, res.clone());
        if ((res.headers.get('content-type') || '').includes('text/html')) {
          const html = await res.text();
          for (const m of html.matchAll(/\/_next\/static\/[^"'\s)]+/g)) assetUrls.add(m[0].replace(/\\u0026/g, '&'));
        }
      } catch {
        /* offline during install: cached on next visit */
      }
    }),
  );
  await Promise.all([...assetUrls].map((u) => assets.add(u).catch(() => undefined)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![PAGES, ASSETS, MEDIA].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGES);
  try {
    const res = await Promise.race([fetch(request), timeout(4000)]);
    if (res.ok) cache.put(new URL(request.url).pathname, res.clone());
    return res;
  } catch {
    const path = new URL(request.url).pathname;
    return (await cache.match(path)) || (await cache.match('/')) || (await cache.match('/offline')) || Response.error();
  }
}

async function cacheFirst(request, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
    return;
  }
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }
  if (url.pathname.startsWith('/media/')) {
    event.respondWith(cacheFirst(request, MEDIA));
    return;
  }
  // RSC payloads for client-side navigation: network, then cache.
  if (url.searchParams.has('_rsc') || request.headers.get('RSC') === '1') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) caches.open(PAGES).then((c) => c.put(request, res.clone()));
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || Response.error())),
    );
  }
});
