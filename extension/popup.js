/* =========================================================================
   popup.js — Save Knowledge Extension
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
    sun:
    `
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
        >
            <circle cx="12" cy="12" r="5"/>

            <line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/>

            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>

            <line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/>

            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
    `,

    moon:
    `
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
        >
            <path
                d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
            />
        </svg>
    `
};

function applyTheme(theme)
{
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

    el.statusBar.title =
        normalizedMessage;
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

    el.tabSave?.setAttribute(
        "aria-selected",
        String(isSave)
    );

    el.tabSettings?.setAttribute(
        "aria-selected",
        String(!isSave)
    );

    el.tabSave.tabIndex = isSave ? 0 : -1;
    el.tabSettings.tabIndex = isSave ? -1 : 0;

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
}


// ─── API Helper ──────────────────────────────────────────────────────────────

async function apiFetch(path, options = {})
{
    const stored = await storageGet(
    [
        STORAGE_KEYS.token,
        STORAGE_KEYS.legacyToken
    ]);

    const token =
        stored[STORAGE_KEYS.token] ||
        stored[STORAGE_KEYS.legacyToken];

    const response = await fetch(
        `${API_BASE}${path}`,
        {
            ...options,

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
    );

    const contentType =
        response.headers.get("content-type") || "";

    const data =
        contentType.includes("application/json")
            ? await response.json()
            : await response.text();

    if (!response.ok)
    {
        const message =
            typeof data === "object" && data?.message
                ? data.message
                : `Request failed with status ${response.status}`;

        throw new Error(message);
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
        || "Inbox"
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
        "Search or choose a list…";

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
            ".picker-option[data-project-id]:not([hidden])"
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
    el.projectMenu.scrollIntoView({ block: "nearest" });
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

    const destinationName =
        normalizedProjectId
            ? option.textContent || "Unnamed Project"
            : "Inbox";

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
            "Search or choose a list…";

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
    option.textContent = "Inbox";

    el.projectSelect.appendChild(option);

    const button =
        document.createElement("button");

    button.type = "button";
    button.className = "picker-option";
    button.dataset.projectId = "";
    button.setAttribute("role", "option");
    button.tabIndex = -1;

    const icon =
        document.createElement("span");

    icon.className = "picker-option-icon";
    icon.innerHTML =
    `
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 5.75A1.75 1.75 0 0 1 5.75 4h12.5A1.75 1.75 0 0 1 20 5.75v12.5A1.75 1.75 0 0 1 18.25 20H5.75A1.75 1.75 0 0 1 4 18.25V5.75Z"/>
            <path d="M4 14h4l1.5 2h5l1.5-2h4"/>
        </svg>
    `;

    const name =
        document.createElement("span");

    name.className = "picker-option-name";
    name.textContent = "Inbox";

    const check =
        document.createElement("span");

    check.className = "picker-option-check";
    check.textContent = "✓";

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
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3.75 6.75A1.75 1.75 0 0 1 5.5 5h4.18c.46 0 .9.18 1.22.5l1.1 1.1c.33.33.77.52 1.23.52h5.27a1.75 1.75 0 0 1 1.75 1.75v8.63a1.75 1.75 0 0 1-1.75 1.75h-13a1.75 1.75 0 0 1-1.75-1.75V6.75Z"/>
        </svg>
    `;

    const name =
        document.createElement("span");

    name.className = "picker-option-name";
    name.textContent = projectName;

    const check =
        document.createElement("span");

    check.className = "picker-option-check";
    check.textContent = "✓";

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
            "No TickTick lists yet. New articles will be saved to Inbox.";

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
        }

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
        if (button)
        {
            button.disabled = false;
            button.textContent = originalText;
        }

        if (el.projectNameInput)
        {
            el.projectNameInput.disabled = false;
        }
    }
}

async function loadTickTickProjects()
{
    if (
        !el.projectSelect ||
        !el.projectPickerBtn
    )
    {
        return;
    }

    try
    {
        const stored = await storageGet(
        [
            STORAGE_KEYS.projects,
            STORAGE_KEYS.selectedProjectId
        ]);

        const cachedProjects =
            stored[STORAGE_KEYS.projects];

        const selectedProjectId =
            stored[STORAGE_KEYS.selectedProjectId] || "";

        if (Array.isArray(cachedProjects))
        {
            renderProjects(
                cachedProjects,
                selectedProjectId
            );
        }
        else
        {
            if (el.projectPickerLabel)
            {
                el.projectPickerLabel.textContent =
                    "Loading lists...";
            }

            if (el.projectSearchInput)
            {
                el.projectSearchInput.value =
                    "Loading lists...";
            }

            setProjectPickerDisabled(true);
        }

        const result = await apiFetch(
            "/content/projects",
            {
                method: "GET"
            }
        );

        const projects =
            Array.isArray(result?.data)
                ? result.data
                : [];

        await storageSet(
        {
            [STORAGE_KEYS.projects]:
                projects
        });

        renderProjects(
            projects,
            selectedProjectId
        );
    }
    catch (error)
    {
        console.warn(
            "Failed to load TickTick projects:",
            error
        );

        const stored = await storageGet(
        [
            STORAGE_KEYS.projects,
            STORAGE_KEYS.selectedProjectId
        ]);

        const cachedProjects =
            stored[STORAGE_KEYS.projects];

        if (Array.isArray(cachedProjects))
        {
            renderProjects(
                cachedProjects,
                stored[STORAGE_KEYS.selectedProjectId] || ""
            );
        }
        else
        {
            renderProjects([], "");
        }

        setStatus(
            "Could not refresh lists. Showing saved data.",
            "warning"
        );
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
        text.textContent = `#${tag}`;

        const removeButton =
            document.createElement("button");

        removeButton.type = "button";
        removeButton.className = "tag-chip-remove";
        removeButton.textContent = "×";
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
    el.tagSuggestions.scrollIntoView({ block: "nearest" });

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
        console.warn(
            "Failed to load tags:",
            error
        );
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
            button.textContent = "Copied! ✓";
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
    const failed = state?.status === "error";
    const provider = state?.provider || "Google";
    const message = pending
        ? `Continue in the ${provider} window. This popup will reopen when you're done.`
        : failed ? state.message : state?.status === "success" ? `${provider} connected successfully.` : "";

    for (const button of [el.connectGoogleBtn, el.connectTickTickBtn, el.connectTickTickFromSaveBtn, el.reconnectTickTickBtn])
    {
        if (!button) continue;
        button.disabled = pending;
        button.setAttribute("aria-busy", String(pending));
    }
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
    if (message) setStatus(message, failed ? "danger" : pending ? "info" : "success");
}

function startConnection(provider, action)
{
    renderAuthUI({ provider, status: "pending" });
    try
    {
        chrome.runtime.sendMessage({ action }, response =>
        {
            const error = chrome.runtime.lastError?.message || response?.error;
            if (error || !response?.started)
            {
                renderAuthUI({ provider, status: "error", message: error || "Could not open the connection window. Please try again." });
            }
        });
    }
    catch (error)
    {
        renderAuthUI({ provider, status: "error", message: error.message || "Could not open the connection window." });
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
    const button =
        el.saveArticleBtn;

    const originalText =
        button?.textContent || "Save Article";

    try
    {
        const stored = await storageGet(
        [
            STORAGE_KEYS.token,
            STORAGE_KEYS.legacyToken
        ]);

        const token =
            stored[STORAGE_KEYS.token] ||
            stored[STORAGE_KEYS.legacyToken];

        if (!token)
        {
            throw new Error(
                "Authentication token is missing. Please sign in again."
            );
        }

        const projectId =
            el.projectSelect?.value || "";

        const destinationName =
            projectId
                ? el.projectPickerLabel?.textContent?.trim() ||
                    "selected project"
                : "TickTick Inbox";

        const tags =
            getTagsForSave();

        const payload =
        {
            title:
                el.title?.value.trim(),

            url:
                el.url?.value.trim(),

            rawText:
                el.rawText?.value.trim(),

            projectId:
                projectId || null,

            user_input:
                tags
                    .map((tag) => `#${tag}`)
                    .join(" "),

            use_summaryAi:
                Boolean(el.useSummaryAi?.checked),

            use_tagsAi:
                Boolean(el.useTagsAi?.checked),

            use_quiz:
                Boolean(el.useQuiz?.checked),

            mergeSummaryWithContent:
                Boolean(el.mergeSummaryWithContent?.checked)
        };

        if (!payload.title)
        {
            el.title?.setAttribute("aria-invalid", "true");
            el.title?.focus();
            throw new Error(
                "Title is required."
            );
        }

        if (!payload.rawText)
        {
            el.rawText?.setAttribute("aria-invalid", "true");
            el.rawText?.focus();
            throw new Error(
                "Article text is required."
            );
        }

        if (button)
        {
            button.disabled = true;
            button.textContent = "Saving...";
            button.style.opacity = "0.8";
            button.setAttribute(
                "aria-busy",
                "true"
            );
        }

        hideTagSuggestions();
        hideProjectMenu();

        setStatus(
            "Saving article...",
            "info"
        );

        await apiFetch(
            "/content",
            {
                method: "POST",
                body: JSON.stringify(payload)
            }
        );

        if (button)
        {
            button.textContent = "Saved! ✓";
            button.style.backgroundColor = "var(--green)";
            button.style.borderColor = "var(--green)";
            button.style.opacity = "1";
            button.removeAttribute(
                "aria-busy"
            );
        }

        setStatus(
            `Saved to ${destinationName} successfully.`,
            "success"
        );

        if (el.title)
        {
            el.title.value = "";
        }

        if (el.url)
        {
            el.url.value = "";
        }

        if (el.rawText)
        {
            el.rawText.value = "";
        }

        selectedTags = [];
        renderSelectedTags();

        if (el.tagInput)
        {
            el.tagInput.value = "";
        }

        await loadTags();

        setTimeout(() =>
        {
            if (!button)
            {
                return;
            }

            button.disabled = false;
            button.textContent = originalText;
            button.style.backgroundColor = "";
            button.style.borderColor = "";
            button.style.opacity = "1";
        }, 2000);
    }
    catch (error)
    {
        if (button)
        {
            button.disabled = false;
            button.textContent = originalText;
            button.style.opacity = "1";
            button.removeAttribute(
                "aria-busy"
            );
        }

        setStatus(
            error.message,
            "danger"
        );
    }
}


// ─── Refresh Page Data ───────────────────────────────────────────────────────

async function refreshPageData()
{
    try
    {
        const tabs = await new Promise((resolve) =>
        {
            chrome.tabs.query(
                {
                    active: true,
                    currentWindow: true
                },
                resolve
            );
        });

        const currentTab =
            tabs[0];

        const stored = await storageGet(
        [
            STORAGE_KEYS.contextData
        ]);

        const cached =
            stored[STORAGE_KEYS.contextData];

        if (cached?.text)
        {
            if (el.title)
            {
                el.title.value =
                    cached.title ||
                    currentTab?.title ||
                    "";
            }

            if (el.url)
            {
                el.url.value =
                    cached.url ||
                    currentTab?.url ||
                    "";
            }

            if (el.rawText)
            {
                el.rawText.value =
                    cached.text;
            }

            setStatus(
                "Data captured from selection.",
                "success"
            );

            await storageRemove(
                STORAGE_KEYS.contextData
            );

            return;
        }

        let clipboardText = "";

        try
        {
            clipboardText =
                await navigator.clipboard.readText();
        }
        catch
        {
            clipboardText = "";
        }

        if (clipboardText.trim())
        {
            if (el.title)
            {
                el.title.value =
                    currentTab?.title ||
                    "Copied Text";
            }

            if (el.url)
            {
                el.url.value =
                    currentTab?.url ||
                    "";
            }

            if (el.rawText)
            {
                el.rawText.value =
                    clipboardText;
            }

            setStatus(
                "Data loaded from clipboard.",
                "success"
            );

            return;
        }

        if (!currentTab?.id)
        {
            return;
        }

        chrome.tabs.sendMessage(
            currentTab.id,
            {
                type: "GET_PAGE_CONTEXT"
            },
            (response) =>
            {
                if (chrome.runtime.lastError)
                {
                    if (el.title)
                    {
                        el.title.value =
                            currentTab?.title || "";
                    }

                    if (el.url)
                    {
                        el.url.value =
                            currentTab?.url || "";
                    }

                    setStatus(
                        "Refresh the page to read its content.",
                        "warning"
                    );

                    return;
                }

                if (response?.ok)
                {
                    if (el.title)
                    {
                        el.title.value =
                            response.data.selectedText
                                ? response.data.title
                                : currentTab.title || "";
                    }

                    if (el.url)
                    {
                        el.url.value =
                            response.data.url ||
                            currentTab.url ||
                            "";
                    }

                    if (el.rawText)
                    {
                        el.rawText.value =
                            response.data.selectedText ||
                            response.data.pageText ||
                            "";
                    }

                    setStatus(
                        "Page content loaded.",
                        "success"
                    );
                }
            }
        );
    }
    catch
    {
        setStatus(
            "Failed to load page data.",
            "danger"
        );
    }
}


// ─── Load User Preferences ───────────────────────────────────────────────────

async function loadUserPreferences()
{
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
            return;
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
    }
    catch (error)
    {
        console.warn(
            "Failed to load user preferences:",
            error
        );
    }
}


// ─── Email Settings ──────────────────────────────────────────────────────────

async function saveEmailSettings()
{
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
        }

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
        setStatus(
            error.message,
            "danger"
        );
    }
    finally
    {
        if (button)
        {
            button.disabled = false;
            button.textContent = "Save";
        }
    }
}


// ─── Quiz Preferences ────────────────────────────────────────────────────────

async function saveQuizPreference()
{
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
}


// ─── Events ──────────────────────────────────────────────────────────────────

function bindEvents()
{
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
        connectTickTick
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
        }
    );

    el.tabSettings?.addEventListener(
        "click",
        () =>
        {
            switchTab("settings");
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

    const savedTheme =
        stored[STORAGE_KEYS.theme];

    if (savedTheme)
    {
        applyTheme(savedTheme);
    }
    else
    {
        const preferredTheme =
            window.matchMedia(
                "(prefers-color-scheme: dark)"
            ).matches
                ? "dark"
                : "light";

        applyTheme(preferredTheme);
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
            loadTags()
        ];

        if (isTickTickConnected)
        {
            initialTasks.push(loadTickTickProjects());
        }
        else
        {
            renderProjects([], "");
        }

        await Promise.allSettled(initialTasks);

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

        setConnectedUI(
            isSignedIn,
            isTickTickConnected
        );

        if (!isSignedIn)
        {
            return;
        }

        switchTab("save");
        fillTelegramCommand(userId);
        setUserIdDisplay(userId);

        const refreshTasks =
        [
            refreshPageData(),
            loadUserPreferences(),
            loadTags()
        ];

        if (isTickTickConnected)
        {
            refreshTasks.push(loadTickTickProjects());
        }
        else
        {
            renderProjects([], "");
        }

        await Promise.allSettled(refreshTasks);

        const latest = await storageGet([STORAGE_KEYS.authUI]);
        if (latest[STORAGE_KEYS.authUI]) renderAuthUI(latest[STORAGE_KEYS.authUI]);
    }).catch((error) =>
    {
        console.error("[OAUTH] Popup refresh failed:", error);
    });
});

// Start with intrinsic 400 × 600 dimensions. Once Chrome has sized the
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
