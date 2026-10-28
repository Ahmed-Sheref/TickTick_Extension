import path from 'path';
import
{
    fileURLToPath
}
from 'url';
import express from 'express';
import swaggerUi from 'swagger-ui-express';

import
{
    schemas
}
from './schemas.js';
import
{
    contentDocs
}
from './content.docs.js';
import
{
    userDocs
}
from './user.docs.js';
import
{
    ticktickDocs
}
from './ticktick.docs.js';
import
{
    telegramDocs
}
from './telegram.docs.js';
import
{
    notionContentDocs
}
from './notion-content.docs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const swaggerDocument = {
    openapi: '3.0.3',
    info:
    {
        title: 'Knowvia API',
        version: '2.2.0',
        description: `
## Overview
API for Knowvia content capture, account authentication, knowledge storage, and optional third-party exports.

Google application login establishes the Knowvia identity and application Bearer JWT. TickTick and Notion linking are optional, authenticated integrations; they do not establish the primary application identity.

POST /api/v1/content always stores the original in MongoDB first. HTTP 201 confirms primary persistence, not completion of external exports. Explicitly selected providers dispatch independently after commit. Omitted destinations mean Knowvia only. Read the owner-scoped sync-status endpoint for confirmed outcomes; it never writes provider content. Dispatch is in-process and not durable.

Delivery APIs remain supported even while Email and Telegram controls are absent from the extension. Existing scheduled preferences may remain active.
    `.trim(),
        contact:
        {
            name: 'API Maintainer',
        },
    },

    servers: [
    {
        url: 'http://localhost:3000',
        description: 'Local development server',
    },
    {
        url: 'https://your-domain.com',
        description: 'Production server',
    }, ],

    tags: [
    {
        name: 'Authentication',
        description: 'Google application identity and one-time exchange'
    },
    {
        name: 'Legacy compatibility',
        description: 'Existing TickTick identity endpoints; new clients use Google'
    },
    {
        name: 'TickTick Integration',
        description: 'Optional authenticated export linking'
    },
    {
        name: 'Notion Integration',
        description: 'Optional authenticated workspace linking'
    },
    {
        name: 'Telegram / Delivery',
        description: 'Existing backend delivery infrastructure'
    },
    {
        name: 'Notion',
        description: 'Authenticated destination selection and saved-content synchronization'
    },
    {
        name: 'Auth',
        description: 'OAuth flow and user identity bootstrap',
    },
    {
        name: 'Content',
        description: 'Create and retrieve saved articles',
    },
    {
        name: 'User Preferences',
        description: 'Email and digest settings',
    },
    {
        name: 'Integrations',
        description: 'Webhook/integration endpoints not normally called by frontend',
    }, ],

    components:
    {
        schemas,
        securitySchemes:
        {
            telegramWebhook:
            {
                type: 'apiKey',
                in: 'header',
                name: 'X-Telegram-Bot-Api-Secret-Token'
            },
            bearerAuth:
            {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT'
            },
            appBearer:
            {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT'
            }
        },
    },

    paths:
    {
        ...contentDocs,
        ...userDocs,
        ...ticktickDocs,
        ...telegramDocs,
        ...notionContentDocs,
    },
};

const swaggerUiOptions = {
    customSiteTitle: 'Knowvia API Docs',
    docExpansion: 'list',
    defaultModelsExpandDepth: 2,
    defaultModelExpandDepth: 2,
    displayRequestDuration: true,
    filter: true,
    persistAuthorization: true,
    tryItOutEnabled: true,
};

export function setupSwagger(app)
{
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, swaggerUiOptions));

    app.get('/api-docs.json', (req, res) =>
    {
        res.setHeader('Content-Type', 'application/json');
        res.send(swaggerDocument);
    });

    app.get('/api-docs/health', (req, res) =>
    {
        res.status(200).json(
        {
            status: 'success',
            message: 'Swagger documentation is available',
            version: swaggerDocument.info.version,
        });
    });
}

export default swaggerDocument;
