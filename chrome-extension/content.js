(function () {
  "use strict";

  const EXTENSION_NAME = "Subtraz Desktop Alerts";
  const EXTENSION_VERSION = chrome.runtime.getManifest().version;

  function announceInstalled() {
    window.postMessage(
      {
        source: "subtraz-extension",
        type: "SUBTRAZ_EXTENSION_INSTALLED",
        name: EXTENSION_NAME,
        version: EXTENSION_VERSION
      },
      window.location.origin
    );
  }

  window.addEventListener("message", function (event) {
    if (event.source !== window) return;
    if (event.origin !== window.location.origin) return;

    if (
      event.data &&
      event.data.source === "subtraz-web" &&
      event.data.type === "SUBTRAZ_EXTENSION_PING"
    ) {
      announceInstalled();
    }
  });

  announceInstalled();
  setTimeout(announceInstalled, 500);
  setTimeout(announceInstalled, 1200);

  window.addEventListener("hashchange", function () {
    setTimeout(announceInstalled, 150);
    setTimeout(announceInstalled, 600);
  });
})();