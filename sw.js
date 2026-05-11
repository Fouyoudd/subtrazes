self.addEventListener('push', function(e) {
  const data = e.data?.json() || {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'SubTracks', {
      body: data.body || 'You have an upcoming renewal.',
      icon: 'https://plain-apac-prod-public.komododecks.com/202605/09/ZIboAgsmtLYiF8SL1RwT/image.png',
      badge: 'https://plain-apac-prod-public.komododecks.com/202605/09/ZIboAgsmtLYiF8SL1RwT/image.png',
      vibrate: [200, 100, 200],
      requireInteraction: true
    })
  );
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(clients.openWindow('https://subtrack.surge.sh'));
});