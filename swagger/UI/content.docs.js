/**
 * @fileoverview OpenAPI docs for /api/v1/content
 */

export const contentDocs = {
  '/api/v1/content': {
    post: {
      tags: ['Content'],
      summary: 'Create content item',
      description: `
Creates a new content item, optionally enriches it with AI, saves it to MongoDB, and may attempt TickTick sync.

### Frontend notes
- Required fields: \`userId\`, \`title\`, \`rawText\`
- \`user_input\` supports:
  - \`~listName\` → parsed as list name
  - \`#tag\` → parsed as tags
- AI flags control content generation and backend behavior:
  - \`use_summaryAi\`: generates summary AND automatically makes content eligible for weekly email
  - \`use_tagsAi\`: generates AI tags in addition to parsed user tags
  - \`use_quiz\`: generates quiz AND automatically makes content eligible for Telegram quiz flow
  - \`mergeSummaryWithContent\`: when enabled, appends the summary to the saved content
- Successful creation returns the saved content plus an \`ai\` object
- This endpoint is rate-limited more strictly than general routes
      `.trim(),
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateContentRequest' },
            examples: {
              minimal: {
                summary: 'Minimal create request',
                value: {
                  userId: 'USER_4a9f2c1b3e7d8a0f',
                  title: 'Understanding MongoDB Indexes',
                  rawText: 'Indexes in MongoDB improve query performance...',
                  use_summaryAi: false,
                  use_tagsAi: false,
                  use_quiz: false,
                  mergeSummaryWithContent: false,
                },
              },
              full: {
                summary: 'Full create request with AI and list parsing',
                value: {
                  userId: 'USER_4a9f2c1b3e7d8a0f',
                  title: 'Understanding MongoDB Indexes',
                  url: 'https://mongodb.com/docs/indexes',
                  rawText:
                    'Indexes in MongoDB support efficient query execution by avoiding full collection scans...',
                  user_input: '~learning #mongodb #backend',
                  use_summaryAi: true,
                  use_tagsAi: true,
                  use_quiz: true,
                  mergeSummaryWithContent: false,
                },
              },
            },
          },
        },
      },
      responses: {
        201: {
          description: 'Content created successfully.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateContentResponse' },
              examples: {
                successWithAi: {
                  summary: 'Saved content with AI output',
                  value: {
                    status: 'success',
                    data: {
                      content: {
                        _id: '663f1a2b4c5d6e7f8a9b0c1d',
                        userId: 'USER_4a9f2c1b3e7d8a0f',
                        title: 'Understanding MongoDB Indexes',
                        url: 'https://mongodb.com/docs/indexes',
                        rawText: 'Indexes in MongoDB support efficient...',
                        listName: 'learning',
                        tags: ['mongodb', 'backend', 'database'],
                        summary:
                          'MongoDB indexes reduce query time by avoiding full scans.',
                        quiz: {
                          question:
                            'What problem do indexes primarily solve in MongoDB?',
                          options: [
                            'Slow writes',
                            'Full collection scans',
                            'Schema validation',
                            'Replication lag',
                          ],
                          correctAnswer: 'Full collection scans',
                          isSolved: false,
                        },
                        options: {
                          useSummaryAi: true,
                          useTagsAi: true,
                          useQuiz: true,
                          includeInWeeklyEmail: true,
                          includeInTelegramQuiz: true,
                          mergeSummaryWithContent: false,
                        },
                        integrations: {
                          tickTickId: null,
                          tickTickProjectId: null,
                        },
                        isRead: false,
                        lastEmailedAt: null,
                        createdAt: '2026-04-14T12:00:00.000Z',
                        updatedAt: '2026-04-14T12:00:00.000Z',
                      },
                      ai: {
                        summary:
                          'MongoDB indexes reduce query time by avoiding full scans.',
                        tags: ['mongodb', 'backend', 'database'],
                        quiz: {
                          question:
                            'What problem do indexes primarily solve in MongoDB?',
                          options: [
                            'Slow writes',
                            'Full collection scans',
                            'Schema validation',
                            'Replication lag',
                          ],
                          correctAnswer: 'Full collection scans',
                          isSolved: false,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        400: {
          description: 'Validation error.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              examples: {
                missingUserId: {
                  value: {
                    status: 'error',
                    message: 'userId is required and must be a non-empty string',
                  },
                },
                missingTitle: {
                  value: {
                    status: 'error',
                    message: 'title is required and must be a non-empty string',
                  },
                },
                titleTooLong: {
                  value: {
                    status: 'error',
                    message: 'title must be less than 500 characters',
                  },
                },
              },
            },
          },
        },
        429: {
          description: 'Too many requests for content route.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: {
                status: 'error',
                message:
                  'Too many requests from this IP, please try again later.',
                retryAfter: '15 minutes',
              },
            },
          },
        },
        500: {
          description: 'Internal server error.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: {
                status: 'error',
                message: 'Internal server error',
              },
            },
          },
        },
      },
    },
  },

  '/api/v1/content/user/{userId}': {
    get: {
      tags: ['Content'],
      summary: 'Get all content for a user',
      description: `
Returns all saved content for the provided \`userId\`, sorted newest first.

### Frontend notes
- Use this route after OAuth callback once you have stored \`userId\`
- Main list page / dashboard route for user content
      `.trim(),
      parameters: [
        {
          name: 'userId',
          in: 'path',
          required: true,
          description: 'Authenticated app user ID',
          schema: {
            type: 'string',
            example: 'USER_4a9f2c1b3e7d8a0f',
          },
        },
      ],
      responses: {
        200: {
          description: 'List of content records.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ContentListResponse' },
            },
          },
        },
        400: {
          description: 'Missing or invalid userId.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: {
                status: 'error',
                message: 'userId is required and must be a non-empty string',
              },
            },
          },
        },
        500: {
          description: 'Database query failed.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
      },
    },
  },
};