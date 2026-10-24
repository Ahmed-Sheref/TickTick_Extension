# Identity migration

Application identity is separate from destination integrations. Phase 1 added the `ConnectedAccount` schema, and Phase 2A added `AuthIdentity`. Google OAuth is now implemented and can create an application user without connecting TickTick. Phase 2B makes core content saving independent of TickTick. Phase 2B does not change OAuth, JWT issuance, existing identities, or token storage, and requires no database migration.

## Current identity

- Application identity is `User.userId`.
- Legacy TickTick OAuth creates that value as `USER_` + a hash prefix. Google sign-up creates a random application `userId`. Both identify application users and are stored on `Content.userId`, JWT claims, and Telegram linking.
- TickTick access and refresh tokens currently live in plaintext on `User` (`tickTickAccessToken`, `tickTickRefreshToken`, `tickTickTokenHash`).
- Existing `User.userId` values must never be regenerated.

## What Phase 1 adds

`ConnectedAccount` is an additive collection for linking external providers (`ticktick`, `notion`) to an existing application user.

- `userId` is the existing application `User.userId`.
- `providerAccountId` is an optional **stable** provider identity (workspace, bot, or provider user id).
- A provider access token is not a stable account id and must not be stored in `providerAccountId`.
- New provider tokens belong in `encryptedAccessToken` / `encryptedRefreshToken` only. Phase 3 now supplies authenticated encryption; Phase 1 itself did not write or migrate tokens.

Existing TickTick tokens remain on `User`. They are not copied, moved, or deleted in Phase 1.

## Phase 2A: Google authentication identity

Google Sign-In is implemented as an application login method. `AuthIdentity` links a login provider to an application `User.userId`.

- `provider` is currently `google` only.
- `providerSubject` is Google's stable `sub`. It is the identity key.
- An access token or email address must never be used as `providerSubject`.
- Unique `(provider, providerSubject)`: one Google account maps to one application user.
- Unique `(userId, provider)`: one Google identity per application user.

Automatic migration of legacy TickTick users is **not** required. Those rows and their `Content` stay untouched. A legacy user may later create a **new** Google-backed application account.

The existing Google OAuth flow:

- First sign-up creates a `User` with a **random** application `userId` (not derived from a Google token or email) and an `AuthIdentity` row for that `sub`.
- Repeat sign-in looks up `(provider: "google", providerSubject: sub)` and reuses that same `userId`.
- JWT continues to identify the application user by `User.userId`.

## Phase 2B: independent content persistence

MongoDB's `Content` collection is the primary content library. Previously, `contentService.createContent` rejected every save unless `User.tickTickConnected` and `User.tickTickAccessToken` were both present. This requirement now applies only when a non-empty `projectId` is supplied.

- An existing authenticated Google-only user can save valid content with `projectId` omitted, `null`, or empty. No TickTick project lookup or task creation is required.
- The application user must still exist. Content payload validation, tag normalization, AI options, summaries, quiz validation, and the `{ content, ai }` service response remain unchanged.
- Selecting a TickTick project requires the existing connection flag and access token. The service fetches projects using that token and rejects a missing project or a failed project lookup before starting the write transaction.
- Existing connected users still synchronize automatically, including when no explicit project is selected. This phase does not introduce a destination selector or an opt-out from existing automatic synchronization.
- The existing MongoDB transaction creates content and commits before post-creation tasks run. The existing transaction-capable MongoDB deployment requirement remains unchanged.
- `postContentCreationService` already skips disconnected accounts and catches synchronization errors. It remains unchanged: failed task creation or integration metadata updates cannot roll back or delete the committed content. A synchronization failure does not turn a successful library save into a failed request.
- No existing `User.userId`, content, integration fields, tokens, or records are migrated or deleted.

### Authentication and ownership

`index.js` mounts `/api/v1/content` behind the existing `requireAuth` middleware. That middleware verifies the application JWT and loads the matching `User`. The controller constructs the save payload with `userId: req.user.userId` **after** spreading the request body, so a client-supplied `userId` cannot override ownership.

Existing read authorization remains in place: `/api/v1/content/user/:userId` returns 403 for another user's id and queries only the authenticated user's content. No authentication, controller, or route changes were needed for Phase 2B.

### Regression verification

`tests/contentSaving.test.js` exercises the real save service, post-creation synchronization service, controller, parent authentication middleware, and read authorization using `node:test`. MongoDB sessions/model I/O and external HTTP calls are mocked; actual Mongoose document validation is retained. Coverage includes Google-only saves, connected-user synchronization, project/credential rejection, invalid content, transaction failures, committed-content survival after synchronization failures, and forged body ownership. The tests do not access a live database or external accounts.

Run `npm test` to execute these regressions with the existing suite.

## Phase 3: secure TickTick linking

A separate authenticated TickTick integration flow now writes encrypted credentials to `ConnectedAccount` while preserving the existing application `userId`. It uses a dedicated callback and single-use state collection; legacy TickTick login and Google OAuth remain unchanged. Content/project operations prefer new encrypted links and retain legacy credential fallback. No legacy token is migrated or deleted.

See [TickTick linking setup and API](ticktick-linking.md) for key-ring/fingerprint-secret configuration, callback registration, endpoints, manual index deployment, rotation, and tests. The corrected MVP uses an HMAC-SHA256 **credential** fingerprint instead of Focus History/provider identity checks. Users may reconnect to the same or a different TickTick destination while keeping their application identity and saved content. One atomic owner-scoped upsert replaces encrypted credentials and the fingerprint, and clears any stale TickTick `providerAccountId`. Unrelated legacy or unknown-ID records no longer block linking; no legacy tokens are migrated.

A credential fingerprint only identifies an exact issued access token. If TickTick reissues a different token for the same external account, fingerprint comparison alone cannot prove that both tokens belong to the same TickTick user. The TickTick-only partial unique fingerprint index prevents identical registered credentials from being assigned to two application users; it does not establish global external-account uniqueness across different credentials. The existing user/provider and provider-ID indexes remain in place. Deploy the new index manually after reviewed preflight before enabling the corrected linking flow.

## Remaining work: legacy migration and further integrations

The following remain separate later phases:

- Link Google identities to existing legacy users using an explicit account-linking flow; never merge users automatically by email or token hash.
- Verify and migrate legacy TickTick associations into `ConnectedAccount` using stable provider identity. New encrypted links are already read at runtime; legacy rows are not migrated automatically.
- Perform separately approved legacy-token encryption/migration and eventual removal of legacy `User` token fields. Phase 3 provides encryption and a versioned key ring but does not migrate stored data.
- Implement Notion OAuth/synchronization and image uploads separately. None are introduced here.
- Plan and approve any production migration or deployment independently. Phase 2B performs neither.

### Later destination linking sequence

1. Keep existing `User.userId` rows unchanged.
2. Do not rewrite legacy TickTick `userId` values onto Google accounts.
3. When a stable TickTick account id is available from TickTick (not from the access token), insert:

   - `userId`: existing `User.userId`
   - `provider`: `ticktick`
   - `connected`: `true`
   - `providerAccountId`: that stable id, if present

4. Only after an encryption helper exists, copy TickTick tokens into the encrypted fields. Leave `User.tickTickAccessToken`, `User.tickTickRefreshToken`, and `User.tickTickTokenHash` in place until a later cutover.
5. Link Notion the same way, always to an existing `userId`. Never create a `User` from a Notion access token.
6. If token rotation created duplicate `User` rows keyed by access-token hash, merge them using a stable TickTick account id, not the token hash.
7. After readers use `ConnectedAccount`, stop issuing new plaintext tokens, then remove legacy `User` token fields in a dedicated later phase.

## Uniqueness

Destination accounts (`ConnectedAccount`):

- One connected account per (`userId`, `provider`).
- One application user per (`provider`, `providerAccountId`) when `providerAccountId` is a string.
- Multiple rows may omit `providerAccountId`.
- TickTick: one application user per populated `credentialFingerprint`, enforced by a separate unique partial index scoped to `provider: "ticktick"`.
- TickTick credential fingerprints are not stable provider IDs. Reconnect clears the previous TickTick provider-ID claim and can select a different external account; the independent application user remains the same.

Authentication identities (`AuthIdentity`):

- One application user per (`provider`, `providerSubject`).
- One Google identity per (`userId`, `provider`).
