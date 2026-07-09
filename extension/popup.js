/* =========================================================================
   popup.js — TickTick Extension
   ========================================================================= */

const API_BASE = "http://localhost:3000/api/v1";
const TELEGRAM_BOT_USERNAME = "Tick_review_bot";

const STORAGE_KEYS =
{
    userId: "ticktick_userId",
    token: "ticktick_token",
    connected: "ticktick_connected",

    email: "ticktick_email",
    weeklyEmailToggle: "ticktick_weeklyEmailToggle",
    telegramQuizToggle: "ticktick_telegramQuizToggle",

    theme: "ticktick_theme",
    contextData: "ticktick_context_data",

    projects: "ticktick_projects",
    selectedProjectId: "ticktick_selectedProjectId",

    tags: "ticktick_tags"
};


// ─── DOM References ──────────────────────────────────────────────────────────

const el =
{
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

    projectField: document.getElementById("projectField"),
    projectSelect: document.getElementById("projectSelect"),
    projectPickerBtn: document.getElementById("projectPickerBtn"),
    projectPickerLabel: document.getElementById("projectPickerLabel"),
    projectMenu: document.getElementById("projectMenu"),

    tagsField: document.getElementById("tagsField"),
    tagsInputBox: document.getElementById("tagsInputBox"),
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

let availableTags = [];
let selectedTags = [];
let activeTagSuggestionIndex = -1;


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
        el.themeToggleBtn.innerHTML =
            theme === "dark"
                ? ICONS.sun
                : ICONS.moon;
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

    el.statusBar.textContent = message;
    el.statusBar.className = `status-bar status-bar--${type}`;
}


// ─── Tabs ────────────────────────────────────────────────────────────────────

function switchTab(tab)
{
    const isSave = tab === "save";

    if (el.panelSave)
    {
        el.panelSave.style.display =
            isSave
                ? "flex"
                : "none";
    }

    if (el.panelSettings)
    {
        el.panelSettings.style.display =
            isSave
                ? "none"
                : "flex";
    }

    el.tabSave?.classList.toggle("active", isSave);
    el.tabSettings?.classList.toggle("active", !isSave);

    hideTagSuggestions();
    hideProjectMenu();
}


// ─── Connection UI ───────────────────────────────────────────────────────────

function setConnectedUI(isConnected)
{
    if (el.onboardingView)
    {
        el.onboardingView.style.display =
            isConnected
                ? "none"
                : "flex";
    }

    if (el.appView)
    {
        el.appView.style.display =
            isConnected
                ? "block"
                : "none";
    }

    const text =
        isConnected
            ? "Connected"
            : "Not Connected";

    const className =
        isConnected
            ? "status-pill status-pill--success"
            : "status-pill status-pill--danger";

    const inner =
        `<span class="pill-dot"></span>${text}`;

    if (el.ticktickStatusPill)
    {
        el.ticktickStatusPill.className = className;
        el.ticktickStatusPill.innerHTML = inner;
    }

    if (el.ticktickStatusSecondary)
    {
        el.ticktickStatusSecondary.className = className;
        el.ticktickStatusSecondary.innerHTML = inner;
    }
}


// ─── API Helper ──────────────────────────────────────────────────────────────

async function apiFetch(path, options = {})
{
    const stored = await storageGet(
    [
        STORAGE_KEYS.token
    ]);

    const token = stored[STORAGE_KEYS.token];

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

function hideProjectMenu()
{
    if (!el.projectMenu || !el.projectPickerBtn)
    {
        return;
    }

    el.projectMenu.style.display = "none";
    el.projectPickerBtn.setAttribute("aria-expanded", "false");
    el.projectPickerBtn.classList.remove("open");
}

function showProjectMenu()
{
    if (
        !el.projectMenu ||
        !el.projectPickerBtn ||
        el.projectPickerBtn.disabled
    )
    {
        return;
    }

    el.projectMenu.style.display = "block";
    el.projectPickerBtn.setAttribute("aria-expanded", "true");
    el.projectPickerBtn.classList.add("open");
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
    }
    else
    {
        hideTagSuggestions();
        showProjectMenu();
    }
}

function setSelectedProject(projectId, shouldSave = true)
{
    if (!el.projectSelect)
    {
        return;
    }

    const option =
        Array.from(el.projectSelect.options)
            .find((item) =>
            {
                return item.value === projectId;
            });

    if (!option)
    {
        return;
    }

    el.projectSelect.value = projectId;

    if (el.projectPickerLabel)
    {
        el.projectPickerLabel.textContent =
            option.textContent || "Unnamed Project";
    }

    if (el.projectMenu)
    {
        const items =
            el.projectMenu.querySelectorAll(
                ".picker-option"
            );

        items.forEach((item) =>
        {
            const isSelected =
                item.dataset.projectId === projectId;

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
                projectId
        });
    }

    hideProjectMenu();
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

    el.projectSelect.innerHTML = "";
    el.projectMenu.innerHTML = "";

    if (!Array.isArray(projects) || projects.length === 0)
    {
        const option =
            document.createElement("option");

        option.value = "";
        option.textContent = "No projects found";

        el.projectSelect.appendChild(option);

        if (el.projectPickerLabel)
        {
            el.projectPickerLabel.textContent =
                "No projects found";
        }

        el.projectPickerBtn.disabled = true;
        hideProjectMenu();

        return;
    }

    el.projectPickerBtn.disabled = false;

    const selectedProjectExists =
        projects.some((project) =>
        {
            return project.id === selectedProjectId;
        });

    const finalSelectedProjectId =
        selectedProjectExists
            ? selectedProjectId
            : projects[0].id;

    for (const project of projects)
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

        if (
            Array.isArray(cachedProjects) &&
            cachedProjects.length > 0
        )
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
                    "Loading projects...";
            }

            el.projectPickerBtn.disabled = true;
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
            STORAGE_KEYS.projects
        ]);

        const cachedProjects =
            stored[STORAGE_KEYS.projects];

        if (
            !Array.isArray(cachedProjects) ||
            cachedProjects.length === 0
        )
        {
            if (el.projectPickerLabel)
            {
                el.projectPickerLabel.textContent =
                    "Projects unavailable";
            }

            if (el.projectPickerBtn)
            {
                el.projectPickerBtn.disabled = true;
            }
        }

        setStatus(
            "Failed to load projects.",
            "danger"
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

    activeTagSuggestionIndex = -1;
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

    renderTagSuggestions();
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

    el.tagInput.setAttribute(
        "aria-expanded",
        "true"
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
    renderTagSuggestions();
}

function handleTagFocus()
{
    hideProjectMenu();
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

function fillTelegramCommand(userId)
{
    if (el.telegramCommand)
    {
        el.telegramCommand.textContent =
            userId
                ? `/start ${userId}`
                : "/start";
    }
}

function openTelegramBot()
{
    const userId =
        el.userId?.value?.trim();

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
        el.userId?.value?.trim(),
        event.target || el.copyUserIdBtn
    );
}

async function copyTelegramCommand(event)
{
    await copyToClipboardWithFeedback(
        el.telegramCommand?.textContent?.trim(),
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
    }

    if (el.weeklyEmailToggle)
    {
        el.weeklyEmailToggle.checked =
            Boolean(isEnabled);
    }
}


// ─── Authentication ──────────────────────────────────────────────────────────

async function connectTickTick()
{
    try
    {
        setStatus(
            "Opening TickTick login...",
            "info"
        );

        chrome.runtime.sendMessage(
            {
                action: "startTickTickAuth"
            },
            (response) =>
            {
                if (chrome.runtime.lastError)
                {
                    setStatus(
                        chrome.runtime.lastError.message,
                        "danger"
                    );

                    return;
                }

                if (!response)
                {
                    setStatus(
                        "No response from background.",
                        "danger"
                    );

                    return;
                }

                if (response.error)
                {
                    setStatus(
                        response.error,
                        "danger"
                    );

                    return;
                }

                if (response.started)
                {
                    setStatus(
                        "TickTick login opened.",
                        "success"
                    );
                }
            }
        );
    }
    catch (error)
    {
        setStatus(
            error.message || "Connect failed.",
            "danger"
        );
    }
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
            STORAGE_KEYS.token
        ]);

        const token =
            stored[STORAGE_KEYS.token];

        if (!token)
        {
            throw new Error(
                "Authentication token is missing. Please reconnect TickTick."
            );
        }

        const projectId =
            el.projectSelect?.value || "";

        if (!projectId)
        {
            throw new Error(
                "Please select a TickTick project."
            );
        }

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

            projectId,

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
            throw new Error(
                "Title is required."
            );
        }

        if (!payload.rawText)
        {
            throw new Error(
                "Article text is required."
            );
        }

        if (button)
        {
            button.disabled = true;
            button.textContent = "Saving...";
            button.style.opacity = "0.8";
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
        }

        setStatus(
            "Article saved successfully.",
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
    el.connectTickTickBtn?.addEventListener(
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

    el.tagsInputBox?.addEventListener(
        "click",
        () =>
        {
            el.tagInput?.focus();
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

    document.addEventListener(
        "click",
        (event) =>
        {
            if (
                el.tagsField &&
                !el.tagsField.contains(event.target)
            )
            {
                hideTagSuggestions();
            }

            if (
                el.projectField &&
                !el.projectField.contains(event.target)
            )
            {
                hideProjectMenu();
            }
        }
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
    const stored = await storageGet(
    [
        STORAGE_KEYS.userId,
        STORAGE_KEYS.token,
        STORAGE_KEYS.connected,
        STORAGE_KEYS.theme
    ]);

    const userId =
        stored[STORAGE_KEYS.userId];

    const token =
        stored[STORAGE_KEYS.token];

    const isConnected =
        Boolean(
            stored[STORAGE_KEYS.connected] &&
            userId &&
            token
        );

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
    setConnectedUI(isConnected);
    fillTelegramCommand(userId || "");

    setStatus(
        isConnected
            ? "Loading..."
            : "Ready",
        isConnected
            ? "info"
            : "success"
    );

    if (isConnected && el.userId)
    {
        el.userId.value =
            userId;

        await Promise.allSettled(
        [
            refreshPageData(),
            loadUserPreferences(),
            loadTickTickProjects(),
            loadTags()
        ]);

        setStatus(
            "Ready",
            "success"
        );
    }
}

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