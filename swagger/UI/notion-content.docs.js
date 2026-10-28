const destination = {
    type: 'object',
    required: ['id', 'type', 'title', 'url', 'lastEditedTime'],
    properties:
    {
        id:
        {
            type: 'string',
            format: 'uuid'
        },
        type:
        {
            type: 'string',
            enum: ['page', 'data_source']
        },
        title:
        {
            type: 'string',
            description: 'Untrusted display text; render as text.'
        },
        url:
        {
            type: 'string',
            nullable: true
        },
        lastEditedTime:
        {
            type: 'string',
            nullable: true
        }
    }
};
const response = data => (
{
    description: 'Successful operation',
    content:
    {
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
                    data
                }
            }
        }
    }
});
const error = {
    description: 'Controlled error. The existing JWT middleware may omit code. No provider payloads or credentials.',
    content:
    {
        'application/json':
        {
            schema:
            {
                type: 'object',
                required: ['status', 'message'],
                properties:
                {
                    status:
                    {
                        type: 'string',
                        enum: ['error']
                    },
                    code:
                    {
                        type: 'string'
                    },
                    message:
                    {
                        type: 'string'
                    }
                }
            }
        }
    }
};
const common = {
    tags: ['Notion'],
    security: [
    {
        appBearer: []
    }]
};
const errors = Object.fromEntries([400, 401, 403, 404, 409, 422, 429, 500, 502, 503].map(status => [status, error]));

export const notionContentDocs = {
    '/api/v1/integrations/notion/destinations':
    {
        get:
        {
            ...common,
            summary: 'Discover accessible Notion pages and data sources',
            description: 'One bounded Search API page; never selects a default. Requires the owning Google-backed app user and usable Notion connection.',
            parameters: [
            {
                in: 'query',
                name: 'query',
                schema:
                {
                    type: 'string',
                    maxLength: 200
                }
            },
            {
                in: 'query',
                name: 'cursor',
                schema:
                {
                    type: 'string',
                    format: 'uuid'
                }
            }],
            responses:
            {
                ...errors,
                200: response(
                {
                    type: 'object',
                    properties:
                    {
                        destinations:
                        {
                            type: 'array',
                            items: destination
                        },
                        hasMore:
                        {
                            type: 'boolean'
                        },
                        nextCursor:
                        {
                            type: 'string',
                            nullable: true
                        }
                    }
                })
            }
        }
    },
    '/api/v1/integrations/notion/destination':
    {
        get:
        {
            ...common,
            summary: 'Read the selected Notion destination',
            responses:
            {
                ...errors,
                200: response(
                {
                    type: 'object',
                    properties:
                    {
                        destination:
                        {
                            type: 'object',
                            nullable: true,
                            properties:
                            {
                                id:
                                {
                                    type: 'string'
                                },
                                type:
                                {
                                    type: 'string'
                                }
                            }
                        }
                    }
                })
            }
        },
        put:
        {
            ...common,
            summary: 'Verify and explicitly select a default destination',
            description: 'A database alias is resolved only if it has exactly one data source. Stores only the verified canonical ID/type and a server selection revision. Never creates a page.',
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
                            additionalProperties: false,
                            required: ['destinationId', 'destinationType'],
                            properties:
                            {
                                destinationId:
                                {
                                    type: 'string',
                                    format: 'uuid'
                                },
                                destinationType:
                                {
                                    type: 'string',
                                    enum: ['page', 'data_source', 'database']
                                }
                            }
                        }
                    }
                }
            },
            responses:
            {
                ...errors,
                200: response(
                {
                    type: 'object',
                    properties:
                    {
                        destination
                    }
                })
            }
        },
        delete:
        {
            ...common,
            summary: 'Clear the default Notion destination',
            responses:
            {
                ...errors,
                200: response(
                {
                    type: 'object',
                    properties:
                    {
                        destination:
                        {
                            type: 'object',
                            nullable: true,
                            example: null
                        }
                    }
                })
            }
        }
    },
    '/api/v1/integrations/notion/sync/{contentId}':
    {
        post:
        {
            ...common,
            summary: 'Synchronize owned saved content or resume a definite partial failure',
            description: 'No request body. Reuses a recorded successful page. Atomic non-expiring claims prevent duplicate concurrent creation. Uncertain writes require reconciliation; a claim is not an exactly-once guarantee.',
            parameters: [
            {
                in: 'path',
                name: 'contentId',
                required: true,
                schema:
                {
                    type: 'string',
                    pattern: '^[a-fA-F0-9]{24}$'
                }
            }],
            responses:
            {
                ...errors,
                200: response(
                {
                    type: 'object',
                    properties:
                    {
                        status:
                        {
                            type: 'string',
                            enum: ['synced']
                        },
                        pageId:
                        {
                            type: 'string',
                            format: 'uuid'
                        },
                        pageUrl:
                        {
                            type: 'string',
                            format: 'uri'
                        },
                        alreadySynced:
                        {
                            type: 'boolean'
                        }
                    }
                })
            }
        }
    }
};
notionContentDocs['/api/v1/integrations/notion/sync/{contentId}'].post.description += ' Requires persisted requested intent and its original connection/destination binding; cannot switch providers or create a new primary Content. A definite partial append can resume only with recorded progress and matching content; uncertain outcomes require reconciliation. Export uses pages/blocks with supported write permissions and schema; arbitrary properties and attachments are unsupported.';
notionContentDocs['/api/v1/integrations/notion/destination'].delete.description = 'Accepts no body or an empty object. Clears only the verified default; does not disconnect the workspace or alter existing content intent.';
