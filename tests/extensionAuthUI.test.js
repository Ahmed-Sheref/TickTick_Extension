import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { webcrypto } from "node:crypto";

const source = await readFile(new URL("../extension/background.js", import.meta.url), "utf8");

function fixture({ cancel = false, width = 420, height = 550, stored = {}, transformRedirect,
    status = 200, linkProvider = "ticktick", authorizationUrl = linkProvider === "notion"
        ? "https://api.notion.com/v1/oauth/authorize?state=example"
        : "https://ticktick.com/oauth/authorize?state=example" } = {})
{
    let messageListener;
    let windowListener;
    let finish;
    let releaseFlow;
    const done = new Promise(resolve => { finish = resolve; });
    const gate = new Promise(resolve => { releaseFlow = resolve; });
    const values = { sk_userId: "google-user", sk_token: "google-jwt", sk_signed_in: true, ...stored };
    const updates = [];
    const exchanges = [];
    const launches = [];
    const chrome = {
        runtime: {
            onMessage: { addListener: fn => { messageListener = fn; } },
            onInstalled: { addListener() {} }
        },
        tabs: {
            query: async () => [{ id: 7, windowId: 3 }],
            update: async () => {}
        },
        windows: {
            get: async () => ({ left: 100, top: 50, width, height }),
            update: async (id, update) => { updates.push({ id, ...update }); },
            onCreated: {
                addListener: fn => { windowListener = fn; },
                removeListener: () => { windowListener = null; }
            }
        },
        identity: {
            getRedirectURL: provider => `https://test.chromiumapp.org/${provider}`,
            launchWebAuthFlow: async ({ url }) => {
                launches.push(url);
                windowListener({ id: 8, type: "popup" });
                await gate;
                if (cancel) throw new Error("The user cancelled sign-in");
                const auth = new URL(url);
                const linking = ["https://ticktick.com", "https://api.notion.com"].includes(auth.origin);
                const request = linking ? exchanges[0].body : null;
                const redirect = linking
                    ? `${request.redirect_uri}?${linkProvider}_link=connected&client_nonce=${request.client_nonce}`
                    : `${auth.searchParams.get("redirect_uri")}?exchange_code=example&client_nonce=${auth.searchParams.get("client_nonce")}`;
                return transformRedirect ? transformRedirect(redirect) : redirect;
            }
        },
        storage: { local: {
            get: async keys => Object.fromEntries(keys.map(key => [key, values[key]])),
            set: async update => { Object.assign(values, update); }
        } },
        action: {
            openPopup: async () => { finish(); },
            setBadgeText: async () => {},
            setBadgeBackgroundColor: async () => {}
        },
        contextMenus: { onClicked: { addListener() {} } }
    };
    runInNewContext(source, {
        chrome, crypto: webcrypto, TextEncoder, URL,
        console: { log() {}, warn() {}, error() {} },
        fetch: async (url, options) => {
            exchanges.push({ url, ...options, body: JSON.parse(options.body) });
            return { ok: status === 200, status, json: async () => ({ data: url.endsWith(`/integrations/${linkProvider}/link`)
                ? { authorizationUrl } : { userId: "example-user", token: "example-token" } }) };
        }
    });
    return {
        values, updates, exchanges, launches, done, releaseFlow,
        send: action => new Promise(resolve => messageListener({ action }, {}, resolve)),
        get listenerRemoved() { return windowListener === null; }
    };
}

for (const provider of ["Google", "TickTick"]) {
    test(`${provider}: connection feedback, bounded window, and popup return`, async () => {
        const ui = fixture();
        assert.equal((await ui.send(`start${provider}Auth`)).started, true);
        assert.equal(ui.values.sk_auth_ui.status, "pending");
        assert.equal((await ui.send("getConnectionState")).pending, true);
        assert.match((await ui.send(`start${provider}Auth`)).error, /already in progress/);
        ui.releaseFlow();
        await ui.done;
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(ui.values.sk_auth_ui.status, "success");
        assert.equal(ui.values.sk_auth_ui.provider, provider);
        assert.equal((await ui.send("getConnectionState")).pending, false);
        const popup = ui.updates.find(update => update.id === 8);
        assert.equal(popup.width, 388);
        assert.equal(popup.height, 502);
        assert.equal(popup.left, 116);
        assert.equal(popup.top, 74);
        assert.equal(ui.listenerRemoved, true);
        assert.equal(ui.exchanges.length, 1);
        if (provider === "Google")
        {
            assert.equal(ui.exchanges[0].body.exchange_code, "example");
            assert.equal(ui.exchanges[0].body.verifier.length, 64);
            assert.equal(ui.values.sk_signed_in, true);
            assert.equal(ui.values.sk_token, "example-token");
        }
        else
        {
            assert.equal(ui.values.ticktick_connected, true);
            assert.equal(ui.exchanges[0].url, "http://localhost:3000/api/v1/integrations/ticktick/link");
            assert.equal(ui.exchanges[0].method, "POST");
            assert.equal(ui.exchanges[0].headers.Authorization, "Bearer google-jwt");
            assert.equal(ui.exchanges[0].redirect, "error");
            assert.equal(ui.exchanges[0].body.redirect_uri, "https://test.chromiumapp.org/ticktick");
            assert.match(ui.exchanges[0].body.client_nonce, /^[a-f0-9]{64}$/);
            assert.deepEqual(Object.keys(ui.exchanges[0].body).sort(), ["client_nonce", "redirect_uri"]);
            assert.equal(ui.values.sk_userId, "google-user");
            assert.equal(ui.values.sk_token, "google-jwt");
            assert.equal(ui.values.sk_signed_in, true);
            assert.equal(ui.launches[0], "https://ticktick.com/oauth/authorize?state=example");
            assert.equal(ui.values.ticktick_token, undefined);
        }
    });
}

test("cancelled connection reports a retryable error and reopens the popup", async () => {
    const ui = fixture({ cancel: true });
    await ui.send("startGoogleAuth");
    ui.releaseFlow();
    await ui.done;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(ui.values.sk_auth_ui.status, "error");
    assert.match(ui.values.sk_auth_ui.message, /Try again/);
    assert.equal(ui.exchanges.length, 0);
    assert.equal(ui.listenerRemoved, true);
    assert.equal((await ui.send("getConnectionState")).pending, false);
});

for (const [provider, expectedWidth, expectedHeight] of [["Google", 560, 700], ["TickTick", 560, 700], ["Notion", 560, 700]]) {
    test(`${provider}: authorization window stays compact on a large display`, async () => {
        const ui = fixture({ width: 1440, height: 900, linkProvider: provider === "Notion" ? "notion" : "ticktick" });
        await ui.send(`start${provider}Auth`);
        ui.releaseFlow();
        await ui.done;
        const popup = ui.updates.find(update => update.id === 8);
        assert.equal(popup.width, expectedWidth);
        assert.equal(popup.height, expectedHeight);
        assert.equal(popup.left, 100 + (1440 - expectedWidth) / 2);
        assert.equal(popup.top, 50 + (900 - expectedHeight) / 2);
    });
}

const oldConnection = {
    ticktick_connected: true,
    ticktick_projects: [{ id: "old-project", name: "Previous account" }],
    ticktick_selectedProjectId: "old-project"
};

test("TickTick reconnect preserves the Google session and clears the previous destination only after success", async () =>
{
    const ui = fixture({ stored: oldConnection });
    await ui.send("startTickTickAuth");
    assert.equal(ui.values.ticktick_selectedProjectId, "old-project");
    ui.releaseFlow();
    await ui.done;
    assert.equal(ui.values.sk_auth_ui.status, "success");
    assert.equal(ui.values.sk_userId, "google-user");
    assert.equal(ui.values.sk_token, "google-jwt");
    assert.equal(ui.values.sk_signed_in, true);
    assert.equal(ui.values.ticktick_connected, true);
    assert.equal(ui.values.ticktick_selectedProjectId, "");
    assert.equal(ui.values.ticktick_projects.length, 0);
    assert.deepEqual(Object.keys(ui.values).sort(), [
        "sk_auth_ui", "sk_signed_in", "sk_token", "sk_userId", "ticktick_connected",
        "ticktick_projects", "ticktick_selectedProjectId"
    ]);
});

for (const [name, transformRedirect] of [
    ["invalid nonce", value => value.replace(/client_nonce=[^&]+/, "client_nonce=wrong")],
    ["missing nonce", value => value.replace(/&client_nonce=[^&]+/, "")],
    ["wrong origin", value => value.replace("test.chromiumapp.org", "evil.example")],
    ["wrong path", value => value.replace("/ticktick?", "/google?")],
    ["wrong scheme", value => value.replace("https:", "http:")],
    ["URL credentials", value => value.replace("https://", "https://user:password@")],
    ["fragment", value => `${value}#connected`],
    ["missing success marker", value => value.replace("ticktick_link=connected", "ticktick_link=failed")],
    ["duplicate nonce", value => `${value}&client_nonce=wrong`],
    ["duplicate success marker", value => `${value}&ticktick_link=connected`],
    ["unexpected token", value => `${value}&access_token=must-not-be-stored`],
    ["empty redirect", () => undefined],
    ["malformed redirect", () => "invalid"]
])
{
    test(`TickTick rejects ${name} without changing the prior connection or session`, async () =>
    {
        const ui = fixture({ stored: oldConnection, transformRedirect });
        await ui.send("startTickTickAuth");
        ui.releaseFlow();
        await ui.done;
        assert.equal(ui.values.sk_auth_ui.status, "error");
        assert.equal(ui.values.sk_userId, "google-user");
        assert.equal(ui.values.sk_token, "google-jwt");
        assert.equal(ui.values.ticktick_connected, true);
        assert.equal(ui.values.ticktick_selectedProjectId, "old-project");
        assert.deepEqual(ui.values.ticktick_projects, oldConnection.ticktick_projects);
        assert.equal(ui.exchanges.length, 1);
        assert.equal(ui.listenerRemoved, true);
    });
}

test("TickTick cancellation leaves a first link unconnected and the application signed in", async () =>
{
    const ui = fixture({ cancel: true });
    await ui.send("startTickTickAuth");
    ui.releaseFlow();
    await ui.done;
    assert.equal(ui.values.sk_auth_ui.status, "error");
    assert.equal(ui.values.ticktick_connected, undefined);
    assert.equal(ui.values.sk_token, "google-jwt");
    assert.equal(ui.values.sk_userId, "google-user");
    assert.equal(ui.listenerRemoved, true);
});

test("TickTick reconnect cancellation preserves the previous selection", async () =>
{
    const ui = fixture({ cancel: true, stored: oldConnection });
    await ui.send("startTickTickAuth");
    ui.releaseFlow();
    await ui.done;
    assert.equal(ui.values.sk_auth_ui.status, "error");
    assert.equal(ui.values.ticktick_connected, true);
    assert.equal(ui.values.ticktick_selectedProjectId, "old-project");
});

test("TickTick requires sk_token and does not fall back to a legacy TickTick token", async () =>
{
    const ui = fixture({ stored: { sk_token: undefined, ticktick_token: "legacy-token" } });
    await ui.send("startTickTickAuth");
    await ui.done;
    assert.equal(ui.values.sk_auth_ui.status, "error");
    assert.equal(ui.exchanges.length, 0);
    assert.equal(ui.launches.length, 0);
    assert.equal(ui.values.ticktick_connected, undefined);
});

for (const status of [401, 409, 503])
{
    test(`TickTick initiation HTTP ${status} cannot report a successful connection`, async () =>
    {
        const ui = fixture({ status, stored: oldConnection });
        await ui.send("startTickTickAuth");
        await ui.done;
        assert.equal(ui.values.sk_auth_ui.status, "error");
        assert.equal(ui.launches.length, 0);
        assert.equal(ui.values.ticktick_selectedProjectId, "old-project");
        assert.equal(ui.values.sk_token, "google-jwt");
    });
}

test("TickTick rejects an unexpected authorization URL before opening a provider window", async () =>
{
    const ui = fixture({ authorizationUrl: "https://evil.example/oauth/authorize" });
    await ui.send("startTickTickAuth");
    await ui.done;
    assert.equal(ui.values.sk_auth_ui.status, "error");
    assert.equal(ui.launches.length, 0);
});

test("TickTick does not mark a different application session as connected", async () =>
{
    const ui = fixture();
    await ui.send("startTickTickAuth");
    // Wait until initiation has captured the original session and opened OAuth.
    await new Promise(resolve => setImmediate(resolve));
    ui.values.sk_token = "another-session";
    ui.values.sk_userId = "another-user";
    ui.releaseFlow();
    await ui.done;
    assert.equal(ui.values.sk_auth_ui.status, "error");
    assert.equal(ui.values.ticktick_connected, undefined);
    assert.equal(ui.values.sk_token, "another-session");
    assert.equal(ui.values.sk_userId, "another-user");
});

test("an already-open popup reloads TickTick lists after confirmed reconnect", async () =>
{
    const popup = await readFile(new URL("../extension/popup.js", import.meta.url), "utf8");
    const listener = popup.slice(popup.indexOf("chrome.storage.onChanged.addListener"), popup.indexOf("// Start with intrinsic"));
    let onChanged;
    let projectLoads = 0;
    const context = {
        chrome: { storage: { onChanged: { addListener: handler => { onChanged = handler; } } } },
        STORAGE_KEYS: { authUI: "sk_auth_ui" },
        storageGet: async () => ({ sk_auth_ui: { provider: "TickTick", status: "success" } }),
        resolveAuthState: () => ({ userId: "google-user", isSignedIn: true, isTickTickConnected: true }),
        renderAuthUI() {}, setConnectedUI() {}, switchTab() {}, fillTelegramCommand() {}, setUserIdDisplay() {},
        refreshPageData() {}, loadUserPreferences() {}, loadTags() {}, loadNotionStatus() {},
        el: { appView: { style: { display: "flex" } }, title: { value: "Unsaved title" }, rawText: { value: "Unsaved content" } },
        draftOwnerId: "google-user", syncUI: { restore() {}, reset() {} },
        notionUI: { reset() {} }, ticktickSelected: false, notionSelected: false,
        selectedTags: [], renderSelectedTags() {},
        loadTickTickProjects: async () => { projectLoads++; }, console
    };
    runInNewContext(listener, context);
    onChanged({ sk_auth_ui: { newValue: { provider: "TickTick", status: "pending" } } }, "local");
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(projectLoads, 0);
    onChanged({ sk_auth_ui: { newValue: { provider: "TickTick", status: "success" } } }, "local");
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(projectLoads, 1);
});

test("Notion links the current Google account without changing its session or TickTick destination", async () =>
{
    const ui = fixture({ linkProvider: "notion", stored: oldConnection });
    assert.equal((await ui.send("startNotionAuth")).started, true);
    assert.equal((await ui.send("startTickTickAuth")).error, "Sign-in is already in progress.");
    assert.equal(ui.values.sk_auth_ui.status, "pending");
    ui.releaseFlow();
    await ui.done;
    assert.equal(ui.values.sk_auth_ui.status, "success");
    assert.equal(ui.values.sk_auth_ui.provider, "Notion");
    assert.equal(ui.exchanges.length, 1);
    assert.equal(ui.exchanges[0].url, "http://localhost:3000/api/v1/integrations/notion/link");
    assert.equal(ui.exchanges[0].headers.Authorization, "Bearer google-jwt");
    assert.equal(ui.exchanges[0].redirect, "error");
    assert.equal(ui.exchanges[0].body.redirect_uri, "https://test.chromiumapp.org/notion");
    assert.match(ui.exchanges[0].body.client_nonce, /^[a-f0-9]{64}$/);
    assert.deepEqual(Object.keys(ui.exchanges[0].body).sort(), ["client_nonce", "redirect_uri"]);
    assert.equal(ui.values.sk_token, "google-jwt");
    assert.equal(ui.values.sk_userId, "google-user");
    assert.equal(ui.values.ticktick_selectedProjectId, "old-project");
    assert.deepEqual(ui.values.ticktick_projects, oldConnection.ticktick_projects);
    assert.equal(ui.values.notion_token, undefined);
    assert.equal(ui.listenerRemoved, true);
});

for (const [name, transformRedirect] of [
    ["wrong origin", value => value.replace("test.chromiumapp.org", "evil.example")],
    ["wrong path", value => value.replace("/notion?", "/ticktick?")],
    ["wrong nonce", value => value.replace(/client_nonce=[^&]+/, "client_nonce=wrong")],
    ["duplicate nonce", value => `${value}&client_nonce=wrong`],
    ["wrong marker", value => value.replace("notion_link", "ticktick_link")],
    ["duplicate marker", value => `${value}&notion_link=connected`],
    ["unexpected credentials", value => `${value}&access_token=must-not-be-stored`],
    ["fragment", value => `${value}#access_token=must-not-be-stored`],
    ["empty redirect", () => undefined]
])
{
    test(`Notion rejects ${name} and preserves existing connections`, async () =>
    {
        const ui = fixture({ linkProvider: "notion", stored: oldConnection, transformRedirect });
        await ui.send("startNotionAuth");
        ui.releaseFlow();
        await ui.done;
        assert.equal(ui.values.sk_auth_ui.status, "error");
        assert.equal(ui.values.sk_token, "google-jwt");
        assert.equal(ui.values.ticktick_selectedProjectId, "old-project");
        assert.equal(ui.listenerRemoved, true);
        assert.doesNotMatch(JSON.stringify(ui.values.sk_auth_ui), /must-not-be-stored|evil\.example/);
    });
}

for (const status of [400, 401, 403, 409, 502, 503])
{
    test(`Notion initiation HTTP ${status} remains retryable without launching OAuth`, async () =>
    {
        const ui = fixture({ linkProvider: "notion", status });
        await ui.send("startNotionAuth");
        await ui.done;
        assert.equal(ui.values.sk_auth_ui.status, "error");
        assert.equal(ui.launches.length, 0);
        assert.equal(ui.values.sk_token, "google-jwt");
    });
}

test("Notion cancellation reports cancellation without marking a connection successful", async () =>
{
    const ui = fixture({ linkProvider: "notion", cancel: true });
    await ui.send("startNotionAuth");
    ui.releaseFlow();
    await ui.done;
    assert.equal(ui.values.sk_auth_ui.status, "error");
    assert.match(ui.values.sk_auth_ui.message, /cancelled/);
});

test("Notion rejects a provider URL outside its exact authorization origin and path", async () =>
{
    const ui = fixture({ linkProvider: "notion", authorizationUrl: "https://api.notion.com/other" });
    await ui.send("startNotionAuth");
    await ui.done;
    assert.equal(ui.launches.length, 0);
    assert.equal(ui.values.sk_auth_ui.status, "error");
});

test("Notion cannot attach a completed authorization to a changed application session", async () =>
{
    const ui = fixture({ linkProvider: "notion" });
    await ui.send("startNotionAuth");
    await new Promise(resolve => setImmediate(resolve));
    ui.values.sk_token = "another-session";
    ui.releaseFlow();
    await ui.done;
    assert.equal(ui.values.sk_auth_ui.status, "error");
    assert.equal(ui.values.sk_token, "another-session");
});
