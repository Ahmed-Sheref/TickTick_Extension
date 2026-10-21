import express from 'express';
import Settings from '../Models/User.js';
import { getAuthUrl, exchangeToken } from '../utils/ticktick.js';
import { hashToken, generateUserIdFromToken } from '../utils/createID.js';
import {createAppToken} from "../utils/jwt.js";
import { randomBytes, createHash } from 'node:crypto';
import OAuthState from '../Models/OAuthState.js';
import OAuthExchange from '../Models/OAuthExchange.js';

const router = express.Router();

const STATE_EXPIRY_MS = 10 * 60 * 1000;
const EXCHANGE_EXPIRY_MS = 60 * 1000;

const hashState = (state) =>
{
    return createHash('sha256').update(state).digest('hex');
};

const hashExchangeCode = (code) =>
{
    return createHash('sha256').update(code).digest('hex');
};

const getAllowedRedirects = () =>
{
    return (process.env.ALLOWED_EXTENSION_REDIRECT_URIS || '').split(',').map(uri => uri.trim()).filter(Boolean);
};



// AUTH ROUTE
router.get('/auth', (req, res) =>
{
    console.log('=== TickTick Auth Route ===');

    const { redirect_uri, client_nonce, code_challenge } = req.query;

    console.log('Redirect URI:', redirect_uri);

    if (!redirect_uri)
    {
        console.log('Missing redirect_uri');
        return res.status(400).json(
        {
            status: 'error',
            message: 'Missing extension redirect_uri'
        });
    }

    if (typeof redirect_uri !== 'string' || typeof client_nonce !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(client_nonce) || typeof code_challenge !== 'string' || !/^[a-f0-9]{64}$/.test(code_challenge))
    {
        return res.status(400).json(
        {
            status: 'error',
            message: 'Invalid OAuth parameters'
        });
    }

    if (!getAllowedRedirects().includes(redirect_uri))
    {
        return res.status(400).json(
        {
            status: 'error',
            message: 'Unauthorized redirect URI'
        });
    }

    const state = randomBytes(32).toString('base64url');

    return OAuthState.create(
    {
        stateHash: hashState(state),
        extensionRedirectUri: redirect_uri,
        clientNonce: client_nonce,
        codeChallenge: code_challenge,
        expiresAt: new Date(Date.now() + STATE_EXPIRY_MS)
    })
    .then(() =>
    {
        const authUrl = getAuthUrl(state);
        const parsedAuthUrl = new URL(authUrl);
        console.log('Redirecting to TickTick...');
        console.log('[OAUTH] Sent Redirect URI:', parsedAuthUrl.searchParams.get('redirect_uri'));
        console.log('Redirecting to TickTick...');

        return res.redirect(authUrl);
    })
    .catch((error) =>
    {
        console.error('OAuth initialization failed:', error.message);

        return res.status(500).json(
        {
            status: 'error',
            message: 'Failed to initialize OAuth'
        });
    });
});



router.post('/auth/exchange', async (req, res) =>
{
    try
    {
        const { exchange_code, verifier } = req.body || {};

        if (typeof exchange_code !== 'string' || typeof verifier !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(exchange_code) || !/^[a-f0-9]{64}$/.test(verifier))
        {
            return res.status(400).json(
            {
                status: 'error',
                message: 'Invalid OAuth exchange parameters'
            });
        }

        const codeChallenge = createHash('sha256').update(verifier).digest('hex');

        const savedExchange = await OAuthExchange.findOneAndDelete(
        {
            codeHash: hashExchangeCode(exchange_code),
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
                status: 'error',
                message: 'Invalid, expired, or already used exchange code'
            });
        }

        const user = await Settings.findOne({ userId: savedExchange.userId });

        if (!user)
        {
            return res.status(401).json(
            {
                status: 'error',
                message: 'OAuth user not found'
            });
        }

        const appToken = createAppToken(user);

        return res.status(200).json(
        {
            status: 'success',
            data:
            {
                userId: user.userId,
                token: appToken
            }
        });
    }
    catch (error)
    {
        console.error('OAuth exchange failed:', error.message);

        return res.status(500).json(
        {
            status: 'error',
            message: 'Failed to exchange OAuth code'
        });
    }
});

router.get('/callback', async (req, res) =>
{
    console.log('=== TickTick Callback Route ===');

    try
    {
        const { code, state } = req.query;

        console.log('Authorization code:', code ? 'Received' : 'Missing');
        console.log('State:', state ? 'Received' : 'Missing');

        if (typeof code !== 'string' || typeof state !== 'string' || !code || !state)
        {
            console.log('Missing required parameters');
            return res.status(400).json(
            {
                status: 'error',
                message: 'Missing or invalid code or state'
            });
        }

        const savedState = await OAuthState.findOneAndDelete(
        {
            stateHash: hashState(state),
            expiresAt:
            {
                $gt: new Date()
            }
        });

        if (!savedState)
        {
            return res.status(400).json(
            {
                status: 'error',
                message: 'Invalid, expired, or already used OAuth state'
            });
        }

        const extensionRedirectUri = savedState.extensionRedirectUri;

        if (!getAllowedRedirects().includes(extensionRedirectUri))
        {
            return res.status(400).json(
            {
                status: 'error',
                message: 'Unauthorized OAuth redirect'
            });
        }

        console.log('Extension redirect URI:', extensionRedirectUri);

        console.log('Exchanging authorization code for tokens...');
        const tokenData = await exchangeToken(code);

        console.log('Token exchange successful');
        console.log('Access token received:', tokenData.access_token ? 'DONE' : 'ERROR');
        console.log('Refresh token received:', tokenData.refresh_token ? 'DONE' : 'ERROR');

        const accessToken = tokenData.access_token;
        const refreshToken = tokenData.refresh_token;

        const tokenHash = hashToken(accessToken);

        console.log('Looking for existing user with token hash...');

        let user = await Settings.findOne({ tickTickTokenHash: tokenHash });

        if (!user)
        {
            console.log('Creating new user...');
            user = await Settings.create(
            {
                userId: generateUserIdFromToken(accessToken),
                tickTickTokenHash: tokenHash,
                tickTickAccessToken: accessToken,
                tickTickRefreshToken: refreshToken,
                tickTickConnected: true
            });
            console.log('New user created with ID:', user.userId);
        }
        else
        {
            console.log('Updating existing user:', user.userId);
            user.tickTickAccessToken = accessToken;
            user.tickTickRefreshToken = refreshToken;
            user.tickTickConnected = true;
            await user.save();
            console.log('User updated successfully');
        }

        const exchangeCode = randomBytes(32).toString('base64url');

        await OAuthExchange.create(
        {
            codeHash: hashExchangeCode(exchangeCode),
            codeChallenge: savedState.codeChallenge,
            userId: user.userId,
            expiresAt: new Date(Date.now() + EXCHANGE_EXPIRY_MS)
        });

        const finalUrl = `${extensionRedirectUri}?exchange_code=${encodeURIComponent(exchangeCode)}&client_nonce=${encodeURIComponent(savedState.clientNonce)}`;

        console.log('=== TickTick OAuth Flow Complete ===');

        return res.redirect(finalUrl);
    }
    catch (error)
    {
        console.error('OAuth error:', error);
        console.error('Error stack:', error.stack);

        return res.status(500).json(
        {
            status: 'error',
            message: error.message
        });
    }
});

export default router;
