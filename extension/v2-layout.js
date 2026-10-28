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
    const intro = make("div", "v2-intro", '<h1>Save to platforms</h1><p>Review your content and choose where to save it.</p>');
    const composition = make("div", "v2-composition");
    panel.prepend(composition);
    const editor = make("div", "v2-editor");
    composition.append(editor);
    editor.append(intro, byId("captureEditor"));
    const metadata = make("div", "v2-metadata");
    const attachments = make("section", "v2-attachments", '<h2>Attached images</h2><button class="v2-upload" type="button" disabled aria-describedby="attachmentSupport"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/></svg><span><strong>Add images</strong><small>For your note or task</small></span><span class="v2-upload-plus" aria-hidden="true">+</span></button><p id="attachmentSupport">Uploads unavailable: this server does not accept attachments.</p>');
    metadata.append(attachments, byId("tagsField"));
    editor.append(metadata);
    const preview = byId("articlePreview");
    preview.prepend(make("div", "v2-preview-head", '<strong>Article preview</strong><span id="previewContentType">Web article</span>'));
    const previewTags = make("div", "v2-preview-tags");
    previewTags.id = "previewTags";
    preview.append(previewTags);
    composition.append(editor, preview);
    const destinations = make("section", "v2-destinations", '<div class="v2-dest-heading"><div><h2>Save to destinations</h2><p>Choose where to send a copy. Drag to reorder, or use the arrows.</p></div><button id="managePlatformsBtn" class="btn btn-secondary btn-sm" type="button" aria-haspopup="dialog" aria-controls="platformVisibilityDialog"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-settings"/></svg>Manage platforms</button></div>');
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
            destination.append(choose);
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
            const ai = make("details", "v2-ticktick-ai", '<summary>TickTick task content / AI</summary><p>These options affect only the TickTick copy.</p>');
            for (const id of ["useSummaryAi", "useTagsAi", "mergeSummaryWithContent"]) ai.append(byId(id).closest("label"));
            const identity = make("div", "v2-provider-identity");
            const toggle = row.querySelector(".destination-card");
            toggle.before(identity);
            identity.append(toggle, ai);
        }
        row.append(configuration);
        list.append(row);
    }
    destinations.append(list);
    panel.prepend(composition, destinations);
    byId("destinationHeading").closest("section").hidden = true;
    byId("destinationHeading").closest("section").setAttribute("aria-hidden", "true");
    byId("saveOptionsHeading").closest("section").hidden = true;
    const quiz = byId("useQuiz").closest("label");
    const inclusion = make("div", "v2-inclusion");
    inclusion.append(quiz);
    inclusion.hidden = true;
    editor.append(inclusion);
    byId("captureOptionsBtn").hidden = true;
    byId("captureOptions").hidden = true;
    byId("doneEditingBtn").hidden = true;
    byId("editCaptureBtn").hidden = true;
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
    const source = make("details", "v2-source", '<summary>Source · <bdi id="sourceHost">Add URL</bdi><span> Edit</span></summary>');
    const url = byId("url");
    source.append(url.previousElementSibling, url);
    preview.append(source);
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
        brand.append(logo);
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
    const settings = make("article", "settings-card v2-platform-settings", '<h3>Your platforms</h3><p>Choose what appears on your save page. Your connections stay available.</p><button id="settingsManagePlatformsBtn" class="btn btn-secondary btn-sm" type="button" aria-haspopup="dialog" aria-controls="platformVisibilityDialog">Manage platforms</button>');
    settings.id = "platformVisibilitySettings";
    byId("panelSettings").append(settings);
    const progress = make("div", "v2-save-progress", '<progress id="destinationProgress" value="0" max="1" aria-label="Confirmed destinations"></progress><span id="destinationProgressCount">—</span>');
    byId("appFooter").append(progress);
    const tagsValue = document.querySelector(".tags-picker-value");
    const addTag = make("button", "v2-add-tag", "+ Add tag");
    addTag.type = "button";
    addTag.id = "addTagBtn";
    addTag.setAttribute("aria-controls", "tagInput");
    addTag.setAttribute("aria-expanded", "false");
    tagsValue.append(addTag);
    const titleCount = make("span", "v2-title-count");
    titleCount.id = "titleCount";
    const titleWrap = make("div", "v2-title-wrap");
    byId("title").before(titleWrap);
    titleWrap.append(byId("title"), titleCount);
    let syncData = null;
    const refresh = () =>
    {
        refreshSource();
        const count = Number(ticktickSelected) + Number(notionSelected);
        titleCount.textContent = `${byId("title").value.length}/500`;
        byId("previewContentType").textContent = /^https?:\/\//.test(byId("url").value) ? "Web article" : "Note";
        if (byId("statusBar").classList.contains("status-bar--info"))
        {
            byId("statusTitle").textContent = "Ready to save";
            byId("statusText").textContent = count ? `${count} destination${count === 1 ? "" : "s"} selected` : "Knowvia collection only";
        }
        const states = syncData ? [syncData.ticktick, syncData.notion].filter(value => value && value.status !== "not_requested") : [];
        const confirmed = states.filter(value => value.status === "synced").length;
        const total = syncData ? states.length : count;
        byId("destinationProgress").max = Math.max(1, total);
        byId("destinationProgress").value = confirmed;
        byId("destinationProgressCount").textContent = total ? `${confirmed}/${total}` : "—";
        progress.title = syncData ? "Confirmed external destinations for the last saved capture" : "Destinations selected for this capture";
        byId("destinationProgress").setAttribute("aria-label", progress.title);
    };
    window.KnowviaV2 = {
        refresh,
        sync: data =>
        {
            syncData = data;
            refresh();
        },
        reset: () =>
        {
            syncData = null;
            refresh();
        }
    };
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
            document.querySelector(".v2-ticktick-ai").hidden = !ticktickSelected;
            notionUI.setBlocked(authPending);
        };
        const persist = () => chrome.storage.local.set(
        {
            [key]: preferences
        }).catch(() => setStatus("Could not store platform preferences. Try again.", "warning"));
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
        for (const id of ["managePlatformsBtn", "settingsManagePlatformsBtn"])
            byId(id).addEventListener("click", event =>
            {
                if (savePending) return;
                platformOpener = event.currentTarget;
                hideProjectMenu();
                hideTagSuggestions();
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
        const renderPreview = () =>
        {
            previewTags.replaceChildren();
            for (const chip of byId("selectedTagsContainer").children)
            {
                const tag = document.createElement("span");
                tag.className = "v2-preview-tag";
                tag.textContent = chip.querySelector(".tag-chip-label")?.textContent || chip.firstChild?.textContent || "";
                previewTags.append(tag);
            }
            document.querySelector(".v2-ticktick-ai").hidden = !ticktickSelected;
        };
        new MutationObserver(renderPreview).observe(byId("selectedTagsContainer"),
        {
            childList: true,
            subtree: true
        });
        byId("connectTickTickFromSaveBtn").addEventListener("click", renderPreview);
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
        renderPreview();
    });
})();
