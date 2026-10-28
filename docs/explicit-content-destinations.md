# Explicit content destinations — implementation report

Implemented 2026-10-28. This phase supersedes historical automatic-sync behavior in the earlier frontend/Notion reports. Existing branding, artwork, colors and general popup layout are preserved. No dependencies, deployment configuration, production environment files or permissions were changed in this phase.

## A. Architecture summary

`POST /api/v1/content` authenticates through `requireAuth`, derives ownership from the application JWT, validates content and explicit destination settings, and checks selected connection metadata before starting the MongoDB transaction. It commits the original article and normalized provider intent together. Only after commit does `runPostCreationTasks()` dispatch the selected providers, each with its own rejection handler. Neither provider write is awaited by the primary response or by the other provider.

Omitted selections mean Knowvia-only. Connected credentials, a legacy `projectId`, and an existing Notion default cannot activate either provider. MongoDB remains mandatory for every save.

TickTick claims each content record atomically before AI/provider work. AI results are stored under its integration metadata and used only in its export. Notion retains its existing credential rotation, destination verification, atomic claim, mapping limits, append progress and uncertain-write protections. Its requested default is snapshotted on the capture; changing/reconnecting the account cannot silently redirect an unfinished export.

The popup reads `GET /content/:contentId/sync-status` after saving. Reads do not write to providers. Polling is bounded; explicit retry is available only when authoritative state permits it. Closing the popup stops its reads, not server-side synchronization.

## B. Files created

| File | Responsibility / exports | Callers |
| --- | --- | --- |
| `validators/contentDestinations.js` | `contentDestinations`, `invalidDestination`: validate and normalize explicit intent and TickTick options | `contentService`, tests |
| `services/ticktickContentService.js` | `createTickTickContentService`, default `syncContent`, `ticktickFailure`: owner-scoped atomic task export, provider AI, safe acknowledgement and retry classification | post-creation dispatcher, content retry route, tests |
| `services/contentSyncStatusService.js` | `contentSyncStatus`, `createContentSyncStatusService`, default `getStatus`: read-only owner-scoped projection | content status route, tests |
| `extension/sync-status.js` | `KnowviaSync.create`: receipt restoration, bounded GET polling, independent status rendering, safe explicit retries and confirmed Notion link | `popup.js`; loaded before it by `popup.html` |
| `tests/explicitDestinations.test.js` | 35 contract, worker, concurrency, uncertainty, AI, legacy and status tests | `npm test` |
| `docs/explicit-content-destinations.md` | Current technical report, contracts, audit and limitations | Historical reports cross-reference this file |

## C. Files modified in this phase

| File | Change and affected functions |
| --- | --- |
| `Models/Content.js` | Optional `destinations` and `integrations.ticktick` schemas; original integration IDs/indexes and Notion claim schema preserved |
| `services/contentService.js` | `createContent`, `createContentDocument`: validate intent, validate selected connection metadata, snapshot Notion selection, persist intent transactionally, preserve original `rawText`, dispatch after commit; cleanup failure does not replace the saved result |
| `services/postContentCreationService.js` | `runPostCreationTasks`: dispatch only persisted selections; independent non-blocking tasks and controlled rejection logging |
| `services/notionContentService.js` | `syncContent`, `syncIfSelected`: enforce new capture intent, bind to the saved default/connection snapshot, record pre-claim failures without overwriting active/partial/uncertain work |
| `utils/notionErrors.js` | Controlled `NOTION_NOT_REQUESTED` error |
| `utils/ticktick.js` | Keep NOTE payload; bounded requests, no redirects; retain internal HTTP status for safe rejection/uncertainty classification |
| `Routes/contentRoute.js` | Authenticated status GET and explicit TickTick retry POST, empty-body enforcement and controlled responses |
| `Controllers/contentControl.js` | `createContent`: keep 201 envelope and JWT ownership override; sanitize unexpected save errors |
| `extension/popup.html` | Independent provider toggle semantics, explicit Notion chooser, shared sync receipt; TickTick-specific option wording; restore existing Telegram command Copy control; load shared status module |
| `extension/popup.js` | `saveArticle`, destination rendering, auth expiry, draft restoration, session-change guards, scroll placement and existing control bindings use the new contract |
| `extension/notion.js` | Separate connection/default from per-capture intent; preserve search/selection/clear/OAuth flow; remove old write-based receipt checking; keyboard focus remains within modal |
| `scripts/verify-extension-ui.mjs` | Extend existing Chrome/Playwright fixtures for selections, read-only status, safe retries, drafts, session expiry and all supported controls; preserve layout matrix |
| `tests/contentSaving.test.js` | Update obsolete automatic-sync assertions; exercise committed saves, all four selections, slow independent providers, verified Notion pointer and status endpoint ownership |
| `tests/notionContent.test.js` | Dispatcher isolation tests now explicitly request providers |
| `tests/extensionAuthUI.test.js` | Reconnect listener fixture includes shared receipt and owner state; existing OAuth assertions retained |
| `swagger/UI/content.docs.js` | Document explicit dispatch, primary-save semantics, status and TickTick retry routes |
| `swagger/UI/schemas.js` | Destination/options request schema; authenticated ownership no longer requires browser `userId` |
| `docs/knowvia-frontend-completion.md`, `docs/knowvia-ui-polish.md`, `docs/notion-content-saving.md` | Historical reports link to this superseding contract |

The repository already contained uncommitted work from earlier phases. Existing OAuth routes, credentials/encryption implementations, background/content scripts, icons, logo, manifest permissions and popup CSS were inspected and retained in this phase. The file lists above describe this phase, not all differences from Git HEAD.

## D. Backend execution walkthrough

All flows start `requireAuth → contentControl.createContent → contentService.createContent → contentDestinations → createContentDocument → commitTransaction`.

1. **Knowvia-only:** neither provider is enabled; the dispatcher starts no external task. Existing credentials and defaults do not change this result.
2. **TickTick-only:** selected credential metadata is checked before commit; its list is verified against that account after commit. After commit: `runPostCreationTasks → ticktickContentService.syncContent → owner lookup → atomic claim → verify selected list → optional provider AI → createTickTickTask(kind: NOTE) → conditional acknowledgement persistence`. Notion is never dispatched.
3. **Notion-only:** the previously verified authenticated default is snapshotted before commit; live destination verification occurs after commit. After commit: `runPostCreationTasks → notionContentService.syncIfSelected → persisted-intent check → syncContent → owner/connection/default check → destination verification → atomic claim → mapNotionContent → create page / append batches → conditional acknowledgement persistence`. TickTick is never dispatched.
4. **Both:** both branches are scheduled independently after the same successful commit. A slow or failed branch cannot reject the other or the primary HTTP result. TickTick AI never edits the original text or Notion export.

## E. Frontend control-to-handler audit

Files abbreviated below: P = `extension/popup.js`; N = `extension/notion.js`; S = `extension/sync-status.js`; B = `extension/background.js`. Browser checks use the actual popup DOM in Chrome with mocked Chrome/service responses. OAuth callback/security behavior is separately tested by Node fixtures; no live provider login is claimed.

| UI control / IDs | File | Handler | Backend endpoint / local action | Verified result |
| --- | --- | --- | --- | --- |
| Google sign-in `connectGoogleBtn`, sign in again `reauthGoogleBtn` | P/B | `connectGoogle`, `startConnection`, `startOAuthFlow` | Google auth/exchange, nonce + PKCE + exchange handoff | Pending, cancellation, duplicate guard and callback regressions pass |
| Settings gear `tabSettings`, Back `tabSave` | P | `switchTab` | Local panel/focus navigation | Both panels and focus restoration pass |
| Close `closePopupBtn` | P | click binding | `window.close()` | Bound to real popup close; closing the test page releases popup timers |
| Edit `editCaptureBtn`, Done `doneEditingBtn` | P | `setCaptureEditor` | Local disclosure/focus | Editable fields and preview pass |
| Recapture `refreshPageBtn` | P | `refreshPageData` | Active tab `GET_PAGE_CONTEXT`, selection/clipboard/page fallback | Real local extraction/message implementation inspected; mocked active-tab/clipboard capture pass |
| Title `title`, URL `url`, body `rawText` | P | input listeners, `updateCapturePreview`, `saveArticle` validation | Local preview/draft, submitted to `/content` | Editing, required fields, failure retention and owner-scoped reopen pass |
| Capture options `captureOptionsBtn`, More options `advancedOptionsBtn` | P | disclosure bindings | Local `aria-expanded` / inert state | Expand/collapse and keyboard reachability pass |
| TickTick tile `connectTickTickFromSaveBtn` | P | destination toggle binding | Per-save boolean; connect flow if needed | Connection alone leaves it unselected; toggling hides/shows configuration |
| Notion tile `notionDestination` | N | toggle binding / `open` | Per-save boolean; choose/connect if needed | Independent of TickTick/default; all four combinations pass |
| Notion Choose/change `chooseNotionSaveDestinationBtn`, settings `manageNotionDestinationBtn` | N | `open` | GET `/integrations/notion/destinations` | Real choices, selected pointer, loading/error/empty states pass |
| List input `projectSearchInput`, wrapper `projectPickerBtn` | P | `handleProjectSearchInput`, keyboard handlers | Filter fetched `/content/projects` results | Search, Arrow keys, Enter, Escape and visible placement pass |
| List arrow `projectPickerToggleBtn` | P | `toggleProjectMenu` | Toggle/close other picker | Open, second-click close, outside click and Escape pass |
| Dynamic project options / hidden `projectSelect` | P | `appendProjectOption`, `setSelectedProject` | Local selected ID forwarded in `destinations.ticktick.projectId` | Correct ID reaches save request; disabled choices remain disabled |
| Add list `openCreateProjectBtn`, name `projectNameInput` | P | `showProjectCreatePanel`, keyboard handlers | Local form, Enter submit / Escape cancel | Input/confirmation behavior pass |
| Create `confirmCreateProjectBtn`, Cancel `cancelCreateProjectBtn` | P | `createTickTickProject`, `hideProjectCreatePanel` | POST `/content/projects` `{name}` | Actual returned ID becomes selected; no fake creation |
| Tag input `tagInput`, wrapper `tagsInputBox`, arrow `tagPickerToggleBtn` | P | tag input/keyboard bindings, `toggleTagSuggestions` | GET `/content/tags`, local filter/create | Suggestions/manual entry, mutually exclusive menus and keyboard pass |
| Dynamic tag choices and chip remove buttons | P | `addSelectedTag`, `removeSelectedTag` | Local normalized array → `ticktickOptions.tags` | Add/remove and actual payload pass |
| Article `articleOption`, Summary `summaryOption`, Custom `customOption` | P | `selectCaptureFormat`, radio keyboard binding | TickTick export settings / content editor | Radio state, Arrow navigation and additive summary options pass |
| AI Summary `useSummaryAi`, AI Tags `useTagsAi`, append `mergeSummaryWithContent` | P | change handlers | `ticktickOptions`; hidden without TickTick | Actual booleans reach backend; worker tests verify separate export and AI failure |
| Capture Telegram quiz `useQuiz` | P | option change handler | Existing `use_quiz` field | Existing quiz generation and ownership pipeline preserved |
| Save `saveArticleBtn`, Ctrl/Cmd+S | P | `saveArticle` | POST `/content` | Valid saved ID required; one request; all four intents; drafts retained on failure; shortcut guarded in dialogs/settings |
| Receipt Refresh `refreshSyncStatusBtn` | S | `read` | GET `/content/:id/sync-status` | Read-only states and bounded polling; no resave/provider POST |
| Retry `ticktickSyncRetry` | S | `retry('ticktick')` | POST `/content/:id/sync/ticktick`, empty body | Controlled explicit retry; worker claims prevent concurrent/uncertain duplication |
| Retry `notionSyncRetry` | S | `retry('notion')` | POST `/integrations/notion/sync/:id`, empty body | Only authoritative retryable states expose action; uncertain/pending hide it |
| Open Notion `openConfirmedNotionBtn` | S | confirmed-link click binding | `chrome.tabs.create` with allowlisted confirmed HTTPS URL | Exact provider-confirmed URL opens; unconfirmed resources never get a link |
| Account details native summary, user ID `userId`, Copy `copyUserIdBtn` | HTML/P | native `<details>`, `copyUserId` | Local disclosure/read-only ID and Clipboard API | Real owner ID copied |
| TickTick settings Connect/Reconnect `connectTickTickBtn` | P/B | `connectTickTick`, existing OAuth | POST `/integrations/ticktick/link` | Callback state, current session, credential fingerprint and list-refresh regressions pass |
| Notion settings Connect/Reconnect `connectNotionBtn` | P/B | `startConnection`, existing OAuth | POST `/integrations/notion/link`; GET status | Workspace/read/reconnect/loading/cancellation pass; no provider tokens stored |
| Refresh connections `refreshConnectionsBtn` | P | `refreshConnections` | Project, Notion status/default, account preferences GETs | Provider outages clear verified connected labels; controls recover |
| Delivery email `email`, Save `saveEmailSettingsBtn`, weekly `weeklyEmailToggle` | P | `saveEmailSettings` | POST `/User/email` | Actual fields, validation, disabled/loading and rollback pass |
| Quiz delivery `telegramQuizToggle` | P | `saveQuizPreference` | POST `/User/quiz-preferences` | Actual request fields and rollback pass |
| Open Bot `openTelegramBotBtn`, command Copy `copyTelegramCommandBtn` | P | `openTelegramBot`, `copyTelegramCommand` | Telegram deep link / Clipboard API | Real user command and bot link; existing hidden command restored |
| Theme `themeToggleBtn` | P | `toggleTheme` | Existing local theme preference | Theme storage and dark presentation pass |
| Notion search `notionSearchInput` | N | debounce / `loadDestinations`, keyboard binding | GET discovery `query` | Late responses ignored; untrusted titles rendered as text |
| Search refresh `refreshNotionDestinationsBtn`, retry `retryNotionDestinationsBtn` | N | `loadDestinations` | GET discovery | Real errors/empty states and recovery pass |
| Notion result buttons | N | row click / list keyboard handler | Local pending selection only | No account mutation until explicit confirmation |
| Load more `loadMoreNotionDestinationsBtn` | N | `loadDestinations({append:true})` | GET discovery with validated cursor | 50→65 fixture results; keyboard focus moves into new page |
| Use destination `confirmNotionDestinationBtn` | N | `mutate(false)` | PUT default with ID/type only | Verified result; duplicate writes/Escape blocked while pending; error retains current default |
| Clear default `clearNotionDestinationBtn` | N | `mutate(true)` | DELETE default, empty body | Clear does not disconnect provider or enable any destination |
| Modal close `closeNotionDialogBtn`, Cancel `cancelNotionDestinationBtn`, Escape/backdrop | N | `closeDialog`, native cancel and Tab handlers | Local cancellation / focus restore | No mutation on cancel; focus bounded; controls visible at all tested sizes |

`signOutBtn` remains explicitly hidden and disabled because no supported logout endpoint exists. The duplicate legacy reconnect button stays hidden; the visible settings button handles reconnect. The legacy hidden native project select is backing state, not a second interactive menu. The superseded Notion receipt buttons were removed; status checking uses the shared read-only panel.

## F. API changes

All endpoints require the application Bearer JWT. Provider credentials, browser ownership/workspace/account IDs and unsupported nested destination/option keys are not accepted.

```json
{
  "title": "A useful article",
  "url": "https://example.com/article",
  "rawText": "The original captured text.",
  "destinations": {
    "ticktick": { "enabled": true, "projectId": "reading-project" },
    "notion": {
      "enabled": true,
      "destinationId": "11111111-1111-1111-1111-111111111111",
      "destinationType": "page"
    }
  },
  "ticktickOptions": {
    "useAiSummary": true,
    "useAiTags": true,
    "mergeSummaryWithContent": true,
    "tags": ["reading"]
  },
  "use_quiz": false
}
```

Notion ID/type are optional when enabled; omitted means the authenticated default previously verified at selection. Supplied values must match that default. Selecting a different default is an explicit, separate PUT in the picker. Saving never changes the account-wide default. The server records its selection version, connection and workspace binding. This phase safely reuses defaults rather than accepting arbitrary per-save parents.

Disabled providers accept only `{ "enabled": false }`. Options for them are rejected. Omitted `destinations` or omitted providers default disabled; a legacy top-level `projectId` remains usable only when TickTick is explicitly enabled. `ticktickOptions` requires enabled TickTick. TickTick selection requires a real list ID returned by the connected account; the popup offers a disabled Choose a list placeholder instead of assuming an undocumented Inbox ID. Unknown keys, non-boolean flags, invalid IDs and malformed/oversized tags are rejected.

The primary response remains HTTP 201:

```json
{
  "status": "success",
  "data": {
    "content": {
      "_id": "aaaaaaaaaaaaaaaaaaaaaaaa",
      "title": "A useful article",
      "rawText": "The original captured text.",
      "destinations": { "ticktick": { "enabled": true }, "notion": { "enabled": false } },
      "integrations": { "ticktick": { "status": "queued" } }
    },
    "ai": { "summary": null, "tags": [], "quiz": null }
  }
}
```

Example shortened to relevant fields. This confirms MongoDB only. Provider-specific AI may still be pending. Legacy global summary/tag/quiz fields remain supported for consumers without the new destination contract; original `rawText` is now always preserved and no legacy request implicitly exports externally.

Read-only `GET /api/v1/content/aaaaaaaaaaaaaaaaaaaaaaaa/sync-status`:

```json
{
  "status": "success",
  "data": {
    "contentId": "aaaaaaaaaaaaaaaaaaaaaaaa",
    "ticktick": {
      "requested": true, "status": "synced", "errorCode": null,
      "retryable": false, "taskId": "confirmed-task", "aiStatus": "generated"
    },
    "notion": {
      "requested": false, "status": "not_requested", "errorCode": null,
      "retryable": false, "pageId": null, "pageUrl": null
    }
  }
}
```

States: `not_requested`, `queued`, `pending` (claimed/in progress), `synced`, `failed`, Notion `partial`, and `uncertain`. Notion needs no weakened queued claim state: explicit intent with no integration attempt projects as queued. Only confirmed resources expose IDs/URLs. TickTick `aiStatus` distinguishes not requested, pending, generated and failed.

GET returns 400 for invalid IDs, the same 404 for missing/foreign content, 401 for missing/expired application authentication, or controlled 503 for unavailable persistence. No provider write runs while reading.

Explicit retries use an empty body:

- `POST /api/v1/content/:contentId/sync/ticktick`
- Existing `POST /api/v1/integrations/notion/sync/:contentId`

Retries cannot enable an unrequested provider or change saved options. New unselected records reject them. Legacy Notion records retain their previous explicit manual-export path; automatic dispatch still requires persisted new intent. Already-synchronized writes reuse existing IDs. Pending/uncertain claims are never automatically reclaimed. Partial Notion resumes only under its existing destination, connection, content-hash and progress checks. Failed Notion binding conflicts require review, not a retry to a different default.

## G. Security review

- Google OAuth, PKCE, exchange handoff, JWT verification, exact extension redirect allowlists, provider state and client nonce verification are unchanged.
- Notion rotating refresh-token locking, AES-256-GCM/AAD encryption, credential-version CAS and workspace/identity verification remain in the original credential/API modules.
- TickTick fingerprinting and encrypted/legacy owner-scoped token resolution remain in the existing credential module. No token is accepted from or returned to the popup.
- Content ownership comes from JWT and owner-scoped queries, including retries/status. The browser's `userId` never authorizes a save.
- Claims are owner-scoped and conditional. An ambiguous write/5xx/malformed acknowledgement or post-write database failure retains a claim and cannot be retried blindly.
- New public statuses whitelist fields, hide claims/options/credentials and validate confirmed external references. Browser titles/errors are inserted as text; Notion links require approved HTTPS hosts.
- No destructive migration, new dependency, permission expansion or provider-account replacement was introduced. Optional schemas preserve legacy documents and indexes.

## H. Verification

Final results:

| Check | Result |
| --- | --- |
| `npm test` | 376 tests: **373 passed, 0 failed, 3 skipped**, no cancellations |
| `node scripts/verify-extension-ui.mjs` | **66 passed, 0 failed** in headless Chrome; no JavaScript console errors in the tested scenarios |
| `node --check` | All 21 changed JavaScript files parse successfully |
| `git diff --check` | Passed |

The three skipped tests require explicitly configured disposable MongoDB: two Notion tests use `NOTION_LINK_TEST_MONGODB_URI`; one TickTick test uses `TICKTICK_LINK_TEST_MONGODB_URI`. They were not run against production data. External calls in executed tests are mocked; developer credentials are not used.

Commands:

```text
npm test
node scripts/verify-extension-ui.mjs
node --check <each changed JavaScript file>
git diff --check
```

The browser harness exercises popup DOM/scripts in headless installed Chrome with mocked extension APIs and backend responses. It covers capture/login/OAuth controls, destination combinations, edit/draft retention and reopen, status reads/retry safety, settings, menus, modal search/pagination and console errors. Layout coverage spans 320–1280px widths, 360–800px heights, both themes, keyboard, touch and reduced motion. It is not a live backend/provider end-to-end test.

## I. Remaining limitations

1. In-process dispatch can be lost if the server exits. Persisted queued intent and claims expose unfinished work, but there is no durable queue/outbox worker or exactly-once guarantee. Uncertain or abandoned pending writes need reconciliation; no unsafe lease reclaim is provided.
2. Pre-save validation reads connection/default metadata from MongoDB. All provider HTTP checks, writes and TickTick AI export work run after commit and do not delay the primary response. Existing independently requested quiz generation and legacy global AI remain part of primary creation.
3. No live Google/TickTick/Notion OAuth, provider write, production deployment or production database test occurred. Disposable database integration tests are skipped without explicit test URIs. Mocked atomic tests do not replace live MongoDB concurrency verification.
4. Notion uses an explicitly managed verified account default with a saved snapshot, not arbitrary per-save parents or custom database properties. Changing that default cannot redirect a saved pending capture.
5. Polling stops after a bounded series of reads; Refresh status continues manually. The last receipt stores only owner/content ID. It does not persist provider tokens or fabricate provider success on reopen.
6. No primary-save idempotency key was introduced. The popup prevents concurrent saves, but a lost primary HTTP acknowledgement requires checking the library before retrying.
7. API base remains the repository's active `http://localhost:3000/api/v1`; deployed backend configuration and real account credentials must be validated in the target environment. No cosmetic redesign or deployment was performed.

## J. Final implementation status

**COMPLETE** for the implementation and automated/browser verification scope. All four destination combinations, independent post-commit dispatch, read-only authoritative status, explicit safe retry, provider-specific AI, supported popup controls and existing authentication regressions pass. The live-account, deployment and durability limits in section I remain explicit; no crash-proof background execution, live OAuth validation or exactly-once delivery is claimed.
