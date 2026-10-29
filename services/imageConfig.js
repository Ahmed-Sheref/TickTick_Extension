import "../extension/image-limits.js";

export const imageLimits = globalThis.KnowviaImageLimits;
const seconds = (name, fallback, maximum) =>
{
    const value = Number(process.env[name] || fallback);
    if (!Number.isInteger(value) || value < 60 || value > maximum)
        throw new Error(`Invalid ${name} configuration`);
    return value;
};
const dailyLimit = () =>
{
    const value = Number(process.env.IMAGE_DAILY_UPLOAD_LIMIT || 120);
    if (!Number.isInteger(value) || value < 1 || value > 1000) throw new Error("Invalid IMAGE_DAILY_UPLOAD_LIMIT configuration");
    return value;
};
export const imagePolicy = () => (
{
    dailyUploads: dailyLimit(),
    uploadSeconds: seconds("IMAGE_UPLOAD_URL_SECONDS", 300, 900),
    abandonedSeconds: seconds("IMAGE_ABANDONED_SECONDS", 86400, 172800),
    recoverySeconds: seconds("IMAGE_RECOVERY_SECONDS", 604800, 2592000),
    downloadSeconds: seconds("IMAGE_DOWNLOAD_URL_SECONDS", 300, 900)
});
export const imageError = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
export const imageId = value => typeof value === "string" && /^[a-f0-9]{24}$/i.test(value);

export function validateImageMetadata(input)
{
    if (!input || typeof input !== "object" || Array.isArray(input) ||
        Object.keys(input).some(key => !["filename", "size", "mimeType"].includes(key)) ||
        typeof input.filename !== "string" || !input.filename.trim() || input.filename.length > 180 ||
        /[\x00-\x1f\x7f/\\]/.test(input.filename) || !imageLimits.types.includes(input.mimeType) ||
        !Number.isSafeInteger(input.size) || input.size < 1 || input.size > imageLimits.sizeLimit)
        throw imageError("Choose a PNG, JPEG, WebP or GIF image up to 5 MiB with a valid filename.");
    return { filename: input.filename.trim(), size: input.size, mimeType: input.mimeType };
}

export function imageSignature(bytes)
{
    if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString("ascii", 12, 16) === "IHDR") return "image/png";
    if (bytes.length >= 12 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
    if (bytes.length >= 10 && ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))) return "image/gif";
    if (bytes.length >= 16 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" && ["VP8 ", "VP8L", "VP8X"].includes(bytes.toString("ascii", 12, 16))) return "image/webp";
    throw imageError("The uploaded file is not a supported image.");
}
