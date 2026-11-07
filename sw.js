/* mhdGO – service worker: aplikace a knihovny z mezipaměti, data jízdních řádů nejdřív ze sítě */
const SHELL = 'mhdgo-shell-v1', DATA = 'mhdgo-data-v1';
const CORE = ['./', './mhdgo.html', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(CORE).catch(() => {})).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== SHELL && k !== DATA && k.startsWith('mhdgo-')).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
const LIB = /unpkg\.com\/leaflet|cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome|api\.mapbox\.com\/mapbox-gl-js|cdn\.jsdelivr\.net\/npm\/three|fonts\.(googleapis|gstatic)\.com/;
self.addEventListener('fetch', e => {
 const req = e.request; if (req.method !== 'GET') return;
 const u = req.url;
 if (/\/data\/.*\.json/.test(u)) { /* data: síť, při výpadku mezipaměť */
  e.respondWith(fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(DATA).then(x => x.put(req, c)); } return r; }).catch(() => caches.match(req)));
  return;
 }
 if (LIB.test(u) || (new URL(u).origin === self.location.origin && /\.(html|png|webmanifest)$|\/$/.test(new URL(u).pathname))) { /* aplikace a knihovny */
  e.respondWith(caches.match(req).then(hit => { const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') { const c = r.clone(); caches.open(SHELL).then(x => x.put(req, c)); } return r; }).catch(() => hit); return hit || net; }));
 }
});
