// Optional browser regression check. All fixtures exist only in this test harness;
// the shipped extension always calls the configured backend.
// Requires Playwright and a locally installed Chrome. No live accounts are used.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = process.env.KNOWVIA_QA_DIR || path.join(root, ".tmp", "knowvia-ui");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const failures = [];
let checks = 0;
const check = async (name, action) => {
    try { await action(); checks++; console.log(`PASS ${name}`); }
    catch (error) { failures.push(name); console.error(`FAIL ${name}: ${error.stack}`); }
};

async function popup({ signedIn = true, ticktick = true, notion = true, width = 480, height = 600, theme = "light", reducedMotion = "no-preference", previewImage = "https://example.com/cover.svg", clipboard = "", hasTouch = false, notionSelected = false, storedReceipt = null, seedDraft = null, layoutPrefs = null } = {})
{
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion, hasTouch });
    page.setDefaultTimeout(6000);
    await page.route("https://example.com/cover.svg", route => route.fulfill({ status: 200, contentType: "image/svg+xml",
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#b4b2f0"/><stop offset="1" stop-color="#f3dce9"/></linearGradient><linearGradient id="mountain" x2="1" y2="1"><stop stop-color="#628ce9"/><stop offset="1" stop-color="#273d88"/></linearGradient></defs><rect width="240" height="240" fill="url(#sky)"/><path d="m-20 185 85-112 43 52 42-83 110 162v36H-20Z" fill="#8b9ade"/><path d="m-15 209 77-90 32 36 59-92 110 177H-15Z" fill="url(#mountain)"/><path d="m128 102 25-39 28 45-24-13-10 11-10-7Z" fill="#cedbf7"/><path d="m-15 221 83-50 54 39 67-65 74 74v21H-15Z" fill="#1e346b"/></svg>` }));
    const errors = [];
    page.on("pageerror", error => { errors.push(error.message); console.error("BROWSER RUNTIME:", error.stack); });
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.addInitScript(({ signedIn, ticktick, notion, theme, previewImage, clipboard, notionSelected, storedReceipt, seedDraft, layoutPrefs }) => {
        const values = signedIn ? { sk_userId: "fixture-user", sk_token: "fixture-app-session", sk_signed_in: true,
            ticktick_connected: ticktick, ticktick_theme: theme } : { ticktick_theme: theme };
        if (storedReceipt) values.knowvia_last_sync = storedReceipt;
        if (seedDraft) values.knowvia_capture_draft = seedDraft;
        if (layoutPrefs) values.knowvia_platform_layout_fixture_user = layoutPrefs;
        if (layoutPrefs) values["knowvia_platform_layout_fixture-user"] = layoutPrefs;
        const listeners = [];
        const select = keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, values[key]]));
        const sendChanges = updates => {
            const changes = Object.fromEntries(Object.entries(updates).map(([key, value]) => [key, { oldValue: values[key], newValue: value }]));
            Object.assign(values, updates);
            listeners.forEach(listener => listener(changes, "local"));
        };
        window.fixture = { values, requests: [], authActions: [], sendChanges, saveMode: "success", delay: 0,
            ticktickMode: ticktick ? "connected" : "disconnected", notionMode: notion ? "connected" : "disconnected",
            preferenceError: false, openedTabs: [], copied: [], notionSelection: notionSelected ? { id: "11111111-1111-1111-1111-111111111111", type: "page" } : null,
            notionDestinations: [
                { id: "11111111-1111-1111-1111-111111111111", type: "page", title: "Reading notes", url: "https://www.notion.so/reading-notes", lastEditedTime: null },
                { id: "22222222-2222-2222-2222-222222222222", type: "data_source", title: "Knowledge library", url: null, lastEditedTime: null },
                { id: "33333333-3333-3333-3333-333333333333", type: "page", title: "Ideas worth keeping", url: null, lastEditedTime: null }
            ], notionSearchMode: "normal", notionSearchDelay: {}, notionSelectionError: false, notionWriteDelay: 0,
            notionSyncMode: "synced", notionRetryAfter: 2, syncStates: null, lastIntent: {} };
        window.chrome = {
            storage: { local: {
                get: (keys, callback) => { const result = select(keys); if (callback) callback(result); return Promise.resolve(result); },
                set: (updates, callback) => { sendChanges(updates); callback?.(); return Promise.resolve(); },
                remove: (keys, callback) => { (Array.isArray(keys) ? keys : [keys]).forEach(key => delete values[key]); callback?.(); return Promise.resolve(); }
            }, onChanged: { addListener: listener => listeners.push(listener) } },
            runtime: { lastError: null, sendMessage: (message, callback) => {
                if (message.action === "getConnectionState") { callback({ pending: false }); return; }
                window.fixture.authActions.push(message.action);
                callback({ started: true });
            } },
            action: { setBadgeText: async () => {} },
            tabs: {
                query: async () => [{ id: 1, title: "Designing a calmer reading workflow", url: "https://example.com/reading" }],
                sendMessage: (_id, _message, callback) => callback({ ok: true, data: {
                    title: "Designing a calmer reading workflow", url: "https://example.com/reading", selectedText: "",
                    previewImage,
                    pageText: "Give useful ideas a place to land. Capture what matters, organize it with a few thoughtful tags, and return to it when you need it." } }),
                create: async details => { fixture.openedTabs.push(details.url); }
            }
        };
        Object.defineProperty(navigator, "clipboard", { value: { readText: async () => clipboard, writeText: async text => { fixture.copied.push(text); } } });
        window.fetch = async (url, options) => {
            const f = window.fixture;
            const route = new URL(url).pathname.replace("/api/v1", "");
            const params = new URL(url).searchParams;
            const body = options.body ? JSON.parse(options.body) : null;
            f.requests.push({ route, query: Object.fromEntries(params), method: options.method, body, authorization: options.headers.Authorization });
            if (f.delay) await new Promise(resolve => setTimeout(resolve, f.delay));
            let status = 200;
            let data;
            const headers = { "Content-Type": "application/json" };
            if (route === "/content/projects") {
                if (f.ticktickMode === "offline") throw new TypeError("Failed to fetch");
                if (f.ticktickMode === "disconnected") { status = 401; data = { status: "error", message: "TickTick account is not connected" }; }
                else data = { status: "success", data: options.method === "POST" ? { id: "new-list", name: body.name }
                    : [{ id: "reading", name: "Reading" }, { id: "ideas", name: "Ideas" }] };
            } else if (route === "/integrations/notion/status") {
                if (f.notionMode === "offline") throw new TypeError("Failed to fetch");
                data = { status: "success", data: { connected: f.notionMode === "connected", reconnectRequired: f.notionMode === "reconnect",
                    workspaceName: "Personal workspace", workspaceIcon: null } };
            } else if (route === "/integrations/notion/destination") {
                if (f.notionWriteDelay && options.method !== "GET") await new Promise(resolve => setTimeout(resolve, f.notionWriteDelay));
                if (f.notionSelectionError) { status = 503; data = { status: "error", code: "NOTION_PERSISTENCE_FAILED", message: "Default destination could not be saved." }; }
                else {
                    if (options.method === "DELETE") f.notionSelection = null;
                    if (options.method === "PUT") f.notionSelection = f.notionDestinations.find(value => value.id === body.destinationId && value.type === body.destinationType);
                    data = { status: "success", data: { destination: f.notionSelection } };
                }
            } else if (route === "/integrations/notion/destinations") {
                const query = params.get("query") || "";
                if (f.notionSearchDelay[query]) await new Promise(resolve => setTimeout(resolve, f.notionSearchDelay[query]));
                if (f.notionSearchMode === "error") { status = 503; data = { status: "error", code: "NOTION_PROVIDER_UNAVAILABLE", message: "Notion is temporarily unavailable." }; }
                else {
                    const results = f.notionSearchMode === "empty" ? [] : f.notionDestinations.filter(value => value.title.toLowerCase().includes(query.toLowerCase()));
                    const offset = params.has("cursor") ? 50 : 0;
                    data = { status: "success", data: { destinations: results.slice(offset, offset + 50), hasMore: results.length > offset + 50,
                        nextCursor: results.length > offset + 50 ? "44444444-4444-4444-4444-444444444444" : null } };
                }
            } else if (route.startsWith("/integrations/notion/sync/")) {
                if (f.notionSyncMode === "pending") { status = 409; data = { status: "error", code: "NOTION_SYNC_IN_PROGRESS", message: "Notion synchronization is in progress." }; }
                else if (f.notionSyncMode === "uncertain") { status = 409; data = { status: "error", code: "NOTION_SYNC_UNCERTAIN", message: "A Notion write may have completed." }; }
                else if (f.notionSyncMode === "rate") { status = 429; headers["Retry-After"] = String(f.notionRetryAfter); data = { status: "error", code: "NOTION_RATE_LIMITED", message: "Notion is rate limited." }; }
                else if (f.notionSyncMode === "error") { status = 403; data = { status: "error", code: "NOTION_PERMISSION_DENIED", message: "Notion permission is missing." }; }
                else if (f.notionSyncMode === "transport") throw new TypeError("Failed to fetch");
                else data = { status: "success", data: { status: "synced", pageId: "99999999-9999-9999-9999-999999999999",
                    pageUrl: f.notionSyncMode === "unsafe-url" ? "javascript:alert(1)" : "https://www.notion.so/provider-confirmed-capture", alreadySynced: true } };
            } else if (/^\/content\/[a-f0-9]{24}\/sync-status$/.test(route)) {
                const states = f.syncStates || Object.fromEntries(["ticktick", "notion"].map(provider => [provider, { requested: Boolean(f.lastIntent[provider]?.enabled),
                    status: f.lastIntent[provider]?.enabled ? "synced" : "not_requested", retryable: false, errorCode: null,
                    ...(provider === "notion" ? { pageId: "99999999-9999-9999-9999-999999999999", pageUrl: "https://www.notion.so/provider-confirmed-capture" } : { taskId: "real-task", aiStatus: "not_requested" }) }]));
                data = { status: "success", data: { contentId: "aaaaaaaaaaaaaaaaaaaaaaaa", ...states } };
            } else if (/^\/content\/[a-f0-9]{24}\/sync\/ticktick$/.test(route)) {
                data = { status: "success", data: { status: "synced", taskId: "real-task" } };
            } else if (route === "/content/tags") data = { status: "success", data: ["reading", "productivity"] };
            else if (route === "/User/preferences/me") data = { status: "success", data: { email: "reader@example.com", weeklyEmailEnabled: true,
                receiveTelegramQuiz: true, telegramConnected: false } };
            else if (route === "/content") {
                f.lastIntent = body.destinations || {};
                status = f.saveMode === "expired" ? 401 : f.saveMode === "error" ? 500 : 201;
                data = f.saveMode === "expired" ? { status: "error", message: "Invalid or expired token" } : f.saveMode === "error" ? { status: "error", message: "Save unavailable. Please try again." }
                    : { status: "success", data: { content: f.saveMode === "malformed" ? {} : { _id: "aaaaaaaaaaaaaaaaaaaaaaaa" } } };
            } else if (["/User/email", "/User/quiz-preferences"].includes(route)) {
                status = f.preferenceError ? 500 : 200;
                data = { status: f.preferenceError ? "error" : "success", message: f.preferenceError ? "Could not save preferences." : "Updated" };
            } else throw new Error(`Unexpected request: ${route}`);
            return new Response(JSON.stringify(data), { status, headers });
        };
    }, { signedIn, ticktick, notion, theme, previewImage, clipboard, notionSelected, storedReceipt, seedDraft, layoutPrefs });
    await page.goto(pathToFileURL(path.join(root, "extension", "popup.html")).href);
    await page.waitForFunction(signedIn => signedIn
        ? document.getElementById("notionStatus").textContent !== "Checking…"
        : document.getElementById("onboardingView").style.display === "flex", signedIn);
    // Theme and shared component transitions must settle before visual capture.
    await page.waitForTimeout(200);
    return { page, errors };
}

try {
    const { page, errors } = await popup();
    await check("capture-first preview, real source metadata and loaded cover", async () => {
        await page.waitForFunction(() => {
            const image = document.getElementById("previewImage");
            return !image.hidden && image.complete && image.naturalWidth > 0;
        });
        assert.equal(await page.locator("#captureEditor").isVisible(), true);
        assert.equal(await page.locator("#panelSettings").isVisible(), false);
        assert.match(await page.locator("#previewTitle").textContent(), /calmer reading workflow/);
        assert.match(await page.locator("#previewExcerpt").textContent(), /Give useful ideas/);
        assert.equal(await page.locator("#previewDomain").textContent(), "example.com");
        assert.equal(await page.locator("#ticktickStatusSecondary").textContent(), "Connected");
        assert.equal(await page.locator("#captureCount").textContent(), "131 characters");
        assert.equal(await page.locator("#saveButtonLabel").textContent(), "Save to Knowvia");
        assert.equal(await page.locator(".v2-wordmark").evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), true);
    });
    await check("connected providers remain unselected until explicitly enabled", async () => {
        assert.equal(await page.locator("#connectTickTickFromSaveBtn").getAttribute("aria-pressed"), "false");
        assert.equal(await page.locator("#notionDestination").getAttribute("aria-pressed"), "false");
        assert.equal(await page.locator("#projectField").isVisible(), true);
        await page.locator("#connectTickTickFromSaveBtn").click();
        assert.equal(await page.locator("#projectField").isVisible(), true);
        assert.equal(await page.locator("#notionSaveConfig").isVisible(), true);
        assert.deepEqual(await page.evaluate(() => fixture.authActions), []);
    });
    await check("keyboard list selection and removable tag chips", async () => {
        await page.locator("#projectSearchInput").fill("Read");
        await page.locator("#projectSearchInput").press("ArrowDown");
        await page.locator("#projectSearchInput").press("Enter");
        assert.equal(await page.locator("#projectSelect").inputValue(), "reading");
        for (const tag of ["focus", "reading"]) {
            await page.locator("#tagInput").fill(tag);
            await page.locator("#tagInput").press("Enter");
        }
        await page.locator("#tagInput").press("Escape");
        assert.match(await page.locator("#selectedTagsContainer").textContent(), /focus/);
        assert.match(await page.locator("#selectedTagsContainer").textContent(), /reading/);
        await page.locator(".main-scroll").evaluate(element => { element.scrollTop = 0; });
        await page.locator(".v2-dest-heading h2").click();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        const layout = await page.locator(".main-scroll").evaluate(element => ({ scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
            sections: [...document.querySelectorAll("#panelSave > *")].filter(child => child.getBoundingClientRect().height > 0)
                .map(child => ({ id: child.id, className: child.className, height: child.getBoundingClientRect().height })) }));
        console.log("Capture layout:", JSON.stringify(layout));
        await page.locator(".main-scroll").evaluate(element => { element.scrollTop = 0; });
        await page.waitForTimeout(220);
        await page.screenshot({ path: path.join(output, "capture.png") });
        await page.locator(".tag-chip").filter({ hasText: "reading" }).locator("button").click();
        assert.doesNotMatch(await page.locator("#selectedTagsContainer").textContent(), /reading/);
        assert.ok(layout.clientHeight > 0);
    });
    await check("edit controls stay secondary and update the displayed preview", async () => {
        await page.locator("#articlePreview").hover();
        await page.locator("#title").focus();
        assert.equal(await page.locator("#captureEditor").isVisible(), true);
        const original = await page.locator("#title").inputValue();
        await page.locator("#title").fill("A more thoughtful reading workflow");
        assert.equal(await page.locator("#previewTitle").textContent(), "A more thoughtful reading workflow");
        await page.locator("#title").fill(original);
        await page.locator("#title").focus();
        assert.equal(await page.locator("#captureEditor").isVisible(), true);
        assert.equal(await page.locator("#editCaptureBtn").getAttribute("aria-expanded"), "false");
    });
    await check("list creation uses the existing endpoint and selects the returned list", async () => {
        await page.locator("#openCreateProjectBtn").click();
        await page.locator("#projectNameInput").fill("Research");
        await page.locator("#confirmCreateProjectBtn").click();
        await page.waitForFunction(() => document.getElementById("projectSelect").value === "new-list");
        const request = await page.evaluate(() => fixture.requests.find(request => request.route === "/content/projects" && request.method === "POST"));
        assert.deepEqual(request.body, { name: "Research" });
        await page.locator("#projectSearchInput").fill("Read");
        await page.locator("#projectSearchInput").press("ArrowDown");
        await page.locator("#projectSearchInput").press("Enter");
    });
    await check("invalid hidden fields open the editor and receive keyboard focus", async () => {
        const title = await page.locator("#title").inputValue();
        await page.evaluate(() => { document.getElementById("title").value = ""; });
        const before = await page.evaluate(() => fixture.requests.filter(request => request.route === "/content").length);
        await page.locator("#saveArticleBtn").click();
        assert.equal(await page.locator("#captureEditor").isVisible(), true);
        assert.equal(await page.locator("#title").getAttribute("aria-invalid"), "true");
        assert.equal(await page.evaluate(() => document.activeElement.id), "title");
        assert.equal(await page.evaluate(() => fixture.requests.filter(request => request.route === "/content").length), before);
        await page.locator("#title").fill(title);
        await page.locator("#title").focus();
    });
    await check("approved layout removes global modes and scopes AI to TickTick", async () => {
        assert.equal(await page.locator(".save-options-section").isVisible(), false);
        assert.equal(await page.locator("#captureOptionsBtn").isVisible(), false);
        await page.locator(".v2-ticktick-ai summary").click();
        await page.locator("#useSummaryAi").check();
        await page.locator("#mergeSummaryWithContent").check();
        assert.equal(await page.locator("#useSummaryAi").evaluate(node => node.closest(".v2-destination-row")?.dataset.provider === "ticktick"), true);
        assert.equal(await page.locator("#notionConfiguration input[type=checkbox]").count(), 0);
        await page.locator(".v2-ticktick-ai summary").click();
    });
    await check("save failures retain the draft and malformed success is rejected", async () => {
        await page.evaluate(() => { fixture.saveMode = "error"; });
        await page.locator("#saveArticleBtn").click();
        await page.waitForFunction(() => document.getElementById("statusText").textContent.includes("Save unavailable"));
        assert.match(await page.locator("#title").inputValue(), /calmer/);
        await page.screenshot({ path: path.join(output, "error.png") });
        await page.evaluate(() => { fixture.saveMode = "malformed"; });
        await page.locator("#saveArticleBtn").click();
        await page.waitForFunction(() => document.getElementById("statusText").textContent.includes("could not be confirmed"));
        assert.match(await page.locator("#title").inputValue(), /calmer/);
    });
    await check("indeterminate saving state, one request, and confirmed library-only success", async () => {
        await page.evaluate(() => { fixture.saveMode = "success"; fixture.delay = 500; fixture.requests.length = 0; saveArticle(); saveArticle(); });
        await page.waitForFunction(() => document.getElementById("saveArticleBtn").getAttribute("aria-busy") === "true");
        assert.equal(await page.locator("#saveArticleBtn").isDisabled(), true);
        assert.equal(await page.locator("#saveArticleBtn").evaluate(element => getComputedStyle(element).opacity), "1");
        assert.equal(await page.locator(".v2-save-progress").isVisible(), true);
        assert.doesNotMatch(await page.locator("#statusBar").textContent(), /\d+%/);
        assert.equal(await page.locator("#statusBar [aria-valuenow]").count(), 0);
        await page.screenshot({ path: path.join(output, "saving.png") });
        await page.waitForFunction(() => document.getElementById("statusText").textContent.startsWith("Saved to Knowvia."));
        const requests = await page.evaluate(() => fixture.requests.filter(request => request.route === "/content"));
        assert.equal(requests.length, 1);
        assert.equal(requests[0].authorization, "Bearer fixture-app-session");
        assert.equal(requests[0].body.destinations.ticktick.projectId, "reading");
        assert.deepEqual(requests[0].body.ticktickOptions.tags, ["focus"]);
        assert.equal(requests[0].body.ticktickOptions.useAiSummary, true);
        assert.equal(requests[0].body.ticktickOptions.mergeSummaryWithContent, true);
        assert.equal(Object.hasOwn(requests[0].body, "userId"), false);
        assert.equal(Object.hasOwn(requests[0].body, "previewImage"), false);
        assert.match(await page.locator("#statusText").textContent(), /confirmed separately/);
        assert.equal(await page.locator("#title").inputValue(), "");
        await page.locator(".main-scroll").evaluate(element => { element.scrollTop = 0; });
        await page.waitForTimeout(200);
        await page.screenshot({ path: path.join(output, "saved.png") });
        await page.evaluate(() => { fixture.delay = 0; });
    });
    await check("settings gear and back button keep capture as the primary view", async () => {
        await page.locator("#tabSettings").click();
        assert.equal(await page.locator("#tabSettings").getAttribute("aria-expanded"), "true");
        assert.equal(await page.locator("#panelSettings").isVisible(), true);
        assert.equal(await page.locator("#panelSave").isVisible(), false);
        assert.equal(await page.locator("#saveActions").isVisible(), false);
        await page.locator("#tabSave").click();
        assert.equal(await page.locator("#tabSettings").getAttribute("aria-expanded"), "false");
        assert.equal(await page.locator("#panelSave").isVisible(), true);
    });
    await check("Notion connection, reconnect and unavailable states", async () => {
        await page.locator("#tabSettings").click();
        assert.equal(await page.locator("#notionStatus").textContent(), "Connected");
        assert.match(await page.locator("#notionCapabilityNote").textContent(), /choose a default/i);
        await page.waitForTimeout(200);
        await page.screenshot({ path: path.join(output, "settings.png") });
        await page.evaluate(() => { fixture.notionMode = "reconnect"; });
        await page.locator("#refreshConnectionsBtn").click();
        await page.waitForFunction(() => document.getElementById("notionStatus").textContent === "Reconnect required");
        assert.equal(await page.locator("#connectNotionBtn").textContent(), "Reconnect");
        await page.evaluate(() => { fixture.notionMode = "offline"; });
        await page.locator("#refreshConnectionsBtn").click();
        await page.waitForFunction(() => document.getElementById("notionStatus").textContent === "Unavailable");
        assert.match(await page.locator("#notionConnectionHint").textContent(), /Cannot reach/);
    });
    await check("Notion OAuth pending, cancellation and callback refresh", async () => {
        await page.locator("#connectNotionBtn").click();
        assert.equal(await page.locator("#connectTickTickBtn").isDisabled(), true);
        assert.deepEqual(await page.evaluate(() => fixture.authActions), ["startNotionAuth"]);
        await page.evaluate(() => fixture.sendChanges({ sk_auth_ui: { provider: "Notion", status: "error", message: "Connection cancelled. Try again." } }));
        assert.equal(await page.locator("#connectNotionBtn").isEnabled(), true);
        assert.match(await page.locator("#notionAuthFeedback").textContent(), /cancelled/);
        await page.evaluate(() => { fixture.notionMode = "connected"; fixture.sendChanges({ sk_auth_ui: { provider: "Notion", status: "success" } }); });
        await page.waitForFunction(() => document.getElementById("notionStatus").textContent === "Connected");
    });
    await check("delivery controls are absent without changing stored preferences", async () => {
        for (const id of ["email", "weeklyEmailToggle", "telegramQuizToggle", "openTelegramBotBtn"])
            assert.equal(await page.locator(`#${id}`).isVisible(), false);
        assert.equal(await page.evaluate(() => fixture.requests.some(r => ["/User/email", "/User/quiz-preferences"].includes(r.route))), false);
    });
    await check("provider outages never reuse a cached connected label", async () => {
        await page.evaluate(() => { fixture.ticktickMode = "offline"; });
        await page.locator("#refreshConnectionsBtn").click();
        await page.waitForFunction(() => document.getElementById("ticktickStatusSecondary").textContent === "Check connection");
        await page.locator("#tabSave").click();
        assert.equal(await page.locator("#projectField").isVisible(), true);
        assert.equal(await page.locator("#projectField").isVisible(), true);
    });
    await check("no JavaScript console errors", () => assert.deepEqual(errors, []));
    await page.close();

    const signedOut = await popup({ signedIn: false });
    await check("Google onboarding and duplicate authentication guard", async () => {
        await signedOut.page.screenshot({ path: path.join(output, "onboarding.png") });
        await signedOut.page.locator("#connectGoogleBtn").click();
        assert.equal(await signedOut.page.locator("#connectGoogleBtn").isDisabled(), true);
        await signedOut.page.evaluate(() => connectGoogle());
        assert.deepEqual(await signedOut.page.evaluate(() => fixture.authActions), ["startGoogleAuth"]);
        assert.deepEqual(signedOut.errors, []);
    });
    await signedOut.page.close();

    for (const [width, height, theme] of [[320, 480, "light"], [480, 600, "dark"]]) {
        const compact = await popup({ ticktick: false, notion: false, width, height, theme, reducedMotion: "reduce", previewImage: "" });
        await check(`${width}px ${theme} layout, disconnected save and reduced motion`, async () => {
            assert.equal(await compact.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            assert.equal(await compact.page.locator("#projectField").isVisible(), true);
            assert.equal(await compact.page.locator("#libraryDestination").isVisible(), false);
            assert.equal(await compact.page.locator("#previewCover").isVisible(), false);
            assert.equal(await compact.page.locator("#saveButtonLabel").textContent(), "Save to Knowvia");
            await compact.page.screenshot({ path: path.join(output, `capture-${width}-${theme}.png`) });
            await compact.page.locator("#title").focus();
            assert.equal(await compact.page.locator("#captureOptions").evaluate(element => getComputedStyle(element).transitionDuration), "0s");
            await compact.page.locator("#title").focus();
            await compact.page.locator("#saveArticleBtn").click();
            await compact.page.waitForFunction(() => document.getElementById("statusText").textContent.startsWith("Saved to Knowvia."));
            const body = await compact.page.evaluate(() => fixture.requests.find(request => request.route === "/content").body);
            assert.deepEqual(body.destinations, { ticktick: { enabled: false }, notion: { enabled: false } });
            assert.deepEqual(compact.errors, []);
        });
        await compact.page.close();
    }
    for (const unsafe of ["javascript:alert(1)", "https://user:secret@example.com/cover.svg"]) {
        const invalid = await popup({ previewImage: unsafe });
        await check(`unsafe preview image is rejected (${unsafe.startsWith("javascript") ? "script URL" : "URL credentials"})`, async () => {
            assert.equal(await invalid.page.locator("#previewImage").isVisible(), false);
            assert.equal(await invalid.page.locator("#previewCover").isVisible(), false);
            assert.equal(await invalid.page.locator("#previewImage").getAttribute("src"), null);
            assert.deepEqual(invalid.errors, []);
        });
        await invalid.page.close();
    }
    const clipboard = await popup({ clipboard: "An unrelated copied note." });
    await check("clipboard capture never borrows the current page cover", async () => {
        assert.equal(await clipboard.page.locator("#previewImage").isVisible(), false);
        assert.match(await clipboard.page.locator("#previewExcerpt").textContent(), /unrelated copied note/);
        assert.match(await clipboard.page.locator("#captureSource").textContent(), /clipboard/i);
        assert.deepEqual(clipboard.errors, []);
    });
    await clipboard.page.close();

    const linked = await popup({ notionSelected: true });
    const n = linked.page;
    await check("Notion reads the explicit default, hydrates its title and never auto-selects a search result", async () => {
        assert.equal(await n.locator("#notionCaptureHint").textContent(), "Not selected");
        assert.equal(await n.locator("#notionDestination").evaluate(node => node.classList.contains("selected")), false);
        await n.locator("#notionDestination").click();
        assert.equal(await n.evaluate(() => fixture.requests.filter(request => request.method === "PUT").length), 0);
        await n.screenshot({ path: path.join(output, "notion-capture-connected.png") });
    });
    await check("Notion modal supports focus, cancel, keyboard selection and a safe capture shortcut", async () => {
        await n.locator("#chooseNotionSaveDestinationBtn").click();
        await n.waitForFunction(() => document.querySelectorAll(".notion-result").length === 3);
        assert.equal(await n.evaluate(() => document.activeElement.id), "notionSearchInput");
        await n.keyboard.press("Control+s");
        assert.equal(await n.evaluate(() => fixture.requests.filter(request => request.route === "/content").length), 0);
        await n.locator("#notionSearchInput").press("ArrowDown");
        await n.keyboard.press("ArrowDown");
        assert.match(await n.locator(".notion-result[aria-selected=true]").textContent(), /Knowledge library/);
        await n.screenshot({ path: path.join(output, "notion-destination-picker.png") });
        await n.locator("#cancelNotionDestinationBtn").click();
        assert.equal(await n.locator("#notionDestinationDialog").isVisible(), false);
        assert.equal(await n.evaluate(() => document.activeElement.id), "chooseNotionSaveDestinationBtn");
        assert.equal(await n.evaluate(() => fixture.requests.filter(request => request.method === "PUT").length), 0);
        assert.equal(await n.locator("#notionCaptureHint").textContent(), "Reading notes");
    });
    await check("Notion default confirmation sends only the verified choice and blocks duplicate writes/Escape while pending", async () => {
        await n.locator("#chooseNotionSaveDestinationBtn").click();
        await n.locator(".notion-result").filter({ hasText: "Knowledge library" }).click();
        await n.evaluate(() => { fixture.notionWriteDelay = 400; });
        await n.locator("#confirmNotionDestinationBtn").click();
        assert.equal(await n.locator("#confirmNotionDestinationBtn").isDisabled(), true);
        await n.keyboard.press("Escape");
        assert.equal(await n.locator("#notionDestinationDialog").isVisible(), true);
        await n.evaluate(() => document.getElementById("confirmNotionDestinationBtn").click());
        await n.waitForFunction(() => !document.getElementById("notionDestinationDialog").open);
        const writes = await n.evaluate(() => fixture.requests.filter(request => request.method === "PUT"));
        assert.equal(writes.length, 1);
        assert.deepEqual(writes[0].body, { destinationId: "22222222-2222-2222-2222-222222222222", destinationType: "data_source" });
        assert.equal(writes[0].authorization, "Bearer fixture-app-session");
        assert.equal(await n.locator("#notionCaptureHint").textContent(), "Knowledge library");
        await n.evaluate(() => { fixture.notionWriteDelay = 0; });
    });
    await check("failed Notion selection stays in the dialog and preserves the current default", async () => {
        await n.locator("#chooseNotionSaveDestinationBtn").click();
        await n.locator(".notion-result").filter({ hasText: "Reading notes" }).click();
        await n.evaluate(() => { fixture.notionSelectionError = true; });
        await n.locator("#confirmNotionDestinationBtn").click();
        await n.waitForFunction(() => !document.getElementById("notionDestinationError").hidden);
        assert.match(await n.locator("#notionDestinationError").textContent(), /could not be saved/);
        assert.equal(await n.locator("#notionCaptureHint").textContent(), "Knowledge library");
        assert.equal(await n.locator("#confirmNotionDestinationBtn").isEnabled(), true);
        await n.screenshot({ path: path.join(output, "notion-selection-error.png") });
        await n.evaluate(() => { fixture.notionSelectionError = false; });
        await n.locator("#cancelNotionDestinationBtn").click();
    });
    await check("Notion selection clearing is explicit and does not disconnect the workspace", async () => {
        await n.locator("#chooseNotionSaveDestinationBtn").click();
        await n.locator("#clearNotionDestinationBtn").click();
        await n.waitForFunction(() => !document.getElementById("notionDestinationDialog").open);
        assert.match(await n.locator("#notionCaptureHint").textContent(), /choose/i);
        assert.equal(await n.locator("#notionStatus").textContent(), "Connected");
        const clear = await n.evaluate(() => fixture.requests.findLast(request => request.method === "DELETE"));
        assert.equal(clear.route, "/integrations/notion/destination");
        assert.equal(clear.body, null);
    });
    await check("Notion search ignores late responses and renders untrusted titles as text", async () => {
        await n.locator("#chooseNotionSaveDestinationBtn").click();
        await n.evaluate(() => { fixture.notionSearchDelay.Reading = 600; });
        await n.locator("#notionSearchInput").fill("Reading");
        await n.waitForFunction(() => fixture.requests.some(request => request.query.query === "Reading"));
        await n.locator("#notionSearchInput").fill("Knowledge");
        await n.waitForFunction(() => document.querySelectorAll(".notion-result").length === 1 && document.querySelector(".notion-result").textContent.includes("Knowledge"));
        await n.waitForTimeout(650);
        assert.match(await n.locator(".notion-result").textContent(), /Knowledge/);
        await n.evaluate(() => { fixture.notionDestinations[0].title = '<img src=x onerror="window.injected=true">'; });
        await n.locator("#notionSearchInput").fill("");
        await n.waitForFunction(() => document.querySelectorAll(".notion-result").length === 3);
        assert.match(await n.locator(".notion-result").first().textContent(), /<img/);
        assert.equal(await n.locator("#notionDestinationResults img").count(), 0);
        assert.equal(await n.evaluate(() => window.injected || false), false);
        await n.locator("#notionSearchInput").press("Escape");
    });
    await check("Notion discovery supports bounded pagination and moves keyboard focus into the newly loaded page", async () => {
        await n.evaluate(() => {
            fixture.notionDestinations = Array.from({ length: 65 }, (_, index) => ({ id: (index + 100).toString(16).padStart(32, "0").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5"),
                type: index % 2 ? "data_source" : "page", title: `Destination ${String(index + 1).padStart(2, "0")}`, url: null, lastEditedTime: null }));
        });
        await n.locator("#chooseNotionSaveDestinationBtn").click();
        await n.waitForFunction(() => document.querySelectorAll(".notion-result").length === 50);
        await n.locator("#loadMoreNotionDestinationsBtn").click();
        await n.waitForFunction(() => document.querySelectorAll(".notion-result").length === 65);
        assert.equal(await n.locator("#loadMoreNotionDestinationsBtn").isVisible(), false);
        assert.match(await n.evaluate(() => document.activeElement.textContent), /Destination 51/);
        assert.equal(await n.evaluate(() => fixture.requests.findLast(request => request.route === "/integrations/notion/destinations").query.cursor), "44444444-4444-4444-4444-444444444444");
        await n.screenshot({ path: path.join(output, "notion-destination-pagination.png") });
        await n.locator("#closeNotionDialogBtn").click();
    });
    await check("Notion empty/error states retain an accessible retry and recover without selecting anything", async () => {
        await n.locator("#chooseNotionSaveDestinationBtn").click();
        await n.locator("#notionSearchInput").fill("no-result-for-this-title");
        await n.waitForFunction(() => !document.getElementById("notionDestinationState").hidden);
        assert.match(await n.locator("#notionDestinationStateTitle").textContent(), /No destinations/);
        await n.screenshot({ path: path.join(output, "notion-empty.png") });
        await n.evaluate(() => { fixture.notionSearchMode = "error"; });
        await n.locator("#refreshNotionDestinationsBtn").click();
        await n.waitForFunction(() => document.getElementById("notionDestinationStateTitle").textContent.includes("Couldn't"));
        await n.screenshot({ path: path.join(output, "notion-discovery-error.png") });
        await n.evaluate(() => { fixture.notionSearchMode = "normal"; });
        await n.locator("#notionSearchInput").fill("Destination 01");
        await n.waitForFunction(() => document.querySelectorAll(".notion-result").length === 1);
        assert.equal(await n.locator("#confirmNotionDestinationBtn").isDisabled(), true);
        await n.locator("#closeNotionDialogBtn").click();
        assert.deepEqual(linked.errors, []);
    });
    await n.close();

    for (const [tick, notion] of [[false, false], [true, false], [false, true], [true, true]]) {
        const sample = await popup({ notionSelected: true });
        const p = sample.page;
        await check(`explicit destinations TickTick=${tick} Notion=${notion} and authoritative status`, async () => {
            if (tick) {
                await p.locator("#connectTickTickFromSaveBtn").click();
                await p.locator("#projectSearchInput").fill("Read");
                await p.locator("#projectSearchInput").press("ArrowDown");
                await p.locator("#projectSearchInput").press("Enter");
            }
            if (notion) await p.locator("#notionDestination").click();
            await p.locator("#saveArticleBtn").click();
            await p.waitForFunction(() => document.getElementById("syncReceipt").hidden === false && document.getElementById("ticktickSyncState").textContent.length);
            const request = await p.evaluate(() => fixture.requests.find(request => request.route === "/content"));
            assert.equal(request.body.destinations.ticktick.enabled, tick);
            assert.equal(request.body.destinations.notion.enabled, notion);
            assert.equal(Object.hasOwn(request.body, "ticktickOptions"), tick);
            assert.equal(await p.locator("#ticktickSyncState").textContent(), tick ? "Synchronized" : "Not requested");
            assert.equal(await p.locator("#notionSyncState").textContent(), notion ? "Synchronized" : "Not requested");
            assert.equal(await p.evaluate(() => fixture.requests.filter(request => request.method === "POST" && request.route.includes("/sync/")).length), 0);
            if (notion) {
                await p.locator("#openConfirmedNotionBtn").click();
                assert.deepEqual(await p.evaluate(() => fixture.openedTabs), ["https://www.notion.so/provider-confirmed-capture"]);
            }
            await p.waitForTimeout(180);
            await p.locator("#syncReceipt").scrollIntoViewIfNeeded();
            await p.screenshot({ path: path.join(output, `destinations-${tick}-${notion}.png`) });
            assert.deepEqual(sample.errors, []);
        });
        await p.close();
    }
    const pending = await popup({ notionSelected: true });
    await check("read-only polling handles queued, failed, uncertain and confirmed provider states", async () => {
        const p = pending.page;
        await p.locator("#notionDestination").click();
        await p.evaluate(() => { fixture.syncStates = { ticktick: { requested: false, status: "not_requested", retryable: false }, notion: { requested: true, status: "pending", retryable: false } }; });
        await p.locator("#saveArticleBtn").click();
        await p.waitForFunction(() => document.getElementById("notionSyncState").textContent === "In progress");
        assert.equal(await p.locator("#notionSyncRetry").isVisible(), false);
        await p.evaluate(() => { fixture.syncStates.notion = { requested: true, status: "uncertain", retryable: false }; });
        await p.locator("#refreshSyncStatusBtn").click();
        await p.waitForFunction(() => document.getElementById("notionSyncState").textContent === "Needs review");
        assert.equal(await p.locator("#notionSyncRetry").isVisible(), false);
        assert.equal(await p.evaluate(() => fixture.requests.filter(r => r.method === "POST" && r.route.includes("/sync/")).length), 0);
        await p.evaluate(() => { fixture.syncStates.notion = { requested: true, status: "failed", retryable: true }; });
        await p.locator("#refreshSyncStatusBtn").click();
        await p.waitForFunction(() => !document.getElementById("notionSyncRetry").hidden);
        await p.locator("#notionSyncRetry").click();
        await p.waitForFunction(() => fixture.requests.some(r => r.method === "POST" && r.route.includes("/sync/")));
        assert.equal(await p.evaluate(() => fixture.requests.filter(r => r.route === "/content").length), 1);
        assert.deepEqual(pending.errors, []);
    });
    await pending.page.close();
    for (const userId of ["fixture-user", "another-user"]) {
        const sample = await popup({ storedReceipt: { userId, contentId: "aaaaaaaaaaaaaaaaaaaaaaaa" } });
        await check(`read-only receipt restore excludes other owners: ${userId}`, async () => {
            assert.equal(await sample.page.locator("#syncReceipt").isVisible(), userId === "fixture-user");
            assert.equal(await sample.page.evaluate(() => fixture.requests.filter(r => r.method === "POST").length), 0);
        });
        await sample.page.close();
    }
    const expired = await popup();
    await check("expired application sessions return to sign-in and retain unsaved content", async () => {
        await expired.page.evaluate(() => { fixture.saveMode = "expired"; });
        await expired.page.locator("#saveArticleBtn").click();
        await expired.page.waitForFunction(() => document.getElementById("onboardingView").style.display === "flex");
        assert.match(await expired.page.locator("#rawText").inputValue(), /Give useful ideas/);
        assert.equal(await expired.page.evaluate(() => fixture.values.sk_token), null);
    });
    await expired.page.close();

    const edited = await popup();
    let draft;
    await check("manual editing persists an owner-scoped draft across popup reopen", async () => {
        await edited.page.locator("#title").focus();
        await edited.page.locator("#title").fill("My unsaved draft");
        await edited.page.locator("#rawText").fill("Do not lose this content after closing the popup.");
        await edited.page.waitForTimeout(220);
        draft = await edited.page.evaluate(() => fixture.values.knowvia_capture_draft);
        assert.equal(draft.title, "My unsaved draft");
    });
    await edited.page.close();
    for (const userId of ["fixture-user", "other-owner"]) {
        const reopened = await popup({ seedDraft: { ...draft, userId } });
        await check(`draft restore is owner scoped: ${userId}`, async () => {
            assert.equal(await reopened.page.locator("#title").inputValue(), userId === "fixture-user" ? "My unsaved draft" : "Designing a calmer reading workflow");
            assert.deepEqual(reopened.errors, []);
        });
        await reopened.page.close();
    }
    const noList = await popup();
    await check("TickTick requires an actual list and its placeholder cannot be selected", async () => {
        const p = noList.page;
        await p.locator("#connectTickTickFromSaveBtn").click();
        await p.locator("#saveArticleBtn").click();
        await p.waitForFunction(() => document.getElementById("statusText").textContent.includes("Choose a TickTick list"));
        assert.equal(await p.evaluate(() => fixture.requests.filter(r => r.route === "/content").length), 0);
        assert.equal(await p.locator('.picker-option[data-project-id=""]').isDisabled(), true);
        await p.locator("#projectSearchInput").press("ArrowDown");
        await p.locator("#projectSearchInput").press("Enter");
        assert.notEqual(await p.locator("#projectSelect").inputValue(), "");
        assert.deepEqual(noList.errors, []);
    });
    await noList.page.close();
    const personalization = await popup({ notionSelected: true });
    let layoutPrefs;
    await check("V2 provider ordering, visibility, hidden-provider exclusion and reset", async () => {
        const p = personalization.page;
        await p.locator('[data-provider="ticktick"] [data-move="-1"]').click();
        assert.deepEqual(await p.locator("#destinationRows > article").evaluateAll(rows => rows.map(row => row.dataset.provider)), ["ticktick", "notion"]);
        await p.locator("#notionDestination").click();
        await p.locator("#managePlatformsBtn").click();
        await p.locator("#showNotionPlatform").uncheck();
        layoutPrefs = await p.evaluate(() => fixture.values["knowvia_platform_layout_fixture-user"]);
        assert.equal(layoutPrefs.visible.notion, false);
        assert.equal(await p.locator("#platformVisibilityDialog").isVisible(), true);
        assert.equal(await p.locator("#email").count(), 1);
        await p.locator("#donePlatformsBtn").click();
        assert.equal(await p.locator('[data-provider="notion"]').isVisible(), false);
        await p.locator("#saveArticleBtn").click();
        await p.waitForFunction(() => fixture.requests.some(request => request.route === "/content"));
        assert.equal(await p.evaluate(() => fixture.requests.find(request => request.route === "/content").body.destinations.notion.enabled), false);
        assert.deepEqual(personalization.errors, []);
    });
    await personalization.page.close();
    const restoredLayout = await popup({ layoutPrefs });
    await check("V2 platform preferences survive reopen and reset without reconnecting", async () => {
        const p = restoredLayout.page;
        assert.equal(await p.locator('[data-provider="notion"]').isVisible(), false);
        assert.deepEqual(await p.locator("#destinationRows > article").evaluateAll(rows => rows.map(row => row.dataset.provider)), ["ticktick", "notion"]);
        await p.locator("#managePlatformsBtn").click();
        await p.locator("#resetPlatformsBtn").click();
        await p.locator("#donePlatformsBtn").click();
        assert.equal(await p.locator('[data-provider="notion"]').isVisible(), true);
        assert.equal(await p.locator("#notionDestination").getAttribute("aria-pressed"), "false");
        assert.deepEqual(await p.evaluate(() => fixture.authActions), []);
        assert.deepEqual(restoredLayout.errors, []);
    });
    await restoredLayout.page.close();
    const wide = await popup({ width: 1440, height: 1046 });
    await check("approved V2 wide composition and honest unsupported attachments", async () => {
        const p = wide.page;
        await p.locator(".main-scroll").evaluate(node => { node.scrollTop = 0; });
        const editor = await p.locator(".v2-editor").boundingBox(), preview = await p.locator("#articlePreview").boundingBox();
        assert.ok(preview.x >= editor.x + editor.width);
        assert.equal(await p.locator(".v2-upload").isDisabled(), true);
        assert.equal(await p.locator(".save-options-section").isVisible(), false);
        await p.screenshot({ path: path.join(output, "v2-approved-wide.png") });
        assert.deepEqual(wide.errors, []);
    });
    await wide.page.close();
    const controls = await popup();
    await check("dropdown toggles, outside click, Escape and unrelated menus remain consistent", async () => {
        const p = controls.page;
        await p.locator("#connectTickTickFromSaveBtn").click();
        await p.locator("#projectPickerToggleBtn").click();
        assert.equal(await p.locator("#projectMenu").isVisible(), true);
        await p.locator("#projectPickerToggleBtn").click();
        assert.equal(await p.locator("#projectMenu").isVisible(), false);
        await p.locator("#addTagBtn").click();
        assert.equal(await p.locator("#tagSuggestions").isVisible(), true);
        await p.locator("#projectSearchInput").focus();
        assert.equal(await p.locator("#tagSuggestions").isVisible(), false);
        await p.locator("#projectSearchInput").press("Escape");
        assert.equal(await p.locator("#projectMenu").isVisible(), false);
        await p.locator("#projectPickerToggleBtn").click();
        await p.locator(".v2-dest-heading h2").click();
        assert.equal(await p.locator("#projectMenu").isVisible(), false);
    });
    await check("account copy and theme work while delivery actions remain absent", async () => {
        const p = controls.page;
        await p.locator("#tabSettings").click();
        await p.locator(".account-details summary").click();
        await p.locator("#copyUserIdBtn").click();
        assert.deepEqual(await p.evaluate(() => fixture.copied), ["fixture-user"]);
        assert.equal(await p.locator("#copyTelegramCommandBtn").isVisible(), false);
        assert.equal(await p.locator("#openTelegramBotBtn").isVisible(), false);
        await p.locator("#themeToggleBtn").click();
        assert.equal(await p.evaluate(() => fixture.values.ticktick_theme), "dark");
        assert.deepEqual(controls.errors, []);
    });
    await controls.page.close();

    for (const [width, height, theme, touch] of [[320, 360, "light", true], [320, 480, "light", true], [375, 600, "dark", true], [480, 600, "light", false], [768, 768, "dark", true], [1280, 800, "light", false]]) {
        const sample = await popup({ width, height, theme, hasTouch: touch, notionSelected: true });
        await check(`${width}×${height} ${theme} Notion modal: bounded layout, isolated scrolling and keyboard focus`, async () => {
            await sample.page.locator("#notionDestination").click();
            await sample.page.locator("#chooseNotionSaveDestinationBtn").click();
            await sample.page.waitForFunction(() => document.querySelectorAll(".notion-result").length === 3);
            await sample.page.waitForTimeout(180);
            const box = await sample.page.locator("#notionDestinationDialog").boundingBox();
            assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height);
            for (const control of ["#closeNotionDialogBtn", "#confirmNotionDestinationBtn", "#cancelNotionDestinationBtn", "#clearNotionDestinationBtn"]) {
                const bounds = await sample.page.locator(control).boundingBox();
                assert.ok(bounds.y >= box.y && bounds.y + bounds.height <= box.y + box.height, `${control} remains inside the dialog`);
                if (touch) assert.ok(bounds.height >= 44, `${control} needs a touch target`);
            }
            await sample.page.locator("#notionSearchInput").press("Shift+Tab");
            await sample.page.keyboard.press("Shift+Tab");
            assert.equal(await sample.page.evaluate(() => document.getElementById("notionDestinationDialog").contains(document.activeElement)), true);
            await sample.page.screenshot({ path: path.join(output, `notion-dialog-${width}-${height}-${theme}.png`) });
            await sample.page.locator("#notionSearchInput").press("Escape");
            assert.equal(await sample.page.evaluate(() => document.getElementById("notionDestinationDialog").open), false);
            assert.equal(await sample.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            assert.deepEqual(sample.errors, []);
        });
        await sample.page.close();
    }

    // Layout and interaction checks exercise the actual shared components at
    // popup, phone, tablet and desktop viewport sizes. No production state is used.
    for (const [width, height, theme, hasTouch] of [
        [320, 480, "light", true], [375, 600, "dark", true],
        [420, 600, "light", false], [480, 600, "light", false],
        [768, 768, "dark", true], [1280, 800, "light", false]
    ]) {
        const sample = await popup({ width, height, theme, hasTouch });
        const p = sample.page;
        await p.locator("#connectTickTickFromSaveBtn").click();
        const name = `${width}-${theme}${hasTouch ? "-touch" : ""}`;
        await check(`${name}: capture, touch targets, glyph rendering and picker boundaries`, async () => {
            assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            const action = await p.locator("#saveArticleBtn").boundingBox();
            assert.ok(action.y >= 0 && action.y + action.height <= height);
            if (hasTouch) {
                for (const selector of ["#tabSettings", "#closePopupBtn", "#refreshPageBtn"]) {
                    const bounds = await p.locator(selector).boundingBox();
                    assert.ok(bounds.width >= 44 && bounds.height >= 44, `${selector} needs a touch target`);
                }
            }
            const emptyGlyphs = await p.locator("svg:not(.icon-definitions)").evaluateAll(icons => icons.filter(icon => {
                const rect = icon.getBoundingClientRect();
                return rect.width && rect.height && icon.getBBox().width === 0;
            }).length);
            assert.equal(emptyGlyphs, 0, "visible vector glyphs must render");
            const lowContrast = await p.evaluate(() => {
                const styles = getComputedStyle(document.documentElement);
                const luminance = token => {
                    let hex = styles.getPropertyValue(token).trim().replace("#", "");
                    if (hex.length === 3) hex = [...hex].map(value => value + value).join("");
                    const rgb = [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
                        .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
                    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
                };
                return [["--ink-0", "--surface"], ["--ink-2", "--bg-3"], ["--ink-3", "--surface"],
                    ["--blue", "--blue-soft"], ["--green", "--green-soft"], ["--red", "--red-soft"],
                    ["--amber", "--amber-soft"], ["--action-ink", "--action"]].filter(([foreground, background]) => {
                    const a = luminance(foreground), b = luminance(background);
                    return !((Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5);
                });
            });
            assert.deepEqual(lowContrast, [], "shared text and semantic color pairs need 4.5:1 contrast");
            await p.screenshot({ path: path.join(output, `capture-${name}.png`) });
            for (const [input, menu] of [["#projectSearchInput", "#projectMenu"], ["#tagInput", "#tagSuggestions"]]) {
                await p.locator(input).focus();
                await p.waitForTimeout(180);
                const viewport = await p.locator(".main-scroll").boundingBox();
                const anchor = await p.locator(input).boundingBox();
                const bounds = await p.locator(menu).boundingBox();
                assert.ok(bounds && bounds.y >= viewport.y - 1 && bounds.y + bounds.height <= viewport.y + viewport.height + 1, `${menu} must fit inside the content viewport`);
                assert.ok(anchor.y >= viewport.y && anchor.y + anchor.height <= viewport.y + viewport.height, "picker input stays visible");
                await p.screenshot({ path: path.join(output, `picker-${menu.slice(1)}-${name}.png`) });
                await p.locator(input).press("Escape");
            }
        });
        await check(`${name}: forms, settings, keyboard focus and lower preferences remain reachable`, async () => {
            await p.locator("#title").focus();
            assert.equal(await p.locator("#captureEditor").isVisible(), true);
            await p.locator("#rawText").scrollIntoViewIfNeeded();
            await p.screenshot({ path: path.join(output, `editor-${name}.png`) });
            await p.locator("#title").focus();
            await p.locator("#tabSettings").click();
            await p.screenshot({ path: path.join(output, `settings-top-${name}.png`) });
            assert.equal(await p.locator("#email").isVisible(), false);
            assert.equal(await p.locator("#telegramQuizToggle").isVisible(), false);
            await p.locator("#settingsManagePlatformsBtn").scrollIntoViewIfNeeded();
            await p.screenshot({ path: path.join(output, `settings-bottom-${name}.png`) });
            await p.locator("#tabSave").click();
            assert.equal(await p.evaluate(() => document.activeElement.id), "tabSettings");
            await p.locator("#tabSettings").press("Tab");
            assert.equal(await p.evaluate(() => document.activeElement.id), "closePopupBtn");
            assert.equal(await p.locator("#closePopupBtn").evaluate(element => getComputedStyle(element).outlineStyle), "solid");
            assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            assert.deepEqual(sample.errors, []);
        });
        await p.close();
    }
    for (const [width, height, theme] of [[320, 480, "light"], [375, 600, "dark"], [768, 768, "light"]]) {
        const sample = await popup({ signedIn: false, width, height, theme, hasTouch: width < 480 });
        await check(`${width}px ${theme} onboarding: sign-in and feedback are reachable`, async () => {
            await sample.page.locator("#connectGoogleBtn").scrollIntoViewIfNeeded();
            await sample.page.screenshot({ path: path.join(output, `onboarding-${width}-${theme}.png`) });
            await sample.page.locator("#connectGoogleBtn").click();
            await sample.page.evaluate(() => fixture.sendChanges({ sk_auth_ui: { provider: "Google", status: "error", message: "Sign-in cancelled. Try again." } }));
            await sample.page.locator("#onboardingAuthStatus").scrollIntoViewIfNeeded();
            assert.match(await sample.page.locator("#onboardingAuthStatus").textContent(), /cancelled/);
            assert.equal(await sample.page.locator("#connectGoogleBtn").isEnabled(), true);
            assert.equal(await sample.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            assert.deepEqual(sample.errors, []);
        });
        await sample.page.close();
    }
} finally { await browser.close(); }
console.log(`${checks} checks passed; ${failures.length} failed. Screenshots: ${output}`);
if (failures.length) process.exitCode = 1;
