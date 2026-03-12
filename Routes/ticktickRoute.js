import express from 'express';
import Settings from '../Models/User.js';
import { getAuthUrl, exchangeToken } from '../utils/ticktick.js';
import { hashToken, generateUserIdFromToken } from '../utils/createID.js';

const router = express.Router();



// AUTH ROUTE
router.get('/auth', (req, res) =>
{
    console.log('=== TickTick Auth Route ===');
    console.log('Query params:', req.query);
    
    const { redirect_uri } = req.query;

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

    const stateObj =
    {
        extensionRedirectUri: redirect_uri,
        nonce: Date.now()
    };

    console.log('State object:', stateObj);

    const state = Buffer.from(JSON.stringify(stateObj)).toString('base64');

    console.log('Encoded state:', state);

    const authUrl = getAuthUrl(state);

    console.log('Generated auth URL:', authUrl);
    console.log('Redirecting to TickTick...');

    return res.redirect(authUrl);
});



// CALLBACK ROUTE

router.get('/callback', async (req, res) =>
{
    console.log('=== TickTick Callback Route ===');
    console.log('Query params:', req.query);
    
    try
    {
        const { code, state } = req.query;

        console.log('Authorization code:', code ? 'Received' : 'Missing');
        console.log('State:', state ? 'Received' : 'Missing');

        if (!code || !state)
        {
            console.log('Missing required parameters');
            return res.status(400).json(
            {
                status: 'error',
                message: 'Missing code or state'
            });
        }

        const decodedState = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));

        console.log('Decoded state:', decodedState);

        const extensionRedirectUri = decodedState.extensionRedirectUri;

        console.log('Extension redirect URI:', extensionRedirectUri);


        console.log('Exchanging authorization code for tokens...');
        const tokenData = await exchangeToken(code);

        console.log('Token exchange successful');
        console.log('Access token received:', tokenData.access_token ? '✅' : '❌');
        console.log('Refresh token received:', tokenData.refresh_token ? '✅' : '❌');

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
            console.log('✅ New user created with ID:', user.userId);
        }
        else
        {
            console.log('Updating existing user:', user.userId);
            user.tickTickAccessToken = accessToken;
            user.tickTickRefreshToken = refreshToken;
            user.tickTickConnected = true;
            await user.save();
            console.log('✅ User updated successfully');
        }


        const finalUrl = `${extensionRedirectUri}?userId=${encodeURIComponent(user.userId)}`;

        console.log('Redirecting to extension:', finalUrl);
        console.log('=== TickTick OAuth Flow Complete ===');

        return res.redirect(finalUrl);
    }
    catch (error)
    {
        console.error('❌ OAuth error:', error);
        console.error('Error stack:', error.stack);

        return res.status(500).json(
        {
            status: 'error',
            message: error.message
        });
    }
});

export default router;