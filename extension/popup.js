/* =========================================================================
   popup.js — Knowvia Extension
   ========================================================================= */

// const API_BASE = "https://lionfish-app-jxpvk.ondigitalocean.app/api/v1";
const API_BASE = "http://localhost:3000/api/v1";
const TELEGRAM_BOT_USERNAME = "Tick_review_bot";

const STORAGE_KEYS =
{
    userId: "sk_userId",
    token: "sk_token",
    signedIn: "sk_signed_in",

    legacyUserId: "ticktick_userId",
    legacyToken: "ticktick_token",
    ticktickConnected: "ticktick_connected",

    email: "ticktick_email",
    weeklyEmailToggle: "ticktick_weeklyEmailToggle",
    telegramQuizToggle: "ticktick_telegramQuizToggle",

    authUI: "sk_auth_ui",
    theme: "ticktick_theme",
    contextData: "ticktick_context_data",

    projects: "ticktick_projects",
    selectedProjectId: "ticktick_selectedProjectId",

    tags: "ticktick_tags"
};


// ─── DOM References ──────────────────────────────────────────────────────────

const el =
{
    onboardingAuthStatus: document.getElementById("onboardingAuthStatus"),
    onboardingView: document.getElementById("onboardingView"),
    appView: document.getElementById("appView"),
    mainScroll: document.querySelector(".main-scroll"),
    statusBar: document.getElementById("statusBar"),
    statusText: document.getElementById("statusText"),

    ticktickStatusPill: document.getElementById("ticktickStatusPill"),
    ticktickStatusSecondary: document.getElementById("ticktickStatusSecondary"),
    connectGoogleBtn: document.getElementById("connectGoogleBtn"),
    connectTickTickBtn: document.getElementById("connectTickTickBtn"),
    connectTickTickFromSaveBtn: document.getElementById("connectTickTickFromSaveBtn"),
    reconnectTickTickBtn: document.getElementById("reconnectTickTickBtn"),
    connectNotionBtn: document.getElementById("connectNotionBtn"),
    notionStatus: document.getElementById("notionStatus"),
    notionConnectionHint: document.getElementById("notionConnectionHint"),
    ticktickConnectionHint: document.getElementById("ticktickConnectionHint"),
    ticktickCaptureHint: document.getElementById("ticktickCaptureHint"),
    refreshConnectionsBtn: document.getElementById("refreshConnectionsBtn"),
    reauthGoogleBtn: document.getElementById("reauthGoogleBtn"),
    preferencesStatus: document.getElementById("preferencesStatus"),
    googleStatus: document.getElementById("googleStatusSecondary"),
    tagsLoadStatus: document.getElementById("tagsLoadStatus"),
    captureSource: document.getElementById("captureSource"),
    captureCount: document.getElementById("captureCount"),
    captureOptionsBtn: document.getElementById("captureOptionsBtn"),
    captureOptions: document.getElementById("captureOptions"),
    previewTitle: document.getElementById("previewTitle"),
    previewExcerpt: document.getElementById("previewExcerpt"),
    previewDomain: document.getElementById("previewDomain"),
    previewImage: document.getElementById("previewImage"),
    previewCoverFallback: document.getElementById("previewCoverFallback"),
    captureEditor: document.getElementById("captureEditor"),
    editCaptureBtn: document.getElementById("editCaptureBtn"),
    doneEditingBtn: document.getElementById("doneEditingBtn"),
    advancedOptionsBtn: document.getElementById("advancedOptionsBtn"),
    articleOption: document.getElementById("articleOption"),
    summaryOption: document.getElementById("summaryOption"),
    customOption: document.getElementById("customOption"),
    libraryDestination: document.getElementById("libraryDestination"),
    closePopupBtn: document.getElementById("closePopupBtn"),
    saveButtonLabel: document.getElementById("saveButtonLabel"),
    statusTitle: document.getElementById("statusTitle"),
    ticktickConnectHint: document.getElementById("ticktickConnectHint"),

    tabSave: document.getElementById("tabSave"),
    tabSettings: document.getElementById("tabSettings"),
    panelSave: document.getElementById("panelSave"),
    panelSettings: document.getElementById("panelSettings"),
    saveActions: document.getElementById("saveActions"),

    title: document.getElementById("title"),
    url: document.getElementById("url"),
    rawText: document.getElementById("rawText"),

    projectField: document.getElementById("projectField"),
    projectSelect: document.getElementById("projectSelect"),
    projectPickerBtn: document.getElementById("projectPickerBtn"),
    projectPickerLabel: document.getElementById("projectPickerLabel"),
    projectSearchInput: document.getElementById("projectSearchInput"),
    projectPickerToggleBtn: document.getElementById("projectPickerToggleBtn"),
    projectMenu: document.getElementById("projectMenu"),

    openCreateProjectBtn: document.getElementById("openCreateProjectBtn"),
    projectCreatePanel: document.getElementById("projectCreatePanel"),
    projectNameInput: document.getElementById("projectNameInput"),
    confirmCreateProjectBtn: document.getElementById("confirmCreateProjectBtn"),
    cancelCreateProjectBtn: document.getElementById("cancelCreateProjectBtn"),

    tagsField: document.getElementById("tagsField"),
    tagsInputBox: document.getElementById("tagsInputBox"),
    tagPickerToggleBtn: document.getElementById("tagPickerToggleBtn"),
    tagInput: document.getElementById("tagInput"),
    selectedTagsContainer: document.getElementById("selectedTagsContainer"),
    tagSuggestions: document.getElementById("tagSuggestions"),

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
    currentEmailContainer: document.getElementById("currentEmailContainer"),
    currentEmailDisplay: document.getElementById("currentEmailDisplay"),

    telegramQuizToggle: document.getElementById("telegramQuizToggle"),
    telegramCommand: document.getElementById("telegramCommand"),
    copyTelegramCommandBtn: document.getElementById("copyTelegramCommandBtn"),
    openTelegramBotBtn: document.getElementById("openTelegramBotBtn"),
    telegramOptions: document.getElementById("telegramOptions"),
    telegramStatusPill: document.getElementById("telegramStatusPill"),
    telegramStatusText: document.getElementById("telegramStatusText"),

    themeToggleBtn: document.getElementById("themeToggleBtn")
};


// ─── Runtime State ───────────────────────────────────────────────────────────

let availableProjects = [];
let availableTags = [];
let selectedTags = [];
let activeTagSuggestionIndex = -1;
let activeProjectSuggestionIndex = -1;
let ticktickAccess = "checking";
let authPending = false;
let savePending = false;
let capturePending = false;
let preferencesLoaded = false;
let connectionsPending = false;
let projectsPending = false;
let emailPending = false;
let quizPending = false;
let notionSelectionPending = false;
let projectsRefreshQueued = false;
let captureFormat = "article";
let lastKnownProjectId = "";

let ticktickSelected = false;
let notionSelected = false;
let draftOwnerId = null;
const syncUI = KnowviaSync.create({
    apiFetch,
    getOwner: async () => {
        const stored = await storageGet([STORAGE_KEYS.userId, STORAGE_KEYS.token, STORAGE_KEYS.signedIn, STORAGE_KEYS.legacyUserId, STORAGE_KEYS.legacyToken]);
        return { ...resolveAuthState(stored), session: stored[STORAGE_KEYS.token] || stored[STORAGE_KEYS.legacyToken] || "" };
    },
    readLocal: async key => (await storageGet([key]))[key],
    writeLocal: (key, value) => storageSet({ [key]: value }),
    isBlocked: () => savePending || authPending
});
function renderDestinationSelection()
{
    const selected = ticktickSelected;
    el.projectField.hidden = false;
    setProjectPickerDisabled(!selected || ticktickAccess !== "connected" || authPending || savePending);
    el.openCreateProjectBtn.disabled = !selected || ticktickAccess !== "connected" || authPending || savePending;
    el.libraryDestination.hidden = false;
    el.tagsField.hidden = false;
    document.querySelector(".save-options-section").hidden = true;
    for (const input of [el.useSummaryAi, el.useTagsAi, el.mergeSummaryWithContent]) input.closest("label").hidden = !selected;
    el.connectTickTickFromSaveBtn.classList.toggle("selected", selected);
    el.connectTickTickFromSaveBtn.setAttribute("aria-pressed", String(selected));
    el.connectTickTickFromSaveBtn.setAttribute("aria-label", selected ? "Disable TickTick for this capture" : "Enable TickTick for this capture");
    el.ticktickCaptureHint.textContent = selected ? ticktickAccess === "connected" ? "Save as a task with link" : "Connect account" : "Not selected";
    document.getElementById("notionSaveConfig").hidden = false;
    if (!selected) { hideProjectMenu(); hideTagSuggestions(); hideProjectCreatePanel(); }
    updateSaveAvailability();
}
const notionUI = KnowviaNotion.create({
    isSelected: () => notionSelected,
    toggleSelected: () => { notionSelected = !notionSelected; renderDestinationSelection(); },
    apiFetch,
    getOwner: async () => {
        const stored = await storageGet([STORAGE_KEYS.userId, STORAGE_KEYS.token, STORAGE_KEYS.signedIn,
            STORAGE_KEYS.legacyUserId, STORAGE_KEYS.legacyToken, STORAGE_KEYS.ticktickConnected]);
        return { ...resolveAuthState(stored), session: stored[STORAGE_KEYS.token] || stored[STORAGE_KEYS.legacyToken] || "" };
    },
    readLocal: async key => (await storageGet([key]))[key],
    writeLocal: (key, value) => storageSet({ [key]: value }),
    connect: () => startConnection("Notion", "startNotionAuth"),
    isBlocked: () => savePending || authPending,
    onMutation: pending => { notionSelectionPending = pending; updateSaveAvailability(); },
    onChange: () => updateSaveAvailability(),
    notify: (message, type, title) => {
        setStatus(message, type);
        if (title) el.statusTitle.textContent = title;
    }
});

function setSaveButtonLabel(label)
{
    el.saveButtonLabel.textContent = label;
    el.saveArticleBtn?.querySelector(".save-icon use")?.setAttribute("href", label === "Capture saved" ? "#icon-check" : "#icon-download");
}

function defaultSaveLabel()
{
    if (ticktickSelected && (ticktickAccess !== "connected" || !el.projectSelect.value) || notionSelected && !notionUI.hasDestination())
        return "Choose destinations";
    if (ticktickSelected && notionSelected) return "Save to 2 platforms";
    if (ticktickSelected) return "Save to TickTick";
    if (notionSelected) return "Save to Notion";
    return "Save to Knowvia";
}

function updateSaveAvailability()
{
    if (el.saveArticleBtn) el.saveArticleBtn.disabled = savePending || capturePending || authPending || notionSelectionPending || (ticktickSelected && ticktickAccess === "checking");
    if (el.saveButtonLabel && !savePending && el.saveArticleBtn.dataset.state !== "success") setSaveButtonLabel(defaultSaveLabel());
    window.KnowviaV2?.refresh();
}

function updateCapturePreview(source)
{
    if (source && el.captureSource)
    {
        const sources = { "CURRENT PAGE": "Web page", "SELECTED TEXT": "Selection", "FROM YOUR CLIPBOARD": "Clipboard", "MANUAL CAPTURE": "Note", "READY FOR YOUR NEXT CAPTURE": "New capture" };
        el.captureSource.textContent = sources[source] || source;
    }
    if (el.captureCount) el.captureCount.textContent = `${(el.rawText?.value.length || 0).toLocaleString()} characters`;
    el.previewTitle.textContent = el.title.value.trim() || "Untitled capture";
    el.previewTitle.title = el.title.value.trim();
    el.previewExcerpt.textContent = el.rawText.value.trim().replace(/\s+/g, " ").slice(0, 240) || "Capture a page, select a passage, or add a note of your own.";
    try
    {
        const url = new URL(el.url.value);
        el.previewDomain.textContent = ["https:", "http:"].includes(url.protocol) ? url.hostname.replace(/^www\./, "") : "Personal note";
    }
    catch { el.previewDomain.textContent = "Personal note"; }
    window.KnowviaV2?.refresh();
}

function setPreviewImage(value)
{
    // Presentation only: no image URL or asset is included in the save payload.
    el.previewImage.hidden = true;
    el.previewImage.removeAttribute("src");
    el.previewCoverFallback.hidden = false;
    try
    {
        const url = new URL(value);
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return;
        el.previewImage.src = url.href;
    }
    catch { /* Pages without a safe cover keep the neutral document artwork. */ }
}

function setCaptureEditor(open, focus = true)
{
    el.captureEditor.hidden = false;
    el.editCaptureBtn.setAttribute("aria-expanded", String(open));
    if (open && focus) el.title.focus();
    if (!open && focus) el.editCaptureBtn.focus();
}

function selectCaptureFormat(format, focusEditor = true)
{
    captureFormat = format;
    for (const [value, button] of [["article", el.articleOption], ["summary", el.summaryOption], ["custom", el.customOption]])
    {
        const selected = value === format;
        button.classList.toggle("selected", selected);
        button.setAttribute("aria-checked", String(selected));
        button.tabIndex = selected ? 0 : -1;
    }
    if (format !== "custom")
    {
        el.useSummaryAi.checked = format === "summary";
        el.mergeSummaryWithContent.checked = format === "summary";
        el.mergeSummaryWithContent.disabled = format !== "summary";
        setCaptureEditor(false, false);
    }
    else setCaptureEditor(true, focusEditor);
}

function renderTickTickState(state, message)
{
    ticktickAccess = state;
    updateSaveAvailability();
    const connected = state === "connected";
    const checking = state === "checking";
    const error = state === "error";
    const label = connected ? "Connected" : checking ? "Checking…" : error ? "Check connection" : "Not connected";
    if (el.ticktickStatusSecondary)
    {
        el.ticktickStatusSecondary.textContent = label;
        el.ticktickStatusSecondary.className = `status-pill status-pill--${connected ? "success" : checking ? "loading" : error ? "warning" : "danger"}`;
    }
    if (el.projectField) el.projectField.hidden = false;
    if (el.libraryDestination) el.libraryDestination.hidden = false;
    if (el.ticktickConnectHint) el.ticktickConnectHint.hidden = connected || checking;

    if (el.ticktickConnectionHint) el.ticktickConnectionHint.textContent = message || (connected
        ? "Access verified. Enable TickTick on the captures you want to send."
        : checking ? "Checking access to your lists…" : "Connect to choose TickTick as an optional destination.");
    if (el.connectTickTickBtn)
    {
        el.connectTickTickBtn.textContent = connected || error ? "Reconnect" : "Connect";
        el.connectTickTickBtn.setAttribute("aria-label", `${el.connectTickTickBtn.textContent} TickTick account`);
        el.connectTickTickBtn.title = el.connectTickTickBtn.getAttribute("aria-label");
    }
    renderDestinationSelection();
}

async function loadNotionStatus()
{
    return notionUI.refresh();
}

async function refreshConnections()
{
    if (connectionsPending || authPending || emailPending || quizPending) return;
    connectionsPending = true;
    el.refreshConnectionsBtn.disabled = true;
    el.refreshConnectionsBtn.setAttribute("aria-busy", "true");
    try { await Promise.allSettled([loadTickTickProjects(), loadNotionStatus(), loadUserPreferences()]); }
    finally
    {
        connectionsPending = false;
        el.refreshConnectionsBtn.disabled = authPending;
        el.refreshConnectionsBtn.removeAttribute("aria-busy");
    }
}


// ─── Storage Helpers ─────────────────────────────────────────────────────────

function storageGet(keys)
{
    return new Promise((resolve) =>
    {
        chrome.storage.local.get(keys, resolve);
    });
}

function storageSet(data)
{
    return new Promise((resolve) =>
    {
        chrome.storage.local.set(data, resolve);
    });
}

function storageRemove(keys)
{
    return new Promise((resolve) =>
    {
        chrome.storage.local.remove(keys, resolve);
    });
}


// ─── Theme ───────────────────────────────────────────────────────────────────

const ICONS =
{
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-sun"/></svg>',
    moon: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-moon"/></svg>'
};

function applyTheme(theme)
{
    try { localStorage.setItem("knowvia_paint_theme", theme === "dark" ? "dark" : "light"); } catch { /* Optional theme-only cache. */ }
    document.documentElement.setAttribute("data-theme", theme);

    if (el.themeToggleBtn)
    {
        const tooltip =
            theme === "dark"
                ? "Switch to light theme"
                : "Switch to dark theme";

        el.themeToggleBtn.innerHTML =
            theme === "dark"
                ? ICONS.sun
                : ICONS.moon;

        el.themeToggleBtn.dataset.tooltip =
            tooltip;

        el.themeToggleBtn.setAttribute(
            "aria-label",
            tooltip
        );
    }
}

async function toggleTheme()
{
    const current =
        document.documentElement.getAttribute("data-theme");

    const next =
        current === "dark"
            ? "light"
            : "dark";

    applyTheme(next);

    await storageSet(
    {
        [STORAGE_KEYS.theme]: next
    });
}


// ─── Status ──────────────────────────────────────────────────────────────────

function setStatus(message, type = "info")
{
    if (!el.statusBar)
    {
        return;
    }

    const normalizedMessage =
        String(message || "Ready");

    if (el.statusText)
    {
        el.statusText.textContent =
            normalizedMessage;
    }
    else
    {
        el.statusBar.textContent =
            normalizedMessage;
    }

    el.statusBar.className =
        `status-bar status-bar--${type}`;

    const statusGlyph = type === "success" ? "check" : type === "loading" ? "refresh" : ["danger", "warning"].includes(type) ? "alert" : "info";
    el.statusBar.querySelector(".status-icon use")?.setAttribute("href", `#icon-${statusGlyph}`);
    el.statusBar.title =
        normalizedMessage;
    if (el.statusTitle) el.statusTitle.textContent = type === "loading"
        ? (savePending ? "Saving your capture…" : authPending ? "Connecting your account…" : "Getting things ready…")
        : type === "danger" ? "Let's try that again" : type === "warning" ? "A little attention needed"
        : type === "success" ? normalizedMessage.startsWith("Saved to Knowvia") ? "Saved in Knowvia" : "Completed" : "Ready when you are";
    window.KnowviaV2?.refresh();
}


// ─── Tabs ────────────────────────────────────────────────────────────────────

function switchTab(tab)
{
    const isSave = tab === "save";

    el.appView?.classList.toggle(
        "settings-active",
        !isSave
    );

    if (el.mainScroll)
    {
        el.mainScroll.scrollTop = 0;
    }

    el.tabSave?.classList.toggle(
        "active",
        isSave
    );

    el.tabSettings?.classList.toggle(
        "active",
        !isSave
    );

    el.tabSettings?.setAttribute("aria-expanded", String(!isSave));
    el.tabSave.tabIndex = 0;
    el.tabSettings.tabIndex = 0;

    hideTagSuggestions();
    hideProjectMenu(false);
    hideProjectCreatePanel();
}


// ─── Connection UI ───────────────────────────────────────────────────────────

function resolveAuthState(stored = {})
{
    const userId =
        stored[STORAGE_KEYS.userId] ||
        stored[STORAGE_KEYS.legacyUserId] ||
        "";

    const token =
        stored[STORAGE_KEYS.token] ||
        stored[STORAGE_KEYS.legacyToken] ||
        "";

    const isTickTickConnected =
        Boolean(stored[STORAGE_KEYS.ticktickConnected]);

    const isSignedIn =
        Boolean(
            (stored[STORAGE_KEYS.signedIn] || isTickTickConnected) &&
            userId &&
            token
        );

    return {
        userId,
        token,
        isSignedIn,
        isTickTickConnected
    };
}

function setConnectedUI(isSignedIn, isTickTickConnected = false)
{
    document.documentElement.removeAttribute("data-booting");
    if (!isSignedIn) {
        notionUI.reset(); syncUI.reset();
        ticktickSelected = false; notionSelected = false; renderDestinationSelection();
    }
    if (el.onboardingView)
    {
        el.onboardingView.style.display =
            isSignedIn
                ? "none"
                : "flex";
    }

    if (el.appView)
    {
        el.appView.style.display =
            isSignedIn
                ? "flex"
                : "none";
    }

    if (el.projectField)
    {
        el.projectField.hidden =
            !isTickTickConnected;
    }

    if (el.ticktickConnectHint)
    {
        el.ticktickConnectHint.hidden =
            !isSignedIn || isTickTickConnected;
    }

    const text =
        isTickTickConnected
            ? "Connected"
            : "Not Connected";

    const className =
        isTickTickConnected
            ? "status-pill status-pill--success"
            : "status-pill status-pill--danger";

    const inner =
        `<span class="pill-dot"></span>${text}`;

    if (el.ticktickStatusPill)
    {
        el.ticktickStatusPill.hidden =
            true;

        el.ticktickStatusPill.setAttribute(
            "aria-hidden",
            "true"
        );

        el.ticktickStatusPill.removeAttribute(
            "title"
        );
    }

    if (el.ticktickStatusSecondary)
    {
        el.ticktickStatusSecondary.className = className;
        el.ticktickStatusSecondary.innerHTML = inner;
    }

    if (el.connectTickTickBtn)
    {
        el.connectTickTickBtn.textContent = isTickTickConnected ? "Reconnect" : "Connect";
        const label = isTickTickConnected ? "Reconnect TickTick account" : "Connect TickTick account";
        el.connectTickTickBtn.setAttribute("aria-label", label);
        el.connectTickTickBtn.title = label;
    }
    // Both existing buttons trigger the same flow; expose one clear action.
    if (el.reconnectTickTickBtn) el.reconnectTickTickBtn.hidden = true;
    // Cached linking state is never proof of current provider access.
    renderTickTickState(ticktickAccess);
}


// ─── API Helper ──────────────────────────────────────────────────────────────

async function apiFetch(path, options = {})
{
    const { timeoutMs = 60000, signal, ...requestOptions } = options;
    const mutating = ["POST", "PUT", "DELETE", "PATCH"].includes(options.method);
    const stored = await storageGet(
    [
        STORAGE_KEYS.token,
        STORAGE_KEYS.legacyToken
    ]);

    const token =
        stored[STORAGE_KEYS.token] ||
        stored[STORAGE_KEYS.legacyToken];

    let response;
    try { response = await fetch(
        `${API_BASE}${path}`,
        {
            ...requestOptions,
            redirect: "error",
            signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),

            headers:
            {
                "Content-Type": "application/json",

                ...(token
                    ? {
                        Authorization: `Bearer ${token}`
                    }
                    : {}),

                ...options.headers
            }
        }
    ); }
    catch (error)
    {
        if (signal?.aborted) throw Object.assign(new Error("Request cancelled"), { code: "REQUEST_ABORTED" });
        throw Object.assign(new Error(error.name === "TimeoutError"
            ? "The request timed out. If you were saving, check your content before retrying."
            : "Cannot reach Knowvia. Check your connection and try again."), { uncertain: mutating });
    }

    const contentType =
        response.headers.get("content-type") || "";

    let data;
    try
    {
        data = contentType.includes("application/json") ? await response.json() : null;
    }
    catch
    {
        throw Object.assign(new Error("The server response could not be read. Check your content before retrying a save."), { uncertain: mutating });
    }

    if (!response.ok || data?.status !== "success")
    {
        const message =
            typeof data === "object" && data?.message
                ? data.message
                : response.ok ? "The server response could not be confirmed. Refresh before trying again."
                    : `Request failed with status ${response.status}`;

        if (response.status === 401 && /invalid.*token|expired.*token|missing authorization|invalid token user/i.test(message)) {
            await storageSet({ [STORAGE_KEYS.token]: null, [STORAGE_KEYS.legacyToken]: null, [STORAGE_KEYS.signedIn]: false });
            setConnectedUI(false, false);
        }
        const retryAfter = response.headers.get("retry-after");
        throw Object.assign(new Error(message), { status: response.status,
            code: typeof data?.code === "string" ? data.code : undefined,
            retryAfter: /^\d{1,7}$/.test(retryAfter || "") ? Number(retryAfter) : undefined,
            uncertain: mutating && response.ok });
    }

    return data;
}


// ─── Projects ────────────────────────────────────────────────────────────────

function getSelectedProjectName()
{
    const selectedOption =
        el.projectSelect?.selectedOptions?.[0];

    return (
        selectedOption?.textContent?.trim()
        || el.projectPickerLabel?.textContent?.trim()
        || "Choose a list"
    );
}

function setProjectPickerDisabled(isDisabled)
{
    el.projectPickerBtn?.setAttribute(
        "aria-disabled",
        String(isDisabled)
    );

    el.projectPickerBtn?.classList.toggle(
        "disabled",
        isDisabled
    );

    if (el.projectSearchInput)
    {
        el.projectSearchInput.disabled =
            isDisabled;
    }

    if (el.projectPickerToggleBtn)
    {
        el.projectPickerToggleBtn.disabled =
            isDisabled;
    }
}

function restoreProjectSearchValue()
{
    if (!el.projectSearchInput)
    {
        return;
    }

    const selectedProjectId =
        String(
            el.projectSelect?.value || ""
        );

    el.projectSearchInput.value =
        selectedProjectId
            ? getSelectedProjectName()
            : "";

    el.projectSearchInput.placeholder =
        selectedProjectId ? "Search or choose a list…" : "Choose a TickTick list…";

    el.projectSearchInput.removeAttribute(
        "title"
    );
}

function hideProjectMenu(restoreValue = true)
{
    if (!el.projectMenu || !el.projectPickerBtn)
    {
        return;
    }

    el.projectMenu.style.display = "none";


    el.projectSearchInput?.setAttribute(
        "aria-expanded",
        "false"
    );

    el.projectPickerToggleBtn?.setAttribute(
        "aria-expanded",
        "false"
    );

    el.projectPickerBtn.classList.remove("open");

    activeProjectSuggestionIndex = -1;
    el.projectSearchInput?.removeAttribute("aria-activedescendant");

    if (restoreValue)
    {
        restoreProjectSearchValue();
    }
}

function getVisibleProjectOptions()
{
    if (!el.projectMenu)
    {
        return [];
    }

    return Array.from(
        el.projectMenu.querySelectorAll(
            ".picker-option[data-project-id]:not([hidden]):not(:disabled)"
        )
    );
}

function updateActiveProjectOption(items)
{
    items.forEach((item, index) =>
    {
        item.classList.toggle(
            "active",
            index === activeProjectSuggestionIndex
        );
    });

    items.forEach((item, index) => { item.id = `project-option-${index}`; });
    const activeItem = items[activeProjectSuggestionIndex];
    if (activeItem) el.projectSearchInput?.setAttribute("aria-activedescendant", activeItem.id);
    else el.projectSearchInput?.removeAttribute("aria-activedescendant");

    activeItem?.scrollIntoView(
    {
        block: "nearest"
    });
}

function filterProjectOptions(query = "")
{
    if (!el.projectMenu)
    {
        return;
    }

    const normalizedQuery =
        String(query || "")
            .trim()
            .toLowerCase();

    const options =
        Array.from(
            el.projectMenu.querySelectorAll(
                ".picker-option[data-project-id]"
            )
        );

    let visibleCount = 0;

    options.forEach((option) =>
    {
        const name =
            option.querySelector(
                ".picker-option-name"
            )
            ?.textContent
            ?.trim()
            ?.toLowerCase()
            || "";

        const isVisible =
            !normalizedQuery
            || name.includes(normalizedQuery);

        option.hidden =
            !isVisible;

        if (isVisible)
        {
            visibleCount += 1;
        }
    });

    el.projectMenu
        .querySelectorAll(
            ".project-search-empty"
        )
        .forEach((element) =>
        {
            element.remove();
        });

    el.projectMenu
        .querySelectorAll(
            ".picker-empty-state:not(.project-search-empty)"
        )
        .forEach((element) =>
        {
            element.hidden =
                Boolean(normalizedQuery);
        });

    if (visibleCount === 0)
    {
        const empty =
            document.createElement("div");

        empty.className =
            "picker-empty-state project-search-empty";

        empty.textContent =
            `No lists match "${query.trim()}".`;

        el.projectMenu.appendChild(empty);
    }

    activeProjectSuggestionIndex = -1;
    el.projectSearchInput?.removeAttribute("aria-activedescendant");
}

// Place both shared pickers inside the scrolling viewport, keeping the input
// visible rather than scrolling the entire form to reveal a dropdown.
function positionPickerMenu(menu, control)
{
    const viewport = el.mainScroll.getBoundingClientRect();
    const anchor = control.getBoundingClientRect();
    const below = viewport.bottom - anchor.bottom - 8;
    const above = anchor.top - viewport.top - 8;
    const opensUp = below < Math.min(menu.scrollHeight, 150) && above > below;
    menu.classList.toggle("opens-up", opensUp);
    menu.style.maxHeight = `${Math.max(36, Math.min(150, opensUp ? above : below))}px`;
}

function showProjectMenu(query = "")
{
    if (
        !el.projectMenu ||
        !el.projectPickerBtn ||
        el.projectPickerBtn.getAttribute(
            "aria-disabled"
        ) === "true"
    )
    {
        return;
    }

    filterProjectOptions(query);

    el.projectMenu.style.display = "block";


    el.projectSearchInput?.setAttribute(
        "aria-expanded",
        "true"
    );

    el.projectPickerToggleBtn?.setAttribute(
        "aria-expanded",
        "true"
    );

    el.projectPickerBtn.classList.add("open");
    positionPickerMenu(el.projectMenu, el.projectPickerBtn);
}

function toggleProjectMenu()
{
    if (!el.projectMenu)
    {
        return;
    }

    const isOpen =
        el.projectMenu.style.display === "block";

    if (isOpen)
    {
        hideProjectMenu();
        return;
    }

    hideTagSuggestions();
    hideProjectCreatePanel(false);

    restoreProjectSearchValue();

    el.projectSearchInput?.focus();

    showProjectMenu("");
}

function handleProjectSearchInput()
{
    const query =
        el.projectSearchInput?.value || "";

    showProjectMenu(query);
}

function handleProjectSearchFocus()
{
    hideTagSuggestions();
    hideProjectCreatePanel(false);

    showProjectMenu("");
}

function handleProjectSearchKeyDown(event)
{
    const items =
        getVisibleProjectOptions();

    if (
        event.key === "ArrowDown"
        || event.key === "ArrowUp"
    )
    {
        event.preventDefault();

        if (items.length === 0)
        {
            return;
        }

        const direction =
            event.key === "ArrowDown"
                ? 1
                : -1;

        activeProjectSuggestionIndex =
            (
                activeProjectSuggestionIndex
                + direction
                + items.length
            )
            % items.length;

        updateActiveProjectOption(items);
        return;
    }

    if (event.key === "Enter")
    {
        if (items.length === 0)
        {
            return;
        }

        event.preventDefault();

        const selectedItem =
            activeProjectSuggestionIndex >= 0
                ? items[activeProjectSuggestionIndex]
                : items.length === 1
                    ? items[0]
                    : null;

        selectedItem?.click();
        return;
    }

    if (event.key === "Escape")
    {
        event.preventDefault();

        hideProjectMenu();
        el.projectSearchInput?.blur();
    }
}

function hideProjectCreatePanel(clearInput = true)
{
    if (el.projectCreatePanel)
    {
        el.projectCreatePanel.hidden = true;
    }

    if (clearInput && el.projectNameInput)
    {
        el.projectNameInput.value = "";
    }
}

function showProjectCreatePanel()
{
    hideProjectMenu();

    if (el.projectCreatePanel)
    {
        el.projectCreatePanel.hidden = false;
    }

    if (el.projectNameInput)
    {
        el.projectNameInput.focus();
        el.projectNameInput.select();
    }
}

function setSelectedProject(projectId, shouldSave = true)
{
    if (!el.projectSelect)
    {
        return;
    }

    const normalizedProjectId =
        String(projectId || "");
    lastKnownProjectId = normalizedProjectId;

    const option =
        Array.from(el.projectSelect.options)
            .find((item) =>
            {
                return item.value === normalizedProjectId;
            });

    if (!option)
    {
        return;
    }

    el.projectSelect.value = normalizedProjectId;
    updateSaveAvailability();

    const destinationName =
        normalizedProjectId
            ? option.textContent || "Unnamed Project"
            : "Choose a list";

    if (el.projectPickerLabel)
    {
        el.projectPickerLabel.textContent =
            destinationName;
    }

    if (el.projectSearchInput)
    {
        el.projectSearchInput.value =
            normalizedProjectId
                ? destinationName
                : "";

        el.projectSearchInput.placeholder =
            normalizedProjectId ? "Search or choose a list…" : "Choose a TickTick list…";

        el.projectSearchInput.removeAttribute(
            "title"
        );
    }


    if (el.projectMenu)
    {
        const items =
            el.projectMenu.querySelectorAll(
                ".picker-option[data-project-id]"
            );

        items.forEach((item) =>
        {
            const isSelected =
                item.dataset.projectId === normalizedProjectId;

            item.classList.toggle(
                "selected",
                isSelected
            );

            item.setAttribute(
                "aria-selected",
                String(isSelected)
            );
        });
    }

    if (shouldSave)
    {
        void storageSet(
        {
            [STORAGE_KEYS.selectedProjectId]:
                normalizedProjectId
        });
    }

    hideProjectMenu();
    hideProjectCreatePanel();
}

function createInboxOption()
{
    const option =
        document.createElement("option");

    option.value = "";
    option.textContent = "Choose a list";

    el.projectSelect.appendChild(option);

    const button =
        document.createElement("button");

    button.type = "button";
    button.className = "picker-option";
    button.dataset.projectId = "";
    button.disabled = true;
    button.setAttribute("aria-disabled", "true");
    button.setAttribute("role", "option");
    button.tabIndex = -1;

    const icon =
        document.createElement("span");

    icon.className = "picker-option-icon";
    icon.innerHTML =
    `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-inbox"/></svg>
    `;

    const name =
        document.createElement("span");

    name.className = "picker-option-name";
    name.textContent = "Choose a list";

    const check =
        document.createElement("span");

    check.className = "picker-option-check";
    check.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-check"/></svg>';

    button.appendChild(icon);
    button.appendChild(name);
    button.appendChild(check);

    button.addEventListener(
        "click",
        () =>
        {
            setSelectedProject("");
        }
    );

    el.projectMenu.appendChild(button);
}

function createProjectOption(project)
{
    const projectId =
        String(project.id || "");

    const projectName =
        project.name || "Unnamed Project";

    const option =
        document.createElement("option");

    option.value = projectId;
    option.textContent = projectName;

    el.projectSelect.appendChild(option);

    const button =
        document.createElement("button");

    button.type = "button";
    button.className = "picker-option";
    button.dataset.projectId = projectId;
    button.setAttribute("role", "option");
    button.tabIndex = -1;

    const icon =
        document.createElement("span");

    icon.className = "picker-option-icon";
    icon.innerHTML =
    `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-folder"/></svg>
    `;

    const name =
        document.createElement("span");

    name.className = "picker-option-name";
    name.textContent = projectName;

    const check =
        document.createElement("span");

    check.className = "picker-option-check";
    check.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-check"/></svg>';

    button.appendChild(icon);
    button.appendChild(name);
    button.appendChild(check);

    button.addEventListener(
        "click",
        () =>
        {
            setSelectedProject(projectId);
        }
    );

    el.projectMenu.appendChild(button);
}

function renderProjects(projects, selectedProjectId = "")
{
    if (
        !el.projectSelect ||
        !el.projectMenu ||
        !el.projectPickerBtn
    )
    {
        return;
    }

    availableProjects =
        Array.isArray(projects)
            ? projects.filter((project) => project?.id)
            : [];

    el.projectSelect.innerHTML = "";
    el.projectMenu.innerHTML = "";

    createInboxOption();

    for (const project of availableProjects)
    {
        createProjectOption(project);
    }

    if (availableProjects.length === 0)
    {
        const emptyMessage =
            document.createElement("div");

        emptyMessage.className = "picker-empty-state";
        emptyMessage.textContent =
            "No TickTick lists yet. Create a list or save to Knowvia only.";

        el.projectMenu.appendChild(emptyMessage);
    }

    setProjectPickerDisabled(false);

    const normalizedSelectedProjectId =
        String(selectedProjectId || "");

    const selectedProjectExists =
        availableProjects.some((project) =>
        {
            return String(project.id) ===
                normalizedSelectedProjectId;
        });

    const finalSelectedProjectId =
        selectedProjectExists
            ? normalizedSelectedProjectId
            : "";

    setSelectedProject(
        finalSelectedProjectId,
        false
    );

    void storageSet(
    {
        [STORAGE_KEYS.selectedProjectId]:
            finalSelectedProjectId
    });
}

async function createTickTickProject()
{
    if (el.confirmCreateProjectBtn?.disabled || ticktickAccess !== "connected" || savePending) return;
    const projectName =
        el.projectNameInput?.value.trim() || "";

    if (!projectName)
    {
        setStatus(
            "List name is required.",
            "danger"
        );

        el.projectNameInput?.focus();
        return;
    }

    const duplicateExists =
        availableProjects.some((project) =>
        {
            return String(project.name || "")
                .trim()
                .toLowerCase() ===
                projectName.toLowerCase();
        });

    if (duplicateExists)
    {
        setStatus(
            "A list with this name already exists.",
            "warning"
        );

        return;
    }

    const button =
        el.confirmCreateProjectBtn;

    const originalText =
        button?.textContent || "Create";

    try
    {
        if (button)
        {
            button.disabled = true;
            button.textContent = "Creating...";
            button.setAttribute("aria-busy", "true");
        }
        el.cancelCreateProjectBtn.disabled = true;

        if (el.projectNameInput)
        {
            el.projectNameInput.disabled = true;
        }

        setStatus(
            "Creating TickTick list...",
            "info"
        );

        const result = await apiFetch(
            "/content/projects",
            {
                method: "POST",
                body: JSON.stringify(
                {
                    name: projectName
                })
            }
        );

        const createdProject =
            result?.data;

        if (!createdProject?.id)
        {
            throw new Error(
                "List was created, but its ID was not returned."
            );
        }

        availableProjects =
        [
            ...availableProjects.filter((project) =>
            {
                return String(project.id) !==
                    String(createdProject.id);
            }),
            createdProject
        ];

        await storageSet(
        {
            [STORAGE_KEYS.projects]:
                availableProjects,

            [STORAGE_KEYS.selectedProjectId]:
                String(createdProject.id)
        });

        renderProjects(
            availableProjects,
            String(createdProject.id)
        );

        hideProjectCreatePanel();

        setStatus(
            `${projectName} was created and selected.`,
            "success"
        );
    }
    catch (error)
    {
        setStatus(
            error.message ||
            "Failed to create list.",
            "danger"
        );
    }
    finally
    {
        el.cancelCreateProjectBtn.disabled = false;
        if (button)
        {
            button.disabled = false;
            button.textContent = originalText;
            button.removeAttribute("aria-busy");
        }

        if (el.projectNameInput)
        {
            el.projectNameInput.disabled = false;
        }
    }
}

async function loadTickTickProjects()
{
    if (projectsPending) { projectsRefreshQueued = true; return; }
    projectsPending = true;
    renderTickTickState("checking");
    setProjectPickerDisabled(true);
    try
    {
        const stored = await storageGet([STORAGE_KEYS.selectedProjectId]);
        lastKnownProjectId = stored[STORAGE_KEYS.selectedProjectId] || "";
        const result = await apiFetch("/content/projects", { method: "GET", cache: "no-store" });
        if (result?.status !== "success" || !Array.isArray(result.data))
            throw new Error("Could not verify your TickTick lists. Refresh to try again.");
        renderProjects(result.data, stored[STORAGE_KEYS.selectedProjectId] || "");
        await storageSet({ [STORAGE_KEYS.projects]: result.data });
        renderTickTickState("connected");
    }
    catch (error)
    {
        // No TickTick status route exists. A successful list request verifies access;
        // a network/server failure leaves status unknown, never optimistically connected.
        const disconnected = error.status === 401 && /TickTick account is not connected/i.test(error.message);
        setProjectPickerDisabled(true);
        renderTickTickState(disconnected ? "disconnected" : "error", disconnected ? undefined : error.message);
    }
    finally
    {
        projectsPending = false;
        if (projectsRefreshQueued)
        {
            projectsRefreshQueued = false;
            await loadTickTickProjects();
        }
    }
}

// ─── Tags ────────────────────────────────────────────────────────────────────

function normalizeTag(tag)
{
    return String(tag || "")
        .trim()
        .replace(/^#+/, "")
        .replace(/\s+/g, "-")
        .toLowerCase();
}

function getVisibleTagSuggestionButtons()
{
    if (!el.tagSuggestions)
    {
        return [];
    }

    return Array.from(
        el.tagSuggestions.querySelectorAll(
            ".tag-suggestion-item"
        )
    );
}

function setActiveTagSuggestion(index)
{
    const buttons =
        getVisibleTagSuggestionButtons();

    if (buttons.length === 0)
    {
        activeTagSuggestionIndex = -1;
        el.tagInput?.removeAttribute("aria-activedescendant");
        return;
    }

    if (index < 0)
    {
        index = buttons.length - 1;
    }

    if (index >= buttons.length)
    {
        index = 0;
    }

    activeTagSuggestionIndex = index;
    buttons.forEach((button, optionIndex) => {
        button.id = `tag-option-${optionIndex}`;
        button.setAttribute("aria-selected", String(optionIndex === index));
    });
    el.tagInput?.setAttribute("aria-activedescendant", buttons[index].id);

    buttons.forEach((button, buttonIndex) =>
    {
        button.classList.toggle(
            "active",
            buttonIndex === activeTagSuggestionIndex
        );
    });

    buttons[activeTagSuggestionIndex]?.scrollIntoView(
    {
        block: "nearest"
    });
}

function hideTagSuggestions()
{
    if (!el.tagSuggestions)
    {
        return;
    }

    el.tagSuggestions.style.display = "none";

    el.tagInput?.setAttribute(
        "aria-expanded",
        "false"
    );


    el.tagPickerToggleBtn?.setAttribute(
        "aria-expanded",
        "false"
    );

    el.tagsInputBox?.classList.remove(
        "open"
    );

    activeTagSuggestionIndex = -1;
    el.tagInput?.removeAttribute("aria-activedescendant");
}

function renderSelectedTags()
{
    if (!el.selectedTagsContainer)
    {
        return;
    }

    el.selectedTagsContainer.innerHTML = "";

    for (const tag of selectedTags)
    {
        const chip =
            document.createElement("span");

        chip.className = "tag-chip";

        const text =
            document.createElement("span");

        text.className = "tag-chip-text";
        text.textContent = tag;

        const removeButton =
            document.createElement("button");

        removeButton.type = "button";
        removeButton.className = "tag-chip-remove";
        removeButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#icon-close"/></svg>';
        removeButton.title = `Remove ${tag}`;
        removeButton.setAttribute(
            "aria-label",
            `Remove ${tag}`
        );

        removeButton.addEventListener(
            "click",
            (event) =>
            {
                event.stopPropagation();
                removeTag(tag);
            }
        );

        chip.appendChild(text);
        chip.appendChild(removeButton);

        el.selectedTagsContainer.appendChild(chip);
    }
}

function addTag(tag)
{
    const normalizedTag =
        normalizeTag(tag);

    if (!normalizedTag)
    {
        return;
    }

    if (!selectedTags.includes(normalizedTag))
    {
        selectedTags.push(normalizedTag);
    }

    renderSelectedTags();

    if (el.tagInput)
    {
        el.tagInput.value = "";
        el.tagInput.focus();
    }

    hideTagSuggestions();
}

function removeTag(tag)
{
    selectedTags =
        selectedTags.filter((selectedTag) =>
        {
            return selectedTag !== tag;
        });

    renderSelectedTags();
    renderTagSuggestions();
}

function renderTagSuggestions()
{
    if (!el.tagSuggestions || !el.tagInput)
    {
        return;
    }

    const query =
        normalizeTag(el.tagInput.value);

    activeTagSuggestionIndex = -1;
    el.tagInput?.removeAttribute("aria-activedescendant");
    el.tagSuggestions.innerHTML = "";

    const filteredTags =
        availableTags
            .filter((tag) =>
            {
                const normalizedTag =
                    normalizeTag(tag);

                if (selectedTags.includes(normalizedTag))
                {
                    return false;
                }

                if (!query)
                {
                    return true;
                }

                return normalizedTag.includes(query);
            })
            .slice(0, 8);

    const canCreateTag =
        Boolean(query) &&
        !availableTags.includes(query) &&
        !selectedTags.includes(query);

    if (canCreateTag)
    {
        const createButton =
            document.createElement("button");

        createButton.type = "button";
        createButton.className =
            "tag-suggestion-item tag-suggestion-create";

        createButton.dataset.tag = query;
        createButton.setAttribute("role", "option");
        createButton.tabIndex = -1;

        const left =
            document.createElement("span");

        left.className = "tag-suggestion-main";

        const hash =
            document.createElement("span");

        hash.className = "tag-suggestion-hash";
        hash.textContent = "#";

        const name =
            document.createElement("span");

        name.className = "tag-suggestion-name";
        name.textContent = query;

        const action =
            document.createElement("span");

        action.className = "tag-suggestion-action";
        action.textContent = "Add new";

        left.appendChild(hash);
        left.appendChild(name);

        createButton.appendChild(left);
        createButton.appendChild(action);

        createButton.addEventListener(
            "mousedown",
            (event) =>
            {
                event.preventDefault();
                addTag(query);
            }
        );

        el.tagSuggestions.appendChild(
            createButton
        );
    }

    for (const tag of filteredTags)
    {
        const normalizedTag =
            normalizeTag(tag);

        const button =
            document.createElement("button");

        button.type = "button";
        button.className = "tag-suggestion-item";
        button.dataset.tag = normalizedTag;
        button.setAttribute("role", "option");
        button.tabIndex = -1;

        const left =
            document.createElement("span");

        left.className = "tag-suggestion-main";

        const hash =
            document.createElement("span");

        hash.className = "tag-suggestion-hash";
        hash.textContent = "#";

        const name =
            document.createElement("span");

        name.className = "tag-suggestion-name";
        name.textContent = normalizedTag;

        const action =
            document.createElement("span");

        action.className = "tag-suggestion-action";
        action.textContent = "Select";

        left.appendChild(hash);
        left.appendChild(name);

        button.appendChild(left);
        button.appendChild(action);

        button.addEventListener(
            "mouseenter",
            () =>
            {
                const buttons =
                    getVisibleTagSuggestionButtons();

                setActiveTagSuggestion(
                    buttons.indexOf(button)
                );
            }
        );

        button.addEventListener(
            "mousedown",
            (event) =>
            {
                event.preventDefault();
                addTag(normalizedTag);
            }
        );

        el.tagSuggestions.appendChild(button);
    }

    if (
        el.tagSuggestions.children.length === 0
    )
    {
        const empty =
            document.createElement("div");

        empty.className =
            "tag-suggestion-empty";

        empty.textContent =
            "No more tags available";

        el.tagSuggestions.appendChild(empty);
    }

    el.tagSuggestions.style.display = "block";
    positionPickerMenu(el.tagSuggestions, el.tagsInputBox);

    el.tagInput.setAttribute(
        "aria-expanded",
        "true"
    );


    el.tagPickerToggleBtn?.setAttribute(
        "aria-expanded",
        "true"
    );

    el.tagsInputBox?.classList.add(
        "open"
    );
}

async function loadTags()
{
    el.tagsLoadStatus.hidden = true;
    try
    {
        const stored = await storageGet(
        [
            STORAGE_KEYS.tags
        ]);

        const cachedTags =
            stored[STORAGE_KEYS.tags];

        if (Array.isArray(cachedTags))
        {
            availableTags =
                [...new Set(
                    cachedTags
                        .map(normalizeTag)
                        .filter(Boolean)
                )].sort();
        }

        const result = await apiFetch(
            "/content/tags",
            {
                method: "GET"
            }
        );
        if (!Array.isArray(result?.data)) throw new Error("Tag suggestions could not be read.");

        availableTags =
            Array.isArray(result?.data)
                ? [...new Set(
                    result.data
                        .map(normalizeTag)
                        .filter(Boolean)
                )].sort()
                : [];

        await storageSet(
        {
            [STORAGE_KEYS.tags]:
                availableTags
        });
    }
    catch (error)
    {
        el.tagsLoadStatus.hidden = false;
    }
}

function handleTagInput()
{
    hideProjectMenu();
    hideProjectCreatePanel();
    renderTagSuggestions();
}

function handleTagFocus()
{
    hideProjectMenu();
    hideProjectCreatePanel();
    renderTagSuggestions();
}

function handleTagKeyDown(event)
{
    const buttons =
        getVisibleTagSuggestionButtons();

    if (event.key === "ArrowDown")
    {
        event.preventDefault();

        setActiveTagSuggestion(
            activeTagSuggestionIndex + 1
        );

        return;
    }

    if (event.key === "ArrowUp")
    {
        event.preventDefault();

        setActiveTagSuggestion(
            activeTagSuggestionIndex - 1
        );

        return;
    }

    if (
        event.key === "Enter" &&
        activeTagSuggestionIndex >= 0 &&
        buttons[activeTagSuggestionIndex]
    )
    {
        event.preventDefault();

        addTag(
            buttons[activeTagSuggestionIndex].dataset.tag
        );

        return;
    }

    if (
        event.key === "Enter" ||
        event.key === "," ||
        event.key === " "
    )
    {
        const typedTag =
            normalizeTag(el.tagInput?.value);

        if (typedTag)
        {
            event.preventDefault();
            addTag(typedTag);
        }

        return;
    }

    if (
        event.key === "Backspace" &&
        !el.tagInput?.value &&
        selectedTags.length > 0
    )
    {
        event.preventDefault();

        removeTag(
            selectedTags[selectedTags.length - 1]
        );

        return;
    }

    if (event.key === "Escape")
    {
        hideTagSuggestions();
    }
}

function getTagsForSave()
{
    const typedTag =
        normalizeTag(el.tagInput?.value);

    const tags =
        [...selectedTags];

    if (
        typedTag &&
        !tags.includes(typedTag)
    )
    {
        tags.push(typedTag);
    }

    return tags;
}


// ─── Telegram ────────────────────────────────────────────────────────────────

function truncateMiddle(value, visibleStart = 9, visibleEnd = 4)
{
    const text =
        String(value || "");

    const minimumLength =
        visibleStart + visibleEnd + 3;

    if (text.length <= minimumLength)
    {
        return text;
    }

    return (
        text.slice(0, visibleStart)
        + "..."
        + text.slice(-visibleEnd)
    );
}

function setUserIdDisplay(userId)
{
    if (!el.userId)
    {
        return;
    }

    const fullUserId =
        String(userId || "");

    el.userId.dataset.fullValue =
        fullUserId;

    el.userId.value =
        truncateMiddle(fullUserId);

    el.userId.title =
        fullUserId || "User ID";
}

function getFullUserId()
{
    return (
        el.userId?.dataset?.fullValue?.trim()
        || el.userId?.value?.trim()
        || ""
    );
}

function fillTelegramCommand(userId)
{
    if (!el.telegramCommand)
    {
        return;
    }

    const fullCommand =
        userId
            ? `/start ${userId}`
            : "/start";

    const visibleCommand =
        userId
            ? `/start ${truncateMiddle(userId)}`
            : "/start";

    el.telegramCommand.dataset.fullValue =
        fullCommand;

    el.telegramCommand.textContent =
        visibleCommand;

    el.telegramCommand.removeAttribute(
        "title"
    );
}

function openTelegramBot()
{
    const userId =
        getFullUserId();

    const url =
        userId
            ? `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${userId}`
            : `https://t.me/${TELEGRAM_BOT_USERNAME}`;

    chrome.tabs.create(
    {
        url
    });
}


// ─── Clipboard ───────────────────────────────────────────────────────────────

async function copyToClipboardWithFeedback(text, button)
{
    if (!text)
    {
        setStatus(
            "Nothing to copy.",
            "danger"
        );

        return;
    }

    try
    {
        await navigator.clipboard.writeText(text);

        const originalText =
            button?.textContent || "Copy";

        const originalColor =
            button?.style?.color || "";

        const originalBorderColor =
            button?.style?.borderColor || "";

        if (button)
        {
            button.textContent = "Copied";
            button.style.color = "var(--green)";
            button.style.borderColor = "var(--green)";
        }

        setTimeout(() =>
        {
            if (!button)
            {
                return;
            }

            button.textContent = originalText;
            button.style.color = originalColor;
            button.style.borderColor = originalBorderColor;
        }, 2000);

        setStatus(
            "Copied to clipboard.",
            "success"
        );
    }
    catch
    {
        setStatus(
            "Failed to copy.",
            "danger"
        );
    }
}

async function copyUserId(event)
{
    await copyToClipboardWithFeedback(
        getFullUserId(),
        event.target || el.copyUserIdBtn
    );
}

async function copyTelegramCommand(event)
{
    const fullCommand =
        el.telegramCommand?.dataset?.fullValue?.trim()
        || el.telegramCommand?.textContent?.trim()
        || "";

    await copyToClipboardWithFeedback(
        fullCommand,
        event.target || el.copyTelegramCommandBtn
    );
}


// ─── Email UI ────────────────────────────────────────────────────────────────

function showCurrentEmail(email, isEnabled)
{
    if (el.currentEmailContainer)
    {
        el.currentEmailContainer.style.display =
            "block";
    }

    if (el.currentEmailDisplay)
    {
        el.currentEmailDisplay.textContent =
            email;

        el.currentEmailDisplay.title =
            email || "No email configured";
    }

    if (el.weeklyEmailToggle)
    {
        el.weeklyEmailToggle.checked =
            Boolean(isEnabled);
    }
}


// ─── Authentication ──────────────────────────────────────────────────────────

// Only presentation state is stored here; OAuth exchanges remain unchanged.
function renderAuthUI(state)
{
    const pending = state?.status === "pending";
    authPending = pending;
    notionUI.setBlocked(pending);
    const failed = state?.status === "error";
    const provider = state?.provider || "Google";
    const message = pending
        ? `Continue in the ${provider} window. This popup will reopen when you're done.`
        : failed ? state.message : state?.status === "success" ? `${provider} connected successfully.` : "";

    for (const button of [el.connectGoogleBtn, el.reauthGoogleBtn, el.connectTickTickBtn, el.connectTickTickFromSaveBtn, el.reconnectTickTickBtn, el.connectNotionBtn])
    {
        if (!button) continue;
        button.disabled = pending;
        button.setAttribute("aria-busy", String(pending));
    }
    updateSaveAvailability();
    if (el.refreshConnectionsBtn) el.refreshConnectionsBtn.disabled = pending || connectionsPending;
    // Keep the existing connected-state rule for the reconnect button.
    if (!pending && el.reconnectTickTickBtn?.hidden) el.reconnectTickTickBtn.disabled = true;
    const googleLabel = el.connectGoogleBtn?.querySelector(".google-auth-label");
    if (googleLabel) googleLabel.textContent = pending ? `Opening ${provider}…` : "Continue with Google";
    if (el.onboardingAuthStatus)
    {
        el.onboardingAuthStatus.hidden = !message;
        el.onboardingAuthStatus.textContent = message;
        el.onboardingAuthStatus.dataset.state = failed ? "error" : "info";
    }
    // Connection outcomes stay with that integration; they do not replace capture feedback.
    const key = provider.toLowerCase();
    const anchor = provider === "Notion" ? el.connectNotionBtn : provider === "TickTick" ? el.connectTickTickBtn : el.reauthGoogleBtn;
    let feedback = document.getElementById(`${key}AuthFeedback`);
    if (!feedback && anchor) {
        feedback = document.createElement("p"); feedback.id = `${key}AuthFeedback`;
        feedback.className = "v2-integration-feedback"; feedback.setAttribute("role", "status");
        anchor.closest(".settings-card")?.append(feedback);
    }
    if (feedback) { feedback.textContent = message; feedback.hidden = !message; feedback.dataset.state = state?.status || ""; }
    const row = document.querySelector(`.v2-destination-row[data-provider="${key}"] .v2-provider-config`);
    let inline = document.getElementById(`${key}CaptureAuthFeedback`);
    if (!inline && row) { inline = document.createElement("p"); inline.id = `${key}CaptureAuthFeedback`; inline.className = "v2-integration-feedback"; inline.setAttribute("role", "status"); row.append(inline); }
    if (inline) { inline.textContent = message; inline.hidden = !message; inline.dataset.state = state?.status || ""; }
}

function startConnection(provider, action)
{
    if (authPending || savePending || notionSelectionPending) return;
    renderAuthUI({ provider, status: "pending" });
    try
    {
        chrome.runtime.sendMessage({ action }, response =>
        {
            const error = chrome.runtime.lastError ? "Could not open the connection window. Please try again." : response?.error;
            if (error || !response?.started)
            {
                renderAuthUI({ provider, status: "error", message: error || "Could not open the connection window. Please try again." });
            }
        });
    }
    catch (error)
    {
        renderAuthUI({ provider, status: "error", message: "Could not open the connection window. Please try again." });
    }
}

function connectGoogle() { startConnection("Google", "startGoogleAuth"); }
function connectTickTick()
{
    startConnection("TickTick", "startTickTickAuth");
}


// ─── Save Article ────────────────────────────────────────────────────────────

async function saveArticle()
{
    if (savePending || capturePending || authPending || notionSelectionPending || document.querySelector("dialog[open]") || (ticktickSelected && ticktickAccess === "checking")) return;
    savePending = true;
    const button = el.saveArticleBtn;
    const controls = [...el.panelSave.querySelectorAll("input, textarea, button")];
    const previouslyDisabled = controls.map(control => control.disabled);
    let saved = false;
    try
    {
        const saveIdentity = await storageGet([STORAGE_KEYS.userId, STORAGE_KEYS.token, STORAGE_KEYS.legacyUserId, STORAGE_KEYS.legacyToken]);
        if (ticktickSelected && ticktickAccess !== "connected") throw new Error("Connect TickTick or deselect it before saving.");
        if (ticktickSelected && !el.projectSelect.value)
        {
            el.projectSearchInput.focus();
            showProjectMenu("");
            throw new Error("Choose a TickTick list before saving, or deselect TickTick.");
        }
        if (notionSelected && !notionUI.hasDestination()) throw new Error("Choose a verified Notion destination or deselect Notion before saving.");
        const payload = {
            title: el.title.value.trim(),
            url: el.url.value.trim(),
            rawText: el.rawText.value.trim(),
            destinations:
            {
                ticktick: ticktickSelected ?
                {
                    enabled: true,
                    projectId: el.projectSelect.value || lastKnownProjectId || null
                } :
                {
                    enabled: false
                },
                notion: notionSelected ?
                {
                    enabled: true,
                    ...notionUI.destination()
                } :
                {
                    enabled: false
                }
            },
            ...(ticktickSelected ?
            {
                ticktickOptions:
                {
                    useAiSummary: Boolean(el.useSummaryAi.checked),
                    useAiTags: Boolean(el.useTagsAi.checked),
                    mergeSummaryWithContent: Boolean(el.mergeSummaryWithContent.checked),
                    tags: getTagsForSave()
                }
            } :
            {}),
            user_input: getTagsForSave().map(tag => `#${tag}`).join(" "),
            use_summaryAi: false,
            use_tagsAi: false,
            use_quiz: false,
            mergeSummaryWithContent: false
        };
        for (const [key, label, limit] of [
                ["title", "Title", 500],
                ["rawText", "Content", 100000]
            ])
        {
            if (!payload[key] || payload[key].length > limit)
            {
                el[key].setAttribute("aria-invalid", "true");
                setCaptureEditor(true, false);
                el[key].focus();
                const message = !payload[key] ? `${label} is required${key === "rawText" ? " by this server, including URL captures" : ""}.` : `${label} must be at most ${limit.toLocaleString()} characters.`;
                const error = document.getElementById(`${key}Error`);
                error.textContent = message;
                error.hidden = false;
                throw new Error(message);
            }
        }
        button.disabled = true;
        setSaveButtonLabel("Saving your capture…");
        button.setAttribute("aria-busy", "true");
        delete button.dataset.state;
        el.refreshPageBtn.disabled = true;
        controls.forEach(control =>
        {
            control.disabled = true;
        });
        hideTagSuggestions();
        hideProjectMenu();
        setStatus("Saving to your knowledge collection…", "loading");
        window.KnowviaV2?.reset();
        const result = await apiFetch("/content",
        {
            method: "POST",
            body: JSON.stringify(payload)
        });
        const currentIdentity = await storageGet([STORAGE_KEYS.userId, STORAGE_KEYS.token, STORAGE_KEYS.legacyUserId, STORAGE_KEYS.legacyToken]);
        if (Object.keys(saveIdentity).some(key => saveIdentity[key] !== currentIdentity[key]))
            throw new Error("Your account changed. Check the previous account for this capture before retrying.");
        if (result?.status !== "success" || !/^[a-f0-9]{24}$/i.test(String(result.data?.content?._id || "")))
            throw new Error("The save could not be confirmed. Check your content before retrying.");
        saved = true;
        setSaveButtonLabel("Capture saved");
        button.dataset.state = "success";
        setStatus("Saved to Knowvia. External copies are confirmed separately below.", "success");
        await syncUI.saved(String(result.data.content._id));
        await storageSet(
        {
            knowvia_capture_draft: null
        });
        el.title.value = "";
        el.url.value = "";
        el.rawText.value = "";
        selectedTags = [];
        renderSelectedTags();
        el.tagInput.value = "";
        updateCapturePreview("READY FOR YOUR NEXT CAPTURE");
        setPreviewImage(null);
        setCaptureEditor(false, false);
        void loadTags();
    }
    catch (error)
    {
        setStatus(error.message, "danger");
        delete button.dataset.state;
        setSaveButtonLabel(defaultSaveLabel());
    }
    finally
    {
        savePending = false;
        controls.forEach((control, index) =>
        {
            control.disabled = previouslyDisabled[index];
        });
        updateSaveAvailability();
        notionUI.setBlocked(authPending);
        button.removeAttribute("aria-busy");
        el.refreshPageBtn.disabled = false;
        if (saved) setTimeout(() =>
        {
            if (!savePending)
            {
                delete button.dataset.state;
                setSaveButtonLabel(defaultSaveLabel());
            }
        }, 2000);
    }
}

// ─── Refresh Page Data ───────────────────────────────────────────────────────

async function refreshPageData()
{
    if (capturePending || savePending) return;
    capturePending = true;
    updateSaveAvailability();
    el.refreshPageBtn.disabled = true;
    el.refreshPageBtn.setAttribute("aria-busy", "true");
    setStatus("Reading your capture…", "loading");
    const showCapture = (title, url, text, source, previewImage = null) => {
        el.title.value = title || "";
        el.url.value = url || "";
        el.rawText.value = text || "";
        updateCapturePreview(source);
        setPreviewImage(previewImage);
        setStatus(text ? "Capture ready. Make any edits before saving." : "Add content or a note to save this page.", text ? "info" : "warning");
    };
    try
    {
        const requestedTab = new URLSearchParams(location.search).get("sourceTab");
        const sourceId = /^\d+$/.test(requestedTab || "") ? Number(requestedTab) : null;
        const tabs = sourceId !== null ? [await chrome.tabs.get(sourceId)] : await chrome.tabs.query({ active: true, currentWindow: true });
        const currentTab = tabs[0];
        const stored = await storageGet([STORAGE_KEYS.contextData]);
        const cached = stored[STORAGE_KEYS.contextData];
        // Preserve the existing capture order: cached selection, clipboard, page.
        if (cached?.text)
        {
            showCapture(cached.title || currentTab?.title, cached.url || currentTab?.url, cached.text, "SELECTED TEXT", cached.previewImage);
            await storageRemove(STORAGE_KEYS.contextData);
            return;
        }
        let clipboardText = "";
        try { clipboardText = await navigator.clipboard.readText(); } catch { /* Clipboard is optional. */ }
        if (clipboardText.trim())
        {
            showCapture(currentTab?.title || "Copied text", currentTab?.url, clipboardText, "FROM YOUR CLIPBOARD");
            return;
        }
        if (!currentTab?.id)
        {
            showCapture("", "", "", "MANUAL CAPTURE");
            return;
        }
        const response = await new Promise(resolve => chrome.tabs.sendMessage(currentTab.id,
            { type: "GET_PAGE_CONTEXT" }, result => resolve(chrome.runtime.lastError ? null : result)));
        if (!response?.ok)
        {
            showCapture(currentTab.title, currentTab.url, "", "MANUAL CAPTURE");
            setStatus("This page cannot be read. Paste text, or refresh the page and recapture.", "warning");
            return;
        }
        const data = response.data;
        showCapture(data.selectedText ? data.title : currentTab.title,
            data.url || currentTab.url, data.selectedText || data.pageText,
            data.selectedText ? "SELECTED TEXT" : "CURRENT PAGE", data.previewImage);
    }
    catch { setStatus("Could not read this page. Paste your content or try Recapture.", "danger"); }
    finally
    {
        capturePending = false;
        updateSaveAvailability();
        el.refreshPageBtn.disabled = false;
        el.refreshPageBtn.removeAttribute("aria-busy");
    }
}

// ─── Load User Preferences ───────────────────────────────────────────────────

async function loadUserPreferences()
{
    if (emailPending || quizPending) return;
    preferencesLoaded = false;
    el.preferencesStatus.hidden = true;
    el.weeklyEmailToggle.disabled = true;
    el.telegramQuizToggle.disabled = true;
    el.saveEmailSettingsBtn.disabled = true;
    try
    {
        const stored = await storageGet(
        [
            STORAGE_KEYS.email,
            STORAGE_KEYS.weeklyEmailToggle,
            STORAGE_KEYS.telegramQuizToggle
        ]);

        if (stored[STORAGE_KEYS.email])
        {
            showCurrentEmail(
                stored[STORAGE_KEYS.email],
                stored[STORAGE_KEYS.weeklyEmailToggle]
            );
        }

        if (
            stored[STORAGE_KEYS.telegramQuizToggle] !== undefined &&
            el.telegramQuizToggle
        )
        {
            el.telegramQuizToggle.checked =
                stored[STORAGE_KEYS.telegramQuizToggle];
        }

        const result = await apiFetch(
            "/User/preferences/me",
            {
                method: "GET"
            }
        );

        if (
            result?.status !== "success" ||
            !result?.data
        )
        {
            throw new Error("Could not load your preferences. Refresh to try again.");
        }

        const
        {
            email,
            weeklyEmailEnabled,
            receiveTelegramQuiz,
            telegramConnected
        } = result.data;

        if (email)
        {
            showCurrentEmail(
                email,
                weeklyEmailEnabled
            );

            await storageSet(
            {
                [STORAGE_KEYS.email]:
                    email,

                [STORAGE_KEYS.weeklyEmailToggle]:
                    weeklyEmailEnabled
            });
        }
        else
        {
            if (el.currentEmailContainer)
            {
                el.currentEmailContainer.style.display =
                    "none";
                el.currentEmailDisplay.textContent = "No email set";
                el.weeklyEmailToggle.checked = false;
            }

            if (el.email)
            {
                el.email.value = "";
            }

            await storageRemove(
            [
                STORAGE_KEYS.email,
                STORAGE_KEYS.weeklyEmailToggle
            ]);
        }

        if (el.telegramQuizToggle)
        {
            el.telegramQuizToggle.checked =
                Boolean(receiveTelegramQuiz);

            await storageSet(
            {
                [STORAGE_KEYS.telegramQuizToggle]:
                    Boolean(receiveTelegramQuiz)
            });
        }

        if (
            el.telegramStatusPill &&
            el.telegramStatusText
        )
        {
            if (telegramConnected)
            {
                el.telegramStatusPill.className =
                    "status-pill status-pill--success";

                el.telegramStatusText.textContent =
                    "Connected";

                if (el.telegramOptions)
                {
                    el.telegramOptions.style.display =
                        "none";
                }
            }
            else
            {
                el.telegramStatusPill.className =
                    "status-pill status-pill--danger";

                el.telegramStatusText.textContent =
                    "Not Connected";

                if (el.telegramOptions)
                {
                    el.telegramOptions.style.display =
                        "block";
                }
            }
        }
        preferencesLoaded = true;
        el.googleStatus.textContent = "Signed in";
        el.googleStatus.className = "status-pill status-pill--success";
        el.weeklyEmailToggle.disabled = false;
        el.telegramQuizToggle.disabled = false;
        el.saveEmailSettingsBtn.disabled = false;
    }
    catch (error)
    {
        if (error.status === 401)
        {
            el.googleStatus.textContent = "Sign in again";
            el.googleStatus.className = "status-pill status-pill--warning";
        }
        el.preferencesStatus.hidden = false;
        el.preferencesStatus.textContent = `${error.message} Use Refresh to retry, or sign in again if your session expired.`;
        el.telegramStatusText.textContent = "Unavailable";
        el.telegramStatusPill.className = "status-pill status-pill--warning";
    }
}


// ─── Email Settings ──────────────────────────────────────────────────────────

async function saveEmailSettings()
{
    if (!preferencesLoaded || emailPending) return;
    emailPending = true;
    el.saveEmailSettingsBtn.disabled = true;
    const previousToggle = (await storageGet([STORAGE_KEYS.weeklyEmailToggle]))[STORAGE_KEYS.weeklyEmailToggle];
    const button =
        el.saveEmailSettingsBtn;

    try
    {
        const enteredEmail =
            el.email?.value.trim();

        const existingEmail =
            el.currentEmailDisplay?.textContent?.trim();

        const emailValue =
            enteredEmail ||
            existingEmail;

        if (!emailValue)
        {
            throw new Error(
                "Please enter an email address."
            );
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue))
        {
            el.email.setAttribute("aria-invalid", "true");
            el.email.focus();
            throw new Error("Enter a valid email address.");
        }

        const isEnabled =
            enteredEmail
                ? true
                : Boolean(
                    el.weeklyEmailToggle?.checked
                );

        if (button)
        {
            button.disabled = true;
            button.textContent = "Saving...";
            button.setAttribute("aria-busy", "true");
        }
        el.weeklyEmailToggle.disabled = true;
        el.email.disabled = true;

        setStatus(
            "Saving email settings...",
            "info"
        );

        await apiFetch(
            "/User/email",
            {
                method: "POST",

                body: JSON.stringify(
                {
                    email: emailValue,
                    weeklyEmailEnabled: isEnabled
                })
            }
        );

        showCurrentEmail(
            emailValue,
            isEnabled
        );

        if (el.email)
        {
            el.email.value = "";
        }

        await storageSet(
        {
            [STORAGE_KEYS.email]:
                emailValue,

            [STORAGE_KEYS.weeklyEmailToggle]:
                isEnabled
        });

        setStatus(
            "Email settings saved.",
            "success"
        );
    }
    catch (error)
    {
        el.weeklyEmailToggle.checked = Boolean(previousToggle);
        setStatus(
            error.message,
            "danger"
        );
    }
    finally
    {
        emailPending = false;
        el.weeklyEmailToggle.disabled = false;
        el.email.disabled = false;
        if (button)
        {
            button.disabled = false;
            button.textContent = "Save";
            button.removeAttribute("aria-busy");
        }
    }
}


// ─── Quiz Preferences ────────────────────────────────────────────────────────

async function saveQuizPreference()
{
    if (!preferencesLoaded || quizPending) return;
    quizPending = true;
    el.telegramQuizToggle.disabled = true;
    try
    {
        const isEnabled =
            Boolean(
                el.telegramQuizToggle?.checked
            );

        setStatus(
            "Saving quiz preferences...",
            "info"
        );

        await apiFetch(
            "/User/quiz-preferences",
            {
                method: "POST",

                body: JSON.stringify(
                {
                    receiveTelegramQuiz:
                        isEnabled
                })
            }
        );

        await storageSet(
        {
            [STORAGE_KEYS.telegramQuizToggle]:
                isEnabled
        });

        setStatus(
            "Quiz preferences saved.",
            "success"
        );
    }
    catch (error)
    {
        setStatus(
            error.message,
            "danger"
        );

        if (el.telegramQuizToggle)
        {
            el.telegramQuizToggle.checked =
                !el.telegramQuizToggle.checked;
        }
    }
    finally { quizPending = false; el.telegramQuizToggle.disabled = false; }
}


// ─── Events ──────────────────────────────────────────────────────────────────

function bindEvents()
{
    const updateScrollState = () => {
        const scroll = el.mainScroll;
        const overflows = scroll.scrollHeight > scroll.clientHeight + 1;
        el.appView.classList.toggle("has-scrolled", scroll.scrollTop > 1);
        el.appView.classList.toggle("has-more-content", overflows && scroll.scrollTop + scroll.clientHeight < scroll.scrollHeight - 1);
        scroll.tabIndex = overflows ? 0 : -1;
        scroll.setAttribute("aria-label", el.appView.classList.contains("settings-active") ? "Settings content" : "Capture content");
    };
    el.mainScroll.addEventListener("scroll", () => {
        updateScrollState();
        if (el.projectMenu.style.display === "block") positionPickerMenu(el.projectMenu, el.projectPickerBtn);
        if (el.tagSuggestions.style.display === "block") positionPickerMenu(el.tagSuggestions, el.tagsInputBox);
    }, { passive: true });
    const scrollObserver = new ResizeObserver(updateScrollState);
    for (const node of [el.mainScroll, el.panelSave, el.panelSettings]) scrollObserver.observe(node);
    updateScrollState();
    renderDestinationSelection();
    let draftTimer;
    for (const input of [el.title, el.url, el.rawText]) input.addEventListener("input", () => {
        clearTimeout(draftTimer);
        const draft = { userId: draftOwnerId, title: el.title.value, url: el.url.value, rawText: el.rawText.value };
        draftTimer = setTimeout(() => {
            void storageGet([STORAGE_KEYS.userId, STORAGE_KEYS.legacyUserId]).then(stored => {
                if (!savePending && draft.userId && draft.userId === (stored[STORAGE_KEYS.userId] || stored[STORAGE_KEYS.legacyUserId]))
                    return storageSet({ knowvia_capture_draft: draft });
            }).catch(() => setStatus("Your edits are available in this popup, but the local draft could not be stored.", "warning"));
        }, 150);
    });
    el.closePopupBtn.addEventListener("click", () => window.close());
    el.editCaptureBtn.addEventListener("click", () => selectCaptureFormat("custom"));
    el.doneEditingBtn.addEventListener("click", () => setCaptureEditor(false));
    el.articleOption.addEventListener("click", () => selectCaptureFormat("article"));
    el.summaryOption.addEventListener("click", () => selectCaptureFormat("summary"));
    el.customOption.addEventListener("click", () => selectCaptureFormat("custom"));
    el.advancedOptionsBtn.addEventListener("click", () => {
        selectCaptureFormat("custom", false);
        el.captureOptionsBtn.setAttribute("aria-expanded", "true");
        el.captureOptions.classList.add("is-open");
        el.captureOptions.inert = false;
        el.captureOptionsBtn.focus();
    });
    document.querySelector('.save-options').addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const formats = ["article", "summary", "custom"];
        const buttons = [el.articleOption, el.summaryOption, el.customOption];
        const current = formats.indexOf(captureFormat);
        const next = event.key === "Home" ? 0 : event.key === "End" ? 2
            : (current + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : 2)) % 3;
        selectCaptureFormat(formats[next], false);
        buttons[next].focus();
    });
    document.addEventListener("keydown", event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s")
        {
            event.preventDefault();
            if (el.appView.classList.contains("settings-active") || document.querySelector("dialog[open]")) return;
            if (!event.repeat && !el.saveArticleBtn.disabled) void saveArticle();
        }
    });
    if (/Mac/.test(navigator.platform || "")) document.getElementById("saveShortcut").textContent = "⌘ S";
    el.previewImage.addEventListener("load", () => {
        el.previewImage.hidden = false;
        el.previewCoverFallback.hidden = true;
    });
    el.previewImage.addEventListener("error", () => {
        el.previewImage.hidden = true;
        el.previewImage.removeAttribute("src");
        el.previewCoverFallback.hidden = false;
    });
    el.connectNotionBtn.addEventListener("click", () => startConnection("Notion", "startNotionAuth"));
    el.reauthGoogleBtn.addEventListener("click", connectGoogle);
    el.refreshConnectionsBtn.addEventListener("click", refreshConnections);
    for (const input of [el.title, el.url, el.rawText]) input.addEventListener("input", () => updateCapturePreview());
    el.url.addEventListener("input", () => setPreviewImage(null));
    el.email.addEventListener("input", () => el.email.removeAttribute("aria-invalid"));
    el.captureOptionsBtn.addEventListener("click", () => {
        const expanded = el.captureOptionsBtn.getAttribute("aria-expanded") !== "true";
        el.captureOptionsBtn.setAttribute("aria-expanded", String(expanded));
        el.captureOptions.classList.toggle("is-open", expanded);
        el.captureOptions.inert = !expanded;
    });
    el.useSummaryAi.addEventListener("change", () => {
        el.mergeSummaryWithContent.disabled = !el.useSummaryAi.checked;
        if (!el.useSummaryAi.checked) el.mergeSummaryWithContent.checked = false;
    });
    for (const input of [el.useSummaryAi, el.useTagsAi, el.useQuiz, el.mergeSummaryWithContent])
        input.addEventListener("change", () => selectCaptureFormat("custom", false));
    el.mergeSummaryWithContent.disabled = !el.useSummaryAi.checked;
    for (const input of [el.title, el.rawText])
    {
        input?.setAttribute("aria-describedby", "statusText");
        input?.addEventListener("input", () => input.removeAttribute("aria-invalid"));
    }
    document.querySelector('[role="tablist"]')?.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const settings = event.key === "End" || (event.key !== "Home" && document.activeElement === el.tabSave);
        switchTab(settings ? "settings" : "save");
        (settings ? el.tabSettings : el.tabSave)?.focus();
    });
    el.connectGoogleBtn?.addEventListener(
        "click",
        connectGoogle
    );

    el.connectTickTickBtn?.addEventListener(
        "click",
        connectTickTick
    );

    el.connectTickTickFromSaveBtn?.addEventListener(
        "click",
        () => {
            if (savePending || authPending) return;
            ticktickSelected = !ticktickSelected;
            renderDestinationSelection();
            if (ticktickSelected && ticktickAccess !== "connected") void connectTickTick();
        }
    );

    el.reconnectTickTickBtn?.addEventListener(
        "click",
        connectTickTick
    );

    el.tabSave?.addEventListener(
        "click",
        () =>
        {
            switchTab("save");
            el.tabSettings.focus();
        }
    );

    el.tabSettings?.addEventListener(
        "click",
        () =>
        {
            switchTab(el.appView.classList.contains("settings-active") ? "save" : "settings");
        }
    );

    el.refreshPageBtn?.addEventListener(
        "click",
        refreshPageData
    );

    el.saveArticleBtn?.addEventListener(
        "click",
        saveArticle
    );

    el.projectPickerBtn?.addEventListener(
        "click",
        (event) =>
        {
            event.stopPropagation();

            if (
                event.target.closest(
                    "#projectPickerToggleBtn"
                )
            )
            {
                return;
            }

            if (
                event.target !==
                el.projectSearchInput
            )
            {
                el.projectSearchInput?.focus();
            }
        }
    );

    el.projectSearchInput?.addEventListener(
        "input",
        handleProjectSearchInput
    );

    el.projectSearchInput?.addEventListener(
        "focus",
        handleProjectSearchFocus
    );

    el.projectSearchInput?.addEventListener(
        "keydown",
        handleProjectSearchKeyDown
    );

    el.projectPickerToggleBtn?.addEventListener(
        "click",
        (event) =>
        {
            event.stopPropagation();
            toggleProjectMenu();
        }
    );

    el.projectMenu?.addEventListener(
        "click",
        (event) =>
        {
            event.stopPropagation();
        }
    );

    el.openCreateProjectBtn?.addEventListener(
        "click",
        (event) =>
        {
            event.stopPropagation();

            if (el.projectCreatePanel?.hidden)
            {
                showProjectCreatePanel();
            }
            else
            {
                hideProjectCreatePanel();
            }
        }
    );

    el.confirmCreateProjectBtn?.addEventListener(
        "click",
        createTickTickProject
    );

    el.cancelCreateProjectBtn?.addEventListener(
        "click",
        () =>
        {
            hideProjectCreatePanel();
        }
    );

    el.projectNameInput?.addEventListener(
        "keydown",
        (event) =>
        {
            if (event.key === "Enter")
            {
                event.preventDefault();
                void createTickTickProject();
            }

            if (event.key === "Escape")
            {
                event.preventDefault();
                hideProjectCreatePanel();
            }
        }
    );

    el.tagsInputBox?.addEventListener(
        "click",
        (event) =>
        {
            event.stopPropagation();

            if (
                event.target.closest(
                    "#tagPickerToggleBtn"
                )
            )
            {
                return;
            }

            hideProjectMenu();
            hideProjectCreatePanel();

            el.tagInput?.focus();

            if (
                el.tagSuggestions?.style.display !==
                "block"
            )
            {
                renderTagSuggestions();
            }
        }
    );

    el.tagPickerToggleBtn?.addEventListener(
        "click",
        (event) =>
        {
            event.stopPropagation();

            const isOpen =
                el.tagSuggestions?.style.display ===
                "block";

            if (isOpen)
            {
                hideTagSuggestions();
                return;
            }

            hideProjectMenu();
            hideProjectCreatePanel();

            el.tagInput?.focus();
            renderTagSuggestions();
        }
    );

    el.tagInput?.addEventListener(
        "input",
        handleTagInput
    );

    el.tagInput?.addEventListener(
        "focus",
        handleTagFocus
    );

    el.tagInput?.addEventListener(
        "keydown",
        handleTagKeyDown
    );

    el.tagSuggestions?.addEventListener(
        "click",
        (event) =>
        {
            event.stopPropagation();
        }
    );

    function isPointerInsideElement(
        event,
        element
    )
    {
        if (
            !element
            || element.hidden
        )
        {
            return false;
        }

        const style =
            window.getComputedStyle(element);

        if (
            style.display === "none"
            || style.visibility === "hidden"
        )
        {
            return false;
        }

        const rect =
            element.getBoundingClientRect();

        return (
            event.clientX >= rect.left
            && event.clientX <= rect.right
            && event.clientY >= rect.top
            && event.clientY <= rect.bottom
        );
    }

    document.addEventListener(
        "pointerdown",
        (event) =>
        {
            const pointerInsideTagsControl =
                isPointerInsideElement(
                    event,
                    el.tagsInputBox
                );

            const pointerInsideTagMenu =
                isPointerInsideElement(
                    event,
                    el.tagSuggestions
                );

            if (
                !pointerInsideTagsControl
                && !pointerInsideTagMenu
            )
            {
                hideTagSuggestions();

                if (
                    document.activeElement ===
                    el.tagInput
                )
                {
                    el.tagInput.blur();
                }
            }

            const pointerInsideProjectControl =
                isPointerInsideElement(
                    event,
                    el.projectPickerBtn
                );

            const pointerInsideProjectMenu =
                isPointerInsideElement(
                    event,
                    el.projectMenu
                );

            const pointerInsideProjectCreatePanel =
                isPointerInsideElement(
                    event,
                    el.projectCreatePanel
                );

            const pointerInsideCreateButton =
                isPointerInsideElement(
                    event,
                    el.openCreateProjectBtn
                );

            if (
                !pointerInsideProjectControl
                && !pointerInsideProjectMenu
                && !pointerInsideProjectCreatePanel
                && !pointerInsideCreateButton
            )
            {
                hideProjectMenu();
                hideProjectCreatePanel();

                if (
                    document.activeElement ===
                    el.projectSearchInput
                )
                {
                    el.projectSearchInput.blur();
                }
            }
        },
        true
    );

    el.copyUserIdBtn?.addEventListener(
        "click",
        copyUserId
    );

    el.saveEmailSettingsBtn?.addEventListener(
        "click",
        saveEmailSettings
    );

    el.weeklyEmailToggle?.addEventListener(
        "change",
        saveEmailSettings
    );

    el.copyTelegramCommandBtn?.addEventListener(
        "click",
        copyTelegramCommand
    );

    el.openTelegramBotBtn?.addEventListener(
        "click",
        openTelegramBot
    );

    el.telegramQuizToggle?.addEventListener(
        "change",
        saveQuizPreference
    );

    el.themeToggleBtn?.addEventListener(
        "click",
        toggleTheme
    );
}


// ─── Bootstrap ───────────────────────────────────────────────────────────────

async function bootstrap()
{
    window.scrollTo(0, 0);
    chrome.action.setBadgeText({ text: "" }).catch(() => {});

    const stored = await storageGet(
    [
        STORAGE_KEYS.userId,
        STORAGE_KEYS.token,
        STORAGE_KEYS.signedIn,
        STORAGE_KEYS.legacyUserId,
        STORAGE_KEYS.legacyToken,
        STORAGE_KEYS.ticktickConnected,
        STORAGE_KEYS.theme,
        STORAGE_KEYS.authUI
    ]);

    const
    {
        userId,
        isSignedIn,
        isTickTickConnected
    } = resolveAuthState(stored);

    draftOwnerId = userId || null;
    const savedTheme =
        stored[STORAGE_KEYS.theme];

    if (savedTheme)
    {
        applyTheme(savedTheme);
    }
    else
    {
        applyTheme("light");
    }

    bindEvents();
    switchTab("save");
    setConnectedUI(
        isSignedIn,
        isTickTickConnected
    );
    fillTelegramCommand(userId || "");
    setStatus(
        isSignedIn
            ? "Loading..."
            : "Ready",
        isSignedIn
            ? "info"
            : "success"
    );


    if (stored[STORAGE_KEYS.authUI]?.status === "pending")
    {
        chrome.runtime.sendMessage({ action: "getConnectionState" }, response => {
            if (chrome.runtime.lastError || !response?.pending)
                renderAuthUI({ provider: stored[STORAGE_KEYS.authUI].provider, status: "error", message: "The connection window closed. You can try again." });
            else renderAuthUI(stored[STORAGE_KEYS.authUI]);
        });
    }
    else if (Date.now() - (stored[STORAGE_KEYS.authUI]?.updatedAt || 0) < 300000)
        renderAuthUI(stored[STORAGE_KEYS.authUI]);

    if (isSignedIn && el.userId)
    {
        setUserIdDisplay(userId);

        const initialTasks =
        [
            refreshPageData(),
            loadUserPreferences(),
            loadTags(),
            loadTickTickProjects(),
            loadNotionStatus(),
            syncUI.restore()
        ];

        await Promise.allSettled(initialTasks);
        const draftStore = await storageGet(["knowvia_capture_draft"]);
        const draft = draftStore.knowvia_capture_draft;
        if (draft?.userId === userId && typeof draft.title === "string" && typeof draft.rawText === "string" && draft.rawText.trim()) {
            el.title.value = draft.title.slice(0, 500); el.url.value = typeof draft.url === "string" ? draft.url : ""; el.rawText.value = draft.rawText.slice(0, 100000);
            updateCapturePreview("MANUAL CAPTURE");
        }

        if (el.statusText?.textContent === "Loading...") setStatus("Ready", "success");
        const connectionUI = stored[STORAGE_KEYS.authUI];
        if (connectionUI && connectionUI.status !== "pending" && Date.now() - connectionUI.updatedAt < 300000)
            renderAuthUI(connectionUI);
    }
}

chrome.storage.onChanged.addListener((changes, areaName) =>
{
    if (areaName !== "local")
    {
        return;
    }

    if (changes[STORAGE_KEYS.authUI]) renderAuthUI(changes[STORAGE_KEYS.authUI].newValue);

    if (changes[STORAGE_KEYS.authUI]?.newValue?.provider === "Notion" &&
        changes[STORAGE_KEYS.authUI].newValue.status === "success")
    {
        void loadNotionStatus();
    }

    const linkedTickTick = changes[STORAGE_KEYS.authUI]?.newValue?.provider === "TickTick" &&
        changes[STORAGE_KEYS.authUI].newValue.status === "success";
    const authKeysChanged =
        linkedTickTick ||
        changes[STORAGE_KEYS.signedIn] ||
        changes[STORAGE_KEYS.userId] ||
        changes[STORAGE_KEYS.token] ||
        changes[STORAGE_KEYS.ticktickConnected] ||
        changes[STORAGE_KEYS.legacyUserId] ||
        changes[STORAGE_KEYS.legacyToken];

    if (!authKeysChanged)
    {
        return;
    }

    storageGet(
    [
        STORAGE_KEYS.signedIn,
        STORAGE_KEYS.userId,
        STORAGE_KEYS.token,
        STORAGE_KEYS.ticktickConnected,
        STORAGE_KEYS.legacyUserId,
        STORAGE_KEYS.legacyToken
    ]).then(async (stored) =>
    {
        const
        {
            userId,
            isSignedIn,
            isTickTickConnected
        } = resolveAuthState(stored);

        if (draftOwnerId && draftOwnerId !== userId) {
            ticktickSelected = false; notionSelected = false;
            syncUI.reset(); notionUI.reset(); selectedTags = []; renderSelectedTags();
        }
        draftOwnerId = userId || null;
        setConnectedUI(
            isSignedIn,
            isTickTickConnected
        );

        if (!isSignedIn)
        {
            return;
        }

        if (!linkedTickTick) switchTab("save");
        fillTelegramCommand(userId);
        setUserIdDisplay(userId);

        const refreshTasks =
        [
            loadUserPreferences(),
            loadTags(),
            loadTickTickProjects(),
            loadNotionStatus(),
            syncUI.restore()
        ];

        if (!linkedTickTick)
        {
            refreshTasks.push(refreshPageData());
        }

        await Promise.allSettled(refreshTasks);

        const latest = await storageGet([STORAGE_KEYS.authUI]);
        if (latest[STORAGE_KEYS.authUI]) renderAuthUI(latest[STORAGE_KEYS.authUI]);
    }).catch((error) =>
    {
        console.error("[OAUTH] Popup refresh failed:", error);
    });
});

// Start with intrinsic 480 × 600 dimensions. Once Chrome has sized the
// action popup, fit its actual height without creating a second outer scrollbar.
// Ignore Chrome's provisional 25px viewport to avoid collapsing the popup.
function fitPopupHeight()
{
    if (window.innerHeight >= 320)
    {
        document.documentElement.style.setProperty(
            "--popup-height", `${Math.min(600, window.innerHeight)}px`
        );
    }
}
window.addEventListener("resize", fitPopupHeight);
requestAnimationFrame(() => requestAnimationFrame(fitPopupHeight));

document.addEventListener(
    "DOMContentLoaded",
    () =>
    {
        bootstrap().catch((error) =>
        {
            setStatus(
                error.message ||
                "Unexpected popup error.",
                "danger"
            );
        });
    }
);
