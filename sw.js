self.addEventListener('push', function(e) {
  const data = e.data?.json() || {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'SubTracks', {
      body: data.body || 'You have an upcoming renewal.',
      icon: 'https://plain-apac-prod-public.komododecks.com/202605/09/ZIboAgsmtLYiF8SL1RwT/image.png',
      badge: 'https://plain-apac-prod-public.komododecks.com/202605/09/ZIboAgsmtLYiF8SL1RwT/image.png',
      vibrate: [200, 100, 200],
      requireInteraction: true,
      data: data.data || {} // ✅ Store payload for click handler
    })
  );
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  const d = e.notification.data || {};
  const params = new URLSearchParams();
  
  if (d.service) params.set('service', d.service);
  if (d.amount) params.set('amount', d.amount);
  if (d.date) params.set('date', d.date);
  
  // ✅ iOS cache-buster
  params.set('_t', Date.now());
  
  const url = params.toString() 
    ? `https://subtrack.surge.sh/index.html?${params.toString()}#/app/dashboard` 
    : 'https://subtrack.surge.sh/index.html#/app/dashboard';
    
  e.waitUntil(clients.openWindow(url));
});