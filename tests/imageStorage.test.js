import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { S3Client } from "@aws-sdk/client-s3";
import { createImageStorageService } from "../services/imageStorageService.js";
import { png } from "./helpers/imageFixture.js";

test("R2 storage signs a single key, enforces size and never returns credentials", async () =>
{
    const sent = [];
    const client = { send: async command =>
    {
        sent.push(command);
        return { ContentLength: png.length, Body: Readable.from([png]) };
    } };
    const signed = [];
    const service = createImageStorageService({ client, bucket: "test-private", sign: async (_client, command, options) =>
    {
        signed.push({ command, options });
        return "https://r2.example.test/signed";
    } });
    const upload = await service.authorize("owner/generated/staging", "image/png", png.length);
    assert.equal(signed[0].command.input.Key, "owner/generated/staging");
    assert.equal(signed[0].command.input.ContentLength, png.length);
    assert.equal(signed[0].command.input.ContentType, "image/png");
    assert.ok(signed[0].options.expiresIn <= 900);
    assert.deepEqual(upload.headers, { "Content-Type": "image/png" });
    const result = await service.read("owner/generated/verified");
    assert.deepEqual(result.bytes, png);
    assert.match(result.sha256, /^[a-f0-9]{64}$/);
    await service.seal("owner/generated/verified", png, "image/png");
    assert.deepEqual(sent.at(-1).input.Body, png);
    await service.remove("owner/generated/verified");
    assert.equal(sent.at(-1).constructor.name, "DeleteObjectCommand");
    await service.display("owner/generated/verified");
    assert.ok(signed.at(-1).options.expiresIn <= 900);
});

test("R2 reads reject declared oversize and streams larger than their metadata", async () =>
{
    for (const declared of [6 * 1024 * 1024, 1])
    {
        const client = { send: async () => ({ ContentLength: declared, Body: Readable.from([Buffer.alloc(6 * 1024 * 1024)]) }) };
        const service = createImageStorageService({ client, bucket: "test-private" });
        await assert.rejects(service.read("key"), /size limit/);
    }
});

test("actual SDK upload signatures bind content length and content type without a network request", async () =>
{
    const client = new S3Client({ endpoint: "https://r2.example.test", region: "auto",
        credentials: { accessKeyId: "isolated-test-key", secretAccessKey: "isolated-test-secret" }, requestChecksumCalculation: "WHEN_REQUIRED" });
    try
    {
        const service = createImageStorageService({ client, bucket: "isolated-private-bucket" });
        const upload = await service.authorize("generated/staging", "image/png", png.length);
        const headers = new URL(upload.uploadUrl).searchParams.get("X-Amz-SignedHeaders").split(";");
        assert.ok(headers.includes("content-length"));
        assert.ok(headers.includes("content-type"));
        assert.ok(headers.includes("host"));
        assert.equal(new URL(upload.uploadUrl).searchParams.has("x-amz-checksum-crc32"), false);
    }
    finally
    {
        client.destroy();
    }
});
