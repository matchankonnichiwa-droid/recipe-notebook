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
// v3 note: still saw the same error recur later. Root-caused further: even
// during *install* (pre-caching APP_FILES), Cache.addAll() itself rejects
// if any response it fetches turns out to be redirected — so a redirecting
// host can poison things before a single page-load even happens. Install
// now fetches+strips each file manually instead of trusting addAll. Also,
// as of v3, navigation requests are no longer intercepted by this service
// worker at all (see the fetch handler) — the safest fix, since that's the
// one request type iOS won't tolerate a redirected answer for.

// v4 note: found the real reason updates never seemed to stick, even after
// reopening the app several times. The background revalidation fetch in
// the "fetch" handler was never wrapped in event.waitUntil() — so the
// browser was free to kill the service worker the moment it returned the
// cached response, before the background fetch+cache.put() had a chance to
// finish. The cache was never actually being updated. Fixed below.

const CACHE_VERSION = "v4";
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
        caches.open(CACHE_NAME).then((cache) =>
            Promise.all(
                APP_FILES.map((path) =>
                    fetch(path)
                        .then((response) => stripRedirect(response))
                        .then((clean) => cache.put(path, clean))
                        .catch(() => {
                            // If one file fails to pre-cache (offline install,
                            // flaky network, etc.), don't fail the whole
                            // install — it'll just be fetched fresh on first
                            // use instead of coming from cache immediately.
                        })
                )
            )
        )
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
    if (event.request.method !== "GET" || url.origin !== self.location.origin)
        return;
    // Navigation requests (actually launching/reloading the page, as
    // opposed to a script/image/etc. sub-resource fetch) are the specific
    // case iOS refuses to let a service worker answer with anything
    // redirected — and are also the request most likely to hit a redirect
    // if the hosting URL itself ever changes. Rather than keep patching
    // around that, just let the browser handle navigations directly,
    // completely untouched by this service worker. Sub-resources (the
    // actual JS/image files, which is where the real speed benefit is)
    // still go through the cache below as before.
    if (event.request.mode === "navigate")
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
            if (cached) {
                // Serve the cached copy immediately, but keep the service
                // worker alive with waitUntil() until the background
                // refetch/cache.put() actually finishes — without this, the
                // browser can (and reliably does) kill the worker the
                // instant respondWith() resolves, silently dropping the
                // "revalidate" half of stale-while-revalidate. That was the
                // real reason updates never seemed to arrive even after
                // reopening the app multiple times.
                event.waitUntil(networkFetch);
                return cached;
            }
            return networkFetch;
        })
    );
});
