/* Shared by the extension and Node image services. No credentials or endpoints. */
globalThis.KnowviaImageLimits = Object.freeze(
{
    maximum: 6,
    sizeLimit: 5 * 1024 * 1024,
    types: Object.freeze(["image/png", "image/jpeg", "image/webp", "image/gif"])
});
