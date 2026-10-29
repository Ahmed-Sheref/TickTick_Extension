import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
const context = { URL };
runInNewContext(await readFile(new URL("../extension/provider-links.js", import.meta.url), "utf8"), context);
const links = context.KnowviaProviderLinks;
test("TickTick app action requires a confirmed requested task and never fabricates a direct task URL", () =>
{
    for (const status of ["queued", "pending", "failed", "uncertain"]) assert.equal(links.ticktick({ requested: true, status, taskId: "confirmed-task" }), null);
    assert.equal(links.ticktick({ requested: true, status: "synced" }), null);
    assert.equal(links.ticktick({ requested: false, status: "synced", taskId: "task" }), null);
    assert.equal(links.ticktick({ requested: true, status: "synced", taskId: "task" }), "https://ticktick.com/webapp/");
});
test("Notion link resolver rejects credentials, executable URLs and unrelated hosts", () =>
{
    for (const value of ["javascript:alert(1)", "https://user:secret@notion.so/page", "https://notion.so.evil.test/page"]) assert.equal(links.notion(value), null);
    assert.equal(links.notion("https://www.notion.so/page"), "https://www.notion.so/page");
});
