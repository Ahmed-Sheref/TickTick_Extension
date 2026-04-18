/* =========================================================================
   background.js — TickTick Extension Service Worker
   ========================================================================= */

const API_BASE = "https://carefree-alignment-production-7eff.up.railway.app/api/v1";

// ─── TickTick OAuth ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action !== "startTickTickAuth") return;

  try {
    const redirectUri = chrome.identity.getRedirectURL("ticktick");
    const authUrl     = `${API_BASE}/ticktick/auth?redirect_uri=${encodeURIComponent(redirectUri)}`;

    chrome.tabs.create({ url: authUrl }, (tab) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ started: true });
    });
  } catch (error) {
    sendResponse({ error: error.message || "Failed to start auth." });
  }

  return true; // Keep message channel open for async sendResponse
});

// Watch for the OAuth redirect tab to complete
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.url) return;

  const redirectBase = chrome.identity.getRedirectURL("ticktick");
  if (!changeInfo.url.startsWith(redirectBase)) return;

  try {
    const url    = new URL(changeInfo.url);
    const userId = url.searchParams.get("userId");
    if (!userId) return;

    await chrome.storage.local.set({
      ticktick_userId:    userId,
      ticktick_connected: true,
    });

    await chrome.tabs.remove(tabId);
  } catch (error) {
    console.error("OAuth tab watcher error:", error);
  }
});

// ─── Context Menu ────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id:       "save-to-ticktick",
    title:    "Send to TickTick Extension",
    contexts: ["selection", "page"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "save-to-ticktick") return;

  // Ask content script for properly formatted selected text + page metadata
  chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_CONTEXT" }, (response) => {
    const text      = response?.ok && response.data.selectedText
      ? response.data.selectedText
      : info.selectionText || "";
    const pageTitle = response?.ok && response.data.title
      ? response.data.title
      : tab.title || "";

    chrome.storage.local.set({
      ticktick_context_data: {
        text,
        url:   tab.url  || "",
        title: pageTitle,
      },
    });
  });
});
