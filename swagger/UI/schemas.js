/**
 * @fileoverview Reusable OpenAPI schema components
 */

export const schemas = {
    UserId:
    {
        type: 'string',
        example: 'USER_4a9f2c1b3e7d8a0f',
        description: 'Opaque application user ID. Google login generates the primary identity; legacy identities remain compatible.',
    },

    ErrorResponse:
    {
        type: 'object',
        properties:
        {
            status:
            {
                type: 'string',
                example: 'error'
            },
            message:
            {
                type: 'string',
                example: 'Human-readable error description.'
            },
            type:
            {
                type: 'string',
                example: 'ValidationError',
                nullable: true
            },
            details:
            {
                type: 'array',
                items:
                {
                    type: 'string'
                },
                example: ['email must be a valid email address'],
                nullable: true,
            },
            retryAfter:
            {
                type: 'string',
                example: '15 minutes',
                nullable: true
            },
        },
    },

    SuccessMessage:
    {
        type: 'object',
        properties:
        {
            status:
            {
                type: 'string',
                example: 'success'
            },
            message:
            {
                type: 'string',
                example: 'Operation completed successfully.'
            },
        },
    },

    RedirectResponse:
    {
        type: 'object',
        description: 'This endpoint returns an HTTP redirect, not a JSON body, on success.',
        properties:
        {
            location:
            {
                type: 'string',
                example: 'https://<extension-id>.chromiumapp.org/google?exchange_code=EXAMPLE&client_nonce=EXAMPLE',
            },
        },
    },

    User:
    {
        type: 'object',
        properties:
        {
            userId:
            {
                $ref: '#/components/schemas/UserId'
            },
            email:
            {
                type: 'string',
                format: 'email',
                example: 'ahmed@example.com',
                nullable: true,
            },
            weeklyEmailEnabled:
            {
                type: 'boolean',
                default: false,
                description: 'User-level opt-in for weekly email digest.',
            },
            telegramChatId:
            {
                type: 'string',
                example: '123456789',
                nullable: true,
            },
            telegramConnected:
            {
                type: 'boolean',
                default: false,
            },
            receiveTelegramQuiz:
            {
                type: 'boolean',
                default: true,
            },
            useSummaryAi:
            {
                type: 'boolean',
                default: true,
            },
            useTagsAi:
            {
                type: 'boolean',
                default: true,
            },
            useQuiz:
            {
                type: 'boolean',
                default: true,
            },
            mergeSummary:
            {
                type: 'boolean',
                default: false,
            },
            tickTickConnected:
            {
                type: 'boolean',
                default: false,
            },
            createdAt:
            {
                type: 'string',
                format: 'date-time',
            },
            updatedAt:
            {
                type: 'string',
                format: 'date-time',
            },
        },
    },

    EmailSettingsRequest:
    {
        type: 'object',
        required: ['email'],
        properties:
        {
            userId:
            {
                $ref: '#/components/schemas/UserId'
            },
            email:
            {
                type: 'string',
                format: 'email',
                example: 'ahmed@example.com',
            },
            weeklyEmailEnabled:
            {
                type: 'boolean',
                default: false,
                example: true,
                description: 'Subscribe or unsubscribe from the weekly digest.',
            },
        },
    },

    EmailSettingsResponse:
    {
        type: 'object',
        properties:
        {
            status:
            {
                type: 'string',
                example: 'success'
            },
            message:
            {
                type: 'string',
                example: 'Email settings updated!'
            },
        },
    },

    Quiz:
    {
        type: 'object',
        nullable: true,
        properties:
        {
            question:
            {
                type: 'string',
                example: 'What is the main advantage of using indexes in MongoDB?',
            },
            options:
            {
                type: 'array',
                items:
                {
                    type: 'string'
                },
                minItems: 2,
                example: ['Faster reads', 'Faster writes', 'Less storage', 'Better joins'],
            },
            correctAnswer:
            {
                type: 'string',
                example: 'Faster reads',
                description: 'Must be one of the values in options.',
            },
            isSolved:
            {
                type: 'boolean',
                default: false,
                description: 'Set to true after the quiz is answered successfully.',
            },
        },
    },

    ArticleOptions:
    {
        type: 'object',
        properties:
        {
            useSummaryAi:
            {
                type: 'boolean',
                default: true,
                description: 'Generate an AI summary for the article. When true, automatically sets includeInWeeklyEmail=true.',
            },
            useTagsAi:
            {
                type: 'boolean',
                default: true,
                description: 'Generate AI tags in addition to parsed user tags.',
            },
            useQuiz:
            {
                type: 'boolean',
                default: true,
                description: 'Generate one quiz object for Telegram usage. When true, automatically sets includeInTelegramQuiz=true.',
            },
            includeInWeeklyEmail:
            {
                type: 'boolean',
                default: true,
                description: 'Backend-derived flag: true when use_summaryAi=true, indicating content is eligible for weekly email digest.',
            },
            includeInTelegramQuiz:
            {
                type: 'boolean',
                default: true,
                description: 'Backend-derived flag: true when use_quiz=true, indicating content is eligible for Telegram quiz flow.',
            },
            mergeSummaryWithContent:
            {
                type: 'boolean',
                default: false,
                description: 'If enabled, appends the AI summary to the saved content text.',
            },
        },
    },

    Integrations:
    {
        type: 'object',
        properties:
        {
            tickTickId:
            {
                type: 'string',
                nullable: true,
                example: 'abc123xyz',
            },
            tickTickProjectId:
            {
                type: 'string',
                nullable: true,
                example: null,
            },
        },
    },

    Content:
    {
        type: 'object',
        properties:
        {
            _id:
            {
                type: 'string',
                example: '663f1a2b4c5d6e7f8a9b0c1d'
            },
            userId:
            {
                $ref: '#/components/schemas/UserId'
            },
            title:
            {
                type: 'string',
                example: 'Understanding MongoDB Indexes'
            },
            url:
            {
                type: 'string',
                format: 'uri',
                nullable: true,
                example: 'https://mongodb.com/docs/indexes',
            },
            rawText:
            {
                type: 'string',
                example: 'Indexes in MongoDB support efficient query execution...',
            },
            listName:
            {
                type: 'string',
                default: 'inbox',
                example: 'learning',
            },
            tags:
            {
                type: 'array',
                items:
                {
                    type: 'string'
                },
                example: ['mongodb', 'database', 'backend'],
            },
            summary:
            {
                type: 'string',
                nullable: true,
                example: 'MongoDB indexes improve query performance by reducing scanned documents.',
            },
            quiz:
            {
                $ref: '#/components/schemas/Quiz'
            },
            options:
            {
                $ref: '#/components/schemas/ArticleOptions'
            },
            integrations:
            {
                $ref: '#/components/schemas/Integrations'
            },
            isRead:
            {
                type: 'boolean',
                default: false
            },
            lastEmailedAt:
            {
                type: 'string',
                format: 'date-time',
                nullable: true,
            },
            createdAt:
            {
                type: 'string',
                format: 'date-time',
            },
            updatedAt:
            {
                type: 'string',
                format: 'date-time',
            },
        },
    },

    CreateContentRequest:
    {
        type: 'object',
        required: ['title', 'rawText'],
        properties:
        {
            destinations:
            {
                type: 'object',
                additionalProperties: false,
                description: 'Omitted providers are disabled. Connection alone never selects a provider.',
                properties:
                {
                    ticktick:
                    {
                        type: 'object',
                        additionalProperties: false,
                        required: ['enabled'],
                        properties:
                        {
                            enabled:
                            {
                                type: 'boolean'
                            },
                            projectId:
                            {
                                type: 'string',
                                minLength: 1,
                                maxLength: 100
                            }
                        }
                    },
                    notion:
                    {
                        type: 'object',
                        additionalProperties: false,
                        required: ['enabled'],
                        properties:
                        {
                            enabled:
                            {
                                type: 'boolean'
                            },
                            destinationId:
                            {
                                type: 'string',
                                format: 'uuid'
                            },
                            destinationType:
                            {
                                type: 'string',
                                enum: ['page', 'data_source']
                            }
                        }
                    }
                }
            },
            ticktickOptions:
            {
                type: 'object',
                additionalProperties: false,
                description: 'Only valid when TickTick is selected; affects its export only.',
                properties:
                {
                    useAiSummary:
                    {
                        type: 'boolean',
                        default: false
                    },
                    useAiTags:
                    {
                        type: 'boolean',
                        default: false
                    },
                    mergeSummaryWithContent:
                    {
                        type: 'boolean',
                        default: false
                    },
                    tags:
                    {
                        type: 'array',
                        maxItems: 30,
                        items:
                        {
                            type: 'string',
                            minLength: 1,
                            maxLength: 60
                        }
                    }
                }
            },
            title:
            {
                type: 'string',
                minLength: 1,
                maxLength: 500,
                example: 'Understanding MongoDB Indexes',
            },
            url:
            {
                type: 'string',
                format: 'uri',
                example: 'https://mongodb.com/docs/indexes',
            },
            rawText:
            {
                type: 'string',
                minLength: 1,
                maxLength: 100000,
                example: 'Indexes in MongoDB support efficient query execution by avoiding full collection scans...',
            },
            user_input:
            {
                type: 'string',
                example: '~learning #mongodb #backend',
                description: 'Frontend helper input. Use ~ for TickTick list name and # for tags. Example: ~learning #nodejs #backend',
            },
            use_summaryAi:
            {
                type: 'boolean',
                default: false,
                description: 'Legacy-only summary flag: ignored when explicit destinations is supplied. Use ticktickOptions for exports.',
            },
            use_tagsAi:
            {
                type: 'boolean',
                default: false,
                description: 'Legacy-only tag generation: ignored when explicit destinations is supplied. Global tags come from user_input.',
            },
            use_quiz:
            {
                type: 'boolean',
                default: false,
                description: 'Generate quiz and automatically make content eligible for Telegram quiz flow.',
            },
            mergeSummaryWithContent:
            {
                type: 'boolean',
                default: false,
                description: 'Legacy preference retained. The original rawText is preserved; TickTick uses ticktickOptions for its own export.',
            },
        },
    },

    CreateContentResponse:
    {
        type: 'object',
        properties:
        {
            status:
            {
                type: 'string',
                example: 'success'
            },
            data:
            {
                type: 'object',
                properties:
                {
                    content:
                    {
                        $ref: '#/components/schemas/Content'
                    },
                    ai:
                    {
                        type: 'object',
                        properties:
                        {
                            summary:
                            {
                                type: 'string',
                                nullable: true,
                                example: 'A concise overview of MongoDB indexes.',
                            },
                            tags:
                            {
                                type: 'array',
                                items:
                                {
                                    type: 'string'
                                },
                                example: ['mongodb', 'indexing'],
                            },
                            quiz:
                            {
                                $ref: '#/components/schemas/Quiz'
                            },
                        },
                    },
                },
            },
        },
    },

    ContentListResponse:
    {
        type: 'object',
        properties:
        {
            status:
            {
                type: 'string',
                example: 'success'
            },
            count:
            {
                type: 'integer',
                example: 2
            },
            data:
            {
                type: 'array',
                items:
                {
                    $ref: '#/components/schemas/Content'
                },
            },
        },
    },

    TelegramWebhookRequest:
    {
        type: 'object',
        description: 'Telegram Update object sent by Telegram servers.',
        properties:
        {
            update_id:
            {
                type: 'integer',
                example: 123456789
            },
            message:
            {
                type: 'object',
                nullable: true,
                properties:
                {
                    message_id:
                    {
                        type: 'integer'
                    },
                    text:
                    {
                        type: 'string',
                        example: '/start USER_4a9f2c1b3e7d8a0f'
                    },
                },
            },
            callback_query:
            {
                type: 'object',
                nullable: true,
                properties:
                {
                    id:
                    {
                        type: 'string',
                        example: '4382bfdwdsb323b2d9'
                    },
                    data:
                    {
                        type: 'string',
                        example: 'quiz_answer_A'
                    },
                },
            },
            poll_answer:
            {
                type: 'object',
                nullable: true,
                properties:
                {
                    poll_id:
                    {
                        type: 'string',
                        example: '547398247239847'
                    },
                    user:
                    {
                        type: 'object',
                        properties:
                        {
                            id:
                            {
                                type: 'integer',
                                example: 123456789
                            },
                        },
                    },
                    option_ids:
                    {
                        type: 'array',
                        items:
                        {
                            type: 'integer'
                        },
                        example: [1],
                    },
                },
            },
        },
    },
};
// Public status projection is distinct from persisted destination snapshots.
const providerStatus = statuses => (
{
    type: 'object',
    properties:
    {
        requested:
        {
            type: 'boolean'
        },
        status:
        {
            type: 'string',
            enum: statuses
        },
        retryable:
        {
            type: 'boolean',
            description: 'Controlled server signal, never permission to blindly retry uncertain writes.'
        },
        errorCode:
        {
            type: 'string',
            nullable: true
        }
    }
});
schemas.ContentSyncStatus = {
    type: 'object',
    properties:
    {
        contentId:
        {
            type: 'string'
        },
        ticktick:
        {
            ...providerStatus(['not_requested', 'queued', 'pending', 'synced', 'failed', 'uncertain']),
            properties:
            {
                ...providerStatus([]).properties,
                status:
                {
                    type: 'string',
                    enum: ['not_requested', 'queued', 'pending', 'synced', 'failed', 'uncertain']
                },
                taskId:
                {
                    type: 'string',
                    nullable: true
                },
                projectId:
                {
                    type: 'string',
                    nullable: true
                }
            }
        },
        notion:
        {
            ...providerStatus(['not_requested', 'queued', 'pending', 'synced', 'failed', 'partial', 'uncertain']),
            properties:
            {
                ...providerStatus([]).properties,
                status:
                {
                    type: 'string',
                    enum: ['not_requested', 'queued', 'pending', 'synced', 'failed', 'partial', 'uncertain']
                },
                pageId:
                {
                    type: 'string',
                    nullable: true
                },
                pageUrl:
                {
                    type: 'string',
                    nullable: true
                }
            }
        }
    }
};
