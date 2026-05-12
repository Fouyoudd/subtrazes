self.addEventListener('push', function(e) {
  const data = e.data?.json() || {};

  // Build the deep-link URL with autofill params if detection data is present
  let urlToOpen = 'https://subtrack.surge.sh/index.html';

  if (data.detection) {
    const d = data.detection;
    const params = new URLSearchParams({
      subscriptions: JSON.stringify([d]),
      auto: '1',
      source: 'gmail'
    });
    urlToOpen = `https://subtrack.surge.sh/index.html?${params.toString()}#/app/subscriptions/add`;
  }

  const notifOptions = {
    body: data.body || 'You have an upcoming renewal.',
    icon: 'https://plain-apac-prod-public.komododecks.com/202605/09/ZIboAgsmtLYiF8SL1RwT/image.png',
    badge: 'https://plain-apac-prod-public.komododecks.com/202605/09/ZIboAgsmtLYiF8SL1RwT/image.png',
    vibrate: [200, 100, 200],
    requireInteraction: true,
    // Store the URL in notification data so notificationclick can read it
    data: { url: urlToOpen }
  };

  e.waitUntil(
    self.registration.showNotification(data.title || 'SubTracks', notifOptions)
  );
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();

  const urlToOpen = e.notification.data?.url || 'https://subtrack.surge.sh/index.html';

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // If the app is already open, focus it and navigate
      for (const client of clientList) {
        if (client.url.includes('subtrack.surge.sh') && 'focus' in client) {
          client.focus();
          client.navigate(urlToOpen);
          return;
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});