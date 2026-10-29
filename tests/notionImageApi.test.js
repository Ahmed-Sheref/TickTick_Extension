import test from "node:test";
import assert from "node:assert/strict";
import { createNotionApiClient } from "../utils/notionApi.js";
import { png } from "./helpers/imageFixture.js";

test("Notion file API shares credential binding and sends native multipart without a JSON header", async () =>
{
    const id = "11111111-2222-3333-4444-555555555555";
    const connection = { accountId: "test-account", credentialVersion: 1 };
    let requests = 0;
    const client = createNotionApiClient({
        credentials: { getForUser: async input => { assert.equal(input.userId, "owner"); return { accessToken: "isolated-token", connection }; } },
        getConfig: () => ({ apiVersion: "2026-03-11" }),
        fetchImpl: async (url, options) =>
        {
            requests++;
            assert.equal(url, `https://api.notion.com/v1/file_uploads/${id}/send`);
            assert.equal(options.redirect, "error");
            assert.equal(options.headers.Authorization, "Bearer isolated-token");
            assert.equal(options.headers["Notion-Version"], "2026-03-11");
            assert.equal(Object.hasOwn(options.headers, "Content-Type"), false);
            assert.ok(options.body instanceof FormData);
            assert.deepEqual(Buffer.from(await options.body.get("file").arrayBuffer()), png);
            return Response.json({ object: "file_upload", id, status: "uploaded", content_length: png.length, content_type: "image/png" });
        }
    });
    const form = new FormData();
    form.append("file", new Blob([png], { type: "image/png" }), "image.png");
    const result = await client.request({ userId: "owner", method: "POST", path: `/file_uploads/${id}/send`, body: form, connection });
    assert.equal(result.data.status, "uploaded");
    await assert.rejects(client.request({ userId: "owner", method: "POST", path: "https://attacker.example/send", body: form }));
    await assert.rejects(client.request({ userId: "owner", method: "POST", path: "/pages", body: form }));
    assert.equal(requests, 1);
});
