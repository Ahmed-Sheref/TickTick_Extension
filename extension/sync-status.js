/* Read-only polling never starts a provider write. Explicit retries use the
   backend's persisted intent and claims, not current popup destination toggles. */
(() =>
{
    const KEY = "knowvia_last_sync";
    const labels = {
        not_requested: "Not requested",
        queued: "Queued",
        pending: "In progress",
        synced: "Synchronized",
        failed: "Failed",
        partial: "Partly saved",
        uncertain: "Needs review",
        unknown: "Checking status"
    };
    const safeNotion = KnowviaProviderLinks.notion;
    globalThis.KnowviaSync = {
        create(deps)
        {
            const section = document.getElementById("syncReceipt");
            const previous = document.getElementById("previousSave");
            const footer = document.getElementById("appFooter");
            const detail = document.getElementById("syncReceiptDetail");
            section.querySelector(".primary-save-result").textContent = "Knowvia ✓";
            const refresh = document.getElementById("refreshSyncStatusBtn");
            const heading = document.createElement("strong");
            heading.id = "syncProgressHeading";
            heading.setAttribute("role", "status");
            section.prepend(heading);
            const openTickTick = document.createElement("button");
            openTickTick.type = "button";
            openTickTick.id = "openConfirmedTickTickBtn";
            openTickTick.className = "text-button";
            openTickTick.textContent = "Open TickTick";
            openTickTick.title = "Open the TickTick app. A verified direct task link is unavailable.";
            const actions = document.createElement("details");
            actions.id = "savedContentActions";
            const actionSummary = document.createElement("summary");
            actionSummary.textContent = "View saved content";
            const actionLinks = document.createElement("div");
            actionLinks.setAttribute("aria-label", "Saved destinations");
            actionLinks.append(document.getElementById("openConfirmedNotionBtn"), openTickTick);
            actions.append(actionSummary, actionLinks);
            section.append(actions);
            actions.addEventListener("keydown", event =>
            {
                if (event.key !== "Escape") return;
                event.preventDefault();
                actions.open = false;
                actionSummary.focus();
            });
            document.addEventListener("click", event =>
            {
                if (actions.open && !actions.contains(event.target)) actions.open = false;
            });
            let receipt = null,
                timer = null,
                busy = false,
                epoch = 0,
                polls = 0;
            const cooldown = {
                ticktick: 0,
                notion: 0
            };
            const current = async identity =>
            {
                const owner = await deps.getOwner();
                return owner.isSignedIn && identity?.userId === owner.userId && identity.session === owner.session;
            };
            let statusUnavailable = false;
            let historical = false;
            let notice = "";
            const cooldownTimers = new Set();
            const requested = state => state?.requested === true && state.status !== "not_requested";
            const retryable = state => requested(state) && state.retryable === true && ["failed", "partial"].includes(state.status);
            const asPrevious = () =>
            {
                if (!receipt || historical) return;
                epoch++;
                clearTimeout(timer);
                busy = false;
                historical = true;
                actions.open = false;
                previous.hidden = false;
                previous.open = false;
                previous.append(section);
                render();
            };
            const render = () =>
            {
                section.hidden = !receipt;
                refresh.disabled = busy;
                refresh.textContent = busy ? "Checking…" : "Check status";
                const states = [receipt?.data?.ticktick, receipt?.data?.notion].filter(requested);
                const active = states.some(state => ["queued", "pending"].includes(state.status));
                const attention = states.some(state => ["failed", "partial", "uncertain"].includes(state.status));
                const complete = receipt?.data && states.every(state => state.status === "synced");
                heading.textContent = statusUnavailable ? "Saved · check sync status" : active ? "Syncing selected destinations…" : attention ? "Saved · some copies need attention" : complete ? "Saved successfully" : "Saved · checking copies…";
                section.dataset.progress = statusUnavailable ? "unknown" : active ? "pending" : attention ? "attention" : "complete";
                openTickTick.hidden = !KnowviaProviderLinks.ticktick(receipt?.data?.ticktick);
                refresh.hidden = !statusUnavailable && states.every(state => state.status === "synced" || state === receipt?.data?.ticktick && retryable(state));
                detail.hidden = !notice && !states.some(state => state.status === "uncertain");
                for (const provider of ["ticktick", "notion"])
                {
                    const state = receipt?.data?.[provider];
                    const row = document.getElementById(`${provider}SyncRow`);
                    const text = document.getElementById(`${provider}SyncState`);
                    const retry = document.getElementById(`${provider}SyncRetry`);
                    row.hidden = !requested(state);
                    row.dataset.state = state?.status || "unknown";
                    text.textContent = state ? labels[state.status] || "Status unavailable" : "";
                    if (["queued", "pending"].includes(state?.status)) text.textContent = provider === "ticktick" ? "TickTick · Saving…" : "Notion · Saving…";
                    if (state?.status === "synced") text.textContent = provider === "ticktick" ? "TickTick ✓" : "Notion ✓";
                    if (requested(state) && (state.status === "uncertain" || statusUnavailable && state.status === "unknown"))
                        text.textContent = busy ? "Checking status…" : "Couldn't confirm status";
                    else if (state?.status === "failed") text.textContent = "Couldn't save";
                    if (provider === "notion")
                    {
                        if (state?.imageStatus === "expired") text.textContent = state.textStatus === "synced" ? "Text saved · source images expired" : "Source images expired";
                        else if (state?.imageStatus === "failed") text.textContent = state.textStatus === "synced" ? "Text saved · images need attention" : "Images need attention";
                        else if (state?.imageStatus === "pending" && state?.textStatus === "synced") text.textContent = "Text saved · sending images…";
                        else if (state?.imageStatus === "uncertain") text.textContent = state.textStatus === "synced" ? "Text saved · image status unconfirmed" : "Image status unconfirmed";
                    }
                    row.firstElementChild.hidden = text.textContent.includes(provider === "ticktick" ? "TickTick" : "Notion");
                    retry.hidden = !retryable(state) || statusUnavailable;
                    retry.disabled = busy || deps.isBlocked() || cooldown[provider] > Date.now();
                }
                const open = document.getElementById("openConfirmedNotionBtn");
                open.hidden = !requested(receipt?.data?.notion) || receipt?.data?.notion?.status !== "synced" || !safeNotion(receipt?.data?.notion?.pageUrl);
                actions.hidden = open.hidden && openTickTick.hidden;
                if (actions.hidden) actions.open = false;
                window.KnowviaV2?.sync(receipt?.data || null);
            };
            const read = async () =>
            {
                if (!receipt || busy || historical && !previous.open) return;
                const operation = epoch,
                    target = receipt;
                if (!await current(target.owner) || operation !== epoch || busy) return;
                clearTimeout(timer);
                busy = true;
                render();
                try
                {
                    const result = await deps.apiFetch(`/content/${target.contentId}/sync-status`,
                    {
                        timeoutMs: 10000
                    });
                    if (operation !== epoch || !await current(target.owner)) return;
                    if (result.data?.contentId !== target.contentId || !result.data?.ticktick || !result.data?.notion) throw new Error("Synchronization status could not be confirmed.");
                    receipt.data = result.data;
                    statusUnavailable = false;
                    notice = "";
                    const needsReview = [result.data.ticktick, result.data.notion].some(state => state.status === "uncertain");
                    detail.textContent = needsReview ? "A copy may already exist. Check the destination before retrying." :
                        "Export status";
                    void deps.writeLocal(KEY,
                    {
                        userId: target.owner.userId,
                        contentId: target.contentId,
                        destinations: target.destinations, imageRetained: target.imageRetained
                    }).catch(() => {});
                    const active = [result.data.ticktick, result.data.notion].some(state => ["queued", "pending"].includes(state.status));
                    if (active && polls++ < 12) timer = setTimeout(() => void read(), 1500);
                    else if (active)
                    {
                        notice = "Sync is still pending. Check status later.";
                        detail.textContent = notice;
                    }
                }
                catch (error)
                {
                    if (operation === epoch)
                    {
                        statusUnavailable = true;
                        notice = "Sync status unavailable.";
                        detail.textContent = notice;
                    }
                }
                finally
                {
                    if (operation === epoch)
                    {
                        busy = false;
                        render();
                    }
                }
            };
            const retry = async provider =>
            {
                if (busy || deps.isBlocked() || !retryable(receipt?.data?.[provider]) || statusUnavailable) return;
                const target = receipt,
                    operation = epoch;
                if (!await current(target.owner) || operation !== epoch || busy || deps.isBlocked()) return;
                if (cooldown[provider] > Date.now()) return;
                clearTimeout(timer);
                receipt.data[provider] = {
                    ...receipt.data[provider],
                    status: "pending",
                    retryable: false,
                    ...(provider === "notion" && receipt.data[provider].imageStatus ? { imageStatus: "pending" } : {})
                };
                busy = true;
                render();
                try
                {
                    const path = provider === "notion" ? `/integrations/notion/sync/${target.contentId}` : `/content/${target.contentId}/sync/ticktick`;
                    await deps.apiFetch(path,
                    {
                        method: "POST",
                        timeoutMs: 75000
                    });
                }
                catch (error)
                {
                    if (operation === epoch)
                    {
                        notice = `${provider === "notion" ? "Notion" : "TickTick"} retry could not be confirmed. Check status before retrying.`;
                        detail.textContent = notice;
                        if (error.status === 429)
                        {
                            cooldown[provider] = Date.now() + Math.min(3600, Math.max(1, error.retryAfter || 5)) * 1000;
                            const cooldownTimer = setTimeout(() =>
                            {
                                cooldownTimers.delete(cooldownTimer);
                                render();
                            }, cooldown[provider] - Date.now() + 30);
                            cooldownTimers.add(cooldownTimer);
                        }
                    }
                }
                finally
                {
                    if (operation === epoch)
                    {
                        busy = false;
                        polls = 0;
                        render();
                        await read();
                    }
                }
            };
            refresh.addEventListener("click", () =>
            {
                polls = 0;
                void read();
            });
            openTickTick.addEventListener("click", () =>
            {
                const url = KnowviaProviderLinks.ticktick(receipt?.data?.ticktick);
                if (!url) return;
                void chrome.tabs.create({ url }).catch(() =>
                {
                    notice = "Could not open TickTick.";
                    detail.textContent = notice;
                    render();
                });
            });
            for (const provider of ["ticktick", "notion"]) document.getElementById(`${provider}SyncRetry`).addEventListener("click", () => void retry(provider));
            document.getElementById("openConfirmedNotionBtn").addEventListener("click", () =>
            {
                const url = receipt?.data?.notion?.status === "synced" && safeNotion(receipt.data.notion.pageUrl);
                if (url) chrome.tabs.create(
                {
                    url
                }).catch(() =>
                {
                    notice = "Could not open Notion. Try again.";
                    detail.textContent = notice;
                    render();
                });
            });
            previous.addEventListener("toggle", () =>
            {
                if (!historical) return;
                if (previous.open) { polls = 0; void read(); }
                else clearTimeout(timer);
            });
            window.addEventListener("pagehide", () =>
            {
                epoch++;
                clearTimeout(timer);
                for (const timeout of cooldownTimers) clearTimeout(timeout);
                cooldownTimers.clear();
            });
            return {
                previous: asPrevious,
                async saved(contentId, destinations, imageRetained = false, initialStatus = null)
                {
                    if (!/^[a-f0-9]{24}$/i.test(contentId)) return;
                    const operation = ++epoch;
                    const owner = await deps.getOwner();
                    if (operation !== epoch || !owner.isSignedIn) return;
                    clearTimeout(timer);
                    busy = false;
                    polls = 0;
                    statusUnavailable = false;
                    notice = "";
                    historical = false;
                    actions.open = false;
                    previous.hidden = true;
                    previous.open = false;
                    footer.append(section);
                    receipt = {
                        contentId,
                        owner,
                        destinations,
                        imageRetained,
                        data: destinations ? Object.fromEntries(["ticktick", "notion"].map(provider => [provider, {
                            requested: Boolean(destinations[provider]?.enabled),
                            status: destinations[provider]?.enabled ? "queued" : "not_requested",
                            retryable: false
                        }])) : null
                    };
                    if (initialStatus?.contentId === contentId && initialStatus.ticktick && initialStatus.notion)
                        receipt.data = initialStatus;
                    detail.textContent = "Checking sync status…";
                    render();
                    void deps.writeLocal(KEY,
                    {
                        userId: receipt.owner.userId,
                        contentId,
                        destinations, imageRetained
                    }).catch(() => {});
                    if (!destinations || destinations.ticktick?.enabled || destinations.notion?.enabled)
                    {
                        void read();
                    }
                },
                async restore()
                {
                    const stored = await deps.readLocal(KEY),
                        owner = await deps.getOwner();
                    if (receipt || !owner.isSignedIn || stored?.userId !== owner.userId || !/^[a-f0-9]{24}$/i.test(stored.contentId)) return;
                    receipt = { contentId: stored.contentId, owner, destinations: stored.destinations, imageRetained: stored.imageRetained === true, data: null };
                    asPrevious();
                },
                reset()
                {
                    epoch++;
                    clearTimeout(timer);
                    receipt = null;
                    historical = false;
                    notice = "";
                    previous.hidden = true;
                    previous.open = false;
                    footer.append(section);
                    statusUnavailable = false;
                    busy = false;
                    render();
                }
            };
        }
    };
})();
