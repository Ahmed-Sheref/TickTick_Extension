const API_BASE = "http://localhost:3000/api/v1";
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

function storageGet(keys)
{
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(data)
{
  return new Promise((resolve) => chrome.storage.local.set(data, resolve));
}

function setStatus(message, type = "info")
{
  if (!el.statusBar) return;
  el.statusBar.textContent = message;
  el.statusBar.className = `status-bar status-bar--${type}`;
}

function switchTab(tab)
{
  const isSave = tab === "save";

  el.panelSave.style.display = isSave ? "block" : "none";
  el.panelSettings.style.display = isSave ? "none" : "block";

  el.tabSave.classList.toggle("btn-secondary", isSave);
  el.tabSave.classList.toggle("btn-ghost", !isSave);

  el.tabSettings.classList.toggle("btn-secondary", !isSave);
  el.tabSettings.classList.toggle("btn-ghost", isSave);
}

function setConnectedUI(isConnected)
{
  el.onboardingView.style.display = isConnected ? "none" : "block";
  el.appView.style.display = isConnected ? "block" : "none";

  const statusText = isConnected ? "Connected" : "Not Connected";
  const statusClass = isConnected ? "status-pill status-pill--success" : "status-pill status-pill--danger";

  if (el.ticktickStatusPill)
  {
    el.ticktickStatusPill.className = statusClass;
    el.ticktickStatusPill.innerHTML = `<span class="pill-dot"></span>${statusText}`;
  }

  if (el.ticktickStatusSecondary)
  {
    el.ticktickStatusSecondary.className = statusClass;
    el.ticktickStatusSecondary.innerHTML = `<span class="pill-dot"></span>${statusText}`;
  }
}

async function apiFetch(path, options = {})
{
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

  if (!response.ok)
  {
    const message = typeof data === "object" && data?.message
      ? data.message
      : `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  return data;
}

function fillTelegramCommand(userId)
{
  if (!el.telegramCommand) return;
  el.telegramCommand.textContent = userId ? `/start ${userId}` : "/start";
}

async function getCurrentTabArticle()
{
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id)
  {
    throw new Error("No active tab found.");
  }

  if (!/^https?:/i.test(tab.url || ""))
  {
    throw new Error("This page cannot be parsed. Open a normal web page first.");
  }

  const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_ARTICLE_DATA" });

  if (!response)
  {
    throw new Error("Could not read page content. Refresh the tab and try again.");
  }

  return response;
}

async function refreshPageData()
{
  try
  {
    setStatus("Reading page data...", "info");

    const article = await getCurrentTabArticle();

    el.title.value = article.title || "";
    el.url.value = article.url || "";
    el.rawText.value = article.rawText || "";

    setStatus("Page data loaded.", "success");
  }
  catch (error)
  {
    setStatus(error.message, "danger");
  }
}

async function connectTickTick()
{
  try
  {
    setStatus("Opening TickTick login...", "info");

    const redirectUri = chrome.identity.getRedirectURL();
    const authUrl = `${API_BASE}/ticktick/auth?redirect_uri=${encodeURIComponent(redirectUri)}`;

    chrome.tabs.create({ url: authUrl });

    setStatus("Complete TickTick login in the opened tab.", "info");
  }
  catch (error)
  {
    setStatus(error.message, "danger");
  }
}

async function loadSavedState()
{
  const saved = await storageGet([
    STORAGE_KEYS.userId,
    STORAGE_KEYS.connected,
    STORAGE_KEYS.email,
    STORAGE_KEYS.weeklyEmailToggle,
    STORAGE_KEYS.telegramQuizToggle
  ]);

  const userId = saved[STORAGE_KEYS.userId] || "";
  const connected = Boolean(saved[STORAGE_KEYS.connected]);

  setConnectedUI(connected);

  el.userId.value = userId;
  el.email.value = saved[STORAGE_KEYS.email] || "";
  el.weeklyEmailToggle.checked = Boolean(saved[STORAGE_KEYS.weeklyEmailToggle]);
  el.telegramQuizToggle.checked =
    saved[STORAGE_KEYS.telegramQuizToggle] === undefined
      ? true
      : Boolean(saved[STORAGE_KEYS.telegramQuizToggle]);

  fillTelegramCommand(userId);

  if (connected && userId)
  {
    await loadUserPreferencesFromBackend(userId);
  }
}

async function loadUserPreferencesFromBackend(userId)
{
  try
  {
    const result = await apiFetch(`/User/preferences/${encodeURIComponent(userId)}`);

    const prefs = result?.data || {};

    el.email.value = prefs.email || "";
    el.weeklyEmailToggle.checked = Boolean(prefs.weeklyEmailEnabled);
    el.telegramQuizToggle.checked = Boolean(prefs.receiveTelegramQuiz);

    await storageSet({
      [STORAGE_KEYS.email]: prefs.email || "",
      [STORAGE_KEYS.weeklyEmailToggle]: Boolean(prefs.weeklyEmailEnabled),
      [STORAGE_KEYS.telegramQuizToggle]: Boolean(prefs.receiveTelegramQuiz)
    });

    setStatus("Preferences synced.", "success");
  }
  catch (error)
  {
    setStatus(`Connected, but could not load preferences: ${error.message}`, "info");
  }
}

async function saveEmailSettings()
{
  try
  {
    const userId = el.userId.value.trim();
    const email = el.email.value.trim();
    const weeklyEmailEnabled = el.weeklyEmailToggle.checked;

    if (!userId)
    {
      throw new Error("User ID is missing. Please reconnect TickTick.");
    }

    await apiFetch("/User/email", {
      method: "POST",
      body: JSON.stringify({
        userId,
        email,
        weeklyEmailEnabled
      })
    });

    await storageSet({
      [STORAGE_KEYS.email]: email,
      [STORAGE_KEYS.weeklyEmailToggle]: weeklyEmailEnabled
    });

    setStatus("Email settings saved.", "success");
  }
  catch (error)
  {
    setStatus(error.message, "danger");
  }
}

async function saveQuizPreference()
{
  try
  {
    const userId = el.userId.value.trim();
    const receiveTelegramQuiz = el.telegramQuizToggle.checked;

    if (!userId)
    {
      throw new Error("User ID is missing. Please reconnect TickTick.");
    }

    await apiFetch("/User/quiz-preferences", {
      method: "POST",
      body: JSON.stringify({
        userId,
        receiveTelegramQuiz
      })
    });

    await storageSet({
      [STORAGE_KEYS.telegramQuizToggle]: receiveTelegramQuiz
    });

    setStatus("Quiz preferences saved.", "success");
  }
  catch (error)
  {
    setStatus(error.message, "danger");
  }
}

async function saveArticle()
{
  try
  {
    const userId = el.userId.value.trim();

    if (!userId)
    {
      throw new Error("User ID is missing. Please connect TickTick first.");
    }

    const payload = {
      userId,
      title: el.title.value.trim(),
      url: el.url.value.trim(),
      rawText: el.rawText.value.trim(),
      user_input: el.userInput.value.trim() || "~inbox",
      use_summaryAi: el.useSummaryAi.checked,
      use_tagsAi: el.useTagsAi.checked,
      use_quiz: el.useQuiz.checked,
      mergeSummaryWithContent: el.mergeSummaryWithContent.checked
    };

    if (!payload.title)
    {
      throw new Error("Title is required.");
    }

    if (!payload.rawText)
    {
      throw new Error("Article text is required.");
    }

    setStatus("Saving article...", "info");

    const result = await apiFetch("/content", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    console.log("Saved article:", result);
    setStatus("Article saved successfully.", "success");
  }
  catch (error)
  {
    setStatus(error.message, "danger");
  }
}

async function copyUserId()
{
  try
  {
    const value = el.userId.value.trim();
    if (!value) throw new Error("No user ID to copy.");

    await navigator.clipboard.writeText(value);
    setStatus("User ID copied.", "success");
  }
  catch (error)
  {
    setStatus(error.message, "danger");
  }
}

async function copyTelegramCommand()
{
  try
  {
    const value = el.telegramCommand.textContent.trim();
    await navigator.clipboard.writeText(value);
    setStatus("Telegram command copied.", "success");
  }
  catch (error)
  {
    setStatus(error.message, "danger");
  }
}

function openTelegramBot()
{
  chrome.tabs.create({
    url: `https://t.me/${TELEGRAM_BOT_USERNAME}`
  });
}

function reconnectTickTick()
{
  connectTickTick();
}

function bindEvents()
{
  el.connectTickTickBtn?.addEventListener("click", connectTickTick);
  el.reconnectTickTickBtn?.addEventListener("click", reconnectTickTick);

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

async function bootstrap()
{
  bindEvents();
  switchTab("save");
  await loadSavedState();
  setStatus("Ready", "info");
}

bootstrap().catch((error) =>
{
  console.error(error);
  setStatus(error.message || "Unexpected popup error.", "danger");
});