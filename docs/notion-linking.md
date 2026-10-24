# Phase 4: secure Notion OAuth backend

## Architecture and scope

Google remains the login provider. A public Notion connection is an external service attached to the existing application `User.userId` through one `ConnectedAccount` with `provider: "notion"`. Linking never creates a `User`, changes an `AuthIdentity`, issues an application JWT, or changes saved content ownership. Existing Google, TickTick, Telegram, AI, and extension flows are unchanged.

This phase provides linking, reconnect, safe status, and an internal credential refresh service. It does not discover destinations, select pages/databases, save content to Notion, synchronize content, upload files, or change the extension UI.

## Official protocol references

Implementation was checked against the official [public connections guide](https://developers.notion.com/guides/get-started/public-connections), [authorization guide](https://developers.notion.com/guides/get-started/authorization), [create-token reference](https://developers.notion.com/reference/create-a-token), and [refresh-token reference](https://developers.notion.com/reference/refresh-a-token).

The documented version is `2026-03-11`. Authorization uses `client_id`, `response_type=code`, `owner=user`, `redirect_uri`, and `state`. Cancellation returns an OAuth `error`, for example `access_denied`. The authorization guide specifies `grant_type=refresh_token` and `refresh_token` for refresh requests; the refresh reference's default code example displays the authorization-code branch instead. The implementation follows the guide's explicit refresh instructions.

## Files and responsibilities

| File | Responsibility |
| --- | --- |
| `Models/NotionLinkState.js` | Separate, expiring, single-use Notion link attempts |
| `Routes/notionLinkRoute.js` | Authenticated initiation/status, public callback, controlled errors and response headers |
| `services/notionLinkService.js` | Google identity policy, redirect checks, state consumption, verified identity, atomic connect/reconnect |
| `utils/notionLinkOAuth.js` | Configuration, authorization URL, bounded token exchange/refresh and response validation |
| `services/notionCredentials.js` | Internal owner-scoped refresh with a database claim and conditional persistence |
| `Models/ConnectedAccount.js` | Existing connection schema plus hidden optional `notionRefreshLock` |
| `index.js` | Additive router mount at `/api/v1/integrations/notion` |
| `tests/notionLinking.test.js` | Mocked OAuth, authentication, encryption, linking and refresh tests |
| `tests/notionLinking.integration.test.js` | Optional disposable MongoDB verification of indexes and atomic operations |

Existing `requireAuth`, `User`, `AuthIdentity`, and `providerTokenEncryption.js` are reused without changing their behavior. There is no generic provider refactor and no change to TickTick fingerprinting.

## Configuration and Developer Portal

Configure these values through the server's environment or secret manager. No real `.env` is changed by this implementation.

```dotenv
NOTION_CLIENT_ID=<public-connection-client-id>
NOTION_CLIENT_SECRET=<public-connection-client-secret>
NOTION_REDIRECT_URI=https://backend.example/api/v1/integrations/notion/callback
NOTION_API_VERSION=2026-03-11
```

Reuse the existing encryption configuration and append the Notion extension callback to the existing comma-separated exact allowlist:

```dotenv
PROVIDER_TOKEN_ACTIVE_KEY_ID=<existing-active-key-id>
PROVIDER_TOKEN_KEYS=<existing-JSON-key-map>
ALLOWED_EXTENSION_REDIRECT_URIS=https://EXTENSION_ID.chromiumapp.org/ticktick,https://EXTENSION_ID.chromiumapp.org/notion
```

Keep all existing allowlist entries required by other integrations. Encryption keys must remain 32-byte values encoded as 64 hexadecimal characters, using the existing helper's key map format. Do not rotate keys, replace that map, or reuse a client secret/JWT secret as an encryption key to enable Notion.

1. Create a **public connection** in the Notion Developer Portal, with installation scope appropriate to the multi-user product (normally Any workspace). Configure only the capabilities the product needs, with the required public connection information/review settings.
2. Register the exact `NOTION_REDIRECT_URI` under the public connection's OAuth redirect URIs. This is the backend callback, not the extension URI. Use the portal's OAuth client ID and secret, not an internal workspace integration token.
3. Configure the server values above and the final extension allowlist. The backend requires HTTPS for the server callback, including development; use an HTTPS development backend/tunnel registered with Notion.
4. Ensure the database indexes below exist before enabling linking. Do not drop existing indexes or automatically transfer existing identities.

Missing/empty credentials, malformed callback URLs, and any version other than the explicitly supported `2026-03-11` fail closed. Client IDs cannot contain whitespace or colons. Backend callback URLs cannot contain credentials, query strings, or fragments. A future API version requires an explicit compatibility review and code update.

## OAuth sequence

1. The extension sends its existing App JWT, final callback URI, and random client nonce to `/link`. `requireAuth` resolves the existing application user. The service requires a Google `AuthIdentity` for that user; client-supplied user/account identifiers are ignored.
2. The service validates the exact extension allowlist and HTTPS `*.chromiumapp.org` host, checks encryption/OAuth configuration, generates 32 random bytes as base64url state, and stores only its SHA-256 hash with the authenticated owner, nonce, both callback URIs, and a ten-minute expiration.
3. The response contains the Notion authorization URL. The caller opens it in the authorization window. Notion manages its own workspace/page permission prompt; this backend does not implement destination discovery or selection.
4. Notion calls the backend callback with `code` and `state`, or an OAuth error. There is no App JWT on this callback. Its authority is the previously authenticated server record.
5. The backend atomically consumes the unexpired state, validates the callback shape, rechecks the extension allowlist, user existence and Google identity, then exchanges the code with Notion using the exact stored backend callback URI. Changed callback configuration requires starting again.
6. The backend validates the provider response, establishes the workspace/user composite identity, checks conflicts, encrypts both tokens, and performs a single owner-scoped connection upsert. Unique indexes decide any concurrent conflict.
7. The backend redirects only to the validated extension URI with `notion_link=connected` and the original `client_nonce`. The future extension caller must verify that nonce against its pending request and continue using its existing App JWT.

State is consumed before any token request, including cancelled, failed, or malformed callbacks. A retry always starts a new authorization. An expired state is rejected independently of when MongoDB's TTL worker deletes it. Missing, array-valued, malformed, unknown, expired and replayed states cannot authorize an exchange.

## Endpoint contracts

### Start linking

```http
POST /api/v1/integrations/notion/link
Authorization: Bearer APP_JWT
Content-Type: application/json
```

```json
{
  "redirect_uri": "https://EXTENSION_ID.chromiumapp.org/notion",
  "client_nonce": "<32-to-128-character-random-base64url-nonce>"
}
```

```json
{
  "status": "success",
  "data": { "authorizationUrl": "https://api.notion.com/v1/oauth/authorize?..." }
}
```

Only explicitly configured extension callback URIs are accepted. HTTPS is required; credentials, ports, query strings, fragments and arbitrary domains are rejected even if mistakenly included in the allowlist. The nonce must use `A-Z`, `a-z`, `0-9`, `_`, or `-` and be 32–128 characters long. Generate it using cryptographic randomness.

### Provider callback

```http
GET /api/v1/integrations/notion/callback?code=AUTHORIZATION_CODE&state=STATE
GET /api/v1/integrations/notion/callback?error=access_denied&state=STATE
```

Success returns HTTP 302 to:

```text
https://EXTENSION_ID.chromiumapp.org/notion?notion_link=connected&client_nonce=ORIGINAL_NONCE
```

Errors return JSON with `status: "error"` and a controlled `message`, never a failure redirect or raw provider body.

| Status | Meaning |
| --- | --- |
| 400 | Invalid parameters/state, expired/replayed state, cancelled or malformed authorization |
| 401 | Missing/invalid App JWT on authenticated routes, or deleted callback owner |
| 403 | Google identity is missing |
| 409 | Proven external identity conflict or duplicate-key race; no credentials transferred |
| 502 | Provider exchange/response validation failed |
| 503 | Missing/malformed Notion or encryption configuration |
| 500 | Controlled unexpected persistence/service failure |

### Read connection status

```http
GET /api/v1/integrations/notion/status
Authorization: Bearer APP_JWT
```

```json
{
  "status": "success",
  "data": {
    "connected": true,
    "reconnectRequired": false,
    "workspaceName": "Example workspace",
    "workspaceIcon": null
  }
}
```

Status requires the owning authenticated Google-backed user. A missing connection returns false booleans and null workspace metadata. It does not return IDs, tokens, ciphertext, lock values, email, owner payloads, or secrets. Workspace names/icons are provider-supplied display metadata; future UIs must render names as text and apply their image URL policy.

All router responses set `Cache-Control: no-store`, `Pragma: no-cache` and `Referrer-Policy: no-referrer`.

## MongoDB schema and indexes

`NotionLinkState` uses its own `notionlinkstates` collection:

| Field | Meaning |
| --- | --- |
| `stateHash` | SHA-256 of the 256-bit random state; unique |
| `userId` | Application owner established by `requireAuth` |
| `extensionRedirectUri` | Validated final extension callback |
| `clientNonce` | Original extension-generated nonce |
| `providerRedirectUri` | Exact backend callback used in authorization |
| `expiresAt` | Creation time plus ten minutes |
| `createdAt`, `updatedAt` | Mongoose timestamps |

Indexes are unique `{ stateHash: 1 }` and TTL `{ expiresAt: 1 }` with `expireAfterSeconds: 0`. Consumption is one `findOneAndDelete({ stateHash, expiresAt: { $gt: now } })`.

The existing `ConnectedAccount` already supports `provider: "notion"`. This patch adds only optional `notionRefreshLock` (String, default null, `select: false`) to that schema. It holds a random operation claim, not a token. Existing rows without the field match the refresh filter's null value. No existing data is migrated.

All existing indexes are preserved unchanged:

| Index | Policy |
| --- | --- |
| Unique `{ userId: 1, provider: 1 }` | At most one Notion connection per application user |
| Partial unique `{ provider: 1, providerAccountId: 1 }` for string IDs | One application owner per verified workspace/user composite |
| Existing TickTick credential fingerprint partial unique index | Unchanged, applies only to TickTick |

Before rollout, inspect existing indexes and any preexisting Notion records. Legacy Notion IDs in a different format require an explicitly reviewed policy/migration; they are not silently rewritten or assumed to prove the same identity. Confirm the two existing connection uniqueness constraints and deploy the new state indexes through the existing index deployment process. This code declares indexes but never calls `syncIndexes`, drops indexes, deletes accounts, or runs production migrations. With automatic index building enabled, Mongoose may build the newly declared state indexes under the application's existing policy; coordinate that at deployment.

## Verified identity and workspace behavior

The constrained policy in this phase accepts only a public user-owned authorization with verified UUID `workspace_id`, `owner.type === "user"`, UUID `owner.user.id`, and UUID `bot_id`. The canonical external key is:

```text
workspace:<lowercase-workspace-UUID>:user:<lowercase-authorizing-user-UUID>
```

It is stored in `providerAccountId`. Access tokens, workspace names, email, and bot IDs are not ownership keys. UUID normalization avoids case variants bypassing uniqueness. Two different authorizing users in the same workspace have different identities and can connect independently. The same verified workspace/user pair cannot be owned by two application users while the first connection row retains that identity, including if disconnected. Reconnecting the first owner to a different identity releases the old identity through the same atomic write.

Workspace-owned responses, missing user IDs, malformed IDs and token responses without a usable refresh credential are deliberately rejected. Nothing is inferred from token hashes. The bot ID identifies the authorization and is stored as metadata; the implementation does not assume it survives reauthorization unchanged. Only selected safe metadata is stored: workspace ID/name/icon, authorizing user ID, bot ID, and reconnect status. Full owner payloads and email are discarded.

## Token exchange and encryption

Code exchange posts JSON to the fixed HTTPS endpoint `https://api.notion.com/v1/oauth/token` using HTTP Basic authentication from the server client ID/secret, `grant_type: "authorization_code"`, `code`, and the stored `redirect_uri`. Because this implementation always supplies `redirect_uri` in the authorization URL, it also supplies it in the code exchange, as required by Notion. All token requests set `Content-Type: application/json`, `Accept: application/json`, and `Notion-Version: 2026-03-11`.

Requests use a ten-second timeout and prohibit HTTP redirects. Responses must be HTTP 200 JSON; the decoded response stream is capped at 64 KiB. Required access/refresh tokens must be nonempty strings at most 16,384 characters and `token_type` must be `bearer`. Metadata shapes and identity are validated before persistence. Transport exceptions, provider response bodies, and credentials are never logged or returned by these modules. There is no configurable provider host and no new network dependency.

The unchanged `providerTokenEncryption.js` encrypts each token using AES-256-GCM and authenticated context:

```javascript
{ userId: applicationUserId, provider: "notion", tokenType: "access" }
{ userId: applicationUserId, provider: "notion", tokenType: "refresh" }
```

The existing versioned envelopes retain their key IDs, fresh IVs, authentication tags and authenticated owner/provider/token-type binding. Access and refresh ciphertext, `tokenKeyId`, and `tokenEncryptedAt` are persisted together. Existing encrypted fields remain excluded from ordinary Mongoose queries. Tokens are never copied into legacy TickTick `User` fields or sent to the extension. No encryption algorithm or production key is changed.

## First connect and reconnect

A single `findOneAndUpdate` upsert scoped to `{ userId, provider: "notion" }` sets both ciphertexts, verified identity, metadata, key/time, connection status and cleared refresh claim together. First authorization creates one account; reconnect replaces the same row while retaining `_id`, `createdAt` and application ownership. The user may select a different Notion workspace or authorizing user on reconnect. Metadata is replaced with the new destination so future destination selections cannot accidentally carry over from a different workspace.

The advisory identity lookup makes known conflicts clear; database unique indexes arbitrate races. A duplicate-key error becomes a controlled 409. No other user's row is updated or transferred. Concurrent same-user reconnects use the same row: the last successful write wins. Concurrent first inserts can return 409 and require starting again. Failures before persistence preserve the previous row; a rejected atomic MongoDB write cannot partially replace credentials.

Notion exchange and MongoDB persistence are separate operations, not a distributed transaction. If authorization succeeds externally but persistence fails, the backend returns a controlled error and the user must authorize again. It does not attempt to revoke the newly obtained token automatically, since revocation could affect another authorization and cannot undo provider-side effects. An ambiguous database acknowledgement may mean the complete write committed; it never implies a partial pair write.

## Refresh lifecycle and concurrency

There is no public refresh endpoint or scheduler. Trusted backend code can call the internal service using the authenticated owner's application ID:

```javascript
import notionCredentials from "../services/notionCredentials.js";

// Only inside an authenticated handler or an authorized server operation:
await notionCredentials.refreshForUser({ userId: req.user.userId });
```

The service verifies the user and Google identity, checks configuration, and atomically claims a connected Notion row with `notionRefreshLock: null`. The claim is random, stored in MongoDB and works across application instances. Only that owner's refresh ciphertext is selected and decrypted. A missing/disconnected/already claimed account returns `NOTION_REFRESH_UNAVAILABLE`; invalid owner context returns `GOOGLE_IDENTITY_REQUIRED`. The service returns safe `{ connected: true }`, never plaintext credentials. It accepts no client-provided account ID.

Refresh sends JSON `{ grant_type: "refresh_token", refresh_token: ... }` with the same fixed endpoint, Basic authentication, version header, timeout, redirect prohibition and response cap. Both newly returned tokens are required and encrypted together. A response without identity retains the identity established during linking. If any identity fields are included, a full valid identity must be present and match the saved workspace/user pair. A changed bot ID is acceptable for that same identity and updates metadata; any supplied workspace display metadata is also updated in the same write. No expiration timestamps are invented.

Final persistence matches `{ userId, provider: "notion", notionRefreshLock: operationClaim }`. A successful write replaces both tokens and encryption metadata and clears the claim. A reconnect clears that claim while writing the new destination, so an older refresh response cannot overwrite or disconnect the reconnect. Such a response returns `NOTION_REFRESH_SUPERSEDED`.

Revoked, invalid, malformed, undecryptable, or otherwise uncertain refresh outcomes return controlled `NOTION_RECONNECT_REQUIRED`. The service conditionally marks the claimed connection disconnected with `metadata.reconnectRequired: true`, preserving the old ciphertext pair and retaining the claim. It does not retry a potentially consumed refresh credential. Reauthorization is the recovery path.

If provider refresh succeeds but persistence fails, the old refresh token may already be invalid. If MongoDB is available, the service marks reconnect required; if that write also fails, the durable claim still prevents further refresh attempts. A process crash after claiming likewise leaves a claim that requires reconnect. Claims deliberately do not expire automatically, because retrying an uncertain rotated token is unsafe. Status reflects the last persisted connection/reconnect flags, so it can temporarily report connected after a crash or database outage even though a claim blocks refresh. This phase has no automated reconciliation. A MongoDB acknowledgement can also be ambiguous after commit: a later read/reconnect resolves the state. The failed caller receives a controlled error without exposing the returned token pair.

## Security and operations

- Protect the callback and all other endpoints with the application's HTTPS deployment. State, authorization codes, nonces and authorization URLs should be redacted from reverse-proxy/APM query/body logs. The existing application request logger logs paths, not queries; no logger behavior is changed here.
- Keep App JWTs in Authorization headers. Do not place them, provider credentials, internal user IDs, or client secrets in final redirect URLs.
- Keep all encryption keys needed to decrypt existing envelopes. Notion reuses the existing key configuration without introducing a new secret or running rotation.
- The callback is intentionally public but fails closed without a valid, unexpired, atomically consumed attempt. Recheck the allowlist at completion to invalidate outstanding links when an entry is removed.
- Keep the unique indexes enabled. A preflight identity lookup alone cannot enforce ownership under concurrency.
- No production data, configuration files, content, user identities or existing provider credentials are migrated by this phase.

## Testing

Routine tests mock provider and database operations; they do not use live Notion credentials or read `.env`:

```powershell
node --test tests/notionLinking.test.js tests/notionLinking.integration.test.js
npm test
```

Tests cover JWT authentication and owner binding, Google identity requirements, exact redirects and nonces, hashed random state and expiration/replay/cancellation, provider request shape and response bounds, verified identity conflicts, shared workspaces, first link/reconnect, duplicate-key races, encryption/persistence preservation, safe callbacks/status, token rotation, distributed refresh claims, stale response rejection and reconnect recovery. Existing Google/JWT, TickTick connect/reconnect, encryption and ownership tests remain part of `npm test`.

The optional integration test runs only when `NOTION_LINK_TEST_MONGODB_URI` explicitly points to a **disposable MongoDB test server**. It never uses `DATABASE`, never loads `.env`, forces a random `notion_link_test_<random>` database name, creates indexes there, and drops only that random database afterward. Do not configure it with production credentials or a production server. Without this explicit configuration it is **skipped**, not passed. It verifies actual unique-index arbitration, preservation after rejected writes, owner uniqueness, independent users in a shared workspace, reconnect row identity, atomic refresh claims, stale refresh rejection and single-use/expired state behavior. The preexisting TickTick MongoDB test has its own independent opt-in variable.

## Known limitations and next phase

- Only one Notion connection per application user; only verified user-owned UUID identity responses with usable token pairs are supported. Global identity protection requires canonical IDs and the existing unique index; preexisting differently formatted Notion rows require separate review.
- No automatic recovery for abandoned refresh claims, ambiguous provider rotation, or database write outcomes; reconnect is deliberate recovery. Provider operations and MongoDB commits are not transactional together.
- No live Notion authorization is performed by unit tests. Register a public client and perform a manual authorization/reconnect against a development backend before deployment. Actual MongoDB tests need the explicit disposable server configuration.
- Future work: extension initiation/status UI with nonce verification, Notion page/database/data-source discovery and destination selection, schema mapping and content saving. Each must resolve credentials by the authenticated owning application user and bind selected resources to the verified connection. None is implemented here.
