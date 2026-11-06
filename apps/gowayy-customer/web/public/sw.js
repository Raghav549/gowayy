/* GOWAYY PWA service worker: cache static shell and verified imagery, network-first for /api. */
const CACHE = 'gowayy-shell-v2';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/brand/g-symbol.svg', '/brand/wordmark.svg', '/brand/app-icon.png', '/brand/splash-logo.svg', '/brand/favicon.png'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/images/') || url.pathname.startsWith('/brand/')) {
    event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(event.request, copy)); }
      return res;
    })));
    return;
  }
  event.respondWith(fetch(event.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(event.request, copy)); }
    return res;
  }).catch(() => caches.match(event.request).then((hit) => hit || caches.match('/index.html'))));
});

// Remote push is displayed only when a provider actually delivers a push event.
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { payload = { title: 'GOWAYY', body: event.data.text(), data: {} }; }
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
  event.waitUntil(self.registration.showNotification(String(payload.title || 'GOWAYY'), {
    body: String(payload.body || 'Open GOWAYY to view your update.'),
    icon: '/brand/app-icon.png', badge: '/brand/favicon.png',
    tag: String(data.notificationId || 'gowayy-update'), data,
  }));
});

self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {};
  event.notification.close();
  const requested = typeof data.actionUrl === 'string' ? data.actionUrl : String(data.type || '').startsWith('order.') ? '/orders' : '/bookings';
  const url = new URL(requested, self.location.origin);
  const target = url.origin === self.location.origin ? `${url.pathname}${url.search}` : '/bookings';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
    const client = windows.find((item) => new URL(item.url).origin === self.location.origin);
    if (client) {
      client.postMessage({ type: 'GOWAYY_PUSH_CLICK', notificationId: data.notificationId ?? null });
      await client.focus();
      if ('navigate' in client) await client.navigate(target);
      return;
    }
    await self.clients.openWindow(target);
  }));
});

// The browser supplies the existing public application-server key during key
// rotation. Active windows re-register with their authenticated API client; if
// no window is open, launch-time synchronization completes registration.
self.addEventListener('pushsubscriptionchange', (event) => {
  const key = event.oldSubscription?.options?.applicationServerKey;
  if (!key) return;
  event.waitUntil(self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }).then(() =>
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      windows.forEach((client) => client.postMessage({ type: 'GOWAYY_PUSH_SUBSCRIPTION_CHANGED' }));
    }),
  ));
});
