// Service worker: caches this app's own files so repeat launches don't have
// to re-download them over the network every time.
//
// Strategy: stale-while-revalidate for everything listed below — serve the
// cached copy immediately (fast), then fetch a fresh copy in the background
// and store it for next time. This means a code update (a new zip deployed
// here) will still show up automatically within one extra reload, without
// needing to bump CACHE_VERSION — that's only there as a manual escape
// hatch if a truly clean slate is ever needed.
//
// Firebase, r.jina.ai, the Anthropic API, and the esm.sh/CDN script tags are
// deliberately left alone — those are either live data or third-party
// origins, not something this app should be caching.
//
// v2 note: v1 cached the bare "./" path, which some static hosts serve as a
// redirect to "/index.html". iOS refuses to let a service worker answer a
// *navigation* request (i.e. actually launching the home-screen app) with a
// redirected Response — that's exactly what broke launching from the home
// screen. Fixed by dropping "./" from the cached list and by always
// re-wrapping any redirected response into a fresh, non-redirected one
// before it's cached or returned.

const CACHE_VERSION = "v2";
const CACHE_NAME = `recipe-app-${CACHE_VERSION}`;

const APP_FILES = [
    "./index.html",
    "./app.js",
    "./calendar.js",
    "./photo-editor.js",
    "./manifest.json",
    "./icon-180.png",
    "./icon-192.png",
    "./icon-512.png",
    "./splash/splash-1170x2532.png",
    "./splash/splash-1179x2556.png",
    "./splash/splash-1284x2778.png",
    "./splash/splash-1290x2796.png",
    "./splash/splash-750x1334.png",
    "./splash/splash-828x1792.png",
];

// A redirected Response can't be handed back for a navigation request (iOS
// throws "Response served by service worker has redirections"). Rebuilding
// it from its own body/status/headers produces an equivalent but
// non-redirected Response that's always safe to cache or return.
async function stripRedirect(response) {
    if (!response || !response.redirected)
        return response;
    const body = await response.blob();
    return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
    });
}

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES))
    );
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(
                names
                    .filter((name) => name.startsWith("recipe-app-") && name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);
    // Only handle our own same-origin GET requests for the files above —
    // everything else (Firebase, APIs, CDN scripts) passes straight through
    // to the network untouched.
    if (event.request.method !== "GET" || url.origin !== self.location.origin)
        return;

    event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
            const cached = await cache.match(event.request);
            const networkFetch = fetch(event.request)
                .then(async (response) => {
                    if (response && response.ok) {
                        const clean = await stripRedirect(response.clone());
                        cache.put(event.request, clean);
                    }
                    return stripRedirect(response);
                })
                .catch(() => cached); // offline: fall back to whatever's cached
            return cached || networkFetch;
        })
    );
});
