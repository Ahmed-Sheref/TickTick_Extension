const API_BASE = "https://carefree-alignment-production-7eff.up.railway.app/api/v1";
let authTabId = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== "startTickTickAuth") return;

  try {
    const redirectUri = chrome.identity.getRedirectURL("ticktick");
    const authUrl = `${API_BASE}/ticktick/auth?redirect_uri=${encodeURIComponent(redirectUri)}`;

    chrome.tabs.create({ url: authUrl }, (tab) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
        return;
      }

      authTabId = tab.id;
      sendResponse({ started: true });
    });
  } catch (error) {
    sendResponse({ error: error.message || "Failed to start auth" });
  }

  return true;
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.url) return;

  const redirectBase = chrome.identity.getRedirectURL("ticktick");

  if (!changeInfo.url.startsWith(redirectBase)) return;

  try {
    const url = new URL(changeInfo.url);
    const userId = url.searchParams.get("userId");

    if (!userId) return;

    await chrome.storage.local.set({
      ticktick_userId: userId,
      ticktick_connected: true
    });

    if (tabId) {
      await chrome.tabs.remove(tabId);
    }
  } catch (error) {
    console.error("OAuth tab watcher error:", error);
  }
});