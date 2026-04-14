/**
 * @fileoverview OpenAPI docs for /api/v1/telegram
 */

export const telegramDocs = {
  '/api/v1/telegram/webhook': {
    post: {
      tags: ['Integrations'],
      summary: 'Telegram webhook receiver',
      description: `
Receives Telegram updates for bot interactions, callback queries, and poll answers.

### Important
- This route is intended for Telegram servers, not your frontend
- Your frontend should not call this directly
- Useful for backend debugging and integration visibility only
      `.trim(),
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/TelegramWebhookRequest' },
            examples: {
              startMessage: {
                summary: 'User sends /start',
                value: {
                  update_id: 123456789,
                  message: {
                    message_id: 10,
                    text: '/start USER_4a9f2c1b3e7d8a0f',
                  },
                },
              },
              pollAnswer: {
                summary: 'User answers a poll',
                value: {
                  update_id: 123456790,
                  poll_answer: {
                    poll_id: '547398247239847',
                    user: { id: 123456789 },
                    option_ids: [1],
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Webhook processed successfully.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SuccessMessage' },
              example: {
                status: 'success',
                message: 'Webhook processed successfully.',
              },
            },
          },
        },
        500: {
          description: 'Webhook processing failed.',
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