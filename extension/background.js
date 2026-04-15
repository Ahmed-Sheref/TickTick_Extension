const API_BASE = "https://ticktickextension-production.up.railway.app/api/v1";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "startTickTickAuth") {
    
    const extensionId = chrome.runtime.id;
    const redirectUri = `https://${extensionId}.chromiumapp.org/ticktick`;
    const authUrl = `${API_BASE}/ticktick/auth?redirect_uri=${encodeURIComponent(redirectUri)}`;

    chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      (responseUrl) => {
        if (chrome.runtime.lastError || !responseUrl) {
          sendResponse({ error: chrome.runtime.lastError?.message || "Auth cancelled" });
          return;
        }

        try {
          const url = new URL(responseUrl);
          const userId = url.searchParams.get("userId");

          if (!userId) {
            sendResponse({ error: "No userId in response" });
            return;
          }

          sendResponse({ userId });
        } catch (e) {
          sendResponse({ error: e.message });
        }
      }
    );

    return true; // مهم جداً عشان sendResponse تشتغل async
  }
});