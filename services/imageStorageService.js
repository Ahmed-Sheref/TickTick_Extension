import { createHash } from "node:crypto";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { imageError, imageLimits, imagePolicy } from "./imageConfig.js";

export function createImageStorageService({ client, bucket, sign = getSignedUrl } = {})
{
    const connection = () =>
    {
        if (client && bucket) return { client, bucket };
        const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_S3_ENDPOINT } = process.env;
        if (!R2_BUCKET_NAME || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !/^[a-f0-9]{32}$/i.test(R2_ACCOUNT_ID || ""))
            throw imageError("Image storage is not configured.", 503);
        const endpoint = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
        if (R2_S3_ENDPOINT && R2_S3_ENDPOINT !== endpoint) throw imageError("Image storage endpoint is invalid.", 503);
        client = new S3Client({ region: process.env.R2_REGION || "auto", endpoint,
            requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
            credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY }, maxAttempts: 2 });
        bucket = R2_BUCKET_NAME;
        return { client, bucket };
    };
    const send = command => connection().client.send(command, { abortSignal: AbortSignal.timeout(30000) });
    const parameters = key => ({ Bucket: connection().bucket, Key: key });
    return {
        async authorize(key, mimeType, size)
        {
            const command = new PutObjectCommand({ ...parameters(key), ContentType: mimeType, ContentLength: size });
            const uploadUrl = await sign(connection().client, command, { expiresIn: imagePolicy().uploadSeconds, signableHeaders: new Set(["content-type", "content-length"]) });
            return { uploadUrl, headers: { "Content-Type": mimeType } };
        },
        async read(key)
        {
            const result = await send(new GetObjectCommand(parameters(key)));
            if (!Number.isSafeInteger(result.ContentLength) || result.ContentLength < 1 || result.ContentLength > imageLimits.sizeLimit)
            {
                result.Body?.destroy();
                throw imageError("The uploaded image exceeds the size limit.");
            }
            const chunks = [];
            let size = 0;
            try
            {
                for await (const chunk of result.Body)
                {
                    size += chunk.length;
                    if (size > imageLimits.sizeLimit) throw imageError("The uploaded image exceeds the size limit.");
                    chunks.push(Buffer.from(chunk));
                }
            }
            finally
            {
                result.Body?.destroy();
            }
            const bytes = Buffer.concat(chunks);
            return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
        },
        // A server-only immutable copy prevents later reuse of the upload URL
        // from changing bytes that passed verification.
        async seal(key, bytes, mimeType)
        {
            await send(new PutObjectCommand({ ...parameters(key), Body: bytes, ContentType: mimeType, ContentLength: bytes.length }));
        },
        async remove(key)
        {
            await send(new DeleteObjectCommand(parameters(key)));
        },
        async display(key)
        {
            return sign(connection().client, new GetObjectCommand({ ...parameters(key), ResponseContentDisposition: "inline" }), { expiresIn: imagePolicy().downloadSeconds });
        }
    };
}
export default createImageStorageService();
