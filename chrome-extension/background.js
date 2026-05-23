const BACKEND_URL = "https://subtracks-production.up.railway.app";
const SUBTRAZ_PAGE_URL = "https://subtraz.top/index.html";
const CHECK_ALARM_NAME = "subtraz-check-gmail";
const NOTIFICATION_PREFIX = "subtraz-receipt-";

/*
  Temporary test icon.
  It keeps the desktop notification functional during local testing.
  We will replace it with your proper Subtraz icon before publishing.
*/
const TEST_ICON_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

let scanRunning = false;

async function getStoredToken() {
  const result = await chrome.storage.local.get(["subtrazExtensionToken"]);
  return result.subtrazExtensionToken || "";
}

async function requestJson(url, options) {
  const response = await fetch(url, options);

  const result = await response.json().catch(function () {
    return {};
  });

  if (!response.ok || !result.ok) {
    throw new Error(result.error || "Request failed.");
  }

  return result;
}

async function ensureCheckAlarm() {
  const existingAlarm = await chrome.alarms.get(CHECK_ALARM_NAME);

  if (!existingAlarm) {
    await chrome.alarms.create(CHECK_ALARM_NAME, {
      delayInMinutes: 1,
      periodInMinutes: 1
    });
  }
}

function buildReceiptMessage(detection) {
  return [
    detection.amount ? "$" + detection.amount : "",
    detection.cycle || "",
    detection.billing_date || ""
  ].filter(Boolean).join(" - ");
}

function buildAutoFillUrl(detection) {
  const subscriptionToFill = {
    serviceName: detection.service_name || "",
    amount: detection.amount || "",
    billingDate: detection.billing_date || "",
    cycle: detection.cycle || "monthly",
    category: detection.category || "",
    source: "extension"
  };

  const params = new URLSearchParams({
    subscriptions: JSON.stringify([subscriptionToFill]),
    auto: "1",
    source: "extension"
  });

  return (
    SUBTRAZ_PAGE_URL +
    "?" +
    params.toString() +
    "#/app/dashboard"
  );
}

async function saveNotificationDetection(detection) {
  const result = await chrome.storage.local.get(["desktopReceiptDetections"]);
  const storedDetections = result.desktopReceiptDetections || {};

  storedDetections[detection.id] = detection;

  await chrome.storage.local.set({
    desktopReceiptDetections: storedDetections
  });
}

async function removeNotificationDetection(detectionId) {
  const result = await chrome.storage.local.get(["desktopReceiptDetections"]);
  const storedDetections = result.desktopReceiptDetections || {};

  delete storedDetections[detectionId];

  await chrome.storage.local.set({
    desktopReceiptDetections: storedDetections
  });

  const remainingCount = Object.keys(storedDetections).length;

  await chrome.action.setBadgeText({
    text: remainingCount ? String(remainingCount) : ""
  });
}

async function showDesktopReceiptAlert(detection) {
  const notificationId = NOTIFICATION_PREFIX + detection.id;

  await saveNotificationDetection(detection);

  await chrome.notifications.create(notificationId, {
    type: "basic",
    iconUrl: TEST_ICON_URL,
    title: (detection.service_name || "Subscription") + " receipt detected",
    message: buildReceiptMessage(detection) || "New subscription receipt found in Gmail.",
    buttons: [
      {
        title: "Add subscription"
      },
      {
        title: "Dismiss"
      }
    ],
    priority: 2,
    requireInteraction: true
  });

  const result = await chrome.storage.local.get(["desktopReceiptDetections"]);
  const count = Object.keys(result.desktopReceiptDetections || {}).length;

  await chrome.action.setBadgeBackgroundColor({
    color: "#16a34a"
  });

  await chrome.action.setBadgeText({
    text: count ? String(count) : ""
  });
}

async function scanGmailAndAlert() {
  if (scanRunning) return;

  scanRunning = true;

  try {
    const token = await getStoredToken();

    if (!token) return;

    await requestJson(
      BACKEND_URL + "/api/extension/detections/scan-now",
      {
        method: "POST",
        headers: {
          "X-Subtraz-Extension-Token": token
        }
      }
    );

    const pendingResult = await requestJson(
      BACKEND_URL + "/api/extension/detections/pending",
      {
        method: "GET",
        headers: {
          "X-Subtraz-Extension-Token": token
        }
      }
    );

    const detections = pendingResult.detections || [];

    for (const detection of detections) {
      await showDesktopReceiptAlert(detection);
    }
  } catch (error) {
    console.error("Subtraz automatic receipt alert failed:", error.message);
  } finally {
    scanRunning = false;
  }
}

async function addReceiptFromNotification(detectionId) {
  try {
    const token = await getStoredToken();

    if (!token) return;

    const result = await requestJson(
      BACKEND_URL +
        "/api/extension/detections/" +
        encodeURIComponent(detectionId) +
        "/open",
      {
        method: "POST",
        headers: {
          "X-Subtraz-Extension-Token": token
        }
      }
    );

    await chrome.tabs.create({
      url: buildAutoFillUrl(result.detection)
    });

    await chrome.notifications.clear(NOTIFICATION_PREFIX + detectionId);
    await removeNotificationDetection(detectionId);
  } catch (error) {
    console.error("Could not add receipt from notification:", error.message);
  }
}

async function dismissReceiptNotification(detectionId) {
  try {
    const token = await getStoredToken();

    if (!token) return;

    await requestJson(
      BACKEND_URL +
        "/api/extension/detections/" +
        encodeURIComponent(detectionId) +
        "/dismiss",
      {
        method: "POST",
        headers: {
          "X-Subtraz-Extension-Token": token
        }
      }
    );

    await chrome.notifications.clear(NOTIFICATION_PREFIX + detectionId);
    await removeNotificationDetection(detectionId);
  } catch (error) {
    console.error("Could not dismiss receipt notification:", error.message);
  }
}

chrome.runtime.onInstalled.addListener(function () {
  ensureCheckAlarm();
});

chrome.runtime.onStartup.addListener(function () {
  ensureCheckAlarm();
});

chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm.name === CHECK_ALARM_NAME) {
    scanGmailAndAlert();
  }
});

chrome.notifications.onButtonClicked.addListener(function (notificationId, buttonIndex) {
  if (!notificationId.startsWith(NOTIFICATION_PREFIX)) return;

  const detectionId = notificationId.slice(NOTIFICATION_PREFIX.length);

  if (buttonIndex === 0) {
    addReceiptFromNotification(detectionId);
  }

  if (buttonIndex === 1) {
    dismissReceiptNotification(detectionId);
  }
});

chrome.notifications.onClicked.addListener(function (notificationId) {
  if (!notificationId.startsWith(NOTIFICATION_PREFIX)) return;

  const detectionId = notificationId.slice(NOTIFICATION_PREFIX.length);
  addReceiptFromNotification(detectionId);
});

chrome.notifications.onClosed.addListener(function (notificationId, byUser) {
  if (!byUser || !notificationId.startsWith(NOTIFICATION_PREFIX)) return;

  const detectionId = notificationId.slice(NOTIFICATION_PREFIX.length);
  dismissReceiptNotification(detectionId);
});

ensureCheckAlarm();