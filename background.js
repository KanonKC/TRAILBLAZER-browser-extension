// BLAZE Extension — Background Service Worker
// Reads the Twitch auth-token cookie and syncs it to the Blaze backend.

const BLAZE_API_URLS = [
  "https://blaze-dev.kanonkc.com",
  "http://localhost:8080"
];

const SYNC_ALARM_NAME = "blaze-token-sync";
const SYNC_INTERVAL_MINUTES = 30;

// ─── Token Fetching ───────────────────────────────────────────────────────────

async function getTwitchAuthToken() {
  return new Promise((resolve) => {
    chrome.cookies.get({ url: "https://www.twitch.tv", name: "auth-token" }, (cookie) => {
      resolve(cookie ? cookie.value : null);
    });
  });
}

async function getBlazeAccessToken(apiUrl) {
  return new Promise((resolve) => {
    chrome.cookies.get({ url: apiUrl, name: "accessToken" }, (cookie) => {
      resolve(cookie ? cookie.value : null);
    });
  });
}

async function getActiveSession() {
  // Try to detect token from known Blaze domains
  for (const apiUrl of BLAZE_API_URLS) {
    const accessToken = await getBlazeAccessToken(apiUrl);
    if (accessToken) {
      return { accessToken, apiUrl };
    }
  }
  return { accessToken: null, apiUrl: BLAZE_API_URLS[0] };
}

// ─── Sync Logic ───────────────────────────────────────────────────────────────

async function syncToken() {
  const twitchToken = await getTwitchAuthToken();
  if (!twitchToken) {
    console.log("[BLAZE] No Twitch auth-token found. User may not be logged in to Twitch.");
    await setBadge("off", "#888888");
    return { success: false, reason: "not_logged_in_twitch" };
  }

  const { accessToken, apiUrl } = await getActiveSession();
  if (!accessToken) {
    console.log("[BLAZE] No Blaze session found. User needs to log in to Blaze dashboard.");
    await setBadge("!", "#FF8C00");
    return { success: false, reason: "not_logged_in_blaze" };
  }

  try {
    const response = await fetch(`${apiUrl}/api/v1/auth/twitch-gql-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
      },
      body: JSON.stringify({ token: twitchToken })
    });

    if (response.status === 204 || response.status === 200) {
      console.log("[BLAZE] Token synced successfully to " + apiUrl);
      await setBadge("✓", "#22c55e");
      await chrome.storage.local.set({ last_sync: new Date().toISOString() });
      return { success: true };
    }

    if (response.status === 401) {
      console.log("[BLAZE] Blaze session expired or invalid.");
      await setBadge("!", "#FF8C00");
      return { success: false, reason: "session_expired" };
    }

    console.warn("[BLAZE] Unexpected response:", response.status);
    await setBadge("!", "#ef4444");
    return { success: false, reason: "server_error" };

  } catch (err) {
    console.error("[BLAZE] Network error during sync:", err);
    await setBadge("!", "#ef4444");
    return { success: false, reason: "network_error" };
  }
}

// ─── Badge Helpers ────────────────────────────────────────────────────────────

async function setBadge(text, color) {
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
}

// ─── Event Listeners ──────────────────────────────────────────────────────────

// Sync when the Twitch cookie changes (login/logout/refresh)
chrome.cookies.onChanged.addListener((changeInfo) => {
  if (
    changeInfo.cookie.domain.includes("twitch.tv") &&
    changeInfo.cookie.name === "auth-token" &&
    !changeInfo.removed
  ) {
    console.log("[BLAZE] Twitch auth-token changed, syncing...");
    syncToken();
  }
});

// Sync when the Blaze cookie changes
chrome.cookies.onChanged.addListener((changeInfo) => {
  const isBlazeDomain = BLAZE_API_URLS.some(url => changeInfo.cookie.domain.includes(new URL(url).hostname));
  if (isBlazeDomain && changeInfo.cookie.name === "accessToken" && !changeInfo.removed) {
    console.log("[BLAZE] Blaze access token detected, syncing...");
    syncToken();
  }
});

// Re-enable alarms if needed
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM_NAME) {
    syncToken();
  }
});

// On install/update: set up alarm and do initial sync
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(SYNC_ALARM_NAME, {
    periodInMinutes: SYNC_INTERVAL_MINUTES
  });
  syncToken();
});

// On startup
chrome.runtime.onStartup.addListener(() => {
  syncToken();
});

// Message listener from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SYNC_NOW") {
    syncToken().then(sendResponse);
    return true; // keep channel open for async response
  }

  if (message.type === "GET_STATUS") {
    getActiveSession().then(async (session) => {
      const twitchToken = await getTwitchAuthToken();
      const lastSyncResult = await new Promise(resolve => chrome.storage.local.get(["last_sync"], r => resolve(r.last_sync || null)));
      
      sendResponse({
        twitchConnected: !!twitchToken,
        blazeConnected: !!session.accessToken,
        lastSync: lastSyncResult,
        apiUrl: session.apiUrl
      });
    });
    return true;
  }
});
