# TickTick Extension API Documentation

This document provides comprehensive information about the TickTick Extension API, including endpoints, authentication, data models, and usage examples.

## 📋 Table of Contents

- [Overview](#overview)
- [Getting Started](#getting-started)
- [Authentication](#authentication)
- [API Endpoints](#api-endpoints)
- [Data Models](#data-models)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [Examples](#examples)
- [Documentation Access](#documentation-access)

## 🚀 Overview

The TickTick Extension API provides a backend service for the Chrome extension that enables:

- **Content Management**: Save and organize articles with AI-powered enrichment
- **TickTick Integration**: OAuth authentication and task synchronization
- **User Settings**: Email preferences and profile management
- **Telegram Bot**: Quiz generation and weekly digest notifications
- **AI Services**: Content summarization, tagging, and quiz generation

### Base URLs

- **Development**: `http://localhost:3000/api/v1`
- **Production**: `https://your-domain.com/api/v1`

## 🛠️ Getting Started

### Prerequisites

1. Node.js 18+ installed
2. MongoDB database
3. TickTick Developer Account (for OAuth)
4. Telegram Bot Token (for bot integration)

### Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```

4. **Access API documentation**:
   - Swagger UI: http://localhost:3000/api-docs
   - OpenAPI JSON: http://localhost:3000/api-docs.json
   - Enhanced Docs: http://localhost:3000/api-docs/enhanced

## 🔐 Authentication

The API uses TickTick OAuth2 for user authentication. Users authenticate through the TickTick OAuth flow to receive a `userId` that identifies their session.

### OAuth Flow

1. **Initiate Authentication**:
   ```
   GET /api/v1/ticktick/auth?redirect_uri={extension_redirect_uri}
   ```

2. **User Authorization**: User is redirected to TickTick to authorize the application

3. **Handle Callback**: TickTick redirects back with authorization code
   ```
   GET /api/v1/ticktick/callback?code={auth_code}&state={encoded_state}
   ```

4. **Receive userId**: The callback returns the user to the extension with `userId` parameter

### Using the API

Once authenticated, include the `userId` in your API requests:

```javascript
const userId = 'user_1234567890abcdef'; // Received from OAuth callback

// Create content
await fetch('/api/v1/content', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId,
    title: 'Article Title',
    rawText: 'Article content...',
    // ... other fields
  })
});
```

## 📡 API Endpoints

### Content Management

#### Create Content
```http
POST /api/v1/content
```

Creates new content with optional AI enrichment.

**Request Body**:
```json
{
  "userId": "user_1234567890abcdef",
  "title": "Understanding Node.js Event Loop",
  "url": "https://example.com/nodejs-event-loop",
  "rawText": "The Node.js event loop is a fundamental concept...",
  "user_input": "~learning #nodejs #backend",
  "use_tagsAi": true,
  "use_summaryAi": true,
  "use_quiz": true,
  "mergeSummaryWithContent": false,
  "includeInWeeklyEmail": true,
  "includeInTelegramQuiz": true
}
```

**Response**:
```json
{
  "status": "success",
  "data": {
    "content": {
      "_id": "64a1b2c3d4e5f6789012345",
      "userId": "user_1234567890abcdef",
      "title": "Understanding Node.js Event Loop",
      "url": "https://example.com/nodejs-event-loop",
      "rawText": "The Node.js event loop is a fundamental concept...",
      "listName": "learning",
      "tags": ["nodejs", "backend", "javascript", "async"],
      "summary": "This article explains how the Node.js event loop handles...",
      "quiz": {
        "question": "What is the primary purpose of the Node.js event loop?",
        "options": [
          "Handle asynchronous operations",
          "Manage memory allocation",
          "Compile JavaScript code",
          "Handle HTTP requests"
        ],
        "correctAnswer": "Handle asynchronous operations"
      },
      "options": {
        "useSummaryAi": true,
        "useTagsAi": true,
        "useQuiz": true,
        "mergeSummaryWithContent": false,
        "includeInWeeklyEmail": true,
        "includeInTelegramQuiz": true
      },
      "integrations": {
        "tickTickId": "task_1234567890"
      },
      "createdAt": "2023-07-01T10:30:00.000Z",
      "updatedAt": "2023-07-01T10:30:00.000Z"
    },
    "ai": {
      "summary": "This article explains how the Node.js event loop handles...",
      "tags": ["nodejs", "backend", "javascript", "async"],
      "quiz": {
        "question": "What is the primary purpose of the Node.js event loop?",
        "options": [
          "Handle asynchronous operations",
          "Manage memory allocation",
          "Compile JavaScript code",
          "Handle HTTP requests"
        ],
        "correctAnswer": "Handle asynchronous operations"
      }
    }
  }
}
```

#### Get User Content
```http
GET /api/v1/content/user/{userId}
```

Retrieves all content items for a specific user.

**Path Parameters**:
- `userId` (string, required): User identifier

**Response**:
```json
{
  "status": "success",
  "data": [
    {
      "_id": "64a1b2c3d4e5f6789012345",
      "userId": "user_1234567890abcdef",
      "title": "Understanding Node.js Event Loop",
      "url": "https://example.com/nodejs-event-loop",
      "rawText": "The Node.js event loop is a fundamental concept...",
      "listName": "learning",
      "tags": ["nodejs", "backend", "javascript"],
      "summary": "This article explains the Node.js event loop...",
      "quiz": null,
      "options": {
        "useSummaryAi": true,
        "useTagsAi": true,
        "useQuiz": false,
        "mergeSummaryWithContent": false,
        "includeInWeeklyEmail": true,
        "includeInTelegramQuiz": true
      },
      "integrations": {
        "tickTickId": "task_1234567890"
      },
      "createdAt": "2023-07-01T10:30:00.000Z",
      "updatedAt": "2023-07-01T10:30:00.000Z"
    }
  ],
  "count": 1
}
```

### TickTick Integration

#### Initiate OAuth
```http
GET /api/v1/ticktick/auth?redirect_uri={extension_redirect_uri}
```

Initiates the OAuth2 flow with TickTick.

**Query Parameters**:
- `redirect_uri` (string, required): Extension redirect URI

**Response**: Redirect to TickTick authorization page

#### Handle OAuth Callback
```http
GET /api/v1/ticktick/callback?code={auth_code}&state={encoded_state}
```

Processes the OAuth callback from TickTick.

**Query Parameters**:
- `code` (string, required): Authorization code from TickTick
- `state` (string, required): Base64-encoded state parameter

**Response**: Redirect back to extension with `userId`

### User Settings

#### Update Email Settings
```http
POST /api/v1/User/email
```

Updates user email address and weekly email preferences.

**Request Body**:
```json
{
  "userId": "user_1234567890abcdef",
  "email": "user@example.com",
  "weeklyEmailEnabled": true
}
```

**Response**:
```json
{
  "status": "success",
  "message": "Email settings updated!"
}
```

### Telegram Integration

#### Webhook Endpoint
```http
POST /api/v1/telegram/webhook
```

Receives updates from Telegram bot API.

**Request Body**: Telegram update object (as per Telegram Bot API documentation)

**Response**: `200 OK` if processed successfully

## 📊 Data Models

### User Model

```typescript
interface User {
  _id: string;                    // MongoDB document ID
  userId: string;                 // Unique user identifier from TickTick
  email?: string;                 // User email address
  weeklyEmailEnabled?: boolean;   // Weekly digest preference
  tickTickTokenHash?: string;     // Hashed TickTick access token
  tickTickAccessToken?: string;    // TickTick OAuth access token
  tickTickRefreshToken?: string;  // TickTick OAuth refresh token
  tickTickConnected?: boolean;     // Connection status
  createdAt: Date;                // Document creation timestamp
  updatedAt: Date;                // Document update timestamp
}
```

### Content Model

```typescript
interface Content {
  _id: string;                    // MongoDB document ID
  userId: string;                 // User identifier
  title: string;                  // Content title
  url?: string;                   // Source URL
  rawText: string;                // Full text content
  listName: string;               // TickTick list name
  tags: string[];                 // Content tags
  summary?: string;               // AI-generated summary
  quiz?: {                       // AI-generated quiz
    question: string;
    options: string[];
    correctAnswer: string;
  };
  options: {                      // Processing options
    useSummaryAi: boolean;
    useTagsAi: boolean;
    useQuiz: boolean;
    mergeSummaryWithContent: boolean;
    includeInWeeklyEmail: boolean;
    includeInTelegramQuiz: boolean;
  };
  integrations?: {                // External service IDs
    tickTickId?: string;
  };
  createdAt: Date;                // Content creation timestamp
  updatedAt: Date;                // Content update timestamp
}
```

## ⚠️ Error Handling

All API errors follow a consistent format:

```json
{
  "status": "error",
  "message": "Human-readable error description",
  "stack": "Stack trace (development only)"
}
```

### Common HTTP Status Codes

- `200 OK`: Request successful
- `201 Created`: Resource created successfully
- `400 Bad Request`: Validation failed or missing required parameters
- `401 Unauthorized`: Invalid or missing authentication
- `404 Not Found`: Resource does not exist
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Unexpected server error

### Validation Errors

When validation fails, the API returns detailed error messages:

```json
{
  "status": "error",
  "message": "userId is required and must be a non-empty string"
}
```

## 🚦 Rate Limiting

The API implements rate limiting to ensure fair usage:

- **General endpoints**: 100 requests per 15 minutes
- **Content endpoints**: 50 requests per 15 minutes
- **Auth endpoints**: 5 requests per 15 minutes

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Request limit per window
- `X-RateLimit-Remaining`: Remaining requests in current window
- `X-RateLimit-Reset`: Time when the rate limit window resets

## 💡 Examples

### Chrome Extension Integration

```javascript
// 1. Initiate OAuth flow
const authUrl = 'http://localhost:3000/api/v1/ticktick/auth?' +
  'redirect_uri=' + encodeURIComponent(chrome.identity.getRedirectURL());

chrome.tabs.create({ url: authUrl });

// 2. Handle OAuth callback and extract userId
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OAUTH_CALLBACK') {
    const url = new URL(message.url);
    const userId = url.searchParams.get('userId');
    
    // Store userId for future API calls
    chrome.storage.local.set({ userId });
  }
});

// 3. Create content with AI enrichment
async function saveArticle(articleData) {
  const { userId } = await chrome.storage.local.get(['userId']);
  
  const response = await fetch('http://localhost:3000/api/v1/content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      title: articleData.title,
      url: articleData.url,
      rawText: articleData.content,
      user_input: '~learning #nodejs',
      use_tagsAi: true,
      use_summaryAi: true,
      use_quiz: true
    })
  });
  
  const result = await response.json();
  console.log('Content saved:', result);
}
```

### Testing with cURL

```bash
# Create content
curl -X POST http://localhost:3000/api/v1/content \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_1234567890abcdef",
    "title": "Test Article",
    "rawText": "This is a test article content...",
    "use_tagsAi": true,
    "use_summaryAi": true
  }'

# Get user content
curl http://localhost:3000/api/v1/content/user/user_1234567890abcdef

# Update email settings
curl -X POST http://localhost:3000/api/v1/User/email \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_1234567890abcdef",
    "email": "user@example.com",
    "weeklyEmailEnabled": true
  }'
```

## 📚 Documentation Access

### Swagger UI
- **URL**: http://localhost:3000/api-docs
- **Features**: Interactive API testing, request/response examples, schema exploration
- **Usage**: Try out endpoints directly in your browser

### OpenAPI Specification
- **URL**: http://localhost:3000/api-docs.json
- **Format**: Standard OpenAPI 3.0 JSON specification
- **Usage**: Import into API tools like Postman, Insomnia, or API clients

### Enhanced Documentation
- **URL**: http://localhost:3000/api-docs/enhanced
- **Format**: Custom JSON with additional examples and explanations
- **Usage**: Programmatic access to detailed API documentation

### Documentation Health Check
```bash
curl http://localhost:3000/api-docs/health
```

## 🔧 Development

### Adding New Endpoints

1. Create the route handler in the appropriate route file
2. Add JSDoc comments following the OpenAPI format:
   ```javascript
   /**
    * @swagger
    * /api/v1/new-endpoint:
    *   post:
    *     summary: "Create new resource"
    *     description: "Detailed description..."
    *     requestBody:
    *       required: true
    *       content:
    *         application/json:
    *           schema:
    *             type: object
    *             properties:
    *               field:
    *                 type: string
    *     responses:
    *       201:
    *         description: "Resource created successfully"
    */
   ```
3. Update the documentation files if needed
4. Test the endpoint through Swagger UI

### Updating Documentation

The documentation is automatically generated from JSDoc comments. To update:

1. Modify the JSDoc comments in your route files
2. Update the `swagger.js` configuration if needed
3. Restart the server to see changes

## 📞 Support

For API-related questions or issues:

1. Check the Swagger UI for interactive documentation
2. Review the error messages in API responses
3. Check the server logs for detailed error information
4. Refer to the code comments in route files for implementation details

---

**Note**: This API is designed to work with the TickTick Chrome Extension. Some endpoints may require specific extension context or headers for proper functionality.
