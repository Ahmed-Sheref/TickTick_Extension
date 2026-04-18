

(() => {
  // ─── Helpers ──────────────────────────────────────────────────────────────

  function cleanTitle(raw) {
    if (!raw) return "";
    return raw
      .replace(/\s+[|\-—•]\s+[^|\-—•]+$/, "") // Strip " | Site Name" suffixes
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractBestTitle() {
    const candidates = [
      document.querySelector('meta[property="og:title"]')?.content?.trim(),
      document.querySelector("h1")?.innerText?.trim(),
      document.title?.trim(),
    ].filter(Boolean);

    for (const candidate of candidates) {
      const cleaned = cleanTitle(candidate);
      if (cleaned.length >= 5) return cleaned;
    }

    return "Untitled Article";
  }

  // Smart text extraction handling RTL (Arabic) and Input fields correctly
  function getSelectedText() {
    // 1. Check if user is selecting text inside an input or textarea
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === "TEXTAREA" || activeEl.tagName === "INPUT")) {
      try {
        const val = activeEl.value;
        const selected = val.substring(activeEl.selectionStart, activeEl.selectionEnd).trim();
        if (selected) return selected;
      } catch (e) {
        // Ignore errors for inputs that don't support selection properties
      }
    }

    // 2. Native window selection (Best for Arabic/RTL)
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return "";

    return selection.toString().trim();
  }

  function getReadableText() {
    const target =
      document.querySelector("article") ||
      document.querySelector("main")    ||
      document.body;

    return (target?.textContent || "").trim().slice(0, 15000);
  }

  // Helper to check if the extension was reloaded/invalidated
  function isExtensionValid() {
    return typeof chrome !== 'undefined' && chrome.runtime && !!chrome.runtime.id;
  }

  // ─── Selection Caching with Debounce ──────────────────────────────────────
  
  let cacheTimeout = null;

  function cacheSelection() {
    clearTimeout(cacheTimeout);
    
    cacheTimeout = setTimeout(() => {
      const text = getSelectedText();
      if (!text) return;

      if (!isExtensionValid()) return;

      try {
        chrome.storage.local.set({
          ticktick_context_data: {
            text,
            title: extractBestTitle(),
            url:   window.location.href,
          },
        });
      } catch (e) {
        console.warn("[TickTick] Storage write failed:", e.message);
      }
    }, 300);
  }

  const eventOptions = { capture: true, passive: true };

  document.addEventListener("mouseup",         cacheSelection, eventOptions);
  document.addEventListener("keyup",           cacheSelection, eventOptions);
  document.addEventListener("selectionchange", cacheSelection, eventOptions);

  document.addEventListener("copy", () => {
    const text = getSelectedText();
    if (!text) return;

    if (!isExtensionValid()) return;

    try {
      chrome.storage.local.set({
        ticktick_context_data: {
          text,
          title: extractBestTitle(),
          url:   window.location.href,
        },
      });
    } catch (e) {
      console.warn("[TickTick] Storage write on copy failed:", e.message);
    }
  }, { capture: true });

  // ─── Message Handler ──────────────────────────────────────────────────────

  try {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!isExtensionValid()) {
        sendResponse({ ok: false, error: "Extension updated. Please refresh this page." });
        return true;
      }

      if (message?.type !== "GET_PAGE_CONTEXT") return;

      try {
        sendResponse({
          ok:   true,
          data: {
            title:        extractBestTitle(),
            url:          window.location.href,
            selectedText: getSelectedText(),
            pageText:     getReadableText(),
          },
        });
      } catch (error) {
        sendResponse({ ok: false, error: error.message });
      }

      return true; 
    });
  } catch (error) {
    console.warn("[TickTick] Could not bind message listener. Extension might be invalidated.");
  }
})();