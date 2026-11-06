/* GOWAYY PARTNER authenticated browser-push display and navigation. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { payload = { title: 'GOWAYY PARTNER', body: event.data.text(), data: {} }; }
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
  event.waitUntil(self.registration.showNotification(String(payload.title || 'GOWAYY PARTNER'), {
    body: String(payload.body || 'Open the partner console to view your update.'), icon: '/brand/app-icon.png', badge: '/brand/favicon.png',
    tag: String(data.notificationId || 'gowayy-partner-update'), data,
  }));
});
self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {};
  event.notification.close();
  const requested = typeof data.actionUrl === 'string' ? data.actionUrl : '/inbox';
  const url = new URL(requested, self.location.origin);
  const target = url.origin === self.location.origin ? `${url.pathname}${url.search}` : '/inbox';
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
