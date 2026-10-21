# Identity migration

This document describes how application identity will separate from destination integrations. Phase 1 added `ConnectedAccount`. Phase 2A adds `AuthIdentity` for Google Sign-In. Neither phase migrates data, changes OAuth routes, or changes JWT issuance.

## Current identity

- Application identity is `User.userId`.
- That value is created during TickTick OAuth (`USER_` + a hash prefix) and is stored on `Content.userId`, JWT claims, and Telegram linking.
- TickTick access and refresh tokens currently live in plaintext on `User` (`tickTickAccessToken`, `tickTickRefreshToken`, `tickTickTokenHash`).
- Existing `User.userId` values must never be regenerated.

## What Phase 1 adds

`ConnectedAccount` is an additive collection for linking external providers (`ticktick`, `notion`) to an existing application user.

- `userId` is the existing application `User.userId`.
- `providerAccountId` is an optional **stable** provider identity (workspace, bot, or provider user id).
- A provider access token is not a stable account id and must not be stored in `providerAccountId`.
- New provider tokens belong in `encryptedAccessToken` / `encryptedRefreshToken` only. Encryption helpers are not implemented in this phase.

Existing TickTick tokens remain on `User`. They are not copied, moved, or deleted in Phase 1.

## Phase 2A: Google authentication identity

Google Sign-In is the planned primary login method. `AuthIdentity` links a login provider to an existing application `User.userId`.

- `provider` is currently `google` only.
- `providerSubject` is Google's stable `sub`. It is the identity key.
- An access token or email address must never be used as `providerSubject`.
- Unique `(provider, providerSubject)`: one Google account maps to one application user.
- Unique `(userId, provider)`: one Google identity per application user.

Automatic migration of legacy TickTick users is **not** required. Those rows and their `Content` stay untouched. A legacy user may later create a **new** Google-backed application account.

When Google OAuth is implemented (not this phase):

- First sign-up creates a `User` with a **random** application `userId` (not derived from a Google token or email) and an `AuthIdentity` row for that `sub`.
- Repeat sign-in looks up `(provider: "google", providerSubject: sub)` and reuses that same `userId`.
- JWT continues to identify the application user by `User.userId`.

## Later destination linking (not this phase)

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

Authentication identities (`AuthIdentity`):

- One application user per (`provider`, `providerSubject`).
- One Google identity per (`userId`, `provider`).
