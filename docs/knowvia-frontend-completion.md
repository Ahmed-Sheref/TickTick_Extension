# Knowvia frontend completion

> Updated saving behavior: see [Explicit content destinations](explicit-content-destinations.md). That phase supersedes historical automatic-sync and frontend-availability statements below.
Implemented and verified on 2026-10-25. Scope: the existing Manifest V3 popup and its capture/settings flows.

## Repository audit

The production frontend is `extension/popup.html`, `popup.css`, and `popup.js`, with Chrome Identity orchestration in `background.js` and page extraction in `content.js`. It uses plain JavaScript, DOM state, and the existing `chrome.storage.local` session/preferences architecture. There is no frontend framework, bundler, lint configuration, TypeScript configuration, or frontend build script.

`extension/index.html` is an explicitly labeled interactive design prototype using demo data and localStorage. It is not the manifest's popup and is not an authenticated dashboard. It remains untouched. The existing user-content read endpoint does not justify creating a new dashboard in this scope.

The audit covered the mounted routes in `index.js`, Google exchange/callback contracts, both integration link services, Notion status, content creation/post-creation services, validation, preferences, reusable pickers, and existing extension tests before implementation.

## Completed screens and behavior

- **Google onboarding:** approved Knowvia artwork, tagline, focused sign-in action, progress/cancellation/error feedback, duplicate-request prevention, and recovery from a closed authorization window.
- **Capture:** editable title, URL and content/notes; existing selection → clipboard → page capture priority; character count; manual-entry fallback for unreadable pages; existing searchable TickTick lists, list creation and tags; collapsed optional summary/tag/quiz controls; persistent save feedback. The default connected form fits 420 × 600 without scrolling. Shorter/narrower windows scroll internally while keeping actions visible.
- **Settings:** Google account/reauthentication, verified TickTick list access, Notion connection/reconnection and workspace status, weekly email and Telegram quiz preferences. A refresh action retries provider/preference reads. Failed preference writes restore the previous toggle state.
- **Interaction:** keyboard-operated tabs and pickers, labeled fields, visible focus, live status text, guarded asynchronous actions, subtle dropdown/disclosure/loading transitions and reduced-motion support. Existing dark-theme preference remains available; new users start with the approved light presentation.
- **Save correctness:** failed or unconfirmed saves retain the draft. Success requires the real response's `status: "success"` and `data.content._id`. The UI confirms saving to Knowvia and does not claim that TickTick or Notion received content without evidence.

## Integrated contracts

All paths below are relative to the existing `/api/v1` base. The original active localhost configuration and commented deployment URLs are unchanged. Authenticated calls use the existing application JWT in the Authorization header.

| Endpoint | Use and contract |
| --- | --- |
| `GET /auth/google/auth` | Existing Chrome Identity sign-in; preserves redirect URI, nonce and PKCE challenge behavior. |
| `POST /auth/google/exchange` | Existing `{ exchange_code, verifier }` exchange; preserves application session storage. |
| `POST /integrations/ticktick/link` | Existing `{ redirect_uri, client_nonce }` initiation with the current app JWT; accepts the existing exact TickTick authorization origin/path and validated callback marker. |
| `GET /content/projects` | Fetches real lists and verifies current TickTick access. No dedicated TickTick status endpoint exists. |
| `POST /content/projects` | Creates a list using `{ name }`; selects the returned `data.id`. |
| `POST /integrations/notion/link` | Starts the existing Notion flow with `{ redirect_uri, client_nonce }`; only `https://api.notion.com/v1/oauth/authorize` is accepted. |
| `GET /integrations/notion/status` | Reads `connected`, `reconnectRequired`, and `workspaceName`; unknown/failed reads are not rendered as connected. Workspace names are inserted as text. |
| `POST /content` | Existing `title`, `url`, `rawText`, nullable `projectId`, hashtag-based `user_input`, `use_summaryAi`, `use_tagsAi`, `use_quiz`, and `mergeSummaryWithContent` fields. No invented destination fields or user IDs are submitted. |
| `GET /content/tags` | Existing suggestions; users can still enter tags when suggestions are unavailable. |
| `GET /User/preferences/me` | Reads email, weekly delivery, quiz delivery and Telegram connection state. |
| `POST /User/email` | Existing `{ email, weeklyEmailEnabled }` preference write. |
| `POST /User/quiz-preferences` | Existing `{ receiveTelegramQuiz }` preference write. |

The providers return through the existing backend callback routes. Notion's final extension URI is `chrome.identity.getRedirectURL("notion")`. The frontend verifies the exact origin/path, nonce, single success marker, absence of unexpected parameters/credentials/fragments, and unchanged app session before recording presentation success. It then refreshes Notion status. The Google and TickTick security checks retain their existing semantics.

## Backend boundaries and remaining limitations

1. **Notion saving is unavailable.** The backend implements linking and status, but no destination discovery, content creation, or image upload. Notion appears only in settings with an explicit connection-only explanation.
2. **No TickTick status route or reconnect flag.** List retrieval is the available evidence of access. Explicit “account is not connected” responses show disconnected state; other failures show “Check connection” and a reconnect action. Cached state cannot produce a verified connected label.
3. **TickTick sync has no per-save acknowledgement in the create response.** Post-creation synchronization catches provider errors and updates the database separately. The UI says “Saved to Knowvia. Check TickTick to confirm its copy.” It cannot offer per-platform progress or truthful confirmed external-save success using this response.
4. **TickTick sync is automatic when server credentials exist.** There is no request field to opt out. A misleading platform toggle or selective multi-platform save control was not added.
5. **No image attachment/preview contract or separate note field.** Existing editable `rawText` retains its content/notes semantics. The popup does not add unsupported images, databases, due dates, priorities, or task management.
6. **Existing AI options are preserved.** Their services already exist. AI enrichment can fail without failing the core save; no generated-result success is asserted. No new AI feature was introduced.
7. **No integrated library/dashboard or sign-out endpoint was added.** `GET /content/user/:userId` remains unused because no functional library screen exists. Existing hidden sign-out UI stays hidden. No fake counts, records, analytics, or integrations were introduced into production.
8. **Live validation remains outstanding.** Nothing was listening on `localhost:3000` during verification. Google/TickTick/Notion authorization with real accounts, actual provider writes, and external delivery were not exercised. Notion requires the exact `/notion` Chrome Identity redirect in the existing backend `ALLOWED_EXTENSION_REDIRECT_URIS`, plus its already-documented provider configuration. No environment values or allowlists were modified.

## Files changed

Modified:

- `extension/popup.html` — branded onboarding, capture and integration/settings markup.
- `extension/popup.css` — tokens, compact layout, reusable controls, motion and responsive states.
- `extension/popup.js` — provider status, capture/save feedback, validation and asynchronous UI handling.
- `extension/background.js` — Notion initiation using the existing secure linking flow, controlled connection errors, and context-menu branding.
- `extension/manifest.json` — product name, description and action title only; existing permissions remain unchanged.
- `extension/icons/icon16.png`
- `extension/icons/icon32.png`
- `extension/icons/icon48.png`
- `extension/icons/icon128.png`
- `tests/extensionAuthUI.test.js` — Notion initiation, cancellation, failure, callback and session-preservation coverage.

Created:

- `extension/assets/knowvia-logo.png` — cropped from the user-approved brand board; no replacement logo was generated. The four icon sizes derive from the approved app-icon region on the same board.
- `scripts/verify-extension-ui.mjs` — optional Playwright browser regression harness. Test fixtures are confined to this script and are never loaded by the extension.
- `docs/knowvia-frontend-completion.md` — this audit, contract and validation record.

The pre-existing untracked `repomix-output.xml`, design prototype, and old `extension.zip` were not modified. Load the updated `extension` directory as an unpacked extension; the old ZIP does not contain these changes.

## Validation results

| Check | Result |
| --- | --- |
| Existing complete Node test suite (`node --test --test-reporter=spec`, equivalent to `npm test`) | 239 tests: 237 passed, 2 skipped, 0 failed. |
| Skipped integration tests | The existing TickTick and Notion MongoDB tests require explicitly configured disposable test databases. No production database was used. |
| Browser regression harness | 16 checks passed in headless Chrome 155, including capture, keyboard lists/tags, list creation, required fields, collapsed options, save failures/malformed responses, duplicate saves, Notion status/cancellation/reconnect, preference writes/rollback, provider outages, Google onboarding, 320px layout, dark mode and reduced motion. |
| Browser assets/console | Logo loaded successfully; no JavaScript console errors in tested scenarios. Screenshots inspected for onboarding, capture, settings, success, narrow layout and dark mode. |
| JavaScript parsing | `node --check` passed for popup, background, unchanged content script, updated auth tests and browser harness. |
| Patch hygiene | `git diff --check` passed. |
| Frontend build/lint/type-check | No such scripts/configurations exist in this plain-JavaScript extension. No build, lint or type-check success is claimed. |
| Live provider authorization | Not run; local backend unavailable, no real account authorization performed. Browser fixtures and OAuth callback tests are not a substitute for that deployment check. |

Run the browser harness with `node scripts/verify-extension-ui.mjs` where Playwright and Chrome are available. Set `CHROME_PATH` for another browser executable and `KNOWVIA_QA_DIR` for screenshot output; default output is `.tmp/knowvia-ui`. Playwright was already available in the workspace's parent environment; no dependency or lockfile was changed.

No backend routes, business services, models, database schemas, server OAuth state validation, PKCE/exchange issuance, JWT issuance, credential encryption/fingerprinting, or provider refresh logic changed. No provider tokens or new credentials are stored by the frontend. The existing application-session architecture remains intact.
