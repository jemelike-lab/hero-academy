const CACHE_VERSION = "hero-academy-v24";
const CORE = [
  "./", "./index.html", "./number-lab.html", "./cauldron-cafe.html",
  "./word-tower.html",
  "./js/characters.js",
  "./hero-hall.html",
  "./diner-lanes.html",
  "./css/style.css", "./css/number-lab.css",
  "./js/app.js", "./js/math-skills.js", "./js/number-lab.js",
  "./manifest.webmanifest",
  "./assets/ralphie/ralphie_default.webp",
  "./assets/ralphie/ralphie_waving.webp",
  "./assets/ralphie/ralphie_cheering.webp",
  "./assets/ralphie/ralphie_thinking.webp",
  "./assets/ralphie/ralphie_surprised.webp",
  "./assets/ralphie/ralphie_sad.webp",
  "./assets/ralphie/ralphie_reading.webp",
  "./assets/ralphie/ralphie_basketball.webp",
  "./assets/ralphie/ralphie_painting.webp",
  "./assets/ralphie/ralphie_magnifying.webp",
  "./assets/ralphie/ralphie_guitar.webp",
  "./assets/ralphie/ralphie_flexing.webp",
  "./assets/ralphie/ralphie_clapping.webp",
  "./assets/ralphie/ralphie_pointing.webp",
  "./assets/ralphie/ralphie_trophy.webp",
  "./css/humphrey.css",
  "./js/humphrey.js",
  "./js/humphrey-listener.js",
  "./js/humphrey-chat.js",
  "./assets/humphrey/humphrey_base_256.webp",
  "./assets/humphrey/humphrey_base_256.png",
  "./assets/humphrey/humphrey_base_512.webp",
  "./assets/humphrey/humphrey_base_512.png",
];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE_VERSION).then(c => c.addAll(CORE))); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  var isHTML = e.request.mode === "navigate" ||
               (e.request.destination === "document") ||
               url.pathname.endsWith(".html") ||
               url.pathname === "/" ||
               url.pathname.endsWith("/");
  if (isHTML) {
    // Network-first for HTML so fresh content reaches users immediately
    e.respondWith(
      fetch(e.request).then(r => {
        if (r.ok) {
          var cl = r.clone();
          caches.open(CACHE_VERSION).then(ca => ca.put(e.request, cl));
        }
        return r;
      }).catch(() => caches.match(e.request).then(c => c || new Response("Offline", { status: 503 })))
    );
  } else {
    // Cache-first for static assets (CSS/JS/images) — SW version bump invalidates
    e.respondWith(
      caches.match(e.request).then(c => c || fetch(e.request).then(r => {
        if (r.ok) {
          var cl = r.clone();
          caches.open(CACHE_VERSION).then(ca => ca.put(e.request, cl));
        }
        return r;
      }).catch(() => c || new Response("Offline", { status: 503 })))
    );
  }
});