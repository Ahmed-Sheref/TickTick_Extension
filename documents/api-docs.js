/**
 * TickTick Extension API Documentation
 * 
 * This file contains comprehensive documentation for all API endpoints
 * including request/response schemas, validation rules, and usage examples.
 */

export const apiDocumentation = {
  title: 'TickTick Extension API',
  version: '1.0.0',
  description: 'Complete API documentation for the TickTick Chrome Extension backend',
  
  // Base URL Configuration
  baseUrl: {
    development: 'http://localhost:3000/api/v1',
    production: 'https://your-domain.com/api/v1'
  },

  // Authentication
  authentication: {
    type: 'OAuth2',
    provider: 'TickTick',
    description: 'Users authenticate through TickTick OAuth2 flow to receive a userId for API access'
  },

  // Rate Limiting
  rateLimiting: {
    general: '100 requests per 15 minutes',
    content: '50 requests per 15 minutes',
    auth: '5 requests per 15 minutes'
  },

  // API Endpoints
  endpoints: {
    
    // CONTENT ENDPOINTS
    content: {
      tag: 'Content',
      description: 'Content management and AI enrichment operations',
      
      createContent: {
        method: 'POST',
        path: '/content',
        summary: 'Create new content with AI enrichment',
        description: `
          Creates a new content item with optional AI-powered summarization, 
          tagging, and quiz generation. The content is saved to the database 
          and optionally synced to TickTick as a task.
        `,
        requestBody: {
          required: true,
          contentType: 'application/json',
          schema: {
            userId: {
              type: 'string',
              required: true,
              description: 'User identifier from TickTick authentication',
              example: 'user_1234567890abcdef',
              validation: 'Non-empty string, max 255 characters'
            },
            title: {
              type: 'string',
              required: true,
              description: 'Content title',
              example: 'Understanding Node.js Event Loop',
              validation: 'Non-empty string, max 500 characters'
            },
            url: {
              type: 'string',
              format: 'uri',
              required: false,
              description: 'Source URL of the content',
              example: 'https://example.com/nodejs-event-loop'
            },
            rawText: {
              type: 'string',
              required: true,
              description: 'Full text content of the article',
              example: 'The Node.js event loop is a fundamental concept...',
              validation: 'Non-empty string, max 100,000 characters'
            },
            user_input: {
              type: 'string',
              required: false,
              description: 'User input for parsing lists and tags (~list #tag1 #tag2)',
              example: '~learning #nodejs #backend',
              validation: 'Optional string for list/tag parsing'
            },
            use_tagsAi: {
              type: 'boolean',
              required: false,
              default: false,
              description: 'Enable AI-powered tag generation',
              example: true
            },
            use_summaryAi: {
              type: 'boolean',
              required: false,
              default: false,
              description: 'Enable AI-powered summarization',
              example: true
            },
            use_quiz: {
              type: 'boolean',
              required: false,
              default: false,
              description: 'Enable AI-generated quiz questions',
              example: true
            },
            mergeSummaryWithContent: {
              type: 'boolean',
              required: false,
              default: false,
              description: 'Append AI summary to the original content',
              example: false
            },
            includeInWeeklyEmail: {
              type: 'boolean',
              required: false,
              default: true,
              description: 'Include in weekly email digest',
              example: true
            },
            includeInTelegramQuiz: {
              type: 'boolean',
              required: false,
              default: true,
              description: 'Include in Telegram quiz pool',
              example: true
            }
          }
        },
        responses: {
          '201': {
            description: 'Content created successfully',
            schema: {
              status: 'success',
              data: {
                content: 'Content object with all fields',
                ai: {
                  summary: 'AI-generated summary if requested',
                  tags: 'Array of AI-generated and user tags',
                  quiz: 'AI-generated quiz object if requested'
                }
              }
            }
          },
          '400': {
            description: 'Validation error',
            schema: {
              status: 'error',
              message: 'Detailed validation error message'
            }
          },
          '500': {
            description: 'Internal server error',
            schema: {
              status: 'error',
              message: 'Error description'
            }
          }
        },
        example: {
          request: {
            userId: 'user_1234567890abcdef',
            title: 'Understanding Node.js Event Loop',
            url: 'https://example.com/nodejs-event-loop',
            rawText: 'The Node.js event loop is a fundamental concept...',
            user_input: '~learning #nodejs #backend',
            use_tagsAi: true,
            use_summaryAi: true,
            use_quiz: true,
            mergeSummaryWithContent: false
          },
          response: {
            status: 'success',
            data: {
              content: {
                _id: '64a1b2c3d4e5f6789012345',
                userId: 'user_1234567890abcdef',
                title: 'Understanding Node.js Event Loop',
                url: 'https://example.com/nodejs-event-loop',
                rawText: 'The Node.js event loop is a fundamental concept...',
                listName: 'learning',
                tags: ['nodejs', 'backend', 'javascript', 'async'],
                summary: 'This article explains how the Node.js event loop handles asynchronous operations...',
                quiz: {
                  question: 'What is the primary purpose of the Node.js event loop?',
                  options: [
                    'Handle asynchronous operations',
                    'Manage memory allocation',
                    'Compile JavaScript code',
                    'Handle HTTP requests'
                  ],
                  correctAnswer: 'Handle asynchronous operations'
                },
                options: {
                  useSummaryAi: true,
                  useTagsAi: true,
                  useQuiz: true,
                  mergeSummaryWithContent: false,
                  includeInWeeklyEmail: true,
                  includeInTelegramQuiz: true
                },
                integrations: {
                  tickTickId: 'task_1234567890'
                },
                createdAt: '2023-07-01T10:30:00.000Z',
                updatedAt: '2023-07-01T10:30:00.000Z'
              },
              ai: {
                summary: 'This article explains how the Node.js event loop handles asynchronous operations...',
                tags: ['nodejs', 'backend', 'javascript', 'async'],
                quiz: {
                  question: 'What is the primary purpose of the Node.js event loop?',
                  options: [
                    'Handle asynchronous operations',
                    'Manage memory allocation',
                    'Compile JavaScript code',
                    'Handle HTTP requests'
                  ],
                  correctAnswer: 'Handle asynchronous operations'
                }
              }
            }
          }
        }
      },

      getContentByUserId: {
        method: 'GET',
        path: '/content/user/{userId}',
        summary: 'Get all content for a specific user',
        description: `
          Retrieves all content items created by a specific user, 
          sorted by creation date (newest first).
        `,
        parameters: {
          userId: {
            type: 'string',
            required: true,
            in: 'path',
            description: 'User identifier',
            example: 'user_1234567890abcdef',
            validation: 'Non-empty string'
          }
        },
        responses: {
          '200': {
            description: 'Content retrieved successfully',
            schema: {
              status: 'success',
              data: 'Array of Content objects',
              count: 'Total number of items'
            }
          },
          '400': {
            description: 'Invalid userId parameter',
            schema: {
              status: 'error',
              message: 'userId is required and must be a non-empty string'
            }
          },
          '500': {
            description: 'Internal server error'
          }
        },
        example: {
          request: '/content/user/user_1234567890abcdef',
          response: {
            status: 'success',
            data: [
              {
                _id: '64a1b2c3d4e5f6789012345',
                userId: 'user_1234567890abcdef',
                title: 'Understanding Node.js Event Loop',
                url: 'https://example.com/nodejs-event-loop',
                rawText: 'The Node.js event loop is a fundamental concept...',
                listName: 'learning',
                tags: ['nodejs', 'backend', 'javascript'],
                summary: 'This article explains the Node.js event loop...',
                quiz: null,
                options: {
                  useSummaryAi: true,
                  useTagsAi: true,
                  useQuiz: false,
                  mergeSummaryWithContent: false,
                  includeInWeeklyEmail: true,
                  includeInTelegramQuiz: true
                },
                integrations: {
                  tickTickId: 'task_1234567890'
                },
                createdAt: '2023-07-01T10:30:00.000Z',
                updatedAt: '2023-07-01T10:30:00.000Z'
              }
            ],
            count: 1
          }
        }
      }
    },

    // TICKTICK ENDPOINTS
    ticktick: {
      tag: 'TickTick',
      description: 'TickTick OAuth authentication and integration',
      
      initiateAuth: {
        method: 'GET',
        path: '/ticktick/auth',
        summary: 'Initiate TickTick OAuth flow',
        description: `
          Starts the OAuth2 authentication flow with TickTick. 
          Redirects user to TickTick for authorization.
        `,
        parameters: {
          redirect_uri: {
            type: 'string',
            required: true,
            in: 'query',
            description: 'Extension redirect URI for OAuth callback',
            example: 'chrome-extension://your-extension-id/auth/callback',
            validation: 'Valid URI string'
          }
        },
        responses: {
          '302': {
            description: 'Redirect to TickTick authorization page'
          },
          '400': {
            description: 'Missing redirect_uri parameter',
            schema: {
              status: 'error',
              message: 'Missing extension redirect_uri'
            }
          }
        },
        example: {
          request: '/ticktick/auth?redirect_uri=chrome-extension://abc123/auth/callback',
          response: 'Redirect to https://ticktick.com/oauth2/authorize?...'
        }
      },

      handleCallback: {
        method: 'GET',
        path: '/ticktick/callback',
        summary: 'Handle TickTick OAuth callback',
        description: `
          Processes the OAuth callback from TickTick after user authorization.
          Exchanges authorization code for access tokens and creates/updates user.
        `,
        parameters: {
          code: {
            type: 'string',
            required: true,
            in: 'query',
            description: 'Authorization code from TickTick'
          },
          state: {
            type: 'string',
            required: true,
            in: 'query',
            description: 'Base64-encoded state parameter with redirect URI'
          }
        },
        responses: {
          '302': {
            description: 'Redirect back to extension with userId',
            headers: {
              Location: 'chrome-extension://your-extension-id/auth/callback?userId=user_123'
            }
          },
          '400': {
            description: 'Missing code or state parameters',
            schema: {
              status: 'error',
              message: 'Missing code or state'
            }
          },
          '500': {
            description: 'OAuth exchange failed',
            schema: {
              status: 'error',
              message: 'Detailed error message'
            }
          }
        }
      }
    },

    // USER ENDPOINTS
    user: {
      tag: 'User',
      description: 'User settings and preferences management',
      
      updateEmailSettings: {
        method: 'POST',
        path: '/User/email',
        summary: 'Update user email settings',
        description: `
          Updates user email address and weekly email preferences.
          Creates user record if it doesn't exist.
        `,
        requestBody: {
          required: true,
          contentType: 'application/json',
          schema: {
            userId: {
              type: 'string',
              required: true,
              description: 'User identifier',
              example: 'user_1234567890abcdef',
              validation: 'Non-empty string'
            },
            email: {
              type: 'string',
              format: 'email',
              required: true,
              description: 'Email address',
              example: 'user@example.com',
              validation: 'Valid email format'
            },
            weeklyEmailEnabled: {
              type: 'boolean',
              required: false,
              default: false,
              description: 'Enable weekly email digests',
              example: true
            }
          }
        },
        responses: {
          '200': {
            description: 'Email settings updated successfully',
            schema: {
              status: 'success',
              message: 'Email settings updated!'
            }
          },
          '400': {
            description: 'Validation error',
            schema: {
              status: 'error',
              message: 'Detailed validation error'
            }
          },
          '500': {
            description: 'Internal server error'
          }
        },
        example: {
          request: {
            userId: 'user_1234567890abcdef',
            email: 'user@example.com',
            weeklyEmailEnabled: true
          },
          response: {
            status: 'success',
            message: 'Email settings updated!'
          }
        }
      }
    },

    // TELEGRAM ENDPOINTS
    telegram: {
      tag: 'Telegram',
      description: 'Telegram bot webhook for quiz and notifications',
      
      webhook: {
        method: 'POST',
        path: '/telegram/webhook',
        summary: 'Telegram bot webhook endpoint',
        description: `
          Receives updates from Telegram bot API and processes them.
          Handles user interactions, quiz responses, and notifications.
        `,
        requestBody: {
          required: true,
          contentType: 'application/json',
          description: 'Telegram update object as documented in Telegram Bot API',
          schema: {
            update_id: {
              type: 'integer',
              description: 'Update identifier'
            },
            message: {
              type: 'object',
              description: 'Message object from Telegram'
            },
            callback_query: {
              type: 'object',
              description: 'Callback query from inline keyboards'
            }
          }
        },
        responses: {
          '200': {
            description: 'Webhook processed successfully'
          },
          '500': {
            description: 'Webhook processing error'
          }
        },
        security: {
          telegramSecret: 'Telegram webhook secret token validation'
        }
      }
    }
  },

  // Error Handling
  errorHandling: {
    standardFormat: {
      status: 'error',
      message: 'Human-readable error description',
      stack: 'Stack trace (development only)'
    },
    commonErrors: {
      '400': 'Bad Request - Validation failed or missing required parameters',
      '401': 'Unauthorized - Invalid or missing authentication',
      '404': 'Not Found - Resource does not exist',
      '429': 'Too Many Requests - Rate limit exceeded',
      '500': 'Internal Server Error - Unexpected server error'
    }
  },

  // Data Models
  dataModels: {
    User: {
      description: 'User profile and settings',
      fields: {
        userId: 'Unique identifier from TickTick token',
        email: 'User email address',
        weeklyEmailEnabled: 'Weekly digest preference',
        tickTickTokenHash: 'Hashed TickTick access token',
        tickTickAccessToken: 'TickTick OAuth access token',
        tickTickRefreshToken: 'TickTick OAuth refresh token',
        tickTickConnected: 'Connection status'
      }
    },
    Content: {
      description: 'Saved content with AI enrichment',
      fields: {
        userId: 'Owner identifier',
        title: 'Content title',
        url: 'Source URL',
        rawText: 'Full text content',
        listName: 'TickTick list name',
        tags: 'Content tags array',
        summary: 'AI-generated summary',
        quiz: 'AI-generated quiz object',
        options: 'Processing options',
        integrations: 'External service IDs'
      }
    }
  },

  // Usage Examples
  examples: {
    chromeExtension: {
      authentication: `
        // 1. Initiate OAuth flow
        const authUrl = 'http://localhost:3000/api/v1/ticktick/auth?' +
          'redirect_uri=' + encodeURIComponent(chrome.identity.getRedirectURL());
        
        // 2. Handle callback and extract userId
        const url = new URL(callbackUrl);
        const userId = url.searchParams.get('userId');
        
        // 3. Use userId for API calls
        fetch('http://localhost:3000/api/v1/content/user/' + userId);
      `,
      
      createContent: `
        const response = await fetch('http://localhost:3000/api/v1/content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: 'user_1234567890abcdef',
            title: 'Article Title',
            rawText: 'Article content...',
            user_input: '~learning #nodejs',
            use_tagsAi: true,
            use_summaryAi: true,
            use_quiz: true
          })
        });
      `
    }
  }
};

export default apiDocumentation;
