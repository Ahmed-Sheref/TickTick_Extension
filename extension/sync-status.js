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
        partial: "Partly synchronized",
        uncertain: "Needs review"
    };
    const safeNotion = value =>
    {
        try
        {
            const url = new URL(value);
            return url.protocol === "https:" && !url.username && !url.password && !url.port &&
                /(^|\.)(notion\.so|notion\.site|notion\.com)$/.test(url.hostname) ? url.href : null;
        }
        catch
        {
            return null;
        }
    };
    globalThis.KnowviaSync = {
        create(deps)
        {
            const section = document.getElementById("syncReceipt");
            const detail = document.getElementById("syncReceiptDetail");
            const refresh = document.getElementById("refreshSyncStatusBtn");
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
            const render = () =>
            {
                section.hidden = !receipt;
                refresh.disabled = busy;
                refresh.textContent = busy ? "Checking…" : "Refresh status";
                for (const provider of ["ticktick", "notion"])
                {
                    const state = receipt?.data?.[provider];
                    const row = document.getElementById(`${provider}SyncRow`);
                    const text = document.getElementById(`${provider}SyncState`);
                    const retry = document.getElementById(`${provider}SyncRetry`);
                    row.hidden = !state;
                    row.dataset.state = state?.status || "unknown";
                    text.textContent = state ? labels[state.status] || "Not confirmed" : "";
                    if (provider === "ticktick" && state?.aiStatus === "failed") text.textContent += " · AI unavailable";
                    retry.hidden = !state?.retryable;
                    retry.disabled = busy || deps.isBlocked() || cooldown[provider] > Date.now();
                }
                const open = document.getElementById("openConfirmedNotionBtn");
                open.hidden = receipt?.data?.notion?.status !== "synced" || !safeNotion(receipt?.data?.notion?.pageUrl);
                window.KnowviaV2?.sync(receipt?.data || null);
            };
            const read = async (automatic = false) =>
            {
                if (!receipt || busy || !await current(receipt.owner)) return;
                clearTimeout(timer);
                const operation = epoch,
                    target = receipt;
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
                    const needsReview = [result.data.ticktick, result.data.notion].some(state => state.status === "uncertain");
                    detail.textContent = needsReview ? "Saved in Knowvia. An external write may have completed. Review that provider before creating another copy." :
                        "Saved in Knowvia. External copies are tracked independently.";
                    await deps.writeLocal(KEY,
                    {
                        userId: target.owner.userId,
                        contentId: target.contentId
                    });
                    const active = [result.data.ticktick, result.data.notion].some(state => ["queued", "pending"].includes(state.status));
                    if (active && polls++ < 12) timer = setTimeout(() => void read(true), 1500);
                    else if (active) detail.textContent = "Saved in Knowvia. Synchronization is still pending; refresh later. Closing this popup does not cancel it.";
                }
                catch (error)
                {
                    if (operation === epoch) detail.textContent = `Saved in Knowvia. ${error.message} Use Refresh status to check again.`;
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
                if (busy || deps.isBlocked() || !receipt?.data?.[provider]?.retryable || !await current(receipt.owner)) return;
                if (cooldown[provider] > Date.now()) return;
                clearTimeout(timer);
                receipt.data[provider] = {
                    ...receipt.data[provider],
                    status: "pending",
                    retryable: false
                };
                busy = true;
                render();
                const target = receipt,
                    operation = epoch;
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
                        detail.textContent = error.message;
                        if (error.status === 429)
                        {
                            cooldown[provider] = Date.now() + Math.min(3600, Math.max(1, error.retryAfter || 5)) * 1000;
                            setTimeout(render, cooldown[provider] - Date.now() + 30);
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
            for (const provider of ["ticktick", "notion"]) document.getElementById(`${provider}SyncRetry`).addEventListener("click", () => void retry(provider));
            document.getElementById("openConfirmedNotionBtn").addEventListener("click", () =>
            {
                const url = receipt?.data?.notion?.status === "synced" && safeNotion(receipt.data.notion.pageUrl);
                if (url) chrome.tabs.create(
                {
                    url
                }).catch(() =>
                {
                    detail.textContent = "Could not open Notion. Try again.";
                });
            });
            return {
                async saved(contentId)
                {
                    if (!/^[a-f0-9]{24}$/i.test(contentId)) return;
                    epoch++;
                    clearTimeout(timer);
                    busy = false;
                    polls = 0;
                    receipt = {
                        contentId,
                        owner: await deps.getOwner(),
                        data: null
                    };
                    detail.textContent = "Saved in Knowvia. Checking external copies…";
                    render();
                    await deps.writeLocal(KEY,
                    {
                        userId: receipt.owner.userId,
                        contentId
                    });
                    void read();
                },
                async restore()
                {
                    const stored = await deps.readLocal(KEY),
                        owner = await deps.getOwner();
                    if (owner.isSignedIn && stored?.userId === owner.userId && /^[a-f0-9]{24}$/i.test(stored.contentId))
                        await this.saved(stored.contentId);
                },
                reset()
                {
                    epoch++;
                    clearTimeout(timer);
                    receipt = null;
                    busy = false;
                    render();
                }
            };
        }
    };
})();
