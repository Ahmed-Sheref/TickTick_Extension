(() => {
  const SELECTION_KEY = "ticktick_last_selection_cache";

  function cleanTitle(rawTitle) {
    if (!rawTitle) return "";

    return rawTitle
      .replace(/\s+[|\-—•]\s+[^|\-—•]+$/, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractBestTitle() {
    const ogTitle = document.querySelector('meta[property="og:title"]')?.content?.trim();
    const h1 = document.querySelector("h1")?.innerText?.trim();
    const docTitle = document.title?.trim();

    const candidates = [ogTitle, h1, docTitle].filter(Boolean);

    for (const candidate of candidates) {
      const cleaned = cleanTitle(candidate);
      if (cleaned && cleaned.length >= 5) return cleaned;
    }

    return "Untitled Article";
  }

  function getSelectedTextSafe() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return "";

    const text = selection.toString().trim();
    if (!text) return "";

    try {
      const container = document.createElement("div");

      for (let i = 0; i < selection.rangeCount; i++) {
        const fragment = selection.getRangeAt(i).cloneContents();
        container.appendChild(fragment);
      }

      return (container.textContent || text).trim();
    } catch {
      return text;
    }
  }

  function rememberSelection() {
    const current = getSelectedTextSafe();
    if (!current) return;

    try {
  if (chrome?.storage?.local) {
    chrome.storage.local.set({ [SELECTION_KEY]: current });
  }
} catch (e) {
  console.warn("Storage failed:", e.message);
}
  }

  function getReadableText() {
    const target =
      document.querySelector("article") ||
      document.querySelector("main") ||
      document.body;

    if (!target) return "";

    return (target.textContent || "")
      .trim()
      .slice(0, 15000);
  }

  document.addEventListener("mouseup", rememberSelection, true);
  document.addEventListener("keyup", rememberSelection, true);
  document.addEventListener("selectionchange", rememberSelection, true);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "GET_PAGE_CONTEXT") return;

    try {
      const selectedText = getSelectedTextSafe();

      sendResponse({
        ok: true,
        data: {
          title: extractBestTitle(),
          url: window.location.href,
          selectedText,
          pageText: getReadableText()
        }
      });
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }

    return true;
  });
})();