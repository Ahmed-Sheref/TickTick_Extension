import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import swaggerUi from 'swagger-ui-express';

import { schemas } from './schemas.js';
import { contentDocs } from './content.docs.js';
import { userDocs } from './user.docs.js';
import { ticktickDocs } from './ticktick.docs.js';
import { telegramDocs } from './telegram.docs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const swaggerDocument = {
  openapi: '3.0.3',
  info: {
    title: 'TickTick Extension API',
    version: '2.2.0',
    description: `
## Overview

Backend API for the TickTick Chrome Extension.

This API lets the frontend:
- authenticate with TickTick
- create and retrieve saved article content
- update email preferences
- understand webhook/integration behavior

---

## Frontend start here

### 1) OAuth
Call:
- \`GET /api/v1/ticktick/auth?redirect_uri=...\`

Then TickTick redirects to:
- \`GET /api/v1/ticktick/callback?code=...&state=...\`

Your frontend should read the final redirected URL and extract:
- \`userId\`

### 2) Save content
Call:
- \`POST /api/v1/content\`

### 3) Load content list
Call:
- \`GET /api/v1/content/user/{userId}\`

### 4) Save email settings
Call:
- \`POST /api/v1/User/email\`

---

## Notes

- OAuth endpoints return redirects on success, not JSON
- Telegram webhook is server-to-server and not intended for direct frontend use
- Content and auth routes are rate limited
    `.trim(),
    contact: {
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
    },
  ],

  tags: [
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
    },
  ],

  components: {
    schemas,
  },

  paths: {
    ...contentDocs,
    ...userDocs,
    ...ticktickDocs,
    ...telegramDocs,
  },
};

const swaggerUiOptions = {
  customSiteTitle: 'TickTick Extension API Docs',
  docExpansion: 'list',
  defaultModelsExpandDepth: 2,
  defaultModelExpandDepth: 2,
  displayRequestDuration: true,
  filter: true,
  persistAuthorization: true,
  tryItOutEnabled: true,
};

export function setupSwagger(app) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, swaggerUiOptions));

  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerDocument);
  });

  app.get('/api-docs/health', (req, res) => {
    res.status(200).json({
      status: 'success',
      message: 'Swagger documentation is available',
      version: swaggerDocument.info.version,
    });
  });
}

export default swaggerDocument;