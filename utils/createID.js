import crypto from "crypto";

export const hashToken = (token) =>
{
    return crypto.createHash("sha256").update(token).digest("hex");
};

export const generateUserIdFromToken = (token) =>
{
    const hash = hashToken(token);
    return `USER_${hash.slice(0, 16)}`;
};