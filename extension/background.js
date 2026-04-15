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

    await chrome.tabs.remove(tabId);
  } catch (error) {
    console.error("OAuth tab watcher error:", error);
  }
});