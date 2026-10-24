/* =========================================================================
   background.js — Save Knowledge Extension Service Worker
   ========================================================================= */

// const API_BASE = "https://carefree-alignment-production-7eff.up.railway.app/api/v1";
const API_BASE = "http://localhost:3000/api/v1";

let oauthInProgress = false;

const startOAuthFlow = async (
{
    provider,
    redirectPath,
    authPath,
    exchangePath,
    storageValues,
    linking = false
}) =>
{
    const session = linking ? await chrome.storage.local.get(["sk_token", "sk_userId"]) : null;
    if (linking && (typeof session.sk_token !== "string" || !session.sk_token.trim()))
    {
        throw new Error("Sign in with Google before connecting TickTick.");
    }
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
    const redirectUri = chrome.identity.getRedirectURL(redirectPath);
    const clientNonce = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
    let verifier;
    let authUrl;
    if (linking)
    {
        const response = await fetch(`${API_BASE}/integrations/ticktick/link`,
        {
            method: "POST",
            headers:
            {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${session.sk_token}`
            },
            redirect: "error",
            cache: "no-store",
            body: JSON.stringify({ redirect_uri: redirectUri, client_nonce: clientNonce })
        });
        if (!response.ok)
        {
            throw new Error(`TickTick linking failed: HTTP ${response.status}`);
        }
        const result = await response.json();
        const authorizationUrl = new URL(result?.data?.authorizationUrl);
        if (authorizationUrl.origin !== "https://ticktick.com" || authorizationUrl.pathname !== "/oauth/authorize" ||
            authorizationUrl.username || authorizationUrl.password || authorizationUrl.hash)
        {
            throw new Error("Invalid TickTick authorization URL");
        }
        authUrl = authorizationUrl.href;
    }
    else
    {
        verifier = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
        const challengeBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
        const codeChallenge = Array.from(new Uint8Array(challengeBuffer), byte => byte.toString(16).padStart(2, "0")).join("");
        authUrl = `${API_BASE}${authPath}?redirect_uri=${encodeURIComponent(redirectUri)}&client_nonce=${encodeURIComponent(clientNonce)}&code_challenge=${encodeURIComponent(codeChallenge)}`;
    }

    const resizeAuthWindow = (win) =>
    {
        if (win?.type !== "popup" || typeof win.id !== "number") return;

        chrome.windows.onCreated.removeListener(resizeAuthWindow);

        // Keep the provider window inside the originating browser window.
        const preferredWidth = provider === "Google" ? 480 : 460;
        const preferredHeight = provider === "Google" ? 600 : 580;
        const width = Math.min(preferredWidth, Math.max(320, (originalWindow?.width || 512) - 32));
        const height = Math.min(preferredHeight, Math.max(320, (originalWindow?.height || 648) - 48));
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

    if (url.origin !== expectedUrl.origin || url.pathname !== expectedUrl.pathname ||
        (linking && (url.username || url.password || url.hash)))
    {
        throw new Error("Unexpected OAuth redirect URL");
    }

    if (linking)
    {
        if (url.searchParams.getAll("client_nonce").length !== 1 ||
            url.searchParams.get("client_nonce") !== clientNonce ||
            url.searchParams.getAll("ticktick_link").length !== 1 ||
            url.searchParams.get("ticktick_link") !== "connected" ||
            [...url.searchParams.keys()].some(key => !["client_nonce", "ticktick_link"].includes(key)))
        {
            throw new Error("Invalid TickTick linking callback");
        }
        const currentSession = await chrome.storage.local.get(["sk_token", "sk_userId"]);
        if (currentSession.sk_token !== session.sk_token || currentSession.sk_userId !== session.sk_userId)
        {
            throw new Error("Application session changed; connect TickTick again.");
        }
        // A reconnect may select another account. Discard its predecessor's lists.
        await chrome.storage.local.set({
            ticktick_connected: true,
            ticktick_projects: [],
            ticktick_selectedProjectId: "",
            sk_auth_ui: { provider, status: "success", updatedAt: Date.now() }
        });
    }
    else
    {
        const exchangeCode = url.searchParams.get("exchange_code");
        const returnedNonce = url.searchParams.get("client_nonce");

        if (!exchangeCode || returnedNonce !== clientNonce)
        {
            throw new Error("Invalid OAuth callback parameters");
        }

        const response = await fetch(`${API_BASE}${exchangePath}`,
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
            throw new Error(`${provider} exchange failed: HTTP ${response.status}`);
        }

        const result = await response.json();
        const userId = result?.data?.userId;
        const token = result?.data?.token;

        if (!userId || !token)
        {
            throw new Error("Invalid OAuth exchange response");
        }

        await chrome.storage.local.set(storageValues(
        {
            userId,
            token
        }));

        await chrome.storage.local.set({
            sk_auth_ui: { provider, status: "success", updatedAt: Date.now() }
        });
    }
    console.log(`[OAUTH] ${provider} completed successfully`);

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
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) =>
{
    if (message.action === "getConnectionState")
    {
        sendResponse({ pending: oauthInProgress });
        return false;
    }
    const isGoogle = message.action === "startGoogleAuth";
    const isTickTick = message.action === "startTickTickAuth";

    if (!isGoogle && !isTickTick) return;

    if (oauthInProgress)
    {
        sendResponse({ error: "Sign-in is already in progress." });
        return false;
    }

    oauthInProgress = true;
    let responseSent = false;

    (async () =>
    {
        await chrome.storage.local.set({
            sk_auth_ui: { provider: isGoogle ? "Google" : "TickTick", status: "pending", updatedAt: Date.now() }
        });
        sendResponse({ started: true });
        responseSent = true;

        if (isGoogle)
        {
            await startOAuthFlow(
            {
                provider: "Google",
                redirectPath: "google",
                authPath: "/auth/google/auth",
                exchangePath: "/auth/google/exchange",
                storageValues: ({ userId, token }) => (
                {
                    sk_userId: userId,
                    sk_token: token,
                    sk_signed_in: true
                })
            });
            return;
        }

        await startOAuthFlow(
        {
            provider: "TickTick",
            redirectPath: "ticktick",
            linking: true
        });
    })().catch(async (error) =>
    {
        console.error("[OAUTH] Login failed:", error);
        await chrome.storage.local.set({
            sk_auth_ui: {
                provider: isGoogle ? "Google" : "TickTick",
                status: "error",
                message: "Connection wasn't completed. Try again when you're ready.",
                updatedAt: Date.now()
            }
        });
        // The action popup closes when a provider window gains focus.
        await chrome.action.openPopup().catch(() => {});

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
    title:    "Send to Save Knowledge",
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
