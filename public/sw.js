/**
 * Service Worker for EA Trade PWA
 * Handles Web Push notifications - enables background signal delivery on iOS PWA
 */
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'EA Trade', body: event.data.text() || 'New signal' };
  }
  
  const title = data.title || '🔵 SIGNAL';
  const body = data.body || 'New trading signal';
  const tag = data.tag || 'ea-trade-signal-' + (data.signalId || Date.now());
  
  // iOS Safari does not support requireInteraction - using it can break push subscriptions
  const options = {
    body,
    tag,
    data: data.data || {},
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(self.registration.scope);
      }
    })
  );
});
