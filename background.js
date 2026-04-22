// TRAILBLAZER Extension — Background Service Worker
// Reads the Twitch auth-token cookie and syncs it to the TRAILBLAZER backend.

const API_URL = import.meta.env.VITE_API_URL;

if (!API_URL) {
  throw new Error("VITE_API_URL environment variable is not set");
}

const TRAILBLAZER_API_URLS = [API_URL];

const SYNC_ALARM_NAME = "trailblazer-token-sync";
const SYNC_INTERVAL_MINUTES = 30;

// ─── Token Fetching ───────────────────────────────────────────────────────────

async function getTwitchAuthToken() {
  return new Promise((resolve) => {
    chrome.cookies.get({ url: "https://www.twitch.tv", name: "auth-token" }, (cookie) => {
      resolve(cookie ? cookie.value : null);
    });
  });
}

async function getTrailblazerAccessToken(apiUrl) {
  return new Promise((resolve) => {
    chrome.cookies.get({ url: apiUrl, name: "accessToken" }, (cookie) => {
      resolve(cookie ? cookie.value : null);
    });
  });
}

async function getActiveSession() {
  // Try to detect token from known TRAILBLAZER domains
  for (const apiUrl of TRAILBLAZER_API_URLS) {
    const accessToken = await getTrailblazerAccessToken(apiUrl);
    if (accessToken) {
      return { accessToken, apiUrl };
    }
  }
  return { accessToken: null, apiUrl: TRAILBLAZER_API_URLS[0] };
}

// ─── Sync Logic ───────────────────────────────────────────────────────────────

async function syncToken() {
  const twitchToken = await getTwitchAuthToken();
  if (!twitchToken) {
    console.log("[TRAILBLAZER] No Twitch auth-token found. User may not be logged in to Twitch.");
    await setBadge("off", "#888888");
    return { success: false, reason: "not_logged_in_twitch" };
  }

  const { accessToken, apiUrl } = await getActiveSession();
  if (!accessToken) {
    console.log("[TRAILBLAZER] No TRAILBLAZER session found. User needs to log in to TRAILBLAZER dashboard.");
    await setBadge("!", "#FF8C00");
    return { success: false, reason: "not_logged_in_trailblazer" };
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
      console.log("[TRAILBLAZER] Token synced successfully to " + apiUrl);
      await setBadge("✓", "#22c55e");
      await chrome.storage.local.set({ last_sync: new Date().toISOString() });
      return { success: true };
    }

    if (response.status === 401) {
      console.log("[TRAILBLAZER] TRAILBLAZER session expired or invalid.");
      await setBadge("!", "#FF8C00");
      return { success: false, reason: "session_expired" };
    }

    console.warn("[TRAILBLAZER] Unexpected response:", response.status);
    await setBadge("!", "#2e2727ff");
    return { success: false, reason: "server_error" };

  } catch (err) {
    console.error("[TRAILBLAZER] Network error during sync:", err);
    await setBadge("!", "#ef4444");
    return { success: false, reason: "network_error" };
  }
}

async function refreshTrailblazerToken(apiUrl) {
  try {
    const response = await fetch(`${apiUrl}/api/v1/refresh-token`, {
      method: "POST",
      credentials: "include"
    });

    if (response.ok) {
      console.log("[TRAILBLAZER] Token refreshed successfully via API");
      return { success: true };
    }

    const error = await response.json().catch(() => ({ message: "Unknown error" }));
    console.warn("[TRAILBLAZER] Token refresh failed:", error.message);
    return { success: false, reason: error.message };
  } catch (err) {
    console.error("[TRAILBLAZER] Network error during token refresh:", err);
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
    console.log("[TRAILBLAZER] Twitch auth-token changed, syncing...");
    syncToken();
  }
});

// Sync when the Blaze cookie changes
chrome.cookies.onChanged.addListener((changeInfo) => {
  const isTrailblazerDomain = TRAILBLAZER_API_URLS.some(url => changeInfo.cookie.domain.includes(new URL(url).hostname));
  if (isTrailblazerDomain && changeInfo.cookie.name === "accessToken" && !changeInfo.removed) {
    console.log("[TRAILBLAZER] TRAILBLAZER access token detected, syncing...");
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
  if (message.type === "REFRESH_TRAILBLAZER") {
    getActiveSession().then(async (session) => {
      const result = await refreshTrailblazerToken(session.apiUrl);
      sendResponse(result);
    });
    return true;
  }

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
        trailblazerConnected: !!session.accessToken,
        lastSync: lastSyncResult,
        apiUrl: session.apiUrl
      });
    });
    return true;
  }
});
