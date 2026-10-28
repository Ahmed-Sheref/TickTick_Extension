import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

test("toolbar action opens the approved wide capture surface and retains the original source tab", async () =>
{
    const source = await readFile(new URL("../extension/background.js", import.meta.url), "utf8");
    const manifest = JSON.parse(await readFile(new URL("../extension/manifest.json", import.meta.url), "utf8"));
    assert.equal(manifest.action.default_popup, undefined);
    let click;
    const windows = [];
    const values = {};
    const chrome = {
        runtime: { getURL: path => `chrome-extension://fixture/${path}`, onMessage: { addListener() {} }, onInstalled: { addListener() {} } },
        action: { onClicked: { addListener: handler => { click = handler; } }, setBadgeText: async () => {} },
        storage: { local: { get: async () => values, set: async updates => Object.assign(values, updates) } },
        windows: {
            get: async id => id === 1 ? { width: 1440, height: 1040, left: 0, top: 0 } : {
                id: 5, tabs: [{ id: 6, url: "chrome-extension://fixture/popup.html?sourceTab=7" }]
            },
            create: async options => { windows.push(options); return { id: 5 }; },
            update: async (id, options) => { assert.equal(id, 5); assert.equal(options.focused, true); }
        },
        tabs: { update: async (id, options) => { assert.equal(id, 6); assert.match(options.url, /sourceTab=8$/); } },
        contextMenus: { onClicked: { addListener() {} } }
    };
    runInNewContext(source, { chrome, console, URL });
    click({ id: 7, windowId: 1 });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(windows.length, 1);
    assert.equal(windows[0].width, 1270);
    assert.equal(windows[0].height, 960);
    assert.equal(windows[0].type, "popup");
    assert.match(windows[0].url, /sourceTab=7$/);
    assert.equal(values.knowvia_capture_window, 5);
    click({ id: 8, windowId: 1 });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(windows.length, 1, "Reuse the capture window on the next click");
});
