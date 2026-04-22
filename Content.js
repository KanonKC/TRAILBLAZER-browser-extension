// BLAZE Extension — Content Script
// Runs on twitch.tv pages. Notifies background when the page is active.

(function () {
  // Let background know the user is active on Twitch (good time to sync)
  chrome.runtime.sendMessage({ type: "SYNC_NOW" });
})();
