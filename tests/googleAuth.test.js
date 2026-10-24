import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { OAuth2Client } from "google-auth-library";

import GoogleOAuthState from "../Models/GoogleOAuthState.js";
import {
    getGoogleAuthUrl,
    exchangeGoogleCode,
    verifyGoogleIdentity
} from "../utils/googleOAuth.js";
import { createGoogleAuthRouter } from "../Routes/googleAuthRoute.js";

// ============================================================================
// 1. Models/GoogleOAuthState.js Tests
// ============================================================================

const googleOAuthStateIndexes = GoogleOAuthState.schema.indexes();

const getIndex = (fields) =>
{
    return googleOAuthStateIndexes.find((index) =>
    {
        const keys = Object.keys(index[0]);
        const expected = Object.keys(fields);

        return keys.length === expected.length
            && expected.every((key) => index[0][key] === fields[key]);
    });
};

test("GoogleOAuthState: valid document passes validation", async () =>
{
    const stateDoc = new GoogleOAuthState(
    {
        stateHash: "a".repeat(64),
        extensionRedirectUri: "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/google",
        clientNonce: "b".repeat(64),
        extensionCodeChallenge: "c".repeat(64),
        googleNonce: "d".repeat(43),
        googleCodeVerifier: "e".repeat(43),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });

    await stateDoc.validate();

    assert.equal(stateDoc.stateHash, "a".repeat(64));
    assert.equal(stateDoc.extensionCodeChallenge, "c".repeat(64));
    assert.equal(stateDoc.googleNonce, "d".repeat(43));
});

test("GoogleOAuthState: all security fields are required", async () =>
{
    const emptyDoc = new GoogleOAuthState({});

    await assert.rejects(
        () => emptyDoc.validate(),
        (error) =>
        {
            assert.equal(error.errors.stateHash.kind, "required");
            assert.equal(error.errors.extensionRedirectUri.kind, "required");
            assert.equal(error.errors.clientNonce.kind, "required");
            assert.equal(error.errors.extensionCodeChallenge.kind, "required");
            assert.equal(error.errors.googleNonce.kind, "required");
            assert.equal(error.errors.googleCodeVerifier.kind, "required");
            assert.equal(error.errors.expiresAt.kind, "required");
            return true;
        }
    );
});

test("GoogleOAuthState: googleCodeVerifier has select: false by default", () =>
{
    const verifierPath = GoogleOAuthState.schema.path("googleCodeVerifier");

    assert.ok(verifierPath);
    assert.equal(verifierPath.options.select, false);
});

test("GoogleOAuthState: stateHash is unique", () =>
{
    const stateHashPath = GoogleOAuthState.schema.path("stateHash");

    assert.ok(stateHashPath);
    assert.equal(stateHashPath.options.unique, true);
});

test("GoogleOAuthState: expiresAt has TTL index with expireAfterSeconds 0", () =>
{
    const index = getIndex({ expiresAt: 1 });

    assert.ok(index);
    assert.equal(index[1].expireAfterSeconds, 0);
});

// ============================================================================
// 2. utils/googleOAuth.js Tests
// ============================================================================

const withTestGoogleEnv = async (fn) =>
{
    const prevId = process.env.GOOGLE_CLIENT_ID;
    const prevSecret = process.env.GOOGLE_CLIENT_SECRET;
    const prevRedirect = process.env.GOOGLE_REDIRECT_URI;

    process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
    process.env.GOOGLE_REDIRECT_URI = "http://localhost:3000/api/v1/auth/google/callback";

    try
    {
        await fn();
    }
    finally
    {
        if (prevId === undefined) delete process.env.GOOGLE_CLIENT_ID;
        else process.env.GOOGLE_CLIENT_ID = prevId;

        if (prevSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
        else process.env.GOOGLE_CLIENT_SECRET = prevSecret;

        if (prevRedirect === undefined) delete process.env.GOOGLE_REDIRECT_URI;
        else process.env.GOOGLE_REDIRECT_URI = prevRedirect;
    }
};

test("googleOAuth: getGoogleAuthUrl throws when env config is missing", () =>
{
    const prevId = process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_ID;

    try
    {
        assert.throws(
            () => getGoogleAuthUrl(
            {
                state: "state_1",
                nonce: "nonce_1",
                codeChallenge: "challenge_1"
            }),
            /Google OAuth configuration is missing/
        );
    }
    finally
    {
        if (prevId !== undefined) process.env.GOOGLE_CLIENT_ID = prevId;
    }
});

test("googleOAuth: getGoogleAuthUrl builds authorization URL with OIDC and PKCE params", async () =>
{
    await withTestGoogleEnv(async () =>
    {
        const urlString = getGoogleAuthUrl(
        {
            state: "test_state_val",
            nonce: "test_nonce_val",
            codeChallenge: "test_challenge_val"
        });

        const parsed = new URL(urlString);

        assert.equal(parsed.origin, "https://accounts.google.com");
        assert.equal(parsed.searchParams.get("client_id"), "test-google-client-id");
        assert.equal(
            parsed.searchParams.get("redirect_uri"),
            "http://localhost:3000/api/v1/auth/google/callback"
        );
        assert.equal(parsed.searchParams.get("response_type"), "code");
        assert.equal(parsed.searchParams.get("scope"), "openid email profile");
        assert.equal(parsed.searchParams.get("state"), "test_state_val");
        assert.equal(parsed.searchParams.get("nonce"), "test_nonce_val");
        assert.equal(parsed.searchParams.get("code_challenge"), "test_challenge_val");
        assert.equal(parsed.searchParams.get("code_challenge_method"), "S256");
    });
});

test("googleOAuth: exchangeGoogleCode returns id_token and passes codeVerifier", async () =>
{
    const originalGetToken = OAuth2Client.prototype.getToken;

    await withTestGoogleEnv(async () =>
    {
        let receivedOptions = null;

        OAuth2Client.prototype.getToken = async function (options)
        {
            receivedOptions = options;
            return {
                tokens:
                {
                    id_token: "mock_id_token_xyz"
                }
            };
        };

        try
        {
            const idToken = await exchangeGoogleCode(
            {
                code: "auth_code_123",
                codeVerifier: "pkce_verifier_456"
            });

            assert.equal(idToken, "mock_id_token_xyz");
            assert.deepEqual(receivedOptions,
            {
                code: "auth_code_123",
                codeVerifier: "pkce_verifier_456"
            });
        }
        finally
        {
            OAuth2Client.prototype.getToken = originalGetToken;
        }
    });
});

test("googleOAuth: verifyGoogleIdentity returns providerSubject and verified email", async () =>
{
    const originalVerifyIdToken = OAuth2Client.prototype.verifyIdToken;

    await withTestGoogleEnv(async () =>
    {
        OAuth2Client.prototype.verifyIdToken = async function ()
        {
            return {
                getPayload: () => (
                {
                    sub: "google_sub_1001",
                    nonce: "expected_nonce_abc",
                    email: "verified@example.com",
                    email_verified: true,
                    name: "Ahmed"
                })
            };
        };

        try
        {
            const identity = await verifyGoogleIdentity(
            {
                idToken: "valid_id_token",
                expectedNonce: "expected_nonce_abc"
            });

            assert.deepEqual(identity,
            {
                providerSubject: "google_sub_1001",
                email: "verified@example.com",
                name: "Ahmed"
            });
        }
        finally
        {
            OAuth2Client.prototype.verifyIdToken = originalVerifyIdToken;
        }
    });
});

test("googleOAuth: verifyGoogleIdentity sets email to null when email_verified is false", async () =>
{
    const originalVerifyIdToken = OAuth2Client.prototype.verifyIdToken;

    await withTestGoogleEnv(async () =>
    {
        OAuth2Client.prototype.verifyIdToken = async function ()
        {
            return {
                getPayload: () => (
                {
                    sub: "google_sub_1002",
                    nonce: "expected_nonce_abc",
                    email: "unverified@example.com",
                    email_verified: false
                })
            };
        };

        try
        {
            const identity = await verifyGoogleIdentity(
            {
                idToken: "valid_id_token",
                expectedNonce: "expected_nonce_abc"
            });

            assert.equal(identity.providerSubject, "google_sub_1002");
            assert.equal(identity.email, null);
        }
        finally
        {
            OAuth2Client.prototype.verifyIdToken = originalVerifyIdToken;
        }
    });
});

test("googleOAuth: verifyGoogleIdentity rejects on nonce mismatch or missing sub", async () =>
{
    const originalVerifyIdToken = OAuth2Client.prototype.verifyIdToken;

    await withTestGoogleEnv(async () =>
    {
        OAuth2Client.prototype.verifyIdToken = async function ()
        {
            return {
                getPayload: () => (
                {
                    sub: "google_sub_1003",
                    nonce: "wrong_nonce"
                })
            };
        };

        try
        {
            await assert.rejects(
                () => verifyGoogleIdentity(
                {
                    idToken: "valid_id_token",
                    expectedNonce: "expected_nonce_abc"
                }),
                /Invalid Google identity/
            );
        }
        finally
        {
            OAuth2Client.prototype.verifyIdToken = originalVerifyIdToken;
        }
    });
});

// ============================================================================
// 3. Routes/googleAuthRoute.js Tests
// ============================================================================

const ALLOWED_REDIRECT_URI = "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/google";
const VALID_CLIENT_NONCE = "n".repeat(64);
const VALID_EXT_CHALLENGE = "c".repeat(64);

const invokeRouter = (router, { method = "GET", path = "/", query = {}, body = {} }) =>
{
    return new Promise((resolve, reject) =>
    {
        const req =
        {
            method,
            url: path,
            originalUrl: path,
            query,
            body
        };

        const response =
        {
            statusCode: 200,
            body: null,
            redirectUrl: null
        };

        const res =
        {
            status(code)
            {
                response.statusCode = code;
                return this;
            },
            json(payload)
            {
                response.body = payload;
                resolve(response);
                return this;
            },
            redirect(url)
            {
                response.statusCode = 302;
                response.redirectUrl = url;
                resolve(response);
                return this;
            }
        };

        router(req, res, (error) =>
        {
            if (error)
            {
                reject(error);
                return;
            }

            resolve(response);
        });
    });
};

test("googleAuthRoute GET /auth: rejects missing redirect_uri", async () =>
{
    const router = createGoogleAuthRouter(
    {
        getAllowedRedirectsFn: () => [ALLOWED_REDIRECT_URI]
    });

    const res = await invokeRouter(router,
    {
        path: "/auth",
        query:
        {
            client_nonce: VALID_CLIENT_NONCE,
            code_challenge: VALID_EXT_CHALLENGE
        }
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, "Missing extension redirect_uri");
});

test("googleAuthRoute GET /auth: rejects unauthorized redirect_uri", async () =>
{
    const router = createGoogleAuthRouter(
    {
        getAllowedRedirectsFn: () => [ALLOWED_REDIRECT_URI]
    });

    const res = await invokeRouter(router,
    {
        path: "/auth",
        query:
        {
            redirect_uri: "https://evil.example.com/callback",
            client_nonce: VALID_CLIENT_NONCE,
            code_challenge: VALID_EXT_CHALLENGE
        }
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, "Unauthorized redirect URI");
});

test("googleAuthRoute GET /auth: rejects invalid client_nonce or code_challenge format", async () =>
{
    const router = createGoogleAuthRouter(
    {
        getAllowedRedirectsFn: () => [ALLOWED_REDIRECT_URI]
    });

    const res = await invokeRouter(router,
    {
        path: "/auth",
        query:
        {
            redirect_uri: ALLOWED_REDIRECT_URI,
            client_nonce: "short_nonce",
            code_challenge: "not_hex"
        }
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, "Invalid OAuth parameters");
});

test("googleAuthRoute GET /auth: persists hashed state and redirects to Google", async () =>
{
    let createdStateRecord = null;
    let authUrlParams = null;

    const router = createGoogleAuthRouter(
    {
        getAllowedRedirectsFn: () => [ALLOWED_REDIRECT_URI],
        GoogleOAuthStateModel:
        {
            create: async (doc) =>
            {
                createdStateRecord = doc;
                return doc;
            }
        },
        getGoogleAuthUrlFn: (params) =>
        {
            authUrlParams = params;
            return "https://accounts.google.com/o/oauth2/v2/auth?mock=1";
        }
    });

    const res = await invokeRouter(router,
    {
        path: "/auth",
        query:
        {
            redirect_uri: ALLOWED_REDIRECT_URI,
            client_nonce: VALID_CLIENT_NONCE,
            code_challenge: VALID_EXT_CHALLENGE
        }
    });

    assert.equal(res.statusCode, 302);
    assert.equal(res.redirectUrl, "https://accounts.google.com/o/oauth2/v2/auth?mock=1");

    assert.ok(createdStateRecord);
    assert.ok(authUrlParams);

    const expectedStateHash = createHash("sha256")
        .update(authUrlParams.state)
        .digest("hex");

    assert.equal(createdStateRecord.stateHash, expectedStateHash);
    assert.notEqual(createdStateRecord.stateHash, authUrlParams.state);
    assert.equal(createdStateRecord.googleNonce, authUrlParams.nonce);
    assert.equal(createdStateRecord.extensionCodeChallenge, VALID_EXT_CHALLENGE);

    const expectedGoogleChallenge = createHash("sha256")
        .update(createdStateRecord.googleCodeVerifier)
        .digest("base64url");

    assert.equal(authUrlParams.codeChallenge, expectedGoogleChallenge);
});

test("googleAuthRoute GET /callback: rejects missing, expired, or reused state", async () =>
{
    const router = createGoogleAuthRouter(
    {
        getAllowedRedirectsFn: () => [ALLOWED_REDIRECT_URI],
        GoogleOAuthStateModel:
        {
            findOneAndDelete: () => (
            {
                select: async () => null
            })
        }
    });

    const res = await invokeRouter(router,
    {
        path: "/callback",
        query:
        {
            code: "google_auth_code_123",
            state: "s".repeat(43)
        }
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, "Invalid, expired, or already used OAuth state");
});

test("googleAuthRoute GET /callback: creates new User, AuthIdentity, and OAuthExchange on first sign-in", async () =>
{
    const rawState = "s".repeat(43);
    let createdUser = null;
    let createdIdentity = null;
    let createdExchange = null;

    const router = createGoogleAuthRouter(
    {
        getAllowedRedirectsFn: () => [ALLOWED_REDIRECT_URI],
        GoogleOAuthStateModel:
        {
            findOneAndDelete: (filter) =>
            {
                const expectedHash = createHash("sha256").update(rawState).digest("hex");
                assert.equal(filter.stateHash, expectedHash);
                assert.ok(filter.expiresAt.$gt instanceof Date);

                return {
                    select: async (fields) =>
                    {
                        assert.equal(fields, "+googleCodeVerifier");
                        return {
                            extensionRedirectUri: ALLOWED_REDIRECT_URI,
                            clientNonce: VALID_CLIENT_NONCE,
                            extensionCodeChallenge: VALID_EXT_CHALLENGE,
                            googleNonce: "g_nonce_123",
                            googleCodeVerifier: "g_verifier_123"
                        };
                    }
                };
            }
        },
        exchangeGoogleCodeFn: async ({ code, codeVerifier }) =>
        {
            assert.equal(code, "valid_google_code");
            assert.equal(codeVerifier, "g_verifier_123");
            return "verified_id_token";
        },
        verifyGoogleIdentityFn: async ({ idToken, expectedNonce }) =>
        {
            assert.equal(idToken, "verified_id_token");
            assert.equal(expectedNonce, "g_nonce_123");
            return {
                providerSubject: "google_subject_999",
                email: "newuser@example.com",
                name: "New User"
            };
        },
        AuthIdentityModel:
        {
            findOne: async () => null,
            create: async (doc) =>
            {
                createdIdentity = doc;
                return doc;
            }
        },
        UserModel:
        {
            create: async (doc) =>
            {
                createdUser = { _id: "mongo_id_1", ...doc };
                return createdUser;
            }
        },
        OAuthExchangeModel:
        {
            create: async (doc) =>
            {
                createdExchange = doc;
                return doc;
            }
        }
    });

    const res = await invokeRouter(router,
    {
        path: "/callback",
        query:
        {
            code: "valid_google_code",
            state: rawState
        }
    });

    assert.equal(res.statusCode, 302);
    assert.ok(createdUser);
    assert.match(createdUser.userId, /^USER_[a-f0-9]{32}$/);
    assert.equal(createdUser.email, "newuser@example.com");

    assert.deepEqual(createdIdentity,
    {
        userId: createdUser.userId,
        provider: "google",
        providerSubject: "google_subject_999"
    });

    const redirectUrl = new URL(res.redirectUrl);
    const exchangeCode = redirectUrl.searchParams.get("exchange_code");

    assert.equal(redirectUrl.origin + redirectUrl.pathname, ALLOWED_REDIRECT_URI);
    assert.equal(redirectUrl.searchParams.get("client_nonce"), VALID_CLIENT_NONCE);
    assert.equal(redirectUrl.searchParams.get("token"), null);
    assert.ok(exchangeCode);

    const expectedExchangeHash = createHash("sha256").update(exchangeCode).digest("hex");
    assert.equal(createdExchange.codeHash, expectedExchangeHash);
    assert.equal(createdExchange.codeChallenge, VALID_EXT_CHALLENGE);
    assert.equal(createdExchange.userId, createdUser.userId);
});

test("googleAuthRoute GET /callback: reuses existing User when AuthIdentity already exists", async () =>
{
    let userCreateCalled = false;

    const router = createGoogleAuthRouter(
    {
        getAllowedRedirectsFn: () => [ALLOWED_REDIRECT_URI],
        GoogleOAuthStateModel:
        {
            findOneAndDelete: () => (
            {
                select: async () => (
                {
                    extensionRedirectUri: ALLOWED_REDIRECT_URI,
                    clientNonce: VALID_CLIENT_NONCE,
                    extensionCodeChallenge: VALID_EXT_CHALLENGE,
                    googleNonce: "g_nonce_123",
                    googleCodeVerifier: "g_verifier_123"
                })
            })
        },
        exchangeGoogleCodeFn: async () => "verified_id_token",
        verifyGoogleIdentityFn: async () => (
        {
            providerSubject: "existing_google_sub",
            email: "existing@example.com"
        }),
        AuthIdentityModel:
        {
            findOne: async () => (
            {
                userId: "USER_existing12345678",
                provider: "google",
                providerSubject: "existing_google_sub"
            })
        },
        UserModel:
        {
            findOne: async ({ userId }) => (
            {
                userId,
                email: "existing@example.com"
            }),
            create: async () =>
            {
                userCreateCalled = true;
            }
        },
        OAuthExchangeModel:
        {
            create: async (doc) =>
            {
                assert.equal(doc.userId, "USER_existing12345678");
                return doc;
            }
        }
    });

    const res = await invokeRouter(router,
    {
        path: "/callback",
        query:
        {
            code: "valid_google_code",
            state: "s".repeat(43)
        }
    });

    assert.equal(res.statusCode, 302);
    assert.equal(userCreateCalled, false);
});

test("googleAuthRoute GET /callback: handles concurrent duplicate AuthIdentity (11000) safely", async () =>
{
    let deletedUserId = null;

    const router = createGoogleAuthRouter(
    {
        getAllowedRedirectsFn: () => [ALLOWED_REDIRECT_URI],
        GoogleOAuthStateModel:
        {
            findOneAndDelete: () => (
            {
                select: async () => (
                {
                    extensionRedirectUri: ALLOWED_REDIRECT_URI,
                    clientNonce: VALID_CLIENT_NONCE,
                    extensionCodeChallenge: VALID_EXT_CHALLENGE,
                    googleNonce: "g_nonce_123",
                    googleCodeVerifier: "g_verifier_123"
                })
            })
        },
        exchangeGoogleCodeFn: async () => "verified_id_token",
        verifyGoogleIdentityFn: async () => (
        {
            providerSubject: "concurrent_google_sub",
            email: "race@example.com"
        }),
        AuthIdentityModel:
        {
            findOne: async () =>
            {
                if (!deletedUserId)
                {
                    return null;
                }

                return {
                    userId: "USER_winner1234567890",
                    provider: "google",
                    providerSubject: "concurrent_google_sub"
                };
            },
            create: async () =>
            {
                const duplicateError = new Error("E11000 duplicate key error");
                duplicateError.code = 11000;
                throw duplicateError;
            }
        },
        UserModel:
        {
            create: async (doc) => ({ _id: "temp_orphan_id", ...doc }),
            deleteOne: async ({ _id }) =>
            {
                deletedUserId = _id;
            },
            findOne: async ({ userId }) => ({ userId, email: "race@example.com" })
        },
        OAuthExchangeModel:
        {
            create: async (doc) =>
            {
                assert.equal(doc.userId, "USER_winner1234567890");
                return doc;
            }
        }
    });

    const res = await invokeRouter(router,
    {
        path: "/callback",
        query:
        {
            code: "valid_google_code",
            state: "s".repeat(43)
        }
    });

    assert.equal(res.statusCode, 302);
    assert.equal(deletedUserId, "temp_orphan_id");
});

// ============================================================================
// 4. POST /exchange Tests
// These tests use in-memory mocks. They do not prove a live Google login
// or a real MongoDB unique-index race.
// ============================================================================

const VALID_EXCHANGE_CODE = "E".repeat(43);
const VALID_PKCE_VERIFIER = "a".repeat(64);
const EXPECTED_CODE_CHALLENGE = createHash("sha256")
    .update(VALID_PKCE_VERIFIER)
    .digest("hex");
const EXPECTED_CODE_HASH = createHash("sha256")
    .update(VALID_EXCHANGE_CODE)
    .digest("hex");

const createExchangeRouter = (overrides = {}) =>
{
    return createGoogleAuthRouter(
    {
        UserModel:
        {
            findOne: async () => null,
            create: async () =>
            {
                throw new Error("User.create must not run during Google exchange");
            }
        },
        AuthIdentityModel:
        {
            create: async () =>
            {
                throw new Error("AuthIdentity.create must not run during Google exchange");
            }
        },
        OAuthExchangeModel:
        {
            findOneAndDelete: async () => null
        },
        createAppTokenFn: () =>
        {
            throw new Error("Application JWT must not be issued on failure");
        },
        ...overrides
    });
};

test("googleAuthRoute POST /exchange: issues application JWT for a valid unused code", async () =>
{
    let findQuery = null;
    let createAppTokenCalls = 0;
    let userCreateCalled = false;

    const router = createExchangeRouter(
    {
        OAuthExchangeModel:
        {
            findOneAndDelete: async (query) =>
            {
                findQuery = query;
                return {
                    codeHash: EXPECTED_CODE_HASH,
                    codeChallenge: EXPECTED_CODE_CHALLENGE,
                    userId: "USER_googleabcdef1234"
                };
            }
        },
        UserModel:
        {
            findOne: async ({ userId }) => (
            {
                _id:
                {
                    toString: () => "mongo_google_user"
                },
                userId,
                tickTickConnected: false
            }),
            create: async () =>
            {
                userCreateCalled = true;
            }
        },
        createAppTokenFn: (user) =>
        {
            createAppTokenCalls += 1;
            assert.equal(user.userId, "USER_googleabcdef1234");
            return "save-knowledge-app-jwt";
        }
    });

    const res = await invokeRouter(router,
    {
        method: "POST",
        path: "/exchange",
        body:
        {
            exchange_code: VALID_EXCHANGE_CODE,
            verifier: VALID_PKCE_VERIFIER
        }
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "success");
    assert.equal(res.body.data.userId, "USER_googleabcdef1234");
    assert.equal(res.body.data.token, "save-knowledge-app-jwt");
    assert.equal(res.body.data.id_token, undefined);
    assert.equal(res.body.data.access_token, undefined);
    assert.equal(createAppTokenCalls, 1);
    assert.equal(userCreateCalled, false);
    assert.equal(findQuery.codeHash, EXPECTED_CODE_HASH);
    assert.equal(findQuery.codeChallenge, EXPECTED_CODE_CHALLENGE);
    assert.ok(findQuery.expiresAt.$gt instanceof Date);
});

test("googleAuthRoute POST /exchange: accepts code and codeVerifier aliases", async () =>
{
    const router = createExchangeRouter(
    {
        OAuthExchangeModel:
        {
            findOneAndDelete: async () => (
            {
                userId: "USER_googleabcdef1234"
            })
        },
        UserModel:
        {
            findOne: async () => (
            {
                _id: { toString: () => "mongo_google_user" },
                userId: "USER_googleabcdef1234"
            }),
            create: async () =>
            {
                throw new Error("User.create must not run during Google exchange");
            }
        },
        createAppTokenFn: () => "save-knowledge-app-jwt"
    });

    const res = await invokeRouter(router,
    {
        method: "POST",
        path: "/exchange",
        body:
        {
            code: VALID_EXCHANGE_CODE,
            codeVerifier: VALID_PKCE_VERIFIER
        }
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.token, "save-knowledge-app-jwt");
});

test("googleAuthRoute POST /exchange: rejects missing or invalid exchange parameters", async () =>
{
    let jwtIssued = false;

    const router = createExchangeRouter(
    {
        createAppTokenFn: () =>
        {
            jwtIssued = true;
            return "should-not-issue";
        }
    });

    const res = await invokeRouter(router,
    {
        method: "POST",
        path: "/exchange",
        body: {}
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, "Invalid OAuth exchange parameters");
    assert.equal(jwtIssued, false);
});

test("googleAuthRoute POST /exchange: rejects a PKCE verifier that does not match", async () =>
{
    let jwtIssued = false;
    const wrongVerifier = "b".repeat(64);

    const router = createExchangeRouter(
    {
        OAuthExchangeModel:
        {
            findOneAndDelete: async (query) =>
            {
                assert.notEqual(query.codeChallenge, EXPECTED_CODE_CHALLENGE);
                return null;
            }
        },
        createAppTokenFn: () =>
        {
            jwtIssued = true;
            return "should-not-issue";
        }
    });

    const res = await invokeRouter(router,
    {
        method: "POST",
        path: "/exchange",
        body:
        {
            exchange_code: VALID_EXCHANGE_CODE,
            verifier: wrongVerifier
        }
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, "Invalid, expired, or already used exchange code");
    assert.equal(jwtIssued, false);
});

test("googleAuthRoute POST /exchange: rejects an expired or unknown exchange code", async () =>
{
    let jwtIssued = false;

    const router = createExchangeRouter(
    {
        OAuthExchangeModel:
        {
            findOneAndDelete: async (query) =>
            {
                assert.ok(query.expiresAt.$gt instanceof Date);
                return null;
            }
        },
        createAppTokenFn: () =>
        {
            jwtIssued = true;
            return "should-not-issue";
        }
    });

    const res = await invokeRouter(router,
    {
        method: "POST",
        path: "/exchange",
        body:
        {
            exchange_code: VALID_EXCHANGE_CODE,
            verifier: VALID_PKCE_VERIFIER
        }
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, "Invalid, expired, or already used exchange code");
    assert.equal(jwtIssued, false);
});

test("googleAuthRoute POST /exchange: rejects reuse of a consumed exchange code", async () =>
{
    let remainingUses = 1;
    let jwtIssued = 0;

    const router = createExchangeRouter(
    {
        OAuthExchangeModel:
        {
            findOneAndDelete: async () =>
            {
                if (remainingUses < 1)
                {
                    return null;
                }

                remainingUses -= 1;

                return {
                    userId: "USER_googleabcdef1234"
                };
            }
        },
        UserModel:
        {
            findOne: async () => (
            {
                _id: { toString: () => "mongo_google_user" },
                userId: "USER_googleabcdef1234"
            }),
            create: async () =>
            {
                throw new Error("User.create must not run during Google exchange");
            }
        },
        createAppTokenFn: () =>
        {
            jwtIssued += 1;
            return "save-knowledge-app-jwt";
        }
    });

    const firstRes = await invokeRouter(router,
    {
        method: "POST",
        path: "/exchange",
        body:
        {
            exchange_code: VALID_EXCHANGE_CODE,
            verifier: VALID_PKCE_VERIFIER
        }
    });

    const secondRes = await invokeRouter(router,
    {
        method: "POST",
        path: "/exchange",
        body:
        {
            exchange_code: VALID_EXCHANGE_CODE,
            verifier: VALID_PKCE_VERIFIER
        }
    });

    assert.equal(firstRes.statusCode, 200);
    assert.equal(secondRes.statusCode, 400);
    assert.equal(secondRes.body.message, "Invalid, expired, or already used exchange code");
    assert.equal(jwtIssued, 1);
});

test("googleAuthRoute POST /exchange: fails safely when the linked user is missing", async () =>
{
    let jwtIssued = false;
    let userCreateCalled = false;

    const router = createExchangeRouter(
    {
        OAuthExchangeModel:
        {
            findOneAndDelete: async () => (
            {
                userId: "USER_missing000000000"
            })
        },
        UserModel:
        {
            findOne: async () => null,
            create: async () =>
            {
                userCreateCalled = true;
            }
        },
        createAppTokenFn: () =>
        {
            jwtIssued = true;
            return "should-not-issue";
        }
    });

    const res = await invokeRouter(router,
    {
        method: "POST",
        path: "/exchange",
        body:
        {
            exchange_code: VALID_EXCHANGE_CODE,
            verifier: VALID_PKCE_VERIFIER
        }
    });

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.message, "OAuth user not found");
    assert.equal(jwtIssued, false);
    assert.equal(userCreateCalled, false);
});

test("ticktick POST /auth/exchange: still rejects invalid parameters independently", async () =>
{
    const ticktickRouter = (await import("../Routes/ticktickRoute.js")).default;

    const res = await invokeRouter(ticktickRouter,
    {
        method: "POST",
        path: "/auth/exchange",
        body: {}
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, "Invalid OAuth exchange parameters");
});


// Callback diagnostics must identify the failing operation without exposing
// Google's request/response payloads, credentials, or account details.
for (const failedStage of [
    "load_oauth_state", "exchange_google_code", "verify_google_identity",
    "resolve_user", "create_extension_exchange"
])
{
    test(`Google callback diagnostics: ${failedStage} is classified without secrets`, async (t) =>
    {
        const secret = "DO_NOT_LOG_OAUTH_CREDENTIALS";
        const failure = Object.assign(new Error(secret), {
            code: failedStage === "resolve_user" ? 11000 : "ECONNRESET",
            config: { headers: { Authorization: secret }, data: secret },
            response: { status: 400, data: { error: "invalid_grant", error_description: secret, id_token: secret } },
            keyValue: { email: secret }
        });
        const failAt = (stage, value) => {
            if (stage === failedStage) throw failure;
            return value;
        };
        const log = t.mock.method(console, "error", () => {});
        const router = createGoogleAuthRouter({
            getAllowedRedirectsFn: () => [ALLOWED_REDIRECT_URI],
            GoogleOAuthStateModel: {
                findOneAndDelete: () => ({ select: async () => failAt("load_oauth_state", {
                    extensionRedirectUri: ALLOWED_REDIRECT_URI,
                    clientNonce: VALID_CLIENT_NONCE,
                    extensionCodeChallenge: VALID_EXT_CHALLENGE,
                    googleNonce: "test-nonce",
                    googleCodeVerifier: "test-verifier"
                }) })
            },
            exchangeGoogleCodeFn: async () => failAt("exchange_google_code", "test-id-token"),
            verifyGoogleIdentityFn: async () => failAt("verify_google_identity", { providerSubject: "test-subject" }),
            AuthIdentityModel: { findOne: async () => failAt("resolve_user", { userId: "test-user" }) },
            UserModel: { findOne: async () => ({ userId: "test-user" }) },
            OAuthExchangeModel: { create: async () => failAt("create_extension_exchange", {}) }
        });
        const res = await invokeRouter(router, {
            path: "/callback", query: { code: "test-google-code", state: "s".repeat(43) }
        });
        assert.equal(res.statusCode, 500);
        assert.deepEqual(res.body, { status: "error", message: "Google authentication failed" });
        assert.equal(log.mock.callCount(), 1);
        assert.deepEqual(log.mock.calls[0].arguments, [
            "[GOOGLE OAUTH] Callback authentication failed",
            {
                stage: failedStage, errorType: "Error", code: failure.code,
                httpStatus: 400, providerError: "invalid_grant"
            }
        ]);
        assert.ok(!JSON.stringify(log.mock.calls[0].arguments).includes(secret));
    });
}

test("Google callback diagnostics: unrecognized error metadata is omitted", async (t) =>
{
    const secret = "DO_NOT_LOG_UNTRUSTED_METADATA";
    const log = t.mock.method(console, "error", () => {});
    const router = createGoogleAuthRouter({
        GoogleOAuthStateModel: {
            findOneAndDelete: () => { throw {
                name: secret, code: secret, message: secret,
                response: { status: secret, data: { error: secret } }
            }; }
        }
    });
    const res = await invokeRouter(router, {
        path: "/callback", query: { code: "test-google-code", state: "s".repeat(43) }
    });
    assert.equal(res.statusCode, 500);
    assert.deepEqual(log.mock.calls[0].arguments[1], {
        stage: "load_oauth_state", errorType: "UnclassifiedError",
        code: null, httpStatus: null, providerError: null
    });
    assert.ok(!JSON.stringify(log.mock.calls[0].arguments).includes(secret));
});
