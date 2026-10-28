// Shared documentation builders; these describe public responses only.
export const jwt = [
{
    bearerAuth: []
}];
export const string = {
    type: 'string'
};
export const json = schema => (
{
    content:
    {
        'application/json':
        {
            schema
        }
    }
});
export const body = (properties, required = Object.keys(properties)) => (
{
    required: true,
    ...json(
    {
        type: 'object',
        properties,
        required
    })
});
export const success = (description, properties) => (
{
    description,
    ...json(
    {
        type: 'object',
        properties:
        {
            status:
            {
                type: 'string',
                enum: ['success']
            },
            ...(properties ?
            {
                data:
                {
                    type: 'object',
                    properties
                }
            } :
            {})
        }
    })
});
export const errors = Object.fromEntries([400, 401, 403, 404, 409, 422, 429, 500, 502, 503].map(n => [n,
{
    description: 'Validation, authentication, resource, conflict or upstream failure as applicable. No provider credentials returned.',
    ...json(
    {
        $ref: '#/components/schemas/ErrorResponse'
    })
}]));
const query = (name, schema = string, required = true) => (
{
    name,
    in: 'query',
    required,
    schema
});
const callback = {
    tags: ['Authentication'],
    summary: 'Complete state-bound OAuth callback',
    security: [],
    parameters: [query('state'), query('code', string, false), query('error', string, false)],
    responses:
    {
        ...errors,
        302:
        {
            description: 'Redirect to the stored allowlisted extension callback. No provider tokens in URL.'
        }
    }
};
const auth = {
    tags: ['Authentication'],
    summary: 'Start Google application login',
    security: [],
    parameters: [query('redirect_uri'), query('client_nonce',
    {
        type: 'string',
        pattern: '^[A-Za-z0-9_-]{32,128}$'
    }), query('code_challenge',
    {
        type: 'string',
        pattern: '^[a-f0-9]{64}$'
    })],
    responses:
    {
        ...errors,
        302:
        {
            description: 'Redirect to Google. The callback returns a single-use exchange code and client nonce to the extension.'
        }
    }
};
const exchange = {
    tags: ['Authentication'],
    summary: 'Exchange a single-use code for the application JWT',
    security: [],
    requestBody: body(
    {
        exchange_code:
        {
            type: 'string',
            pattern: '^[A-Za-z0-9_-]{43}$'
        },
        verifier:
        {
            type: 'string',
            pattern: '^[a-f0-9]{64}$'
        }
    }),
    responses:
    {
        ...errors,
        200: success('Application credentials; never provider tokens',
        {
            userId: string,
            token: string
        })
    }
};
export const authDocs = {
    '/api/v1/auth/google':
    {
        get: auth
    },
    '/api/v1/auth/google/auth':
    {
        get: auth
    },
    '/api/v1/auth/google/callback':
    {
        get: callback
    },
    '/api/v1/auth/google/exchange':
    {
        post:
        {
            ...exchange,
            description: 'Also accepts code and codeVerifier as compatibility aliases.'
        }
    },
    '/api/v1/ticktick/auth':
    {
        get:
        {
            ...auth,
            tags: ['Legacy compatibility'],
            summary: 'Legacy TickTick identity login',
            description: 'Compatibility endpoint only. New Knowvia clients use Google login and authenticated TickTick linking.'
        }
    },
    '/api/v1/ticktick/callback':
    {
        get:
        {
            ...callback,
            tags: ['Legacy compatibility']
        }
    },
    '/api/v1/ticktick/auth/exchange':
    {
        post:
        {
            ...exchange,
            tags: ['Legacy compatibility']
        }
    }
};
for (const provider of ['ticktick', 'notion'])
{
    const root = `/api/v1/integrations/${provider}`;
    authDocs[`${root}/link`] = {
        post:
        {
            tags: [`${provider === 'notion' ? 'Notion' : 'TickTick'} Integration`],
            summary: `Link ${provider} to the authenticated Google-backed account`,
            security: jwt,
            requestBody: body(
            {
                redirect_uri:
                {
                    ...string,
                    description: 'Exact allowlisted extension callback'
                },
                client_nonce:
                {
                    type: 'string',
                    pattern: '^[A-Za-z0-9_-]{32,128}$'
                }
            }),
            responses:
            {
                ...errors,
                200: success('Open authorizationUrl in an authorization window',
                {
                    authorizationUrl:
                    {
                        type: 'string',
                        format: 'uri'
                    }
                })
            }
        }
    };
    authDocs[`${root}/callback`] = {
        get:
        {
            ...callback,
            description: 'Validates one-use state, binds the provider to its stored owner, and redirects with provider link status and client_nonce. No application bearer header is required.'
        }
    };
}
authDocs['/api/v1/integrations/notion/status'] = {
    get:
    {
        tags: ['Notion Integration'],
        summary: 'Read Notion connection metadata',
        security: jwt,
        responses:
        {
            ...errors,
            200: success('Safe connection state',
            {
                connected:
                {
                    type: 'boolean'
                },
                reconnectRequired:
                {
                    type: 'boolean'
                },
                workspaceName:
                {
                    type: 'string',
                    nullable: true
                },
                workspaceIcon:
                {
                    type: 'string',
                    nullable: true
                }
            })
        }
    }
};
