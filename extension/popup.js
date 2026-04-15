const API_BASE = "https://ticktickextension-production.up.railway.app/api/v1";
const TELEGRAM_BOT_USERNAME = "Tick_review_bot";

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
  mergeSummaryWithContent: document.getElementById("mergeSummaryWithContent"),

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
  saveQuizSettingsBtn: document.getElementById("saveQuizSettingsBtn")
};

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(data) {
  return new Promise((resolve) => chrome.storage.local.set(data, resolve));
}

function setStatus(message, type = "info") {
  if (!el.statusBar) return;
  el.statusBar.textContent = message;
  el.statusBar.className = `status-bar status-bar--${type}`;
}

function switchTab(tab) {
  const isSave = tab === "save";

  if (el.panelSave) el.panelSave.style.display = isSave ? "block" : "none";
  if (el.panelSettings) el.panelSettings.style.display = isSave ? "none" : "block";

  el.tabSave?.classList.toggle("btn-secondary", isSave);
  el.tabSave?.classList.toggle("btn-ghost", !isSave);

  el.tabSettings?.classList.toggle("btn-secondary", !isSave);
  el.tabSettings?.classList.toggle("btn-ghost", isSave);
}

function setConnectedUI(isConnected) {
  if (el.onboardingView) el.onboardingView.style.display = isConnected ? "none" : "block";
  if (el.appView) el.appView.style.display = isConnected ? "block" : "none";

  const statusText = isConnected ? "Connected" : "Not Connected";
  const statusClass = isConnected
    ? "status-pill status-pill--success"
    : "status-pill status-pill--danger";

  if (el.ticktickStatusPill) {
    el.ticktickStatusPill.className = statusClass;
    el.ticktickStatusPill.innerHTML = `<span class="pill-dot"></span>${statusText}`;
  }

  if (el.ticktickStatusSecondary) {
    el.ticktickStatusSecondary.className = statusClass;
    el.ticktickStatusSecondary.innerHTML = `<span class="pill-dot"></span>${statusText}`;
  }
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof data === "object" && data?.message
        ? data.message
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data;
}

function fillTelegramCommand(userId) {
  if (!el.telegramCommand) return;
  el.telegramCommand.textContent = userId ? `/start ${userId}` : "/start";
}

async function connectTickTick() {
  try {
    setStatus("Opening TickTick login...", "info");

    const redirectUri = chrome.identity.getRedirectURL("ticktick");
    const authUrl = `${API_BASE}/ticktick/auth?redirect_uri=${encodeURIComponent(redirectUri)}`;

    chrome.identity.launchWebAuthFlow(
      {
        url: authUrl,
        interactive: true
      },
      async (callbackUrl) => {
        if (chrome.runtime.lastError) {
          console.error("OAuth error:", chrome.runtime.lastError.message);
          setStatus(chrome.runtime.lastError.message, "danger");
          return;
        }

        if (!callbackUrl) {
          setStatus("No callback URL received from TickTick.", "danger");
          return;
        }

        const url = new URL(callbackUrl);
        const userId = url.searchParams.get("userId");

        if (!userId) {
          setStatus("userId not found in callback.", "danger");
          return;
        }

        await storageSet({
          [STORAGE_KEYS.userId]: userId,
          [STORAGE_KEYS.connected]: true
        });

        if (el.userId) el.userId.value = userId;
        setConnectedUI(true);
        fillTelegramCommand(userId);

        setStatus("Connected successfully.", "success");
      }
    );
  } catch (error) {
    console.error("connectTickTick error:", error);
    setStatus(error.message || "Connect failed", "danger");
  }
}
async function saveArticle() {
  try {
    const userId = el.userId?.value.trim();

    if (!userId) {
      throw new Error("User ID is missing. Please connect TickTick first.");
    }

    const payload = {
      userId,
      title: el.title?.value.trim(),
      url: el.url?.value.trim(),
      rawText: el.rawText?.value.trim(),
      user_input: el.userInput?.value.trim() || "~inbox",
      use_summaryAi: Boolean(el.useSummaryAi?.checked),
      use_tagsAi: Boolean(el.useTagsAi?.checked),
      use_quiz: Boolean(el.useQuiz?.checked),
      mergeSummaryWithContent: Boolean(el.mergeSummaryWithContent?.checked)
    };

    if (!payload.title) {
      throw new Error("Title is required.");
    }

    if (!payload.rawText) {
      throw new Error("Article text is required.");
    }

    setStatus("Saving article...", "info");

    const result = await apiFetch("/content", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    console.log("Saved article:", result);
    setStatus("Article saved successfully.", "success");
  } catch (error) {
    console.error("saveArticle error:", error);
    setStatus(error.message, "danger");
  }
}

async function refreshPageData() {
  console.log("refreshPageData not implemented yet");
}

async function copyUserId() {
  try {
    const value = el.userId?.value?.trim();
    if (!value) throw new Error("No user ID to copy.");

    await navigator.clipboard.writeText(value);
    setStatus("User ID copied.", "success");
  } catch (error) {
    setStatus(error.message, "danger");
  }
}

async function saveEmailSettings() {
  console.log("saveEmailSettings not implemented yet");
}

async function copyTelegramCommand() {
  try {
    const value = el.telegramCommand?.textContent?.trim();
    if (!value) throw new Error("No command to copy.");

    await navigator.clipboard.writeText(value);
    setStatus("Telegram command copied.", "success");
  } catch (error) {
    setStatus(error.message, "danger");
  }
}

function openTelegramBot() {
  chrome.tabs.create({
    url: `https://t.me/${TELEGRAM_BOT_USERNAME}`
  });
}

async function saveQuizPreference() {
  console.log("saveQuizPreference not implemented yet");
}

function bindEvents() {
  console.log("bindEvents called");
  console.log("connectTickTickBtn:", el.connectTickTickBtn);

  if (el.connectTickTickBtn) {
    el.connectTickTickBtn.addEventListener("click", () => {
      console.log("Connect button listener fired");
      connectTickTick();
    });
  } else {
    console.error("connectTickTickBtn not found");
  }

  el.reconnectTickTickBtn?.addEventListener("click", connectTickTick);
  el.tabSave?.addEventListener("click", () => switchTab("save"));
  el.tabSettings?.addEventListener("click", () => switchTab("settings"));
  el.refreshPageBtn?.addEventListener("click", refreshPageData);
  el.saveArticleBtn?.addEventListener("click", saveArticle);
  el.copyUserIdBtn?.addEventListener("click", copyUserId);
  el.saveEmailSettingsBtn?.addEventListener("click", saveEmailSettings);
  el.copyTelegramCommandBtn?.addEventListener("click", copyTelegramCommand);
  el.openTelegramBotBtn?.addEventListener("click", openTelegramBot);
  el.saveQuizSettingsBtn?.addEventListener("click", saveQuizPreference);
}

async function bootstrap() {
  console.log("popup bootstrap started");
  bindEvents();
  switchTab("save");
  setConnectedUI(false);
  fillTelegramCommand("");
  setStatus("Ready", "info");
}

document.addEventListener("DOMContentLoaded", () => {
  bootstrap().catch((error) => {
    console.error("bootstrap error:", error);
    setStatus(error.message || "Unexpected popup error.", "danger");
  });
});