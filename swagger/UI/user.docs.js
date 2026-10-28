import
{
    jwt,
    string,
    body,
    success,
    errors
}
from './auth.docs.js';
export const userDocs = {
    '/api/v1/User/email':
    {
        post:
        {
            tags: ['User Preferences'],
            security: jwt,
            summary: 'Update authenticated account email and digest preference',
            description: 'Ownership comes from JWT, not request userId. Supported backend feature temporarily absent from the extension. Existing schedules remain active until explicitly changed.',
            requestBody: body(
            {
                email:
                {
                    type: 'string',
                    format: 'email'
                },
                weeklyEmailEnabled:
                {
                    type: 'boolean'
                }
            }, ['email']),
            responses:
            {
                ...errors,
                200:
                {
                    description: 'status: success; message: Email settings updated!'
                }
            }
        }
    },
    '/api/v1/User/quiz-preferences':
    {
        post:
        {
            tags: ['User Preferences'],
            security: jwt,
            summary: 'Update authenticated Telegram quiz preference',
            requestBody: body(
            {
                receiveTelegramQuiz:
                {
                    type: 'boolean'
                }
            }),
            responses:
            {
                ...errors,
                200: success('Preference updated',
                {
                    userId: string,
                    receiveTelegramQuiz:
                    {
                        type: 'boolean'
                    }
                })
            }
        }
    },
    '/api/v1/User/preferences/me':
    {
        get:
        {
            tags: ['User Preferences'],
            security: jwt,
            summary: 'Read authenticated delivery preferences',
            responses:
            {
                ...errors,
                200: success('Preferences with defaults for missing values',
                {
                    userId: string,
                    email: string,
                    weeklyEmailEnabled:
                    {
                        type: 'boolean',
                        default: false
                    },
                    receiveTelegramQuiz:
                    {
                        type: 'boolean',
                        default: true
                    },
                    telegramConnected:
                    {
                        type: 'boolean',
                        default: false
                    },
                    telegramChatId:
                    {
                        type: 'string',
                        nullable: true
                    }
                })
            }
        }
    }
};
