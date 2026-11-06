/* GOWAYY ADMIN service worker: offline shell + authenticated browser push. */
const CACHE = 'gowayy-admin-v2';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/brand/icon.svg', '/brand/splash-logo.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/images/') || url.pathname.startsWith('/mascot/')) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })));
    return;
  }
  if (url.pathname.startsWith('/api/')) return; // network-only for the shared backend
  e.respondWith(fetch(e.request).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; }).catch(() => caches.match(e.request).then((hit) => hit || caches.match('/index.html'))));
});
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { payload = { title: 'GOWAYY ADMIN', body: event.data.text(), data: {} }; }
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
  event.waitUntil(self.registration.showNotification(String(payload.title || 'GOWAYY ADMIN'), {
    body: String(payload.body || 'Open the admin console to review this update.'), icon: '/brand/app-icon.png', badge: '/brand/favicon.png',
    tag: String(data.notificationId || 'gowayy-admin-update'), data,
  }));
});
self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {};
  event.notification.close();
  const requested = typeof data.actionUrl === 'string' ? data.actionUrl : '/#support';
  const url = new URL(requested, self.location.origin);
  const target = url.origin === self.location.origin ? `${url.pathname}${url.search}${url.hash}` : '/#support';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
    const client = windows.find((item) => new URL(item.url).origin === self.location.origin);
    if (client) {
      client.postMessage({ type: 'GOWAYY_PUSH_CLICK', notificationId: data.notificationId ?? null });
      await client.focus();
      if ('navigate' in client) await client.navigate(target);
    } else await self.clients.openWindow(target);
  }));
});
self.addEventListener('pushsubscriptionchange', (event) => {
  const key = event.oldSubscription?.options?.applicationServerKey;
  if (!key) return;
  event.waitUntil(self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }).then(() =>
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => windows.forEach((client) => client.postMessage({ type: 'GOWAYY_PUSH_SUBSCRIPTION_CHANGED' }))),
  ));
});
