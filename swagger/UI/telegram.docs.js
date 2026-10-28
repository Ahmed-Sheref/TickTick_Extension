export const telegramDocs = {
    '/api/v1/telegram/webhook':
    {
        post:
        {
            tags: ['Telegram / Delivery'],
            summary: 'Receive Telegram bot updates',
            security: [
            {
                telegramWebhook: []
            }],
            description: 'Server-to-server only. Validates X-Telegram-Bot-Api-Secret-Token using constant-time comparison before processing an update.',
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
                            additionalProperties: true,
                            properties:
                            {
                                update_id:
                                {
                                    type: 'integer'
                                }
                            }
                        }
                    }
                }
            },
            responses:
            {
                200:
                {
                    description: 'Plain text OK'
                },
                403:
                {
                    description: 'Missing or incorrect webhook secret'
                },
                503:
                {
                    description: 'Server secret not configured'
                },
                500:
                {
                    description: 'Update processing failed'
                }
            }
        }
    }
};
