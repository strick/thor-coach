// Home-screen app shell: network first, with the last good copy as a fallback.
// Health data (/api/) and sign-in (/auth/) never touch the cache.
const SHELL = "thor-shell-v2";
const PRECACHE = [
  "/index.html", "/health.html", "/labs.html", "/chat.html", "/guides.html", "/nutrition.html",
  "/css/app.css", "/js/ui.js", "/js/dashboard.js", "/js/checkin.js", "/js/quickadd.js",
  "/manifest.webmanifest", "/icons/icon-192.png",
];

self.addEventListener("install", (e) => {
  // Pages behind sign-in redirect to the login page when signed out — never
  // store that under the page's name; cache only what came back directly.
  e.waitUntil(caches.open(SHELL).then((c) => Promise.all(PRECACHE.map((u) =>
    fetch(u).then((res) => (res.ok && !res.redirected ? c.put(u, res) : null)).catch(() => {})
  ))));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/") || url.pathname === "/login.html") return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Only complete same-origin responses (not sign-in redirects) are kept.
        if (res.ok && res.type === "basic" && !res.redirected) {
          const copy = res.clone();
          const key = url.pathname === "/" ? "/index.html" : url.pathname; // ignore ?source=homescreen etc.
          caches.open(SHELL).then((c) => c.put(key, copy));
        }
        return res;
      })
      .catch(() => caches.match(url.pathname === "/" ? "/index.html" : url.pathname))
  );
});
