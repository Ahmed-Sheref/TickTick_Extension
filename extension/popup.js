const API_BASE = "http://localhost:3000/api/v1";
const TELEGRAM_BOT_USERNAME = "Tick_review_bot"; // ← غير هذا لاسم البوت الحقيقي
const STORAGE_KEYS = {
  userId: "ticktick_userId",
  connected: "ticktick_connected",
  email: "ticktick_email",
  weeklyEmailToggle: "ticktick_weeklyEmailToggle",
  telegramQuizToggle: "ticktick_telegramQuizToggle"
};

const el = {
  onboardingView: document.getElementById("onboardingView"),
  appView: document.getElementById("appView"),
  statusBar: document.getElementById("statusBar"),
  ticktickStatusPill: document.getElementById("ticktickStatusPill"),
  ticktickStatusSecondary: document.getElementById("ticktickStatusSecondary"),
  connectTickTickBtn: document.getElementById("connectTickTickBtn"),
  reconnectTickTickBtn: document.getElementById("reconnectTickTickBtn"),
  tabSave: document.getElementById("tabSave"),
  tabSettings: document.getElementById("tabSettings"),
  panelSave: document.getElementById("panelSave"),
  panelSettings: document.getElementById("panelSettings"),
  title: document.getElementById("title"),
  url: document.getElementById("url"),
  rawText: document.getElementById("rawText"),
  userInput: document.getElementById("userInput"),
  useSummaryAi: document.getElementById("useSummaryAi"),
  useTagsAi: document.getElementById("useTagsAi"),
  useQuiz: document.getElementById("useQuiz"),
  mergeWithUserText: document.getElementById("mergeWithUserText"),
  refreshPageBtn: document.getElementById("refreshPageBtn"),
  saveArticleBtn: document.getElementById("saveArticleBtn"),
  userId: document.getElementById("userId"),
  copyUserIdBtn: document.getElementById("copyUserIdBtn"),
  email: document.getElementById("email"),
  weeklyEmailToggle: document.getElementById("weeklyEmailToggle"),
  saveEmailSettingsBtn: document.getElementById("saveEmailSettingsBtn"),
  telegramQuizToggle: document.getElementById("telegramQuizToggle"),
  telegramCommand: document.getElementById("telegramCommand"),
  copyTelegramCommandBtn: document.getElementById("copyTelegramCommandBtn"),
  openTelegramBotBtn: document.getElementById("openTelegramBotBtn"),
  saveQuizSettingsBtn: document.getElementById("saveQuizSettingsBtn"),
  telegramOptions: document.getElementById("telegramOptions")
};

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════

function setStatus(message, type = "info") {
  el.statusBar.textContent = message;
  el.statusBar.className = `status-bar ${type}`;
}

function setButtonLoading(button, loading, loadingText) {
  if (!button) return;
  if (!button.dataset.defaultText) button.dataset.defaultText = button.textContent;
  button.disabled = loading;
  button.textContent = loading ? loadingText : button.dataset.defaultText;
}

function setConnectedState(connected) {
  el.onboardingView.classList.toggle("active", !connected);
  el.appView.classList.toggle("active", connected);
  const classes = connected ? "status-pill success" : "status-pill warning";
  const text = connected ? "Connected" : "Not Connected";
  el.ticktickStatusPill.className = classes;
  el.ticktickStatusPill.textContent = text;
  el.ticktickStatusSecondary.className = classes;
  el.ticktickStatusSecondary.textContent = text;
}

function switchTab(name) {
  const saveActive = name === "save";
  el.tabSave.classList.toggle("active", saveActive);
  el.tabSettings.classList.toggle("active", !saveActive);
  el.panelSave.classList.toggle("active", saveActive);
  el.panelSettings.classList.toggle("active", !saveActive);
  if (saveActive) loadPageContext();
}

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(data) {
  return new Promise((resolve) => chrome.storage.local.set(data, resolve));
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

// ══════════════════════════════════════════
// TELEGRAM — FIX المشكلة الثانية
// ══════════════════════════════════════════

async function openTelegramBot() {
  const data = await storageGet([STORAGE_KEYS.userId]);
  const userId = data[STORAGE_KEYS.userId];

  if (!userId) {
    setStatus("Connect TickTick first.", "error");
    return;
  }

  // استخدم الـ userId الأصلي مش الـ safe version
  const deepLink = `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${encodeURIComponent(userId)}`;

  console.log("📱 Opening Telegram deep link:", deepLink);
  console.log("👤 Original userId:", userId);

  try {
    await chrome.tabs.create({
      url: deepLink,
      active: true
    });

    setStatus(`📱 Opening Telegram with /start ${userId}...`, "success");
  } catch (error) {
    console.error("❌ Failed to open Telegram:", error);

    const botLink = `https://t.me/${TELEGRAM_BOT_USERNAME}`;
    const command = `/start ${userId}`;

    await chrome.tabs.create({ url: botLink, active: true });
    await copyText(command, "📋 Command copied!");

    setStatus(`❌ Auto-open failed. Paste this: ${command}`, "warning");
  }
}

// ══════════════════════════════════════════
// SELECTION — FIX المشكلة الأولى (ChatGPT)
// ══════════════════════════════════════════

// Listen for selection changes pushed from content script
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "SELECTION_CHANGED" && message.selectedText) {
    if (el.rawText) {
      el.rawText.value = message.selectedText;
      setStatus("📝 Selected text updated from page.", "success");
    }
  }
});

async function loadPageContext() {
  const SELECTION_KEY = "ticktick_last_selection_cache";

  try {
    const activeTab = await getActiveTab();
    if (!activeTab?.id) {
      setStatus("Could not access the active tab.", "error");
      return;
    }

    // Fill title & URL immediately from tab metadata
    if (activeTab.title && !el.title.value.trim()) el.title.value = activeTab.title;
    if (activeTab.url && !el.url.value.trim()) el.url.value = activeTab.url;

    // Try content script first
    let response = null;
    try {
      response = await chrome.tabs.sendMessage(activeTab.id, { type: "GET_PAGE_CONTEXT" });
    } catch (_) {
      // Content script not injected yet — try injecting it manually
      try {
        await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          files: ["content.js"]
        });
        // Small delay then retry
        await new Promise(r => setTimeout(r, 300));
        response = await chrome.tabs.sendMessage(activeTab.id, { type: "GET_PAGE_CONTEXT" });
      } catch (_2) {
        response = null;
      }
    }

    // Load cached selection as fallback (important for ChatGPT)
    const storageData = await storageGet([SELECTION_KEY]);
    const cachedSelection = storageData[SELECTION_KEY] || "";

    if (response?.ok) {
      el.title.value = response.data.title || activeTab.title || el.title.value || "";
      el.url.value = response.data.url || activeTab.url || el.url.value || "";

      // Priority: live selection > cached selection > page text
      if (response.data.selectedText) {
        el.rawText.value = response.data.selectedText;
        setStatus("✅ Selected text loaded from page.", "success");
      } else if (cachedSelection) {
        el.rawText.value = cachedSelection;
        setStatus("📋 Last selection loaded from cache.", "info");
      } else if (response.data.pageText) {
        el.rawText.value = response.data.pageText;
        setStatus("📄 Page content loaded.", "info");
      } else {
        setStatus("⚠️ No text found. Paste manually.", "error");
      }
    } else {
      // Fallback when content script fails (restricted pages like chrome://)
      if (cachedSelection) {
        el.rawText.value = cachedSelection;
        setStatus("📋 Loaded from cached selection.", "info");
      } else {
        setStatus("⚠️ Can't read this page. Paste text manually.", "error");
      }
    }
  } catch (error) {
    console.error("loadPageContext error:", error);
    setStatus("⚠️ Error loading page. Paste text manually.", "error");
  }
}

// ══════════════════════════════════════════
// TICKTICK AUTH
// ══════════════════════════════════════════

async function startTickTickConnect() {
  setButtonLoading(el.connectTickTickBtn, true, "Connecting...");
  setButtonLoading(el.reconnectTickTickBtn, true, "Connecting...");
  setStatus("Opening TickTick connection...", "info");

  try {
    const redirectUri = chrome.identity.getRedirectURL("ticktick");
    const authUrl = `${API_BASE}/ticktick/auth?redirect_uri=${encodeURIComponent(redirectUri)}`;

    const finalRedirectUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true
    });

    if (!finalRedirectUrl) throw new Error("No redirect received from TickTick.");

    const url = new URL(finalRedirectUrl);
    const userId = url.searchParams.get("userId");

    if (!userId) throw new Error("Missing userId in TickTick callback redirect.");

    await storageSet({
      [STORAGE_KEYS.userId]: userId,
      [STORAGE_KEYS.connected]: true
    });

    await applyStoredUser();
    setConnectedState(true);
    switchTab("save");
    setStatus("✅ TickTick connected successfully.", "success");
    await loadPageContext();

  } catch (error) {
    console.error("TickTick connection error:", error);
    setStatus(`TickTick connection failed: ${error.message}`, "error");
  } finally {
    setButtonLoading(el.connectTickTickBtn, false);
    setButtonLoading(el.reconnectTickTickBtn, false);
  }
}

// ══════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════

async function applyStoredUser() {
  const data = await storageGet([
    STORAGE_KEYS.userId,
    STORAGE_KEYS.email,
    STORAGE_KEYS.weeklyEmailToggle,
    STORAGE_KEYS.telegramQuizToggle,
    STORAGE_KEYS.connected
  ]);
  const userId = data[STORAGE_KEYS.userId] || "";
  el.userId.value = userId;
  el.email.value = data[STORAGE_KEYS.email] || "";
  el.weeklyEmailToggle.checked = Boolean(data[STORAGE_KEYS.weeklyEmailToggle]);
  el.telegramQuizToggle.checked = Boolean(data[STORAGE_KEYS.telegramQuizToggle]);

  // Show/hide telegram options based on toggle state
  el.telegramOptions.classList.toggle("hidden", !el.telegramQuizToggle.checked);

  // Show the full command with userId
  el.telegramCommand.textContent = userId ? `/start ${userId}` : "/start <your_id>";
  setConnectedState(Boolean(data[STORAGE_KEYS.connected] && userId));
}

async function copyText(value, successMessage) {
  if (!value) { setStatus("Nothing to copy.", "error"); return; }
  try {
    await navigator.clipboard.writeText(value);
    setStatus(successMessage, "success");
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.cssText = "position:fixed;left:-9999px;top:-9999px";
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setStatus(successMessage, "success");
    } catch {
      setStatus("Copy failed. Please copy manually.", "error");
    }
  }
}

async function saveEmailSettings() {
  const data = await storageGet([STORAGE_KEYS.userId]);
  const userId = data[STORAGE_KEYS.userId];
  const email = el.email.value.trim();
  const weeklyEmailToggle = el.weeklyEmailToggle.checked;

  if (!userId) { setStatus("Connect TickTick first.", "error"); return; }
  if (!email) { setStatus("Email is required.", "error"); return; }

  setButtonLoading(el.saveEmailSettingsBtn, true, "Saving...");
  try {
    const response = await fetch(`${API_BASE}/User/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, email, weeklyEmail: weeklyEmailToggle })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.message || `HTTP ${response.status}`);

    await storageSet({ 
      [STORAGE_KEYS.email]: email, 
      [STORAGE_KEYS.weeklyEmailToggle]: weeklyEmailToggle
    });
    setStatus("✅ Email settings saved.", "success");
  } catch (error) {
    setStatus(`Email settings failed: ${error.message}`, "error");
  } finally {
    setButtonLoading(el.saveEmailSettingsBtn, false);
  }
}

async function saveQuizPreference() {
  await storageSet({ 
    [STORAGE_KEYS.telegramQuizToggle]: el.telegramQuizToggle.checked
  });
  setStatus("✅ Quiz preferences saved.", "success");
}

// ══════════════════════════════════════════
// SAVE ARTICLE
// ══════════════════════════════════════════

async function saveArticle() {
  const data = await storageGet([STORAGE_KEYS.userId]);
  const userId = data[STORAGE_KEYS.userId];

  if (!userId) { setStatus("Connect TickTick first.", "error"); return; }
  if (!el.title.value.trim()) { setStatus("Title is required.", "error"); return; }
  if (!el.rawText.value.trim()) { setStatus("Article text is required.", "error"); return; }

  const payload = {
    userId,
    title: el.title.value.trim(),
    url: el.url.value.trim(),
    rawText: el.rawText.value.trim(),
    user_input: el.userInput.value.trim() || "~inbox",
    use_tagsAi: el.useTagsAi.checked,
    use_summaryAi: el.useSummaryAi.checked,
    use_quiz: el.useQuiz.checked,
    mergeWithUserText: el.mergeWithUserText.checked
  };

  setButtonLoading(el.saveArticleBtn, true, "Saving...");
  setStatus("Saving article...", "info");

  try {
    const response = await fetch(`${API_BASE}/content`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.message || `HTTP ${response.status}`);

    setStatus("✅ Article saved successfully!", "success");
    el.title.value = "";
    el.rawText.value = "";
    el.userInput.value = "";
  } catch (error) {
    setStatus(`Save failed: ${error.message}`, "error");
  } finally {
    setButtonLoading(el.saveArticleBtn, false);
  }
}

// ══════════════════════════════════════════
// BIND EVENTS
// ══════════════════════════════════════════

function bindEvents() {
  el.connectTickTickBtn.addEventListener("click", startTickTickConnect);
  el.reconnectTickTickBtn.addEventListener("click", startTickTickConnect);

  el.refreshPageBtn?.addEventListener("click", async () => {
    // Clear cached selection so we get fresh content
    await chrome.storage.local.remove("ticktick_last_selection_cache");
    el.title.value = "";
    el.url.value = "";
    setStatus("🔄 Refreshing page content...", "info");
    await loadPageContext();
  });

  el.saveArticleBtn.addEventListener("click", saveArticle);
  el.saveEmailSettingsBtn.addEventListener("click", saveEmailSettings);
  el.saveQuizSettingsBtn.addEventListener("click", saveQuizPreference);

  el.copyUserIdBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    await copyText(el.userId.value, "✅ User ID copied!");
  });

  el.copyTelegramCommandBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    await copyText(el.telegramCommand.textContent, "✅ Telegram command copied!");
  });

  // ✅ المشكلة الثانية محلولة هنا
  el.openTelegramBotBtn.addEventListener("click", openTelegramBot);

  el.tabSave.addEventListener("click", () => switchTab("save"));
  el.tabSettings.addEventListener("click", () => switchTab("settings"));

  // Toggle event listeners
  el.weeklyEmailToggle?.addEventListener("change", (e) => {
    const isEnabled = e.target.checked;
    // No need to hide/show options since we simplified the UI
  });

  el.telegramQuizToggle?.addEventListener("change", (e) => {
    const isEnabled = e.target.checked;
    el.telegramOptions.classList.toggle("hidden", !isEnabled);
  });
}

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════

async function init() {
  bindEvents();
  await applyStoredUser();

  const data = await storageGet([STORAGE_KEYS.connected, STORAGE_KEYS.userId]);
  if (data[STORAGE_KEYS.connected] && data[STORAGE_KEYS.userId]) {
    await loadPageContext();
  } else {
    setStatus("Connect TickTick to unlock the workspace.", "info");
  }
}

init();