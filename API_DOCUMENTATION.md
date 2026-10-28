# Knowvia API

The maintained executable contract is [swagger/UI/swagger-ui.js](swagger/UI/swagger-ui.js), served at `/api-docs`, `/api-docs.json`, and `/api-docs/health`. Existing API documentation version **2.2.0** is retained; package version is a separate convention.

## Authentication
Google application login starts at `GET /api/v1/auth/google/auth` (also `/api/v1/auth/google`). Supply an allowlisted `redirect_uri`, a 32–128 character base64url `client_nonce`, and the hexadecimal SHA-256 `code_challenge` of the extension verifier. The state-bound callback returns a short-lived exchange code. POST `exchange_code` and the 64-character hexadecimal `verifier` to `/api/v1/auth/google/exchange` to receive the application JWT. Send it as `Authorization: Bearer …` for authenticated operations.

Authenticated `POST /api/v1/integrations/ticktick/link` and `/api/v1/integrations/notion/link` accept `redirect_uri` and `client_nonce`, returning `data.authorizationUrl`. Their callbacks validate saved state, require no bearer header, and never return provider tokens. These optional connections do not establish application identity. `/api/v1/ticktick/auth`, `/callback`, and `/auth/exchange` remain legacy compatibility routes.

## Content workflow
`POST /api/v1/content` requires title and rawText, with maximum lengths 500 and 100000. Ownership comes from JWT. Global tags are parsed from `user_input` hashtags. Omitted destinations disable both exports, regardless of connected accounts. Swagger supplies four examples: Knowvia only, TickTick only, Notion only, and both; example provider IDs must be replaced with verified selections.

Input validation and connection metadata checks precede the MongoDB transaction. External writes dispatch independently after commit. HTTP 201 confirms primary persistence, not external success. In-process dispatch is best effort and not durable. TickTick AI affects only its copy; original content is preserved. Explicit destinations disable legacy primary summary/tag AI flags. `use_quiz` retains backend compatibility; the current frontend explicitly sends false.

`GET /api/v1/content/{contentId}/sync-status` is owner-scoped and read-only. Providers independently report not_requested, queued, pending, synced, failed or uncertain; Notion can also report partial. Notion queued can be projected from selected intent before an attempt exists. Only confirmed external references are exposed, never claim values or credentials.

Retries use persisted selection, not arbitrary new options: `POST /api/v1/content/{contentId}/sync/ticktick` and `POST /api/v1/integrations/notion/sync/{contentId}` accept no body (an empty object is also accepted). They do not create another primary Content. Conditional claims prevent concurrent duplication; pending and uncertain outcomes are not blindly retried. Notion resumes only definite partial failures with safe recorded progress and matching binding. Retries are not a universal exactly-once guarantee.

## Notion destinations
GET `/api/v1/integrations/notion/destinations` supports bounded search (`query`) and cursor pagination. GET/PUT/DELETE `/destination` reads, verifies/selects, or clears a default. The default is bound to connection/selection metadata. A per-save selection does not silently change it. Selection accepts a database alias only when it resolves unambiguously to one data source; content request selection uses canonical page/data_source types. Page/block export needs write permissions and a supported schema. Arbitrary database property mapping and attachment uploads are unsupported.

## Account and delivery
The exact case-sensitive documented prefix is `/api/v1/User`: POST `/email`, POST `/quiz-preferences`, GET `/preferences/me`. All require application JWT and derive ownership from it. These supported APIs remain available in Swagger while extension Email/Telegram controls are hidden. Previously enabled scheduled delivery can remain active. Account owners can explicitly change preferences through these authenticated endpoints; a separate supported account-management UI is a follow-up, not silently implemented here.

POST `/api/v1/telegram/webhook` is server-to-server and uses `X-Telegram-Bot-Api-Secret-Token`, not application JWT.

## Limits
No attachment upload, TickTick due-date/priority override, arbitrary Notion property mapping, or durable export queue is promised. Live provider acceptance requires configured accounts. `api-docs.js` is an unmounted legacy reference, not the public contract.
