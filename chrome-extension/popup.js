const BACKEND_URL = "http://localhost:3001";
const RECEIPT_PAGE_URL = "http://127.0.0.1:5500/index.html#/app/receiptAutoFill";

const unlinkedView = document.getElementById("unlinkedView");
const linkedView = document.getElementById("linkedView");
const pairMessage = document.getElementById("pairMessage");
const pairCodeInput = document.getElementById("pairCodeInput");
const linkAccountBtn = document.getElementById("linkAccountBtn");
const linkedAccountText = document.getElementById("linkedAccountText");

const checkReceiptsBtn = document.getElementById("checkReceiptsBtn");
const pendingReceiptCard = document.getElementById("pendingReceiptCard");
const pendingReceiptName = document.getElementById("pendingReceiptName");
const pendingReceiptDetails = document.getElementById("pendingReceiptDetails");
const addPendingReceiptBtn = document.getElementById("addPendingReceiptBtn");
const dismissPendingReceiptBtn = document.getElementById("dismissPendingReceiptBtn");

let currentPendingDetection = null;

function openReceiptAutoFill() {
  chrome.tabs.create({
    url: RECEIPT_PAGE_URL
  });
}

function showMessage(message, type) {
  pairMessage.textContent = message;
  pairMessage.className = "message show " + type;
}

function clearMessage() {
  pairMessage.textContent = "";
  pairMessage.className = "message";
}

function setPairBusy(isBusy) {
  linkAccountBtn.disabled = isBusy;
  linkAccountBtn.textContent = isBusy ? "Linking..." : "Link account";
}

function showUnlinked() {
  unlinkedView.classList.remove("hidden");
  linkedView.classList.add("hidden");
}

function showLinked(email) {
  unlinkedView.classList.add("hidden");
  linkedView.classList.remove("hidden");

  linkedAccountText.textContent = email
    ? "Linked to " + email + ". Ready to check receipt alerts."
    : "This browser is linked to your Subtraz account.";
}

function hidePendingReceipt() {
  currentPendingDetection = null;
  pendingReceiptCard.classList.add("hidden");
  pendingReceiptName.textContent = "";
  pendingReceiptDetails.textContent = "";
}

function showPendingReceipt(detection) {
  currentPendingDetection = detection;

  const details = [
    detection.amount ? "$" + detection.amount : "",
    detection.cycle || "",
    detection.billing_date || ""
  ].filter(Boolean).join(" - ");

  pendingReceiptName.textContent =
    (detection.service_name || "Subscription") + " receipt detected";

  pendingReceiptDetails.textContent =
    details || "Subscription receipt detected from Gmail.";

  pendingReceiptCard.classList.remove("hidden");
}

async function getStoredToken() {
  const result = await chrome.storage.local.get(["subtrazExtensionToken"]);
  return result.subtrazExtensionToken || "";
}

async function checkExistingLink() {
  const token = await getStoredToken();

  if (!token) {
    showUnlinked();
    return;
  }

  try {
    const response = await fetch(BACKEND_URL + "/api/extension/status", {
      method: "GET",
      headers: {
        "X-Subtraz-Extension-Token": token
      }
    });

    const result = await response.json().catch(function () {
      return {};
    });

    if (!response.ok || !result.ok || !result.linked) {
      await chrome.storage.local.remove(["subtrazExtensionToken"]);
      showUnlinked();
      return;
    }

    showLinked(result.accountEmail || "");
  } catch (error) {
    showLinked("");
  }
}

async function fetchPendingReceipts() {
  const token = await getStoredToken();

  if (!token) {
    showUnlinked();
    return;
  }

  checkReceiptsBtn.disabled = true;
  checkReceiptsBtn.textContent = "Scanning Gmail...";

  try {
    const scanResponse = await fetch(
      BACKEND_URL + "/api/extension/detections/scan-now",
      {
        method: "POST",
        headers: {
          "X-Subtraz-Extension-Token": token
        }
      }
    );

    const scanResult = await scanResponse.json().catch(function () {
      return {};
    });

    if (!scanResponse.ok || !scanResult.ok) {
      throw new Error(scanResult.error || "Could not scan Gmail.");
    }

    checkReceiptsBtn.textContent = "Checking receipts...";

    const response = await fetch(
      BACKEND_URL + "/api/extension/detections/pending",
      {
        method: "GET",
        headers: {
          "X-Subtraz-Extension-Token": token
        }
      }
    );

    const result = await response.json().catch(function () {
      return {};
    });

    if (!response.ok || !result.ok) {
      throw new Error(result.error || "Could not check pending receipts.");
    }

    if (!result.detections || !result.detections.length) {
      hidePendingReceipt();

      if (scanResult.found > 0 && scanResult.created === 0) {
        alert("Receipts were found, but they were already checked before. Send a new test receipt email and try again.");
      } else {
        alert("No new subscription receipt found in Gmail.");
      }

      return;
    }

    showPendingReceipt(result.detections[0]);
  } catch (error) {
    alert(error.message || "Could not scan Gmail.");
  } finally {
    checkReceiptsBtn.disabled = false;
    checkReceiptsBtn.textContent = "Check for pending receipt";
  }
}

async function openCurrentDetection() {
  if (!currentPendingDetection) return;

  const token = await getStoredToken();

  try {
    const response = await fetch(
      BACKEND_URL +
        "/api/extension/detections/" +
        encodeURIComponent(currentPendingDetection.id) +
        "/open",
      {
        method: "POST",
        headers: {
          "X-Subtraz-Extension-Token": token
        }
      }
    );

    const result = await response.json().catch(function () {
      return {};
    });

    if (!response.ok || !result.ok) {
      throw new Error(result.error || "Could not open this receipt.");
    }

    const detection = result.detection;

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

    chrome.tabs.create({
      url:
        "http://127.0.0.1:5500/index.html?" +
        params.toString() +
        "#/app/dashboard"
    });

    hidePendingReceipt();
  } catch (error) {
    alert(error.message || "Could not open this receipt.");
  }
}

async function dismissCurrentDetection() {
  if (!currentPendingDetection) return;

  const token = await getStoredToken();

  try {
    const response = await fetch(
      BACKEND_URL +
        "/api/extension/detections/" +
        encodeURIComponent(currentPendingDetection.id) +
        "/dismiss",
      {
        method: "POST",
        headers: {
          "X-Subtraz-Extension-Token": token
        }
      }
    );

    const result = await response.json().catch(function () {
      return {};
    });

    if (!response.ok || !result.ok) {
      throw new Error(result.error || "Could not dismiss this receipt.");
    }

    hidePendingReceipt();
  } catch (error) {
    alert(error.message || "Could not dismiss this receipt.");
  }
}

pairCodeInput.addEventListener("input", function () {
  pairCodeInput.value = pairCodeInput.value.replace(/\D/g, "").slice(0, 6);
  clearMessage();
});

linkAccountBtn.addEventListener("click", async function () {
  const code = pairCodeInput.value.trim();

  if (!/^\d{6}$/.test(code)) {
    showMessage("Enter the 6-digit code from Subtraz.", "error");
    return;
  }

  setPairBusy(true);
  clearMessage();

  try {
    const response = await fetch(BACKEND_URL + "/api/extension/pair/claim", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        code,
        deviceName: "Chrome Extension"
      })
    });

    const result = await response.json().catch(function () {
      return {};
    });

    if (!response.ok || !result.ok || !result.extensionToken) {
      throw new Error(result.error || "Could not link this browser.");
    }

    await chrome.storage.local.set({
      subtrazExtensionToken: result.extensionToken
    });

    showLinked("");
  } catch (error) {
    showMessage(error.message || "Could not link this browser.", "error");
  } finally {
    setPairBusy(false);
  }
});

checkReceiptsBtn.addEventListener("click", fetchPendingReceipts);
addPendingReceiptBtn.addEventListener("click", openCurrentDetection);
dismissPendingReceiptBtn.addEventListener("click", dismissCurrentDetection);

document.getElementById("openReceiptBtn").addEventListener("click", openReceiptAutoFill);
document.getElementById("openLinkedReceiptBtn").addEventListener("click", openReceiptAutoFill);

document.getElementById("unlinkBtn").addEventListener("click", async function () {
  await chrome.storage.local.remove(["subtrazExtensionToken"]);
  pairCodeInput.value = "";
  clearMessage();
  hidePendingReceipt();
  showUnlinked();
});

checkExistingLink();