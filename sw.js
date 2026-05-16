self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(clients.claim());
});

self.addEventListener('push', function(e) {
  let data = {};
  try { data = e.data.json(); } catch(err) { data = { title: 'Subtraz', body: e.data ? e.data.text() : 'New notification' }; }

  let urlToOpen = 'https://subtraz.top/index.html';
  if (data.detection) {
    const params = new URLSearchParams({
      subscriptions: JSON.stringify([data.detection]),
      auto: '1',
      source: 'gmail'
    });
    urlToOpen = `https://subtraz.top/index.html?${params.toString()}`;
  }

  e.waitUntil(
    self.registration.showNotification(data.title || 'Subtraz', {
      body: data.body || 'Tap to open.',
      icon: 'https://plain-apac-prod-public.komododecks.com/202605/09/ZIboAgsmtLYiF8SL1RwT/image.png',
      badge: 'https://plain-apac-prod-public.komododecks.com/202605/09/ZIboAgsmtLYiF8SL1RwT/image.png',
      requireInteraction: true,
      vibrate: [200, 100, 200],
      data: { url: urlToOpen }
    })
  );
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  const url = e.notification.data?.url || 'https://subtraz.top/index.html';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (const client of list) {
        if ((client.url.includes('subtraz.top') || client.url.includes('subtraz.top')) && 'focus' in client) {
          client.focus();
          return client.navigate(url);
        }
      }
      return clients.openWindow(url);
    })
  );
});