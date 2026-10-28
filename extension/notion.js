/* Notion UI for the existing popup. Application JWTs stay in apiFetch; provider
   credentials never enter the extension. All persisted data here is display-only. */
(() =>
{
    const DISPLAY_KEY = "knowvia_notion_destination_display";
    const id = value => typeof value === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value) ? value.toLowerCase() : null;
    const kind = type => type === "data_source" ? "Data source" : "Page";
    const safeUrl = value =>
    {
        try
        {
            const url = new URL(value);
            return typeof value === "string" && value.length <= 2000 && url.protocol === "https:" && !url.username && !url.password && !url.port &&
                /(^|\.)(notion\.so|notion\.site|notion\.com)$/.test(url.hostname) ? url.href : null;
        }
        catch
        {
            return null;
        }
    };
    const icon = name =>
    {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");
        const use = document.createElementNS(svg.namespaceURI, "use");
        use.setAttribute("href", `#icon-${name}`);
        svg.append(use);
        return svg;
    };

    const create = deps =>
    {
        const el = Object.fromEntries(["notionDestination", "notionCaptureHint", "notionStatus", "notionConnectionHint", "connectNotionBtn",
            "notionDefaultRow", "notionDefaultName", "manageNotionDestinationBtn", "notionCapabilityNote", "notionDestinationDialog", "notionSearchInput", "notionResultsCaption", "notionResultsScroll",
            "notionDestinationResults", "notionDestinationState", "notionDestinationStateTitle", "notionDestinationStateText", "notionDestinationError",
            "refreshNotionDestinationsBtn", "retryNotionDestinationsBtn", "loadMoreNotionDestinationsBtn", "clearNotionDestinationBtn",
            "cancelNotionDestinationBtn", "confirmNotionDestinationBtn", "closeNotionDialogBtn"
        ].map(key => [key, document.getElementById(key)]));
        let owner = null;
        let refreshVersion = 0;
        let searchVersion = 0;
        let access = "checking";
        let workspaceName = "";
        let selectionReady = false;
        let selectionError = "";
        let destination = null;
        let choices = [];
        let draft = null;
        let nextCursor = null;
        let loading = false;
        let mutation = false;
        let mutationVersion = 0;
        let authBlocked = false;
        let searchController;
        let searchTimer;
        let opener;
        const known = new Map();
        const same = (a, b) => Boolean(a && b && a.id === b.id && a.type === b.type);
        const blocked = () => authBlocked || deps.isBlocked();
        const current = async identity =>
        {
            const now = await deps.getOwner();
            return Boolean(identity?.isSignedIn && now.isSignedIn && now.userId === identity.userId && now.session === identity.session);
        };
        const request = async (path, options = {}, identity = owner) =>
        {
            if (!await current(identity)) throw Object.assign(new Error("Your account changed. Reopen the popup to continue."),
            {
                code: "SESSION_CHANGED"
            });
            const result = await deps.apiFetch(path, options);
            if (!await current(identity)) throw Object.assign(new Error("Your account changed. Reopen the popup to continue."),
            {
                code: "SESSION_CHANGED"
            });
            return result;
        };
        const normalize = value =>
        {
            if (!id(value?.id) || !["page", "data_source"].includes(value.type)) return null;
            return {
                id: id(value.id),
                type: value.type,
                title: typeof value.title === "string" ? value.title.trim().slice(0, 500) : "",
                url: safeUrl(value.url)
            };
        };
        const label = value => value?.title || (value ? `${kind(value.type)} selected` : "Choose a destination");
        const busyButton = (button, busy) =>
        {
            button.disabled = busy;
            if (busy) button.setAttribute("aria-busy", "true");
            else button.removeAttribute("aria-busy");
        };
        const errorText = error =>
        {
            const messages = {
                NOTION_RECONNECT_REQUIRED: "Reconnect Notion to restore access to your workspace.",
                NOTION_NOT_CONNECTED: "Connect Notion before choosing a destination.",
                NOTION_REFRESH_UNAVAILABLE: "Notion is reconnecting. Try again shortly, or reconnect from Settings.",
                NOTION_PERMISSION_DENIED: "Check that this page or database is shared with Knowvia and allows new content.",
                NOTION_RESOURCE_NOT_FOUND: "This destination is no longer available. Share it with Knowvia or choose another.",
                NOTION_SCHEMA_INVALID: "This data source needs a title field. Choose another destination or update it in Notion.",
                NOTION_CONNECTION_CHANGED: "Your Notion connection changed. Refresh and choose the destination again.",
                NOTION_RATE_LIMITED: "Notion needs a moment. Wait before trying again.",
                NOTION_PROVIDER_UNAVAILABLE: "Notion is temporarily unavailable. Your Knowvia copy is safe.",
                NOTION_LINK_UNAVAILABLE: "Notion is not available on the server yet. Your Knowvia copy is safe.",
                NOTION_DESTINATION_REQUIRED: "Choose a default Notion destination first.",
                NOTION_INVALID_RESPONSE: "The Notion response could not be confirmed. Refresh before trying again."
            };
            return messages[error.code] || error.message || "Something went wrong. Try again.";
        };
        const render = () =>
        {
            const connected = access === "connected";
            const selected = connected && selectionReady && destination;
            const reconnect = access === "reconnect";
            const checking = access === "checking";
            el.notionDestination.disabled = checking || mutation || blocked();
            el.notionDestination.classList.toggle("selected", Boolean(deps.isSelected()));
            el.notionDestination.classList.toggle("needs-attention", connected && !selectionReady || access === "error" || reconnect);
            el.notionDestination.setAttribute("aria-label", selected ? `Notion destination: ${label(destination)}. Change destination.` :
                connected ? "Choose a Notion destination" : reconnect ? "Reconnect Notion" : "Connect Notion");
            el.notionCaptureHint.textContent = checking ? "Checking connection…" : selected ? label(destination) :
                connected ? selectionReady ? "Choose a destination" : "Check destination" : reconnect ? "Reconnect workspace" :
                access === "error" ? "Check connection" : "Connect your workspace";
            el.notionDestination.setAttribute("aria-pressed", String(deps.isSelected()));
            el.notionCaptureHint.textContent = deps.isSelected() ? selected ? label(destination) : "Choose destination" : connected ? "Not selected" : el.notionCaptureHint.textContent;
            el.notionDestination.setAttribute("aria-label", deps.isSelected() ? "Disable Notion for this capture" : "Enable Notion for this capture");
            document.getElementById("notionSaveConfig").hidden = false;
            document.getElementById("notionSaveDestinationName").textContent = selected ? label(destination) : "Choose a destination";
            const workspace = document.getElementById("notionWorkspace");
            if (workspace) workspace.value = connected ? workspaceName || "Connected workspace" : checking ? "Checking…" : "Not connected";
            document.getElementById("chooseNotionSaveDestinationBtn").disabled = checking || mutation || blocked();
            el.notionCaptureHint.title = el.notionCaptureHint.textContent;
            el.notionDefaultRow.hidden = !connected;
            el.notionDefaultName.textContent = selectionReady ? label(destination) : "Destination unavailable";
            el.manageNotionDestinationBtn.textContent = destination ? "Change" : "Choose";
            el.manageNotionDestinationBtn.disabled = mutation || blocked();
            el.notionCapabilityNote.textContent = selectionError || (selected ? "This default is used only when you enable Notion for a capture." :
                connected ? "Choose a default, then enable Notion for the captures you want to send." : "Connect a workspace, then choose where your captures go.");
            el.confirmNotionDestinationBtn.disabled = !draft || mutation || blocked();
            el.confirmNotionDestinationBtn.textContent = mutation ? "Updating…" : same(draft, destination) ? "Done" : "Use destination";
            el.clearNotionDestinationBtn.hidden = !destination;
            for (const button of [el.clearNotionDestinationBtn, el.cancelNotionDestinationBtn, el.closeNotionDialogBtn]) button.disabled = mutation;
            el.notionSearchInput.disabled = mutation;
            el.refreshNotionDestinationsBtn.disabled = mutation || loading;
            el.loadMoreNotionDestinationsBtn.disabled = mutation || loading;
            el.notionDestinationResults.setAttribute("aria-busy", String(loading));
            deps.onChange?.();
        };
        const rememberDisplay = async () =>
        {
            if (destination && owner)
            {
                try
                {
                    await deps.writeLocal(DISPLAY_KEY,
                    {
                        userId: owner.userId,
                        ...destination
                    });
                }
                catch
                {
                    /* Optional display cache. */
                }
            }
        };
        const updateKnown = entries =>
        {
            for (const entry of entries) known.set(`${entry.type}:${entry.id}`, entry);
            if (destination) destination = known.get(`${destination.type}:${destination.id}`) || destination;
        };
        const renderResults = () =>
        {
            el.notionDestinationResults.replaceChildren();
            for (const value of choices)
            {
                const row = document.createElement("button");
                row.type = "button";
                row.className = "notion-result";
                row.dataset.destinationId = value.id;
                row.setAttribute("role", "option");
                row.setAttribute("aria-selected", String(same(value, draft)));
                row.tabIndex = same(value, draft) || (!draft && value === choices[0]) ? 0 : -1;
                row.disabled = mutation;
                const mark = document.createElement("span");
                mark.className = "notion-result-icon";
                mark.append(icon(value.type === "page" ? "document" : "data-source"));
                const copy = document.createElement("span");
                copy.className = "notion-result-copy";
                const title = document.createElement("strong");
                title.dir = "auto";
                title.textContent = value.title || `Untitled ${kind(value.type).toLowerCase()}`;
                title.title = title.textContent;
                const type = document.createElement("span");
                type.textContent = `${kind(value.type)}${same(value, destination) ? " · Current default" : ""}`;
                copy.append(title, type);
                const check = document.createElement("span");
                check.className = "notion-result-check";
                check.append(icon("check"));
                row.append(mark, copy, check);
                row.addEventListener("click", () =>
                {
                    draft = value;
                    for (const item of el.notionDestinationResults.children)
                    {
                        const selected = item === row;
                        item.setAttribute("aria-selected", String(selected));
                        item.tabIndex = selected ? 0 : -1;
                    }
                    render();
                });
                el.notionDestinationResults.append(row);
            }
        };
        const loadDestinations = async (
        {
            append = false
        } = {}) =>
        {
            if (!owner || mutation || append && (!nextCursor || loading)) return;
            clearTimeout(searchTimer);
            searchController?.abort();
            searchController = new AbortController();
            const run = ++searchVersion;
            const previousLength = choices.length;
            const identity = owner;
            loading = true;
            el.notionDestinationError.hidden = true;
            el.notionDestinationState.hidden = true;
            el.loadMoreNotionDestinationsBtn.hidden = true;
            if (!append)
            {
                choices = [];
                nextCursor = null;
                el.notionResultsScroll.scrollTop = 0;
                el.notionDestinationResults.replaceChildren();
                for (let i = 0; i < 4; i++)
                {
                    const skeleton = document.createElement("div");
                    skeleton.className = "destination-skeleton";
                    skeleton.setAttribute("aria-hidden", "true");
                    el.notionDestinationResults.append(skeleton);
                }
            }
            el.notionResultsCaption.textContent = append ? "Loading more destinations…" : "Finding shared pages and data sources…";
            render();
            const params = new URLSearchParams();
            const query = el.notionSearchInput.value.trim();
            if (query) params.set("query", query);
            if (append) params.set("cursor", nextCursor);
            try
            {
                const result = await request(`/integrations/notion/destinations${params.size ? `?${params}` : ""}`,
                {
                    method: "GET",
                    signal: searchController.signal,
                    timeoutMs: 15000
                }, identity);
                if (run !== searchVersion) return;
                const data = result.data;
                if (!Array.isArray(data?.destinations) || data.destinations.length > 50 || typeof data.hasMore !== "boolean" ||
                    data.hasMore && !id(data.nextCursor)) throw new Error("Destinations could not be read. Refresh to try again.");
                const entries = data.destinations.map(normalize).filter(Boolean);
                if (entries.length !== data.destinations.length) throw new Error("Destinations could not be read. Refresh to try again.");
                updateKnown(entries);
                choices = [...new Map([...(append ? choices : []), ...entries].map(value => [`${value.type}:${value.id}`, value])).values()];
                nextCursor = data.hasMore ? id(data.nextCursor) : null;
                renderResults();
                if (append && choices.length > previousLength)
                {
                    const firstNew = el.notionDestinationResults.children[previousLength];
                    firstNew?.focus(
                    {
                        preventScroll: true
                    });
                    firstNew?.scrollIntoView(
                    {
                        block: "nearest"
                    });
                }
                el.notionResultsCaption.textContent = `${choices.length} destination${choices.length === 1 ? "" : "s"}${query ? " found" : " shared with Knowvia"}`;
                el.loadMoreNotionDestinationsBtn.hidden = !nextCursor;
                el.notionDestinationState.hidden = choices.length > 0;
                el.notionDestinationStateTitle.textContent = "No destinations found";
                el.notionDestinationStateText.textContent = query ? "Try a different title, or share a page with Knowvia in Notion." :
                    "Share a page or database with Knowvia in Notion, then refresh this list.";
                el.retryNotionDestinationsBtn.hidden = false;
                el.retryNotionDestinationsBtn.textContent = "Refresh destinations";
                await rememberDisplay();
            }
            catch (error)
            {
                if (run !== searchVersion || error.code === "REQUEST_ABORTED" || error.code === "SESSION_CHANGED") return;
                renderResults();
                el.notionResultsCaption.textContent = append ? "Your loaded destinations are still available." : "Destinations unavailable";
                if (!choices.length)
                {
                    el.notionDestinationState.hidden = false;
                    el.notionDestinationStateTitle.textContent = "Couldn't load destinations";
                    el.notionDestinationStateText.textContent = errorText(error);
                    el.retryNotionDestinationsBtn.hidden = false;
                    el.retryNotionDestinationsBtn.textContent = "Try again";
                }
                else
                {
                    el.notionDestinationError.hidden = false;
                    el.notionDestinationError.textContent = errorText(error);
                    el.loadMoreNotionDestinationsBtn.hidden = !nextCursor;
                }
            }
            finally
            {
                if (run === searchVersion)
                {
                    loading = false;
                    render();
                }
            }
        };
        const closeDialog = () =>
        {
            if (mutation) return;
            el.notionDestinationDialog.close();
        };
        const open = async trigger =>
        {
            if (blocked() || mutation) return;
            if (access === "disconnected" || access === "reconnect")
            {
                deps.connect();
                return;
            }
            if (access !== "connected")
            {
                await refresh();
                if (access === "disconnected" || access === "reconnect")
                {
                    deps.connect();
                    return;
                }
                if (!owner || access === "checking") return;
            }
            opener = trigger || document.activeElement;
            draft = destination;
            el.notionSearchInput.value = "";
            el.notionDestinationError.hidden = true;
            if (!el.notionDestinationDialog.open) el.notionDestinationDialog.showModal();
            el.notionSearchInput.focus();
            render();
            void loadDestinations();
        };
        const mutate = async clear =>
        {
            if (mutation || blocked() || !clear && !draft) return;
            if (!clear && same(draft, destination))
            {
                closeDialog();
                return;
            }
            const identity = owner;
            const operation = ++mutationVersion;
            mutation = true;
            deps.onMutation(true);
            el.notionDestinationError.hidden = true;
            busyButton(clear ? el.clearNotionDestinationBtn : el.confirmNotionDestinationBtn, true);
            render();
            try
            {
                const result = await request("/integrations/notion/destination",
                {
                    method: clear ? "DELETE" : "PUT",
                    timeoutMs: 15000,
                    ...(clear ?
                    {} :
                    {
                        body: JSON.stringify(
                        {
                            destinationId: draft.id,
                            destinationType: draft.type
                        })
                    })
                }, identity);
                const value = clear ? null : normalize(result.data?.destination);
                if (clear ? result.data?.destination !== null : !value) throw new Error("The destination change could not be confirmed. Refresh to check it.");
                destination = value;
                selectionReady = true;
                if (value) updateKnown([value]);
                await rememberDisplay();
                mutation = false;
                closeDialog();
                deps.notify(clear ? "Notion default cleared. Choose a destination before sending another capture to Notion." :
                    `Default destination: ${label(destination)}. Enable Notion to send a capture.`, "success", clear ? "Notion default cleared" : "Notion destination updated");
            }
            catch (error)
            {
                if (error.code !== "SESSION_CHANGED")
                {
                    el.notionDestinationError.textContent = errorText(error);
                    el.notionDestinationError.hidden = false;
                }
            }
            finally
            {
                if (operation === mutationVersion)
                {
                    mutation = false;
                    deps.onMutation(false);
                    busyButton(el.clearNotionDestinationBtn, false);
                    busyButton(el.confirmNotionDestinationBtn, false);
                    render();
                }
            }
        };
        const refresh = async () =>
        {
            const run = ++refreshVersion;
            const identity = await deps.getOwner();
            if (run !== refreshVersion) return;
            if (!identity.isSignedIn)
            {
                reset();
                return;
            }
            if (owner && (owner.userId !== identity.userId || owner.session !== identity.session))
            {
                reset();
                return refresh();
            }
            owner = identity;
            if (el.notionDestinationDialog.open && !mutation) closeDialog();
            access = "checking";
            selectionReady = false;
            selectionError = "";
            render();
            el.notionStatus.textContent = "Checking…";
            el.notionStatus.className = "status-pill status-pill--loading";
            try
            {
                const result = await request("/integrations/notion/status",
                {
                    method: "GET",
                    cache: "no-store",
                    timeoutMs: 15000
                }, identity);
                if (run !== refreshVersion) return;
                const status = result.data;
                if (typeof status?.connected !== "boolean" || typeof status.reconnectRequired !== "boolean") throw new Error("Could not verify Notion. Refresh to try again.");
                access = status.reconnectRequired ? "reconnect" : status.connected ? "connected" : "disconnected";
                workspaceName = typeof status.workspaceName === "string" ? status.workspaceName : "";
                el.notionStatus.textContent = status.reconnectRequired ? "Reconnect required" : status.connected ? "Connected" : "Not connected";
                el.notionStatus.className = `status-pill status-pill--${access === "connected" ? "success" : access === "reconnect" ? "warning" : "neutral"}`;
                el.notionConnectionHint.textContent = access === "connected" ? (typeof status.workspaceName === "string" && status.workspaceName || "Workspace connected") :
                    access === "reconnect" ? "Authorize Notion again to restore your connection." : "Connect your Notion workspace to your account.";
                el.connectNotionBtn.textContent = access === "connected" || access === "reconnect" ? "Reconnect" : "Connect";
                el.connectNotionBtn.setAttribute("aria-label", `${el.connectNotionBtn.textContent} Notion`);
                if (access === "connected")
                {
                    try
                    {
                        const selection = await request("/integrations/notion/destination",
                        {
                            method: "GET",
                            cache: "no-store",
                            timeoutMs: 15000
                        }, identity);
                        if (run !== refreshVersion) return;
                        destination = selection.data?.destination === null ? null : normalize(selection.data?.destination);
                        if (selection.data?.destination !== null && !destination) throw new Error("The default destination could not be read.");
                        selectionReady = true;
                        const cached = await deps.readLocal(DISPLAY_KEY);
                        if (run !== refreshVersion) return;
                        if (cached?.userId === identity.userId && same(cached, destination)) updateKnown([normalize(cached)]);
                        // This read supplies display titles only; it never chooses a default.
                        if (destination && !destination.title)
                        {
                            try
                            {
                                const list = await request("/integrations/notion/destinations",
                                {
                                    method: "GET",
                                    timeoutMs: 15000
                                }, identity);
                                if (run !== refreshVersion) return;
                                if (Array.isArray(list.data?.destinations)) updateKnown(list.data.destinations.map(normalize).filter(Boolean));
                            }
                            catch
                            {
                                /* A selected pointer stays honest even if display-title discovery is unavailable. */
                            }
                        }
                    }
                    catch (error)
                    {
                        if (run !== refreshVersion || error.code === "SESSION_CHANGED") return;
                        destination = null;
                        selectionReady = false;
                        selectionError = errorText(error);
                    }
                }
                else
                {
                    destination = null;
                    selectionReady = true;
                }

            }
            catch (error)
            {
                if (run !== refreshVersion || error.code === "SESSION_CHANGED") return;
                access = "error";
                destination = null;
                el.notionStatus.textContent = "Unavailable";
                el.notionStatus.className = "status-pill status-pill--warning";
                el.notionConnectionHint.textContent = errorText(error);
                el.connectNotionBtn.textContent = "Connect";
            }
            finally
            {
                if (run === refreshVersion) render();
            }
        };

        function reset()
        {
            refreshVersion++;
            searchVersion++;
            mutationVersion++;
            searchController?.abort();
            clearTimeout(searchTimer);
            owner = null;
            destination = null;
            selectionReady = false;
            selectionError = "";
            access = "disconnected";
            workspaceName = "";
            mutation = false;
            loading = false;
            deps.onMutation(false);
            known.clear();
            if (el.notionDestinationDialog.open) el.notionDestinationDialog.close();
            render();
        }
        el.notionDestination.addEventListener("click", () =>
        {
            if (blocked()) return;
            deps.toggleSelected();
            render();
            if (deps.isSelected() && !(access === "connected" && selectionReady && destination)) void open(el.notionDestination);
        });
        document.getElementById("chooseNotionSaveDestinationBtn").addEventListener("click", event => void open(event.currentTarget));
        el.manageNotionDestinationBtn.addEventListener("click", () => void open(el.manageNotionDestinationBtn));
        el.closeNotionDialogBtn.addEventListener("click", closeDialog);
        el.cancelNotionDestinationBtn.addEventListener("click", closeDialog);
        el.notionDestinationDialog.addEventListener("cancel", event =>
        {
            if (mutation) event.preventDefault();
        });
        el.notionDestinationDialog.addEventListener("keydown", event =>
        {
            if (event.key !== "Tab") return;
            const controls = [...el.notionDestinationDialog.querySelectorAll("button:not(:disabled), input:not(:disabled), [tabindex='0']")]
                .filter(node => node.getClientRects().length && !node.closest("[hidden]"));
            const first = controls[0],
                last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first)
            {
                event.preventDefault();
                last?.focus();
            }
            else if (!event.shiftKey && document.activeElement === last)
            {
                event.preventDefault();
                first?.focus();
            }
        });
        el.notionDestinationDialog.addEventListener("close", () =>
        {
            searchVersion++;
            searchController?.abort();
            clearTimeout(searchTimer);
            if (opener?.isConnected && opener.getClientRects().length) opener.focus();
        });
        el.notionDestinationDialog.addEventListener("click", event =>
        {
            if (event.target !== el.notionDestinationDialog) return;
            const box = el.notionDestinationDialog.getBoundingClientRect();
            if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeDialog();
        });
        el.notionSearchInput.addEventListener("input", () =>
        {
            searchController?.abort();
            searchVersion++;
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => void loadDestinations(), 250);
        });
        el.notionSearchInput.addEventListener("keydown", event =>
        {
            if (event.key === "ArrowDown")
            {
                event.preventDefault();
                el.notionDestinationResults.querySelector("button")?.focus();
            }
            if (event.key === "Enter")
            {
                event.preventDefault();
                void loadDestinations();
            }
        });
        el.notionDestinationResults.addEventListener("keydown", event =>
        {
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const rows = [...el.notionDestinationResults.querySelectorAll("button")];
            if (!rows.length) return;
            const index = rows.indexOf(document.activeElement);
            const next = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 :
                (index + (event.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length;
            rows[next].click();
            rows[next].focus();
            rows[next].scrollIntoView(
            {
                block: "nearest"
            });
        });
        el.refreshNotionDestinationsBtn.addEventListener("click", () => void loadDestinations());
        el.retryNotionDestinationsBtn.addEventListener("click", () => void loadDestinations());
        el.loadMoreNotionDestinationsBtn.addEventListener("click", () => void loadDestinations(
        {
            append: true
        }));
        el.confirmNotionDestinationBtn.addEventListener("click", () => void mutate(false));
        el.clearNotionDestinationBtn.addEventListener("click", () => void mutate(true));
        // Provider receipts now use the shared read-only synchronization panel.

        render();
        return {
            refresh,
            reset,
            destination: () => destination ?
            {
                destinationId: destination.id,
                destinationType: destination.type
            } :
            {},
            hasDestination: () => access === "connected" && selectionReady && Boolean(destination),
            isDialogOpen: () => el.notionDestinationDialog.open,
            setBlocked: value =>
            {
                authBlocked = value;
                render();
            }
        };
    };
    globalThis.KnowviaNotion = Object.freeze(
    {
        create
    });
})();
