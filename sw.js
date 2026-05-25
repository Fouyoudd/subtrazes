self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(clients.claim());
});

const LIVE_APP_URL = "https://subtraz.top/index.html";

const ALLOWED_APP_ORIGINS = new Set([
  "https://subtraz.top",
  "https://www.subtraz.top",
  "http://127.0.0.1:5500",
  "http://localhost:5500"
]);

function safeAppUrl(value) {
  try {
    const parsed = new URL(String(value || ""));

    if (!ALLOWED_APP_ORIGINS.has(parsed.origin)) {
      return "";
    }

    return parsed.href;
  } catch (_) {
    return "";
  }
}

function buildReceiptPushUrl(detection) {
  const params = new URLSearchParams({
    subscriptions: JSON.stringify([detection]),
    auto: "1",
    source: "gmail"
  });

  return `${LIVE_APP_URL}?${params.toString()}#/app/notifications`;
}

function buildReminderPushUrl(subscriptionId) {
  return `${LIVE_APP_URL}?reminder_sub=${encodeURIComponent(subscriptionId)}#/app/subscriptions`;
}

self.addEventListener("push", function (event) {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = {
      title: "Subtraz",
      body: event.data ? event.data.text() : "New alert"
    };
  }

  let urlToOpen =
    safeAppUrl(data.url) ||
    safeAppUrl(data.reminderUrl) ||
    "";

  if (!urlToOpen && data.reminder && data.reminder.subscriptionId) {
    urlToOpen = buildReminderPushUrl(data.reminder.subscriptionId);
  }

  if (!urlToOpen && data.subscriptionId) {
    urlToOpen = buildReminderPushUrl(data.subscriptionId);
  }

  if (!urlToOpen && data.detection) {
    urlToOpen = buildReceiptPushUrl(data.detection);
  }

  if (!urlToOpen) {
    urlToOpen = LIVE_APP_URL;
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Subtraz", {
      body: data.body || "Tap to open Subtraz.",
      icon: "https://plain-apac-prod-public.komododecks.com/202605/09/ZIboAgsmtLYiF8SL1RwT/image.png",
      badge: "https://plain-apac-prod-public.komododecks.com/202605/09/ZIboAgsmtLYiF8SL1RwT/image.png",
      tag: data.tag || "subtraz-alert",
      renotify: true,
      data: {
        url: urlToOpen
      }
    })
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  const urlToOpen =
    safeAppUrl(event.notification.data?.url) ||
    LIVE_APP_URL;

  event.waitUntil(
    clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then(function (windowClients) {
      const existingApp = windowClients.find(function (client) {
        try {
          return (
            ALLOWED_APP_ORIGINS.has(new URL(client.url).origin) &&
            "focus" in client
          );
        } catch (_) {
          return false;
        }
      });

      if (existingApp) {
        return existingApp.focus().then(function () {
          existingApp.postMessage({
            type: "SUBTRAZ_PUSH_OPEN_URL",
            url: urlToOpen
          });
        });
      }

      return clients.openWindow(urlToOpen);
    })
  );
});