/* =========================================================================
   background.js — TickTick Extension Service Worker
   ========================================================================= */

// const API_BASE = "https://carefree-alignment-production-7eff.up.railway.app/api/v1";
const API_BASE = "http://localhost:3000/api/v1";

// ─── TickTick OAuth ───────────────────────────────────────────────────────────

let oauthInProgress = false;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) =>
{
    if (message.action !== "startTickTickAuth") return;

    if (oauthInProgress)
    {
        sendResponse({ error: "TickTick login is already in progress." });
        return false;
    }

    oauthInProgress = true;
    let responseSent = false;

    (async () =>
    {
        const [originalTab] = await chrome.tabs.query(
        {
            active: true,
            lastFocusedWindow: true
        });

        const originalWindowId = originalTab?.windowId;
        const originalTabId = originalTab?.id;
        const originalWindow = typeof originalWindowId === "number"
            ? await chrome.windows.get(originalWindowId).catch(() => null)
            : null;
        const redirectUri = chrome.identity.getRedirectURL("ticktick");
        const clientNonce = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
        const verifier = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
        const challengeBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
        const codeChallenge = Array.from(new Uint8Array(challengeBuffer), byte => byte.toString(16).padStart(2, "0")).join("");
        const authUrl = `${API_BASE}/ticktick/auth?redirect_uri=${encodeURIComponent(redirectUri)}&client_nonce=${encodeURIComponent(clientNonce)}&code_challenge=${encodeURIComponent(codeChallenge)}`;

        const resizeAuthWindow = (win) =>
        {
            if (win?.type !== "popup" || typeof win.id !== "number") return;

            chrome.windows.onCreated.removeListener(resizeAuthWindow);

            const width = 580;
            const height = 740;
            const updateInfo = { width, height };

            if (Number.isFinite(originalWindow?.left) && Number.isFinite(originalWindow?.top) && Number.isFinite(originalWindow?.width) && Number.isFinite(originalWindow?.height))
            {
                updateInfo.left = Math.round(originalWindow.left + (originalWindow.width - width) / 2);
                updateInfo.top = Math.round(originalWindow.top + (originalWindow.height - height) / 2);
            }

            chrome.windows.update(win.id, updateInfo).catch((error) =>
            {
                console.warn("[OAUTH] Could not position authorization window:", error.message);
            });
        };

        chrome.windows.onCreated.addListener(resizeAuthWindow);

        let finalRedirectUrl;

        try
        {
            const authFlowPromise = chrome.identity.launchWebAuthFlow(
            {
                url: authUrl,
                interactive: true
            });

            sendResponse({ started: true });
            responseSent = true;
            finalRedirectUrl = await authFlowPromise;
        }
        finally
        {
            chrome.windows.onCreated.removeListener(resizeAuthWindow);
        }

        if (!finalRedirectUrl)
        {
            throw new Error("OAuth redirect URL was not received");
        }

        const url = new URL(finalRedirectUrl);
        const expectedUrl = new URL(redirectUri);

        if (url.origin !== expectedUrl.origin || url.pathname !== expectedUrl.pathname)
        {
            throw new Error("Unexpected OAuth redirect URL");
        }

        const exchangeCode = url.searchParams.get("exchange_code");
        const returnedNonce = url.searchParams.get("client_nonce");

        if (!exchangeCode || returnedNonce !== clientNonce)
        {
            throw new Error("Invalid OAuth callback parameters");
        }

        const response = await fetch(`${API_BASE}/ticktick/auth/exchange`,
        {
            method: "POST",
            headers:
            {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(
            {
                exchange_code: exchangeCode,
                verifier
            })
        });

        if (!response.ok)
        {
            throw new Error(`OAuth exchange failed: HTTP ${response.status}`);
        }

        const result = await response.json();
        const userId = result?.data?.userId;
        const token = result?.data?.token;

        if (!userId || !token)
        {
            throw new Error("Invalid OAuth exchange response");
        }

        await chrome.storage.local.set(
        {
            ticktick_userId: userId,
            ticktick_token: token,
            ticktick_connected: true
        });

        console.log("[OAUTH] Login completed successfully");

        if (typeof originalWindowId === "number")
        {
            try
            {
                await chrome.windows.update(originalWindowId, { focused: true });

                if (typeof originalTabId === "number")
                {
                    await chrome.tabs.update(originalTabId, { active: true });
                }
            }
            catch (error)
            {
                console.warn("[OAUTH] Could not restore original browser tab:", error.message);
            }
        }

        try
        {
            await chrome.action.openPopup(
                typeof originalWindowId === "number"
                    ? { windowId: originalWindowId }
                    : {}
            );
            await chrome.action.setBadgeText({ text: "" });
        }
        catch (error)
        {
            console.warn("[OAUTH] Could not reopen action popup:", error.message);
            await chrome.action.setBadgeBackgroundColor({ color: "#16A34A" });
            await chrome.action.setBadgeText({ text: "✓" });
        }
    })().catch((error) =>
    {
        console.error("[OAUTH] Login failed:", error);

        if (!responseSent)
        {
            sendResponse({ error: error.message || "Failed to start auth." });
        }
    }).finally(() =>
    {
        oauthInProgress = false;
    });

    return true;
});

// ─── Context Menu ────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id:       "save-to-ticktick",
    title:    "Send to TickTick Extension",
    contexts: ["selection", "page"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "save-to-ticktick") return;

  // Ask content script for properly formatted selected text + page metadata
  chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_CONTEXT" }, (response) => {
    const text      = response?.ok && response.data.selectedText
      ? response.data.selectedText
      : info.selectionText || "";
    const pageTitle = response?.ok && response.data.title
      ? response.data.title
      : tab.title || "";

    chrome.storage.local.set({
      ticktick_context_data: {
        text,
        url:   tab.url  || "",
        title: pageTitle,
      },
    });
  });
});
