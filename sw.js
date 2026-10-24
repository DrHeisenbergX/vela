/* Vela Service Worker – offline-first */
const VERSION = 'vela-v3.1.0';
const SHELL = 'vela-shell-' + VERSION;
const OCR = 'vela-ocr-v6.0.1';            /* separat versioniert: gross, ändert selten */
const SHELL_FILES = [
  './', './index.html', './manifest.webmanifest', './favicon.png',
  './apple-touch-icon.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png'
];
const OCR_FILES = [
  './vendor/tesseract/tesseract.min.js',
  './vendor/tesseract/worker.min.js',
  './vendor/tesseract/tesseract-core-simd-lstm.wasm.js',
  './vendor/tesseract/tesseract-core-lstm.wasm.js',
  './vendor/lang/deu.traineddata.gz',
  './vendor/lang/eng.traineddata.gz'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    await shell.addAll(SHELL_FILES.map((u) => new Request(u, { cache: 'reload' })));  /* HTTP-Cache umgehen, damit die neue Version geladen wird */
    /* OCR-Dateien best effort: ein Fehler blockiert die Installation nicht */
    const ocr = await caches.open(OCR);
    await Promise.allSettled(OCR_FILES.map(async (u) => {
      if (!(await ocr.match(u))) { const r = await fetch(u, { cache: 'no-cache' }); if (r.ok) await ocr.put(u, r); }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('vela-') && k !== SHELL && k !== OCR).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* OCR-Assets: cache-first (gross, unveränderlich) */
  if (url.pathname.includes('/vendor/')) {
    event.respondWith((async () => {
      const cache = await caches.open(OCR);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  /* App-Shell und Navigation: stale-while-revalidate */
  event.respondWith((async () => {
    const cache = await caches.open(SHELL);
    const key = req.mode === 'navigate' ? './index.html' : req;
    const hit = await cache.match(key, { ignoreSearch: true });
    const net = fetch(req).then((res) => { if (res && res.ok && res.type === 'basic') cache.put(key, res.clone()); return res; }).catch(() => null);
    if (hit) { event.waitUntil(net); return hit; }
    const res = await net;
    return res || new Response('Offline – Inhalt nicht verfügbar', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });
