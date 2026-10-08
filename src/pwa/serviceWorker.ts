/**
 * Builds the service worker source for the offline-capable app (PWA).
 * Everything the game needs is precached on the first visit; afterwards it runs with no network.
 */
export interface ServiceWorkerOptions {
  /** Paths to precache, relative to the site root (e.g. "index.html", "assets/index-abc.js"). */
  assets: string[];
  /** Changes whenever the build changes, so phones pick up new versions. */
  version: string;
}

export function serviceWorkerSource({ assets, version }: ServiceWorkerOptions): string {
  const list = JSON.stringify(['./', ...assets.map((a) => `./${a.replace(/^\.?\//, '')}`)], null, 2);
  return `// Generated at build time. Precaches the whole game so it plays offline.
const CACHE = 'kickboxing-${version}';
const ASSETS = ${list};
// The ngrok free tier shows an interstitial page unless this header is present.
const HEADERS = { 'ngrok-skip-browser-warning': '1' };

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(ASSETS.map((url) =>
        fetch(new Request(url, { cache: 'reload', headers: HEADERS })).then(async (res) => {
          if (!res.ok) throw new Error('precache failed: ' + url + ' ' + res.status);
          // Store without "Vary": the browser asks for module scripts with an Origin header that the
          // precache request didn't have, and a Vary: Origin entry would then never match offline.
          const headers = new Headers(res.headers);
          headers.delete('vary');
          return cache.put(url, new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers }));
        }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('kickboxing-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (req.mode === 'navigate') {
      // Page loads: try the network briefly (to get updates), fall back to the cached game.
      try {
        const res = await Promise.race([
          fetch(req, { headers: HEADERS }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500)),
        ]);
        if (res && res.ok && (res.headers.get('content-type') || '').includes('text/html')) return res;
      } catch (e) { /* offline */ }
      return (await cache.match('./index.html', { ignoreVary: true })) || (await cache.match('./', { ignoreVary: true })) || Response.error();
    }
    const hit = await cache.match(req, { ignoreSearch: true, ignoreVary: true });
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch (e) {
      return Response.error();
    }
  })());
});
`;
}
