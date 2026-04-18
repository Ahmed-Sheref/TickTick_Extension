/* =========================================================================
   popup.js — TickTick Extension
   ========================================================================= */

const API_BASE = "https://carefree-alignment-production-7eff.up.railway.app/api/v1";
const TELEGRAM_BOT_USERNAME = "Tick_review_bot";

const STORAGE_KEYS = {
  userId:              "ticktick_userId",
  connected:           "ticktick_connected",
  email:               "ticktick_email",
  weeklyEmailToggle:   "ticktick_weeklyEmailToggle",
  telegramQuizToggle:  "ticktick_telegramQuizToggle",
  theme:               "ticktick_theme",
  contextData:         "ticktick_context_data",
};

// ─── DOM References ──────────────────────────────────────────────────────────

const el = {
  // Views
  onboardingView:          document.getElementById("onboardingView"),
  appView:                 document.getElementById("appView"),
  statusBar:               document.getElementById("statusBar"),

  // Connection
  ticktickStatusPill:      document.getElementById("ticktickStatusPill"),
  ticktickStatusSecondary: document.getElementById("ticktickStatusSecondary"),
  connectTickTickBtn:      document.getElementById("connectTickTickBtn"),
  reconnectTickTickBtn:    document.getElementById("reconnectTickTickBtn"),

  // Tabs
  tabSave:                 document.getElementById("tabSave"),
  tabSettings:             document.getElementById("tabSettings"),
  panelSave:               document.getElementById("panelSave"),
  panelSettings:           document.getElementById("panelSettings"),

  // Save form
  title:                   document.getElementById("title"),
  url:                     document.getElementById("url"),
  rawText:                 document.getElementById("rawText"),
  userInput:               document.getElementById("userInput"),

  // AI toggles
  useSummaryAi:            document.getElementById("useSummaryAi"),
  useTagsAi:               document.getElementById("useTagsAi"),
  useQuiz:                 document.getElementById("useQuiz"),
  mergeSummaryWithContent: document.getElementById("mergeSummaryWithContent"),

  // Save panel actions
  refreshPageBtn:          document.getElementById("refreshPageBtn"),
  saveArticleBtn:          document.getElementById("saveArticleBtn"),

  // Settings — Account
  userId:                  document.getElementById("userId"),
  copyUserIdBtn:           document.getElementById("copyUserIdBtn"),

  // Settings — Email
  email:                   document.getElementById("email"),
  weeklyEmailToggle:       document.getElementById("weeklyEmailToggle"),
  saveEmailSettingsBtn:    document.getElementById("saveEmailSettingsBtn"),
  currentEmailContainer:   document.getElementById("currentEmailContainer"),
  currentEmailDisplay:     document.getElementById("currentEmailDisplay"),

  // Settings — Telegram
  telegramQuizToggle:      document.getElementById("telegramQuizToggle"),
  telegramCommand:         document.getElementById("telegramCommand"),
  copyTelegramCommandBtn:  document.getElementById("copyTelegramCommandBtn"),
  openTelegramBotBtn:      document.getElementById("openTelegramBotBtn"),
  telegramOptions:         document.getElementById("telegramOptions"),
  telegramStatusPill:      document.getElementById("telegramStatusPill"),
  telegramStatusText:      document.getElementById("telegramStatusText"),

  // Theme
  themeToggleBtn:          document.getElementById("themeToggleBtn"),
};

// ─── Storage Helpers ─────────────────────────────────────────────────────────

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(data) {
  return new Promise((resolve) => chrome.storage.local.set(data, resolve));
}

// ─── Theme ───────────────────────────────────────────────────────────────────

const ICONS = {
  sun: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1"  x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22"  y1="4.22"  x2="5.64"  y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1"  y1="12" x2="3"  y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22"  y1="19.78" x2="5.64"  y2="18.36"/>
    <line x1="18.36" y1="5.64"  x2="19.78" y2="4.22"/>
  </svg>`,

  moon: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>`,
};

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  if (el.themeToggleBtn) {
    el.themeToggleBtn.innerHTML = theme === "dark" ? ICONS.sun : ICONS.moon;
  }
}

async function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  await storageSet({ [STORAGE_KEYS.theme]: next });
}

// ─── Status Bar ──────────────────────────────────────────────────────────────

function setStatus(message, type = "info") {
  if (!el.statusBar) return;
  el.statusBar.textContent = message;
  el.statusBar.className = `status-bar status-bar--${type}`;
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

function switchTab(tab) {
  const isSave = tab === "save";
  if (el.panelSave)     el.panelSave.style.display     = isSave ? "block" : "none";
  if (el.panelSettings) el.panelSettings.style.display = isSave ? "none"  : "block";
  el.tabSave?.classList.toggle("active",  isSave);
  el.tabSettings?.classList.toggle("active", !isSave);
}

// ─── Connection UI ───────────────────────────────────────────────────────────

function setConnectedUI(isConnected) {
  if (el.onboardingView) el.onboardingView.style.display = isConnected ? "none"  : "flex";
  if (el.appView)        el.appView.style.display        = isConnected ? "block" : "none";

  const text  = isConnected ? "Connected" : "Not Connected";
  const cls   = isConnected ? "status-pill status-pill--success" : "status-pill status-pill--danger";
  const inner = `<span class="pill-dot"></span>${text}`;

  if (el.ticktickStatusPill) {
    el.ticktickStatusPill.className   = cls;
    el.ticktickStatusPill.innerHTML   = inner;
  }
  if (el.ticktickStatusSecondary) {
    el.ticktickStatusSecondary.className = cls;
    el.ticktickStatusSecondary.innerHTML = inner;
  }
}

// ─── API Helper ──────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof data === "object" && data?.message
        ? data.message
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data;
}

// ─── Telegram ────────────────────────────────────────────────────────────────

function fillTelegramCommand(userId) {
  if (el.telegramCommand) {
    el.telegramCommand.textContent = userId ? `/start ${userId}` : "/start";
  }
}

function openTelegramBot() {
  const userId = el.userId?.value?.trim();
  const url = userId
    ? `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${userId}`
    : `https://t.me/${TELEGRAM_BOT_USERNAME}`;
  chrome.tabs.create({ url });
}

// ─── Clipboard ───────────────────────────────────────────────────────────────

async function copyToClipboardWithFeedback(text, btn) {
  if (!text) {
    setStatus("Nothing to copy.", "danger");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);

    const originalText        = btn.textContent;
    const originalColor       = btn.style.color;
    const originalBorderColor = btn.style.borderColor;

    btn.textContent        = "Copied! ✓";
    btn.style.color        = "var(--green)";
    btn.style.borderColor  = "var(--green)";

    setTimeout(() => {
      btn.textContent        = originalText;
      btn.style.color        = originalColor;
      btn.style.borderColor  = originalBorderColor;
    }, 2000);

    setStatus("Copied to clipboard.", "success");
  } catch {
    setStatus("Failed to copy.", "danger");
  }
}

async function copyUserId(e) {
  copyToClipboardWithFeedback(el.userId?.value?.trim(), e.target || el.copyUserIdBtn);
}

async function copyTelegramCommand(e) {
  copyToClipboardWithFeedback(
    el.telegramCommand?.textContent?.trim(),
    e.target || el.copyTelegramCommandBtn
  );
}

// ─── Email Settings UI ───────────────────────────────────────────────────────

function showCurrentEmail(email, isEnabled) {
  if (el.currentEmailContainer) el.currentEmailContainer.style.display = "block";
  if (el.currentEmailDisplay)   el.currentEmailDisplay.textContent      = email;
  if (el.weeklyEmailToggle)     el.weeklyEmailToggle.checked            = Boolean(isEnabled);
}

// ─── Auth ────────────────────────────────────────────────────────────────────

async function connectTickTick() {
  try {
    setStatus("Opening TickTick login...", "info");

    chrome.runtime.sendMessage({ action: "startTickTickAuth" }, (response) => {
      if (chrome.runtime.lastError) {
        setStatus(chrome.runtime.lastError.message, "danger");
        return;
      }
      if (!response) {
        setStatus("No response from background.", "danger");
        return;
      }
      if (response.error) {
        setStatus(response.error, "danger");
        return;
      }
      if (response.started) {
        setStatus("TickTick login tab opened.", "success");
      }
    });
  } catch (error) {
    setStatus(error.message || "Connect failed.", "danger");
  }
}


// ─── Save Article ────────────────────────────────────────────────────────────

async function saveArticle() {
  const btn = el.saveArticleBtn;
  const originalText = btn.textContent;

  try {
    const userId = el.userId?.value.trim();
    if (!userId) throw new Error("User ID is missing. Please connect TickTick first.");

    const payload = {
      userId,
      title:                  el.title?.value.trim(),
      url:                    el.url?.value.trim(),
      rawText:                el.rawText?.value.trim(),
      user_input:             el.userInput?.value.trim() || "~inbox",
      use_summaryAi:          Boolean(el.useSummaryAi?.checked),
      use_tagsAi:             Boolean(el.useTagsAi?.checked),
      use_quiz:               Boolean(el.useQuiz?.checked),
      mergeSummaryWithContent: Boolean(el.mergeSummaryWithContent?.checked),
    };

    if (!payload.title)   throw new Error("Title is required.");
    if (!payload.rawText) throw new Error("Article text is required.");

    btn.disabled = true;
    btn.textContent = "Saving...";
    btn.style.opacity = "0.8";
    setStatus("Saving article...", "info");

    await apiFetch("/content", { method: "POST", body: JSON.stringify(payload) });

    btn.textContent = "Saved! ✓";
    btn.style.backgroundColor = "var(--green)";
    btn.style.borderColor = "var(--green)";
    btn.style.opacity = "1";
    setStatus("Article saved successfully.", "success");

    if (el.title) el.title.value = "";
    if (el.url) el.url.value = "";
    if (el.rawText) el.rawText.value = "";

    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = originalText;
      btn.style.backgroundColor = "";
      btn.style.borderColor = "";
    }, 2000);

  } catch (error) {
    btn.disabled = false;
    btn.textContent = originalText;
    btn.style.opacity = "1";
    setStatus(error.message, "danger");
  }
}

// ─── Refresh Page Data ───────────────────────────────────────────────────────

async function refreshPageData() {
  try {
    const tabs = await new Promise((resolve) =>
      chrome.tabs.query({ active: true, currentWindow: true }, resolve)
    );
    const currentTab = tabs[0];

    // 1. Prefer data captured by the content script
    const stored = await storageGet([STORAGE_KEYS.contextData]);
    const cached = stored[STORAGE_KEYS.contextData];

    if (cached?.text) {
      if (el.title)   el.title.value   = cached.title || currentTab?.title || "";
      if (el.url)     el.url.value     = cached.url   || currentTab?.url   || "";
      if (el.rawText) el.rawText.value = cached.text;
      setStatus("Data captured from selection.", "success");
      chrome.storage.local.remove(STORAGE_KEYS.contextData);
      return;
    }

    // 2. Fallback to clipboard
    let clipboardText = "";
    try {
      clipboardText = await navigator.clipboard.readText();
    } catch { /* clipboard unavailable */ }

    if (clipboardText.trim()) {
      if (el.title)   el.title.value   = currentTab?.title || "Copied Text";
      if (el.url)     el.url.value     = currentTab?.url   || "";
      if (el.rawText) el.rawText.value = clipboardText;
      setStatus("Data loaded from clipboard.", "success");
      return;
    }

    // 3. Fallback to full page content via content script
    if (!currentTab?.id) return;

    chrome.tabs.sendMessage(currentTab.id, { type: "GET_PAGE_CONTEXT" }, (response) => {
      if (chrome.runtime.lastError) {
        if (el.title) el.title.value = currentTab?.title || "";
        if (el.url)   el.url.value   = currentTab?.url   || "";
        setStatus("Please refresh the page to read full content.", "warning");
        return;
      }
      if (response?.ok) {
        if (el.title)   el.title.value   = response.data.selectedText ? response.data.title : (currentTab.title || "");
        if (el.url)     el.url.value     = response.data.url || currentTab.url;
        if (el.rawText) el.rawText.value = response.data.selectedText || response.data.pageText || "";
        setStatus("Page content loaded.", "success");
      }
    });
  } catch (error) {
    setStatus("Failed to load page data.", "danger");
  }
}

// ─── Load User Preferences ───────────────────────────────────────────────────

async function loadUserPreferences(userId) {
  try {
    // Show cached data immediately for snappiness
    const stored = await storageGet([
      STORAGE_KEYS.email,
      STORAGE_KEYS.weeklyEmailToggle,
      STORAGE_KEYS.telegramQuizToggle,
    ]);

    if (stored[STORAGE_KEYS.email]) {
      showCurrentEmail(stored[STORAGE_KEYS.email], stored[STORAGE_KEYS.weeklyEmailToggle]);
    }

    if (stored[STORAGE_KEYS.telegramQuizToggle] !== undefined && el.telegramQuizToggle) {
      el.telegramQuizToggle.checked = stored[STORAGE_KEYS.telegramQuizToggle];
    }

    // Fetch fresh data from the server
    const result = await apiFetch(`/User/preferences/${userId}`, { method: "GET" });

    if (result?.status === "success" && result?.data) {
      const { email, weeklyEmailEnabled, receiveTelegramQuiz, telegramConnected } = result.data;

      if (email) {
        showCurrentEmail(email, weeklyEmailEnabled);
        await storageSet({
          [STORAGE_KEYS.email]:             email,
          [STORAGE_KEYS.weeklyEmailToggle]: weeklyEmailEnabled,
        });
      } else {
        if (el.currentEmailContainer) el.currentEmailContainer.style.display = "none";
        if (el.email) el.email.value = "";
        await chrome.storage.local.remove([STORAGE_KEYS.email, STORAGE_KEYS.weeklyEmailToggle]);
      }

      if (el.telegramQuizToggle) {
        el.telegramQuizToggle.checked = Boolean(receiveTelegramQuiz);
        await storageSet({ [STORAGE_KEYS.telegramQuizToggle]: Boolean(receiveTelegramQuiz) });
      }

      if (el.telegramStatusPill && el.telegramStatusText) {
        if (telegramConnected) {
          el.telegramStatusPill.className  = "status-pill status-pill--success";
          el.telegramStatusText.textContent = "Connected";
          if (el.telegramOptions) el.telegramOptions.style.display = "none";
        } else {
          el.telegramStatusPill.className  = "status-pill status-pill--danger";
          el.telegramStatusText.textContent = "Not Connected";
          if (el.telegramOptions) el.telegramOptions.style.display = "block";
        }
      }
    }
  } catch (error) {
    console.warn("Failed to load user preferences:", error);
  }
}

// ─── Save Email Settings ─────────────────────────────────────────────────────

async function saveEmailSettings() {
  const btn = el.saveEmailSettingsBtn;

  try {
    const userId = el.userId?.value.trim();
    if (!userId) throw new Error("Please connect TickTick first.");

    // Determine which email to use
    const enteredEmail  = el.email?.value.trim();
    const existingEmail = el.currentEmailDisplay?.textContent?.trim();
    const emailValue    = enteredEmail || existingEmail;

    if (!emailValue) throw new Error("Please enter an email address.");

    const isEnabled = enteredEmail
      ? true
      : Boolean(el.weeklyEmailToggle?.checked);

    if (btn) {
      btn.disabled   = true;
      btn.textContent = "Saving...";
    }
    setStatus("Saving email settings...", "info");

    await apiFetch("/User/email", {
      method: "POST",
      body: JSON.stringify({ userId, email: emailValue, weeklyEmailEnabled: isEnabled }),
    });

    showCurrentEmail(emailValue, isEnabled);
    if (el.email) el.email.value = "";
    await storageSet({
      [STORAGE_KEYS.email]:             emailValue,
      [STORAGE_KEYS.weeklyEmailToggle]: isEnabled,
    });

    setStatus("Email settings saved.", "success");
  } catch (error) {
    setStatus(error.message, "danger");
  } finally {
    if (btn) {
      btn.disabled    = false;
      btn.textContent = "Save";
    }
  }
}

// ─── Save Quiz Preference ────────────────────────────────────────────────────

async function saveQuizPreference() {
  try {
    const userId = el.userId?.value.trim();
    if (!userId) throw new Error("Please connect TickTick first.");

    const isEnabled = Boolean(el.telegramQuizToggle?.checked);
    setStatus("Saving quiz preferences...", "info");

    await apiFetch("/User/quiz-preferences", {
      method: "POST",
      body: JSON.stringify({ userId, receiveTelegramQuiz: isEnabled }),
    });

    await storageSet({ [STORAGE_KEYS.telegramQuizToggle]: isEnabled });
    setStatus("Quiz preferences saved.", "success");
  } catch (error) {
    setStatus(error.message, "danger");
    // Revert toggle on failure
    if (el.telegramQuizToggle) {
      el.telegramQuizToggle.checked = !el.telegramQuizToggle.checked;
    }
  }
}

// ─── Event Binding ────────────────────────────────────────────────────────────

function bindEvents() {
  el.connectTickTickBtn?.addEventListener("click", connectTickTick);
  el.reconnectTickTickBtn?.addEventListener("click", connectTickTick);
  el.tabSave?.addEventListener("click", () => switchTab("save"));
  el.tabSettings?.addEventListener("click", () => switchTab("settings"));
  el.refreshPageBtn?.addEventListener("click", refreshPageData);
  el.saveArticleBtn?.addEventListener("click", saveArticle);
  el.copyUserIdBtn?.addEventListener("click", copyUserId);
  el.saveEmailSettingsBtn?.addEventListener("click", saveEmailSettings);
  el.weeklyEmailToggle?.addEventListener("change", saveEmailSettings);
  el.copyTelegramCommandBtn?.addEventListener("click", copyTelegramCommand);
  el.openTelegramBotBtn?.addEventListener("click", openTelegramBot);
  el.telegramQuizToggle?.addEventListener("change", saveQuizPreference);
  el.themeToggleBtn?.addEventListener("click", toggleTheme);
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

async function bootstrap() {
  const stored = await storageGet([
    STORAGE_KEYS.userId,
    STORAGE_KEYS.connected,
    STORAGE_KEYS.theme,
  ]);

  const userId      = stored[STORAGE_KEYS.userId];
  const isConnected = Boolean(stored[STORAGE_KEYS.connected] && userId);

  // Apply theme (saved preference → system preference)
  const savedTheme = stored[STORAGE_KEYS.theme];
  if (savedTheme) {
    applyTheme(savedTheme);
  } else {
    applyTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }

  bindEvents();
  switchTab("save");
  setConnectedUI(isConnected);
  fillTelegramCommand(userId || "");

  if (isConnected && el.userId) {
    el.userId.value = userId;
    refreshPageData();
    loadUserPreferences(userId);
  }

  setStatus("Ready", "info");
}

document.addEventListener("DOMContentLoaded", () => {
  bootstrap().catch((error) => {
    setStatus(error.message || "Unexpected popup error.", "danger");
  });
});
