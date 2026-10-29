/**
 * @fileoverview OpenAPI docs for /api/v1/content
 */

export const contentDocs = {
    '/api/v1/content/{contentId}/sync-status':
    {
        get:
        {
            tags: ['Content'],
            summary: 'Read independent provider synchronization states',
            security: [
            {
                bearerAuth: []
            }],
            parameters: [
            {
                name: 'contentId',
                in: 'path',
                required: true,
                schema:
                {
                    type: 'string',
                    pattern: '^[a-fA-F0-9]{24}$'
                }
            }],
            responses:
            {
                200:
                {
                    description: 'Read-only owner-scoped states: not_requested, queued, pending, synced, failed or uncertain; Notion also supports partial. Notion queued may be projected from intent before an attempt exists. Includes requested, retryable and confirmed safe resource references.'
                },
                400:
                {
                    description: 'Invalid ID'
                },
                401:
                {
                    description: 'Application authentication required'
                },
                404:
                {
                    description: 'Content not found for this account'
                },
                503:
                {
                    description: 'Status unavailable'
                }
            }
        }
    },
    '/api/v1/content/{contentId}/sync/ticktick':
    {
        post:
        {
            tags: ['Content'],
            summary: 'Explicit safe TickTick retry using persisted intent',
            security: [
            {
                bearerAuth: []
            }],
            description: 'No request body or changed destination options. Never reclaims pending/uncertain writes.',
            parameters: [
            {
                name: 'contentId',
                in: 'path',
                required: true,
                schema:
                {
                    type: 'string',
                    pattern: '^[a-fA-F0-9]{24}$'
                }
            }],
            responses:
            {
                200:
                {
                    description: 'Confirmed task ID; already synced tasks are reused'
                },
                400:
                {
                    description: 'Unexpected body'
                },
                401:
                {
                    description: 'Application authentication required'
                },
                404:
                {
                    description: 'Content not found'
                },
                409:
                {
                    description: 'Not requested, claimed, disconnected or uncertain outcome'
                },
                503:
                {
                    description: 'Synchronization unavailable'
                }
            }
        }
    },
    '/api/v1/content':
    {
        post:
        {
            tags: ['Content'],
            summary: 'Create content item',
            security: [
            {
                bearerAuth: []
            }],
            description: `
Commits the original capture to MongoDB. Only providers explicitly enabled in destinations are dispatched after commit, independently of each other and the response. Omitted destinations mean Knowvia-only, even with connected accounts or a Notion default. TickTick AI options affect its export only. Read GET /api/v1/content/{contentId}/sync-status for authoritative provider states. In-process dispatch is best effort, not a durable queue.

### Frontend notes
- Required fields: \`title\`, \`rawText\`; ownership always comes from the application JWT.
- \`user_input\` supports:
  - \`~listName\` → parsed as list name
  - \`#tag\` → parsed as tags
- AI flags control content generation and backend behavior:
  - \`use_summaryAi\`: generates summary AND automatically makes content eligible for weekly email
  - \`use_tagsAi\`: generates AI tags in addition to parsed user tags
  - \`use_quiz\`: generates quiz AND automatically makes content eligible for Telegram quiz flow
  - TickTick-only AI uses \`ticktickOptions\`; the original stored rawText stays intact.
- Successful creation returns the saved content plus an \`ai\` object
- Reading sync status never performs provider writes.
      `.trim(),
            requestBody:
            {
                required: true,
                content:
                {
                    'application/json':
                    {
                        schema:
                        {
                            $ref: '#/components/schemas/CreateContentRequest'
                        },
                        examples: Object.fromEntries([
                            ['knowviaOnly', false, false],
                            ['ticktick', true, false],
                            ['notion', false, true],
                            ['both', true, true]
                        ].map(([name, ticktick, notion]) => [name,
                        {
                            summary: 'Example only: replace provider identifiers with verified selections',
                            value:
                            {
                                title: 'Understanding OAuth',
                                url: 'https://example.com/oauth',
                                rawText: 'Original article text.',
                                use_quiz: false,
                                destinations:
                                {
                                    ticktick: ticktick ?
                                    {
                                        enabled: true,
                                        projectId: 'real-project-id'
                                    } :
                                    {
                                        enabled: false
                                    },
                                    notion: notion ?
                                    {
                                        enabled: true,
                                        destinationId: '11111111-1111-1111-1111-111111111111',
                                        destinationType: 'page'
                                    } :
                                    {
                                        enabled: false
                                    }
                                },
                                ...(ticktick ?
                                {
                                    ticktickOptions:
                                    {
                                        useAiSummary: true,
                                        useAiTags: false,
                                        mergeSummaryWithContent: false,
                                        tags: ['oauth', 'security']
                                    }
                                } :
                                {})
                            }
                        }])),
                    },
                },
            },
            responses:
            {
                201:
                {
                    description: 'HTTP 201 confirms MongoDB persistence only, not completion of provider writes.',
                    content:
                    {
                        'application/json':
                        {
                            schema:
                            {
                                $ref: '#/components/schemas/CreateContentResponse'
                            },
                            examples:
                            {
                                successWithAi:
                                {
                                    summary: 'Saved content with AI output',
                                    value:
                                    {
                                        status: 'success',
                                        data:
                                        {
                                            content:
                                            {
                                                _id: '663f1a2b4c5d6e7f8a9b0c1d',
                                                userId: 'USER_4a9f2c1b3e7d8a0f',
                                                title: 'Understanding MongoDB Indexes',
                                                url: 'https://mongodb.com/docs/indexes',
                                                rawText: 'Indexes in MongoDB support efficient...',
                                                listName: 'learning',
                                                tags: ['mongodb', 'backend', 'database'],
                                                summary: 'MongoDB indexes reduce query time by avoiding full scans.',
                                                quiz:
                                                {
                                                    question: 'What problem do indexes primarily solve in MongoDB?',
                                                    options: [
                                                        'Slow writes',
                                                        'Full collection scans',
                                                        'Schema validation',
                                                        'Replication lag',
                                                    ],
                                                    correctAnswer: 'Full collection scans',
                                                    isSolved: false,
                                                },
                                                options:
                                                {
                                                    useSummaryAi: true,
                                                    useTagsAi: true,
                                                    useQuiz: true,
                                                    includeInWeeklyEmail: true,
                                                    includeInTelegramQuiz: true,
                                                    mergeSummaryWithContent: false,
                                                },
                                                integrations:
                                                {
                                                    tickTickId: null,
                                                    tickTickProjectId: null,
                                                },
                                                isRead: false,
                                                lastEmailedAt: null,
                                                createdAt: '2026-04-14T12:00:00.000Z',
                                                updatedAt: '2026-04-14T12:00:00.000Z',
                                            },
                                            ai:
                                            {
                                                summary: 'MongoDB indexes reduce query time by avoiding full scans.',
                                                tags: ['mongodb', 'backend', 'database'],
                                                quiz:
                                                {
                                                    question: 'What problem do indexes primarily solve in MongoDB?',
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
                400:
                {
                    description: 'Validation error.',
                    content:
                    {
                        'application/json':
                        {
                            schema:
                            {
                                $ref: '#/components/schemas/ErrorResponse'
                            },
                            examples:
                            {
                                missingUserId:
                                {
                                    value:
                                    {
                                        status: 'error',
                                        message: 'userId is required and must be a non-empty string',
                                    },
                                },
                                missingTitle:
                                {
                                    value:
                                    {
                                        status: 'error',
                                        message: 'title is required and must be a non-empty string',
                                    },
                                },
                                titleTooLong:
                                {
                                    value:
                                    {
                                        status: 'error',
                                        message: 'title must be less than 500 characters',
                                    },
                                },
                            },
                        },
                    },
                },
                429:
                {
                    description: 'Too many requests for content route.',
                    content:
                    {
                        'application/json':
                        {
                            schema:
                            {
                                $ref: '#/components/schemas/ErrorResponse'
                            },
                            example:
                            {
                                status: 'error',
                                message: 'Too many requests from this IP, please try again later.',
                                retryAfter: '15 minutes',
                            },
                        },
                    },
                },
                500:
                {
                    description: 'Internal server error.',
                    content:
                    {
                        'application/json':
                        {
                            schema:
                            {
                                $ref: '#/components/schemas/ErrorResponse'
                            },
                            example:
                            {
                                status: 'error',
                                message: 'Internal server error',
                            },
                        },
                    },
                },
            },
        },
    },

    '/api/v1/content/user/{userId}':
    {
        get:
        {
            tags: ['Content'],
            summary: 'Get owned content',
            security: [
            {
                bearerAuth: []
            }],
            description: `
Requires JWT; a different userId returns 403. Returns saved content for the provided \`userId\`, sorted newest first.

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
                schema:
                {
                    type: 'string',
                    example: 'USER_4a9f2c1b3e7d8a0f',
                },
            }, ],
            responses:
            {
                200:
                {
                    description: 'List of content records.',
                    content:
                    {
                        'application/json':
                        {
                            schema:
                            {
                                $ref: '#/components/schemas/ContentListResponse'
                            },
                        },
                    },
                },
                400:
                {
                    description: 'Missing or invalid userId.',
                    content:
                    {
                        'application/json':
                        {
                            schema:
                            {
                                $ref: '#/components/schemas/ErrorResponse'
                            },
                            example:
                            {
                                status: 'error',
                                message: 'userId is required and must be a non-empty string',
                            },
                        },
                    },
                },
                500:
                {
                    description: 'Database query failed.',
                    content:
                    {
                        'application/json':
                        {
                            schema:
                            {
                                $ref: '#/components/schemas/ErrorResponse'
                            },
                        },
                    },
                },
            },
        },
    },
};
const contentSecurity = [
{
    bearerAuth: []
}];
contentDocs['/api/v1/content/projects'] = {
    get:
    {
        tags: ['Content'],
        security: contentSecurity,
        summary: 'List projects from the authenticated TickTick connection',
        responses:
        {
            200:
            {
                description: 'status: success, data: provider project array'
            },
            401:
            {
                description: 'Application JWT or usable TickTick connection missing'
            },
            500:
            {
                description: 'Lookup failed'
            }
        }
    },
    post:
    {
        tags: ['Content'],
        security: contentSecurity,
        summary: 'Create a TickTick project',
        requestBody:
        {
            required: true,
            content:
            {
                'application/json':
                {
                    schema:
                    {
                        type: 'object',
                        required: ['name'],
                        properties:
                        {
                            name:
                            {
                                type: 'string',
                                minLength: 1
                            }
                        }
                    }
                }
            }
        },
        responses:
        {
            201:
            {
                description: 'status: success, data: created provider project'
            },
            400:
            {
                description: 'Project name required'
            },
            401:
            {
                description: 'Application JWT or TickTick connection missing'
            },
            500:
            {
                description: 'Creation failed'
            }
        }
    }
};
contentDocs['/api/v1/content/tags'] = {
    get:
    {
        tags: ['Content'],
        security: contentSecurity,
        summary: 'Read global tags from owned Knowvia content',
        responses:
        {
            200:
            {
                description: 'status: success, data: string array, count: integer'
            },
            401:
            {
                description: 'Application JWT required'
            }
        }
    }
};
contentDocs['/api/v1/content/{contentId}/sync-status'].get.responses[200].content = {
    'application/json':
    {
        schema:
        {
            type: 'object',
            properties:
            {
                status:
                {
                    type: 'string',
                    enum: ['success']
                },
                data:
                {
                    $ref: '#/components/schemas/ContentSyncStatus'
                }
            }
        }
    }
};
for (const example of Object.values(contentDocs['/api/v1/content'].post.requestBody.content['application/json'].examples))
{
    if (example.value.destinations.notion.enabled)
    {
        example.value.notionOptions = { tags: ['reference', 'oauth'] };
    }
    if (example.value.ticktickOptions)
    {
        delete example.value.ticktickOptions.mergeSummaryWithContent;
    }
}
