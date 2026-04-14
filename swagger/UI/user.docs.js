/**
 * @fileoverview OpenAPI docs for /api/v1/User
 */

export const userDocs = {
  '/api/v1/User/email': {
    post: {
      tags: ['User Preferences'],
      summary: 'Save email settings',
      description: `
Creates or updates the user's email address and weekly digest preference.

### Business behavior
- If user does not exist, a new record is created
- If user exists, \`email\` and \`weeklyEmailEnabled\` are updated
- Frontend can call this from a settings screen immediately after OAuth flow
      `.trim(),
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/EmailSettingsRequest' },
            examples: {
              enableDigest: {
                summary: 'Enable weekly digest',
                value: {
                  userId: 'USER_4a9f2c1b3e7d8a0f',
                  email: 'ahmed@example.com',
                  weeklyEmailEnabled: true,
                },
              },
              disableDigest: {
                summary: 'Disable weekly digest',
                value: {
                  userId: 'USER_4a9f2c1b3e7d8a0f',
                  email: 'ahmed@example.com',
                  weeklyEmailEnabled: false,
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Email settings saved.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/EmailSettingsResponse' },
              example: {
                status: 'success',
                message: 'Email settings updated!',
              },
            },
          },
        },
        400: {
          description: 'Validation failed.',
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
                invalidEmail: {
                  value: {
                    status: 'error',
                    message: 'email must be a valid email address',
                  },
                },
                invalidWeeklyFlag: {
                  value: {
                    status: 'error',
                    message: 'weeklyEmailEnabled must be a boolean value',
                  },
                },
              },
            },
          },
        },
        500: {
          description: 'Internal server error.',
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