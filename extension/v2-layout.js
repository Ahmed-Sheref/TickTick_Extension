/* Approved V2 composition, using existing controls and API handlers. No demo data. */
(() =>
{
    const byId = id => document.getElementById(id);
    const make = (tag, className, html = "") =>
    {
        const node = document.createElement(tag);
        node.className = className;
        node.innerHTML = html;
        return node;
    };
    const panel = byId("panelSave");
    panel.classList.add("v2-capture");
    const intro = make("div", "v2-intro", '<h1 id="captureHeading">Save your content</h1><p>Add or adjust the details, then choose where to save.</p>');
    const composition = make("div", "v2-composition");
    panel.prepend(composition);
    const editor = make("div", "v2-editor");
    composition.append(editor);
    composition.before(intro);
    editor.append(byId("captureEditor"));
    const destinations = make("section", "v2-destinations", '<div class="v2-dest-heading"><div><h2>Save to destinations</h2></div><button id="managePlatformsBtn" class="btn btn-secondary btn-sm" type="button" aria-haspopup="dialog" aria-controls="platformVisibilityDialog"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-settings"/></svg>Manage platforms</button></div>');
    const list = make("div", "v2-destination-list");
    list.id = "destinationRows";
    destinations.append(list);
    panel.append(destinations);
    for (const [provider, tile] of [
            ["notion", "notionDestination"],
            ["ticktick", "connectTickTickFromSaveBtn"]
        ])
    {
        const row = make("article", "v2-destination-row");
        row.dataset.provider = provider;
        const reorder = make("div", "v2-reorder", `<span draggable="true" class="drag-handle" aria-hidden="true" title="Drag to reorder"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01" stroke-width="3"/></svg></span><button type="button" data-move="-1" aria-label="Move ${provider} up"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6"/></svg></button><button type="button" data-move="1" aria-label="Move ${provider} down"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14m-6-6 6 6 6-6"/></svg></button>`);
        row.append(reorder, byId(tile));
        const configuration = make("div", "v2-provider-config");
        configuration.id = `${provider}Configuration`;
        if (provider === "notion")
        {
            const fields = byId("notionSaveConfig");
            const choose = byId("chooseNotionSaveDestinationBtn");
            const name = byId("notionSaveDestinationName");
            fields.className = "v2-inline-fields";
            fields.replaceChildren();
            const workspace = make("div", "v2-field", '<label for="notionWorkspace">Workspace</label><input id="notionWorkspace" class="v2-static-field" value="Not connected" readonly aria-describedby="notionFieldsHelp"/>');
            const destination = make("div", "v2-field", '<label id="notionInlineDestinationLabel">Page / database</label>');
            choose.className = "v2-select-button";
            choose.setAttribute("aria-labelledby", "notionInlineDestinationLabel notionSaveDestinationName");
            choose.setAttribute("aria-haspopup", "dialog");
            choose.setAttribute("aria-controls", "notionDestinationDialog");
            choose.replaceChildren(name);
            choose.insertAdjacentHTML("beforeend", '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-chevron-down"/></svg>');
            const error = make("p", "v2-field-error");
            error.id = "notionSelectionError";
            error.hidden = true;
            error.setAttribute("role", "status");
            choose.setAttribute("aria-describedby", error.id);
            destination.append(choose, error);
            fields.append(workspace, destination, make("div", "v2-field", '<label for="notionPageType">Page type</label><input id="notionPageType" class="v2-static-field" value="Standard page" readonly aria-describedby="notionFieldsHelp"/>'));
            configuration.append(fields, make("p", "sr-only", 'Workspace is set by your Notion connection. The server creates standard pages; custom page types are not supported.'));
            configuration.lastChild.id = "notionFieldsHelp";
        }
        else
        {
            const fields = make("div", "v2-inline-fields");
            byId("projectFieldLabel").firstElementChild.textContent = "List";
            fields.append(byId("projectField"));
            for (const [key, label] of [
                    ["dueDate", "Due date"],
                    ["priority", "Priority"]
                ])
                fields.append(make("div", "v2-field", `<label for="ticktick${key}">${label}</label><select id="ticktick${key}" disabled aria-describedby="ticktickFieldsHelp"><option>Unavailable</option></select>`));
            configuration.append(fields, make("p", "v2-capability-note", 'Due dates and priorities are not supported by this server.'));
            configuration.lastChild.id = "ticktickFieldsHelp";
            configuration.lastChild.className = "sr-only";
            for (const field of fields.querySelectorAll("select:disabled")) field.title = "This server does not support saving due dates or priorities.";
            // Preserve restored draft options without exposing the retired AI controls.
            for (const id of ["useSummaryAi", "useTagsAi"])
            {
                const input = document.createElement("input");
                input.type = "checkbox";
                input.id = id;
                input.hidden = true;
                editor.append(input);
            }
            const identity = make("div", "v2-provider-identity");
            const toggle = row.querySelector(".destination-card");
            toggle.before(identity);
            identity.append(toggle);
            const tagField = byId("tagsField");
            configuration.append(tagField);
        }
        if (provider === "notion")
        {
            configuration.append(make("div", "provider-tags", '<label for="notionTagInput">Notion tags</label><div id="notionTagChips"></div><input id="notionTagInput" placeholder="Add Notion tag" maxlength="60" aria-label="Notion manual tags"/>'));
            const imageOptions = make("div", "notion-image-options", '<label class="image-inclusion"><input type="checkbox" id="includeNotionImages" checked/> Include images</label>');
            imageOptions.id = "notionImageOptions";
            imageOptions.hidden = true;
            configuration.append(imageOptions);
        }
        row.append(configuration);
        list.append(row);
    }
    destinations.append(list);
    panel.prepend(intro, composition, destinations);
    const projectFeedback = make("p", "v2-field-error");
    projectFeedback.id = "projectLoadError";
    projectFeedback.hidden = true;
    projectFeedback.setAttribute("role", "status");
    const retryProjects = make("button", "text-button", "Retry loading lists");
    retryProjects.id = "retryProjectsBtn";
    retryProjects.type = "button";
    retryProjects.hidden = true;
    retryProjects.addEventListener("click", () => void loadTickTickProjects());
    byId("projectField").append(projectFeedback, retryProjects);
    byId("destinationHeading").closest("section").remove();
    byId("captureEditor").hidden = false;
    byId("rawText").previousElementSibling.querySelector("label").textContent = "Summary / description";
    byId("rawText").setAttribute("aria-describedby", "rawTextError");
    byId("title").setAttribute("aria-describedby", "titleError");
    for (const field of ["title", "rawText"])
    {
        const error = make("p", "v2-field-error");
        error.id = `${field}Error`;
        error.hidden = true;
        error.setAttribute("role", "alert");
        byId(field).after(error);
    }
    const source = make("details", "v2-source", '<summary>Source · <bdi id="sourceHost">Add URL</bdi></summary>');
    const url = byId("url");
    source.append(url.previousElementSibling, url);
    source.addEventListener("toggle", () => { if (source.open) url.focus(); });
    const sourceRow = make("div", "source-edit-row");
    sourceRow.append(source);
    const extras = make("div", "capture-extras");
    extras.append(sourceRow, byId("imageAttachments"));
    byId("captureEditor").append(extras);
    const refreshSource = () =>
    {
        try
        {
            byId("sourceHost").textContent = new URL(url.value).hostname;
        }
        catch
        {
            byId("sourceHost").textContent = url.value ? "Review URL" : "Add URL";
        }
    };
    url.addEventListener("input", refreshSource);

    refreshSource();
    for (const brand of document.querySelectorAll(".brand-lockup"))
    {
        brand.replaceChildren();
        const logo = document.createElement("img");
        logo.src = "assets/knowvia-approved-wordmark.png";
        logo.alt = "Knowvia";
        logo.className = "v2-wordmark";
        logo.classList.add("logo-light");
        const darkLogo = logo.cloneNode();
        darkLogo.src = "assets/knowvia-wordmark-dark.svg";
        darkLogo.classList.remove("logo-light");
        darkLogo.classList.add("logo-dark");
        brand.append(logo, darkLogo);
    }
    // Native dialog gives the approved overlay a focus trap, Escape and inert backdrop.
    const dialog = make("dialog", "v2-platform-dialog", '<header><div><span class="v2-eyebrow">KNOWVIA SETTINGS</span><h2 id="platformDialogTitle">Your platforms</h2></div><button id="closePlatformsBtn" class="icon-button" aria-label="Close platform settings" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-close"/></svg></button></header><p id="platformDialogDescription">Decide what appears on your save page. You can bring a platform back any time.</p><section class="v2-platform-options"><div class="v2-options-heading"><strong>Show on save page</strong><span id="visiblePlatformCount">2 of 2 visible</span></div><div id="platformOptions"></div><p class="v2-platform-hint">Hiding a platform removes it from the main form, not your account. To temporarily skip saving to a visible platform, use its switch on the save page.</p></section><footer><button id="resetPlatformsBtn" class="btn btn-secondary btn-sm" type="button">Reset defaults</button><button id="donePlatformsBtn" class="btn btn-primary" type="button">Done</button></footer>');
    dialog.id = "platformVisibilityDialog";
    dialog.setAttribute("aria-labelledby", "platformDialogTitle");
    dialog.setAttribute("aria-describedby", "platformDialogDescription");
    document.body.append(dialog);
    for (const [provider, label, inputId, description] of [
            ["notion", "Notion", "showNotionPlatform", "Knowledge pages and notes"],
            ["ticktick", "TickTick", "showTicktickPlatform", "Tasks and reminders"]
        ])
        byId("platformOptions").append(make("label", "v2-platform-option", `<span class="platform-logo ${provider}-logo"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-${provider}"/></svg></span><span class="v2-platform-copy"><strong>${label}</strong><small>${description}</small></span><input id="${inputId}" aria-label="Show ${label} on save page" type="checkbox" checked/><span class="v2-visibility-switch" aria-hidden="true"></span>`));
    const settings = make("article", "settings-card v2-platform-settings", '<h3>Your platforms</h3><p>Choose what appears on your save page. Your connections stay available.</p>');
    settings.id = "platformVisibilitySettings";
    byId("panelSettings").append(settings);
    const platformControls = dialog.querySelector(".v2-platform-options");
    const resetControl = byId("resetPlatformsBtn");
    settings.append(platformControls, resetControl);
    dialog.addEventListener("close", () => settings.append(platformControls, resetControl));
    byId("appFooter").append(byId("syncReceipt"));
    const previous = make("details", "previous-save", '<summary>Previous save · check status</summary>');
    previous.id = "previousSave";
    previous.hidden = true;
    panel.append(previous);
    byId("preferencesStatus").remove();
    byId("panelSettings").querySelector(".settings-card--account").append(make("p", "inline-feedback"));
    const preferencesStatus = byId("panelSettings").querySelector(".settings-card--account .inline-feedback");
    preferencesStatus.id = "preferencesStatus";
    preferencesStatus.hidden = true;
    preferencesStatus.setAttribute("role", "status");
    let notionTags = [];
    const renderNotionTags = () =>
    {
        const chips = byId("notionTagChips");
        chips.replaceChildren();
        for (const tag of notionTags)
        {
            const chip = make("button", "tag-chip");
            chip.type = "button";
            chip.textContent = `${tag} ×`;
            chip.setAttribute("aria-label", `Remove Notion tag ${tag}`);
            chip.addEventListener("click", () =>
            {
                notionTags = notionTags.filter(value => value !== tag);
                renderNotionTags();
                byId("notionTagInput").dispatchEvent(new Event("input", { bubbles: true }));
            });
            chips.append(chip);
        }
    };
    window.KnowviaProviderTags = {
        // Save also includes text that has not yet been committed with Enter.
        get: () => [...new Set([...notionTags, byId("notionTagInput").value.trim().toLowerCase().replace(/[\s\-_\.]/g, "")].filter(Boolean))],
        restore: tags =>
        {
            notionTags = [...new Set(tags.filter(value => typeof value === "string").map(value => value.toLowerCase().replace(/[\s\-_\.]/g, "")).filter(Boolean))].slice(0,30);
            byId("notionTagInput").value = "";
            renderNotionTags();
        }
    };
    byId("notionTagInput").addEventListener("keydown", event =>
    {
        if (event.key !== "Enter") return;
        event.preventDefault();
        const value = event.target.value.trim();
        if (!value || notionTags.length >= 30) return;
        window.KnowviaProviderTags.restore([...notionTags, value]);
        event.target.value = "";
        event.target.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const tagsValue = document.querySelector(".tags-picker-value");
    const addTag = make("button", "v2-add-tag", "Add");
    addTag.type = "button";
    addTag.id = "addTagBtn";
    addTag.setAttribute("aria-controls", "tagInput");
    addTag.setAttribute("aria-expanded", "false");
    const tagsHeading = make("div", "tags-heading");
    const tagsLabel = byId("tagsFieldLabel");
    tagsLabel.before(tagsHeading);
    const tagEntry = make("div", "tag-entry");
    tagEntry.append(byId("tagInput"), addTag);
    tagsHeading.append(tagsLabel, tagEntry);
    const titleCount = make("span", "v2-title-count");
    titleCount.id = "titleCount";
    const titleWrap = make("div", "v2-title-wrap");
    byId("title").before(titleWrap);
    titleWrap.append(byId("title"), titleCount);
    const refresh = () =>
    {
        refreshSource();
        window.KnowviaImages?.refresh(notionSelected);
        byId("retryProjectsBtn").hidden = !ticktickSelected || ticktickAccess !== "error";
        byId("retryProjectsBtn").disabled = projectsPending;
        const count = Number(ticktickSelected) + Number(notionSelected);
        titleCount.textContent = `${byId("title").value.length}/500`;
        if (byId("statusBar").classList.contains("status-bar--info"))
        {
            byId("statusText").textContent = count ? `${count} destination${count === 1 ? "" : "s"} selected` : "Knowvia collection only";
        }
    };
    window.KnowviaV2 = { refresh, sync: refresh, reset: refresh };
    document.addEventListener("DOMContentLoaded", async () =>
    {
        const defaults = () => (
        {
            order: ["notion", "ticktick"],
            visible:
            {
                notion: true,
                ticktick: true
            }
        });
        let preferences = defaults();
        const owner = await chrome.storage.local.get(["sk_userId", "ticktick_userId"]);
        let key = `knowvia_platform_layout_${owner.sk_userId || owner.ticktick_userId || "guest"}`;
        const stored = (await chrome.storage.local.get([key]))[key];
        if (stored?.order?.length === 2 && new Set(stored.order).size === 2 && stored.order.every(value => ["notion", "ticktick"].includes(value)))
            preferences = {
                order: stored.order,
                visible:
                {
                    notion: stored.visible?.notion !== false,
                    ticktick: stored.visible?.ticktick !== false
                }
            };
        const rows = Object.fromEntries([...list.children].map(row => [row.dataset.provider, row]));
        const update = () =>
        {
            for (const [index, provider] of preferences.order.entries())
            {
                const row = rows[provider];
                row.hidden = !preferences.visible[provider];
                row.querySelector('[data-move="-1"]').disabled = index === 0;
                row.querySelector('[data-move="1"]').disabled = index === preferences.order.length - 1;
                list.append(row);
            }
            byId("showNotionPlatform").checked = preferences.visible.notion;
            byId("showTicktickPlatform").checked = preferences.visible.ticktick;
            byId("visiblePlatformCount").textContent = `${Number(preferences.visible.notion) + Number(preferences.visible.ticktick)} of 2 visible`;
            if (!preferences.visible.ticktick) ticktickSelected = false;
            if (!preferences.visible.notion) notionSelected = false;
            renderDestinationSelection();
                notionUI.setBlocked(authPending);
        };
        const platformError = make("p", "v2-field-error");
        platformError.hidden = true;
        platformError.setAttribute("role", "status");
        platformControls.append(platformError);
        const persist = () => chrome.storage.local.set(
        {
            [key]: preferences
        }).then(() => { platformError.hidden = true; }).catch(() =>
        {
            platformError.textContent = "Could not store platform preferences. Change an option to retry.";
            platformError.hidden = false;
        });
        const move = (provider, offset) =>
        {
            const current = preferences.order.indexOf(provider),
                next = current + offset;
            if (next < 0 || next >= 2 || savePending) return;
            [preferences.order[current], preferences.order[next]] = [preferences.order[next], preferences.order[current]];
            update();
            void persist();
            rows[provider].querySelector(`[data-move="${-offset}"]`).focus();
        };
        let dragging = null;
        for (const [provider, row] of Object.entries(rows))
        {
            row.querySelectorAll("[data-move]").forEach(button => button.addEventListener("click", () => move(provider, Number(button.dataset.move))));
            row.addEventListener("dragstart", event =>
            {
                if (savePending)
                {
                    event.preventDefault();
                    return;
                }
                dragging = provider;
                row.classList.add("is-dragging");
                event.dataTransfer.setData("text/plain", provider);
            });
            row.addEventListener("dragover", event =>
            {
                if (dragging)
                {
                    event.preventDefault();
                    row.classList.add("drag-over");
                }
            });
            row.addEventListener("drop", event =>
            {
                event.preventDefault();
                if (dragging && dragging !== provider) move(dragging, preferences.order.indexOf(provider) - preferences.order.indexOf(dragging));
                dragging = null;
            });
            row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
            row.addEventListener("dragend", () =>
            {
                dragging = null;
                Object.values(rows).forEach(item => item.classList.remove("drag-over", "is-dragging"));
            });
        }
        for (const [provider, id] of [
                ["notion", "showNotionPlatform"],
                ["ticktick", "showTicktickPlatform"]
            ])
            byId(id).addEventListener("change", () =>
            {
                if (savePending)
                {
                    update();
                    return;
                }
                preferences.visible[provider] = byId(id).checked;
                update();
                void persist();
            });
        byId("resetPlatformsBtn").addEventListener("click", () =>
        {
            if (savePending) return;
            preferences = defaults();
            update();
            void persist();
        });
        let platformOpener;
        for (const id of ["managePlatformsBtn"])
            byId(id).addEventListener("click", event =>
            {
                if (savePending) return;
                platformOpener = event.currentTarget;
                hideProjectMenu();
                hideTagSuggestions();
                dialog.insertBefore(platformControls, dialog.querySelector("footer"));
                dialog.querySelector("footer").prepend(resetControl);
                dialog.showModal();
            });
        for (const id of ["closePlatformsBtn", "donePlatformsBtn"]) byId(id).addEventListener("click", () => dialog.close());
        dialog.addEventListener("close", () => platformOpener?.focus());
        dialog.addEventListener("click", event =>
        {
            if (event.target === dialog)
            {
                const bounds = dialog.getBoundingClientRect();
                if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
            }
        });
        addTag.addEventListener("click", () =>
        {
            if (byId("tagInput").value.trim())
                byId("tagInput").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
            tagsValue.classList.add("is-editing");
            addTag.setAttribute("aria-expanded", "true");
            byId("tagInput").focus();
        });
        byId("tagInput").addEventListener("blur", () =>
        {
            if (!byId("tagInput").value.trim())
            {
                tagsValue.classList.remove("is-editing");
                addTag.setAttribute("aria-expanded", "false");
            }
        });
        for (const id of ["title", "rawText", "url"]) byId(id).addEventListener("input", () =>
        {
            byId(`${id}Error`)?.setAttribute("hidden", "");
            byId(id).removeAttribute("aria-invalid");
            window.KnowviaV2.reset();
        });
        chrome.storage.onChanged.addListener(async (changes, area) =>
        {
            if (area !== "local" || !changes.sk_userId) return;
            const nextKey = `knowvia_platform_layout_${changes.sk_userId.newValue || "guest"}`;
            if (nextKey === key) return;
            key = nextKey;
            const next = (await chrome.storage.local.get([key]))[key];
            preferences = defaults();
            if (next?.order?.length === 2 && new Set(next.order).size === 2 && next.order.every(value => ["notion", "ticktick"].includes(value)))
                preferences = {
                    order: next.order,
                    visible:
                    {
                        notion: next.visible?.notion !== false,
                        ticktick: next.visible?.ticktick !== false
                    }
                };
            update();
        });
        update();

    });
})();
