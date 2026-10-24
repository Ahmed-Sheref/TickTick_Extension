import express from "express";
import { randomBytes, createHash } from "node:crypto";
import User from "../Models/User.js";
import AuthIdentity from "../Models/AuthIdentity.js";
import GoogleOAuthState from "../Models/GoogleOAuthState.js";
import OAuthExchange from "../Models/OAuthExchange.js";
import {
    getGoogleAuthUrl,
    exchangeGoogleCode,
    verifyGoogleIdentity
} from "../utils/googleOAuth.js";
import { createAppToken } from "../utils/jwt.js";

const STATE_EXPIRY_MS = 10 * 60 * 1000;
const EXCHANGE_EXPIRY_MS = 60 * 1000;

// Log classifications only: OAuth errors may contain tokens, request bodies,
// account details, and credentials in their message/response/config fields.
const callbackErrorDetails = (stage, error) =>
{
    const names = new Set([
        "Error", "TypeError", "GaxiosError", "MongoServerError", "MongooseError",
        "ValidationError", "CastError", "MongoNetworkError", "MongoServerSelectionError"
    ]);
    const networkCodes = new Set([
        "ENOTFOUND", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN",
        "CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "ERR_TLS_CERT_ALTNAME_INVALID"
    ]);
    const providerCodes = new Set([
        "invalid_grant", "invalid_client", "unauthorized_client", "redirect_uri_mismatch",
        "access_denied", "invalid_request", "invalid_scope", "server_error",
        "temporarily_unavailable", "unsupported_grant_type"
    ]);
    const code = error?.code;
    const httpStatus = error?.response?.status ?? error?.statusCode;
    const providerError = error?.response?.data?.error;

    return {
        stage,
        errorType: names.has(error?.name) ? error.name : "UnclassifiedError",
        code: Number.isSafeInteger(code) || networkCodes.has(code) ? code : null,
        httpStatus: Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599
            ? httpStatus : null,
        providerError: providerCodes.has(providerError) ? providerError : null
    };
};

const hashValue = (value) =>
{
    return createHash("sha256").update(value).digest("hex");
};

const createGoogleCodeChallenge = (verifier) =>
{
    return createHash("sha256").update(verifier).digest("base64url");
};

const generateAppUserId = () =>
{
    return `USER_${randomBytes(16).toString("hex")}`;
};

const getAllowedRedirects = () =>
{
    return (process.env.ALLOWED_EXTENSION_REDIRECT_URIS || "")
        .split(",")
        .map((uri) => uri.trim())
        .filter(Boolean);
};

const resolveOrCreateGoogleUser = async (
{
    providerSubject,
    email,
    UserModel,
    AuthIdentityModel
}) =>
{
    const existingIdentity = await AuthIdentityModel.findOne(
    {
        provider: "google",
        providerSubject
    });

    if (existingIdentity)
    {
        const existingUser = await UserModel.findOne(
        {
            userId: existingIdentity.userId
        });

        if (!existingUser)
        {
            const missingUserError = new Error("Authenticated user not found");
            missingUserError.statusCode = 401;
            throw missingUserError;
        }

        if (!existingUser.email && email)
        {
            existingUser.email = email;
            await existingUser.save();
        }

        return existingUser;
    }

    const newUser = await UserModel.create(
    {
        userId: generateAppUserId(),
        email: email || null
    });

    try
    {
        await AuthIdentityModel.create(
        {
            userId: newUser.userId,
            provider: "google",
            providerSubject
        });

        return newUser;
    }
    catch (error)
    {
        await UserModel.deleteOne({ _id: newUser._id }).catch(() => {});

        if (error?.code === 11000)
        {
            const concurrentIdentity = await AuthIdentityModel.findOne(
            {
                provider: "google",
                providerSubject
            });

            if (concurrentIdentity)
            {
                const concurrentUser = await UserModel.findOne(
                {
                    userId: concurrentIdentity.userId
                });

                if (concurrentUser)
                {
                    return concurrentUser;
                }
            }
        }

        throw error;
    }
};

export const createGoogleAuthRouter = (dependencies = {}) =>
{
    const {
        UserModel = User,
        AuthIdentityModel = AuthIdentity,
        GoogleOAuthStateModel = GoogleOAuthState,
        OAuthExchangeModel = OAuthExchange,
        getGoogleAuthUrlFn = getGoogleAuthUrl,
        exchangeGoogleCodeFn = exchangeGoogleCode,
        verifyGoogleIdentityFn = verifyGoogleIdentity,
        getAllowedRedirectsFn = getAllowedRedirects,
        createAppTokenFn = createAppToken
    } = dependencies;

    const router = express.Router();

    const startGoogleAuth = async (req, res) =>
    {
        try
        {
            const { redirect_uri, client_nonce, code_challenge } = req.query;

            if (!redirect_uri)
            {
                return res.status(400).json(
                {
                    status: "error",
                    message: "Missing extension redirect_uri"
                });
            }

            if (
                typeof redirect_uri !== "string" ||
                typeof client_nonce !== "string" ||
                !/^[A-Za-z0-9_-]{32,128}$/.test(client_nonce) ||
                typeof code_challenge !== "string" ||
                !/^[a-f0-9]{64}$/.test(code_challenge)
            )
            {
                return res.status(400).json(
                {
                    status: "error",
                    message: "Invalid OAuth parameters"
                });
            }

            if (!getAllowedRedirectsFn().includes(redirect_uri))
            {
                return res.status(400).json(
                {
                    status: "error",
                    message: "Unauthorized redirect URI"
                });
            }

            const state = randomBytes(32).toString("base64url");
            const googleNonce = randomBytes(32).toString("base64url");
            const googleCodeVerifier = randomBytes(32).toString("base64url");
            const googleCodeChallenge = createGoogleCodeChallenge(googleCodeVerifier);

            await GoogleOAuthStateModel.create(
            {
                stateHash: hashValue(state),
                extensionRedirectUri: redirect_uri,
                clientNonce: client_nonce,
                extensionCodeChallenge: code_challenge,
                googleNonce,
                googleCodeVerifier,
                expiresAt: new Date(Date.now() + STATE_EXPIRY_MS)
            });

            const authUrl = getGoogleAuthUrlFn(
            {
                state,
                nonce: googleNonce,
                codeChallenge: googleCodeChallenge
            });

            return res.redirect(authUrl);
        }
        catch (error)
        {
            console.error("[GOOGLE OAUTH] Failed to initialize OAuth");

            return res.status(500).json(
            {
                status: "error",
                message: "Failed to initialize Google OAuth"
            });
        }
    };

    router.get("/", startGoogleAuth);
    router.get("/auth", startGoogleAuth);

    router.get("/callback", async (req, res) =>
    {
        let stage = "validate_callback";
        try
        {
            const { code, state, error: oauthError } = req.query;

            if (
                oauthError ||
                typeof code !== "string" ||
                typeof state !== "string" ||
                !code.trim() ||
                !/^[A-Za-z0-9_-]{32,128}$/.test(state)
            )
            {
                return res.status(400).json(
                {
                    status: "error",
                    message: "Missing or invalid code or state"
                });
            }

            stage = "load_oauth_state";
            const savedState = await GoogleOAuthStateModel.findOneAndDelete(
            {
                stateHash: hashValue(state),
                expiresAt:
                {
                    $gt: new Date()
                }
            }).select("+googleCodeVerifier");

            if (!savedState || !savedState.googleCodeVerifier)
            {
                return res.status(400).json(
                {
                    status: "error",
                    message: "Invalid, expired, or already used OAuth state"
                });
            }

            if (!getAllowedRedirectsFn().includes(savedState.extensionRedirectUri))
            {
                return res.status(400).json(
                {
                    status: "error",
                    message: "Unauthorized OAuth redirect"
                });
            }

            stage = "exchange_google_code";
            const idToken = await exchangeGoogleCodeFn(
            {
                code,
                codeVerifier: savedState.googleCodeVerifier
            });

            stage = "verify_google_identity";
            const identity = await verifyGoogleIdentityFn(
            {
                idToken,
                expectedNonce: savedState.googleNonce
            });

            if (!identity?.providerSubject || typeof identity.providerSubject !== "string")
            {
                return res.status(401).json(
                {
                    status: "error",
                    message: "Invalid Google identity"
                });
            }

            stage = "resolve_user";
            const user = await resolveOrCreateGoogleUser(
            {
                providerSubject: identity.providerSubject,
                email: identity.email || null,
                UserModel,
                AuthIdentityModel
            });

            const exchangeCode = randomBytes(32).toString("base64url");

            stage = "create_extension_exchange";
            await OAuthExchangeModel.create(
            {
                codeHash: hashValue(exchangeCode),
                codeChallenge: savedState.extensionCodeChallenge,
                userId: user.userId,
                expiresAt: new Date(Date.now() + EXCHANGE_EXPIRY_MS)
            });

            stage = "redirect_to_extension";
            const finalRedirectUrl = new URL(savedState.extensionRedirectUri);
            finalRedirectUrl.searchParams.set("exchange_code", exchangeCode);
            finalRedirectUrl.searchParams.set("client_nonce", savedState.clientNonce);

            return res.redirect(finalRedirectUrl.toString());
        }
        catch (error)
        {
            console.error(
                "[GOOGLE OAUTH] Callback authentication failed",
                callbackErrorDetails(stage, error)
            );

            const statusCode = error?.statusCode === 401 ? 401 : 500;

            return res.status(statusCode).json(
            {
                status: "error",
                message: "Google authentication failed"
            });
        }
    });

    router.post("/exchange", async (req, res) =>
    {
        try
        {
            const requestBody = req.body || {};
            const exchangeCode = requestBody.exchange_code || requestBody.code;
            const pkceVerifier = requestBody.verifier || requestBody.codeVerifier;

            if (
                typeof exchangeCode !== "string" ||
                typeof pkceVerifier !== "string" ||
                !/^[A-Za-z0-9_-]{43}$/.test(exchangeCode) ||
                !/^[a-f0-9]{64}$/.test(pkceVerifier)
            )
            {
                return res.status(400).json(
                {
                    status: "error",
                    message: "Invalid OAuth exchange parameters"
                });
            }

            const codeChallenge = createHash("sha256").update(pkceVerifier).digest("hex");

            const savedExchange = await OAuthExchangeModel.findOneAndDelete(
            {
                codeHash: hashValue(exchangeCode),
                codeChallenge,
                expiresAt:
                {
                    $gt: new Date()
                }
            });

            if (!savedExchange)
            {
                return res.status(400).json(
                {
                    status: "error",
                    message: "Invalid, expired, or already used exchange code"
                });
            }

            const user = await UserModel.findOne(
            {
                userId: savedExchange.userId
            });

            if (!user)
            {
                return res.status(401).json(
                {
                    status: "error",
                    message: "OAuth user not found"
                });
            }

            const appToken = createAppTokenFn(user);

            return res.status(200).json(
            {
                status: "success",
                data:
                {
                    userId: user.userId,
                    token: appToken
                }
            });
        }
        catch (error)
        {
            console.error("[GOOGLE OAUTH] Exchange failed");

            return res.status(500).json(
            {
                status: "error",
                message: "Failed to exchange OAuth code"
            });
        }
    });

    return router;
};

export default createGoogleAuthRouter();
