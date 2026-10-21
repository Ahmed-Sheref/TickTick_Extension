
import { OAuth2Client } from "google-auth-library";

const getGoogleClient = () =>
{
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri)
    {
        throw new Error("Google OAuth configuration is missing");
    }

    return new OAuth2Client(
    {
        clientId,
        clientSecret,
        redirectUri
    });
};

const getGoogleAuthUrl = ({ state, nonce, codeChallenge }) =>
{
    if (!state || !nonce || !codeChallenge)
    {
        throw new Error("Missing Google OAuth security parameters");
    }

    const client = getGoogleClient();

    return client.generateAuthUrl(
    {
        response_type: "code",
        scope: ["openid", "email", "profile"],
        access_type: "online",
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: "S256"
    });
};

const exchangeGoogleCode = async ({ code, codeVerifier }) =>
{
    if (!code || !codeVerifier)
    {
        throw new Error("Missing Google authorization code or verifier");
    }

    const client = getGoogleClient();

    const { tokens } = await client.getToken(
    {
        code,
        codeVerifier
    });

    if (!tokens.id_token)
    {
        throw new Error("Google ID token was not returned");
    }

    return tokens.id_token;
};

const verifyGoogleIdentity = async ({ idToken, expectedNonce }) =>
{
    if (!idToken || !expectedNonce)
    {
        throw new Error("Missing Google identity verification parameters");
    }

    const client = getGoogleClient();

    const ticket = await client.verifyIdToken(
    {
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();

    if (!payload?.sub || payload.nonce !== expectedNonce)
    {
        throw new Error("Invalid Google identity");
    }

    return {
        providerSubject: payload.sub,
        email: payload.email_verified === true ? payload.email : null,
        name: payload.name || null
    };
};

export 
{
    getGoogleAuthUrl,
    exchangeGoogleCode,
    verifyGoogleIdentity
};
