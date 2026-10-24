# Phase 3: secure TickTick account linking

This is a separate integration flow for an application user with a verified Google `AuthIdentity`. It never creates a `User`, changes `User.userId`, issues a JWT, or migrates legacy credentials. The Chrome extension UI is not changed or wired to this new API in this phase.

## Configuration

Configure these values in the server environment (not source control):

```dotenv
PROVIDER_TOKEN_ACTIVE_KEY_ID=k1
PROVIDER_TOKEN_KEYS={"k1":"<64 hexadecimal characters representing a cryptographically random 32-byte key>"}
TICKTICK_CREDENTIAL_FINGERPRINT_KEY=<a separate cryptographically random 32-byte key encoded as 64 hex characters>
TICKTICK_LINK_REDIRECT_URI=http://localhost:3000/api/v1/integrations/ticktick/callback
```

Provision the key using a cryptographically secure generator or secrets manager. The placeholder above is intentionally not a usable key. Do not reuse `JWT_SECRET` or a provider client secret as an encryption key. Keep keys out of logs. The fingerprint key must be independent of JWT, OAuth-client, and AES encryption secrets. Missing/malformed keys and known secret reuse fail closed with a redacted 503 before linking state is created; configuration is rechecked on callback. No `.env` values are generated or changed by this correction. Production callback URLs must use HTTPS; HTTP is accepted only for localhost development.

Register the linking callback URL with TickTick. Keep the existing legacy `TICKTICK_REDIRECT_URI` and client registration unchanged. If the TickTick application cannot register both callback URLs, register a separate OAuth client and configure both:

```dotenv
TICKTICK_LINK_CLIENT_ID=<separate linking client ID>
TICKTICK_LINK_CLIENT_SECRET=<separate linking client secret>
```

If neither linking-client variable is set, linking uses the existing `TICKTICK_CLIENT_ID` / `TICKTICK_CLIENT_SECRET` pair. Setting only one linking-client variable is rejected. This avoids mixing client IDs and secrets.

The existing `ALLOWED_EXTENSION_REDIRECT_URIS` remains an exact, comma-separated allowlist for the final extension redirect. That allowlist is different from the provider's server callback URL. The two values serve different stages of OAuth.

No `.env` changes, key generation, deployment, token migration, or production database operations are performed by this implementation. The existing `TickTickLinkState` unique state-hash and TTL indexes remain unchanged. Existing `ConnectedAccount` indexes remain in place; the new TickTick credential-fingerprint unique partial index must be deployed before enabling this corrected flow. See the manual index plan below. Tests never provision production indexes.

## API flow

1. Send `POST /api/v1/integrations/ticktick/link` with the application's JWT in the `Authorization: Bearer ...` header. Never send a JWT in the URL. The body contains only:

   ```json
   {
     "redirect_uri": "https://<extension-id>.chromiumapp.org/ticktick",
     "client_nonce": "<32-to-128-character random base64url nonce>"
   }
   ```

2. The server verifies the JWT/application user and Google identity, validates the return URI, checks encryption and fingerprint configuration, and stores a 10-minute attempt bound to that `userId`. Only a SHA-256 hash of the 256-bit random state is stored. The JSON response contains `data.authorizationUrl`. The caller opens that URL in the provider authorization window.
3. TickTick calls `GET /api/v1/integrations/ticktick/callback?code=...&state=...`. This callback is intentionally not JWT-protected: its authority is the single-use server-side state. It atomically consumes an unexpired attempt, rechecks user/identity and the return allowlist, and exchanges the code using the dedicated linking callback.
4. The server computes an HMAC-SHA256 credential fingerprint and checks whether that exact credential is already registered to another application user. It encrypts the access/optional refresh token and performs one atomic `findOneAndUpdate` upsert scoped to `{ userId, provider: "ticktick" }`. First connection creates one row; reconnect updates that same row even when the new authorization selects a different TickTick account. Fingerprint, encrypted tokens, key ID, encryption time, connection status, and clearing of any stale `providerAccountId` happen in the same write. `_id`, ownership, `createdAt`, and unrelated metadata are preserved. A missing refresh token replaces the previous refresh credential with null. Pre-write failures retain the previous connection. Unique-index violations, including concurrent claims that passed the advisory precheck, return a controlled 409 with no partial credential replacement. Concurrent same-user authorization writes use the same owner-scoped row; the last successful write wins, or a concurrent first-insert uniqueness conflict can return 409 and require a fresh authorization. A failed/denied callback consumes its single-use state, so retry starts a new authorization.
5. Success redirects only with `ticktick_link=connected` and the original `client_nonce`. The caller must compare the nonce with its pending request. No application JWT, provider token, token exchange code, or new application identity is returned in the redirect. The client keeps its existing JWT. Failure returns a controlled JSON error and never redirects to an unchecked URI.

All new linking responses use `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. Provider HTTP calls have timeouts, require the fixed HTTPS provider endpoints, and do not follow redirects. Raw provider errors and token payloads are neither logged nor returned.

## Credential identity and reconnect behavior

**A credential fingerprint only identifies an exact issued access token. If TickTick reissues a different token for the same external account, fingerprint comparison alone cannot prove that both tokens belong to the same TickTick user.**

This MVP intentionally permits an authenticated Google-backed application user to replace their connected TickTick destination. The application `User.userId`, Google identity, JWT session, and saved content ownership never change. Reconnect does not create another application user or transfer an existing connection from another user.

There are no Focus History, Pomodoro, user-profile, or other provider-identity requests in linking. The only provider call needed to complete authorization is the existing server-side OAuth code exchange. Unrelated legacy users and placeholder connections without fingerprints no longer block new users. Legacy records and plaintext legacy tokens are neither scanned nor migrated by this flow.

A fingerprint collision with another user's registered TickTick credential is rejected. Different credentials may produce different fingerprints even for the same external account, so **global TickTick account uniqueness is not guaranteed across different token values**. Older records without fingerprints and legacy plaintext tokens are outside this credential-collision check until a separately reviewed backfill; they are not silently associated or transferred.

New connections have `providerAccountId: null`. An explicit successful reconnect also clears any previous TickTick `providerAccountId` atomically with replacing credentials: that old ID cannot verify the newly selected destination. The fingerprint is never used as a provider ID, application user ID, or Google `providerSubject`. The existing provider-ID field/index remains available and unchanged for independently verified identities and other providers such as Notion. No unrelated Notion row is updated.

`credentialFingerprint` is optional and excluded from ordinary Mongoose queries with `select: false`. Linking never returns it in a response or redirect. No provider tokens, fingerprint secrets, or encryption keys are logged.

### Fingerprint-secret rotation

The fingerprint key is a separate 32-byte random secret represented as 64 hex characters in `TICKTICK_CREDENTIAL_FINGERPRINT_KEY`. Keep one consistent value on all instances. Changing it immediately changes the digest of every credential; changing it without backfilling stored fingerprints can let an identical token evade collision detection. AES key rotation does not rotate this secret and does not require fingerprint changes.

A future safe rotation requires a reviewed maintenance plan, not a rolling environment-only update:

1. Pause link/reconnect writes on every instance; content reads and existing token decryption need not change.
2. Retain the old fingerprint secret and all required AES decryption keys. Inventory current credential rows and compute candidate new-key fingerprints from their decrypted access tokens in trusted server-side memory, without logging plaintext or secrets.
3. Detect/review duplicate credentials or malformed rows. Do not merge users or transfer credentials automatically. Separately review any legacy/unfingerprinted rows; none are backfilled here.
4. Under the approved migration, replace fingerprints while preserving the unique constraint, verify counts and ownership, and switch every application instance to the same new secret before resuming link writes. Keep rollback material until validation completes.
5. If rolling rotation is later required, design versioned fingerprint aliases/dual-key checks and matching uniqueness enforcement in a separate schema migration. This phase does not implement or execute that migration.

### Manual index deployment and preflight

This correction declares one new index; it never calls `syncIndexes`, drops an index, removes records, or runs a production migration. Coordinate deployment so production automatic index builds are disabled during preflight and the index exists before the corrected link endpoints are enabled. The existing application uses Mongoose's connection/index policy; adding a schema declaration is not a substitute for this reviewed deployment procedure.

On the intended database, an operator should first inspect existing index definitions and data using read-only commands:

```javascript
db.connectedaccounts.getIndexes();

// Return counts/owners for review, without printing fingerprint values.
db.connectedaccounts.aggregate([
  { $match: { provider: "ticktick", credentialFingerprint: { $type: "string" } } },
  { $group: { _id: "$credentialFingerprint", count: { $sum: 1 }, users: { $addToSet: "$userId" } } },
  { $match: { count: { $gt: 1 } } },
  { $project: { _id: 0, count: 1, users: 1 } }
]);

// New populated fingerprints must be 64-character lowercase hex digests.
db.connectedaccounts.countDocuments({
  provider: "ticktick",
  credentialFingerprint: { $type: "string", $not: /^[a-f0-9]{64}$/ }
});
```

Any duplicate, malformed value, or incompatible existing index requires a reviewed resolution plan. Stop deployment instead of deleting users, clearing credentials, dropping indexes, or modifying rows automatically. Existing missing/null fingerprints are compatible and are not backfilled by this correction.

After approval and successful preflight, an operator can explicitly create the additive index:

```javascript
db.connectedaccounts.createIndex(
  { provider: 1, credentialFingerprint: 1 },
  {
    name: "ticktick_credential_fingerprint_unique",
    unique: true,
    partialFilterExpression: {
      provider: "ticktick",
      credentialFingerprint: { $type: "string" }
    }
  }
);
```

Verify the exact index keys, name, unique flag, and partial filter using `getIndexes()` before enabling linking. Preserve the existing unique `(userId, provider)` index and the existing partial unique `(provider, providerAccountId)` index; Notion/other provider-ID uniqueness remains unchanged. No public key/fingerprint values or raw tokens are needed for these checks. Do not rely on a read-before-write credential check without the unique database index.

## Encryption and rotation

`utils/providerTokenEncryption.js` uses AES-256-GCM with a fresh 96-bit IV and 128-bit authentication tag. The versioned envelope includes a key identifier. Authenticated additional data binds each ciphertext to its application `userId`, provider, token type (access/refresh), version, and key ID. Moving ciphertext across users, providers, or token fields fails authentication.

`encryptedAccessToken` and `encryptedRefreshToken` are persisted only after encryption. `tokenKeyId` records the access-token key identifier and `tokenEncryptedAt` records encryption time. Plaintext exists only in memory for provider requests. No newly linked token is copied into `User.tickTickAccessToken` or `User.tickTickRefreshToken`.

For future rotation, add the new random key to `PROVIDER_TOKEN_KEYS`, retain old entries, and switch `PROVIDER_TOKEN_ACTIVE_KEY_ID`. New writes use the active key while existing envelopes remain readable using their embedded key IDs. Do not remove an old key until a separate re-encryption operation has handled all ciphertext using it. This phase does not run that operation. Incorrect/missing keys and tampered ciphertext fail closed.

## Runtime compatibility

Content saving, selected-project validation, project listing/creation, and post-save synchronization now resolve encrypted credentials from `ConnectedAccount` first. If no new link exists, they fall back to the existing legacy `User` fields. An explicitly disconnected encrypted link or an unreadable active link does not fall back to legacy credentials. Inactive Phase-1 placeholder rows without encrypted credentials retain legacy fallback, since older readers ignored those rows.

Google-only MongoDB saves remain independent of TickTick. Synchronization still occurs after commit and cannot undo a successful library save. Existing legacy OAuth routes, Google OAuth routes, JWT issuance, AI behavior, and Telegram integration are unchanged. No Notion flow is implemented.

## Tests

Run `npm test`. Focused tests cover HMAC determinism/key validation, schema indexes, new links with no Focus History, same/different credential reconnects, destination replacement, unrelated legacy/placeholders, exact cross-user collisions, simultaneous claims, callback security, encryption/write failure preservation, legacy OAuth, Google authentication, and content/encrypted credential resolution. Normal tests mock database and provider HTTP I/O.

`tests/ticktickCredentialIndex.integration.test.js` is opt-in when `TICKTICK_LINK_TEST_MONGODB_URI` names an explicitly disposable MongoDB test server. It does not read `DATABASE` or `.env`, forces a randomly named isolated test database, and removes only that test database afterward. It verifies actual partial-index uniqueness, duplicate-key race behavior, preservation after a rejected atomic update, same-row reconnect, and compatibility of null fingerprints/Notion records. Without that variable, the test is reported as skipped; do not report it as passed. No MongoDB dependency is downloaded or production database used automatically.
