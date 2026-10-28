# Content-saving architecture cleanup

## A. Architecture audit

The working repository, not historical repomix snapshots, was the source of truth. Before implementation, the focused baseline passed 163 tests. The execution trace included popup.saveArticle, requireAuth, contentControl.createContent, contentService, status GET and both retry routes. Controller ownership is derived from JWT and overrides request ownership.

| Finding | Evidence | Category | Action |
|---|---|---|---|
| TickTick bootstrap differs from Notion | contentService.createContent; Content schema; worker claim filters; contentSyncStatus | Existing representation compatibility | Retained bootstrap shape behind pure buildInitialIntegrationStates. No enum or claim changes. |
| Shared core constructs status/project/AI state | contentService.createContent | Provider coupling | Moved construction to contentIntegrationState.js. Core persists its result. |
| Selected connection prerequisites | User projection; notionCredentials; selectedNotionDestination; ticktickCredentials | Required pre-commit policy | Named private requireContentOwner and verifySelectedDestinations boundaries; lookup/order/errors retained. |
| Unused dispatcher inputs | runPostCreationTasks destructures only content; all call sites searched | Dead arguments | Main caller now passes only committed content. Workers still receive only its owner/content ID. |
| finalRawText | Private applyAiToContent returns it only to ignored dispatcher field; no export or response consumer | Dead derived value | Removed variable and unused summary merge calculation; original rawText, AI response and merge preference retained. |
| Weekly/quiz mapping | buildContentOptions; weeklyEmailService query; weeklyQuizService query | Active legacy coupling | Preserved includeInWeeklyEmail from summary and includeInTelegramQuiz from quiz. Explicit destinations continue suppressing primary summary/tag AI only. |
| tickTickId/tickTickProjectId | Content schema; TickTick worker; status projection; Swagger response schemas; tests | Compatibility | Retained schema, default fields, fallback reads and atomic dual-write acknowledgement. Added boundary comments. |

### Intent, execution and public status

Saved destinations record requested providers and their normalized options/binding. Persisted worker state records attempt progress. Public projection safely reports waiting intent even without a Notion attempt. Strategy A would simplify bootstrap but remove fields from the returned Content representation; Strategy B would alter Notion's enum/claims. Neither is necessary here. The permitted minimal boundary refactor preserves the current representations and response shape.

TickTick persists queued before dispatch, then pending under a claim, then synced/failed/uncertain. Notion starts with no attempt subdocument, projects queued from saved intent, and persists pending/synced/failed/partial/uncertain after execution begins. Provider-specific AI versus partial block continuation remain separate. No generic state machine was introduced.

### Legacy field consumer audit

- Models/Content.js: persisted compatibility fields/defaults retained alongside modern integrations.ticktick.
- services/ticktickContentService.js: modern taskId/status is primary; legacy tickTickId is read only when modern status is absent. Confirmed success atomically writes modern taskId and both legacy aliases under the existing owner/claim filter.
- services/contentSyncStatusService.js: old records without destinations retain inference from modern state/legacy ID; safe ID validation still prevents malformed acknowledgements becoming public success.
- Controllers/contentControl.js: matching TickTick writes after active controller definitions are commented historical code, not runtime consumers.
- Routes/controllers: active save delegates to service; sync status/retries delegate to owner-scoped services. No additional legacy ID writers found.
- swagger/UI/schemas.js and content.docs.js: response documentation consumes legacy fields; retained without edits this phase.
- Tests: contentSaving/explicitDestinations protect dual writes and old IDs; notionContent and its integration fixture protect concurrent/sibling TickTick metadata.
- Weekly services query delivery eligibility flags and do not reference these TickTick IDs.

No historical data, persisted field name, index, collection, account or provider schema was changed.

## B. Modified files

| File | Change and preserved behavior | Verification |
|---|---|---|
| services/contentIntegrationState.js (new) | Pure deterministic bootstrap helper. Same TickTick fields; no Notion queued persistence. No I/O or validation duplication. | Four combinations, no mutation, AI option combinations, status projection tests. |
| services/contentService.js | Named owner/readiness boundaries, helper initialization, content-only dispatch, removed dead merged-text result. Same validation order, prerequisite errors, transaction/commit order, AI fields and original text. | Primary saving/HTTP/legacy AI/transaction suites. |
| services/postContentCreationService.js | Expanded injectable dispatcher and separate sanitized error handlers. Same independent microtask scheduling, no awaiting provider writes. | All selection combinations, slow providers and independent rejection/log-safety tests. |
| services/contentSyncStatusService.js | Comment explains intent/legacy projection boundary. Runtime unchanged. | Status, ownership and leakage tests. |
| services/ticktickContentService.js | Comments identify compatibility read/atomic aliases. Runtime unchanged. | Claims, retries, provider AI and alias tests. |
| tests/contentSaving.test.js | Added characterization assertions for legacy delivery mapping, merge preference and exact top-level save payload shape. | Focused and full suite. |
| tests/explicitDestinations.test.js | Added five bootstrap/projection/purity cases. | Focused and full suite. |
| docs/content-saving-architecture-cleanup.md | Audit, decisions and verification report. | Compared against repository searches and executed tests. |

Frontend, auth, OAuth, token encryption, credentials/refresh services, delivery services, validators, routes, controllers, deployment and environment configuration were not edited in this phase. Prior uncommitted workspace work remains intact. No new dependencies or migrations.

## C. Before/after execution flow

Before: the service mixed primary orchestration, TickTick bootstrap construction, readiness details and an unused merged-text result, then passed excess dispatcher arguments.

After (actual implementation):

```text
POST /content + JWT ownership
    -> validate primary input
    -> require existing owner (same query/order)
    -> normalize explicit destination intent
    -> verify selected prerequisites and bind Notion selection
    -> parse shared data and preserve legacy AI/option behavior
    -> create Content with original rawText, saved intent and pure bootstrap result
    -> commit MongoDB transaction
    -> runPostCreationTasks({ content })
        -> independent TickTick worker microtask
        -> independent Notion worker microtask
    -> unchanged primary { content, ai } response

GET sync-status -> owner-scoped read -> safe public projection (no writes)
Explicit retry -> owner + persisted intent -> unchanged provider claims/state rules
```

Selected disconnected prerequisites still fail before commit. Once committed, provider failure cannot undo primary storage. A primary request does not await external writes. Existing historical records retain their interpretation. No reliability stronger than best-effort in-process dispatch is claimed.

## D. Test results

- Baseline focused suites: 163 passed, zero failures.
- Final focused suites (contentSaving, explicitDestinations, notionContent, contentValidator): **168 passed, zero failures, zero skipped**.
- Full npm test: **387 total, 384 passed, zero failed, 3 skipped**. Existing disposable MongoDB integration tests remain opt-in; no production database was used.
- node --check passed for every modified/new JavaScript file.
- git diff --check passed; Git may emit pre-existing LF/CRLF normalization notices.
- Fixture providers are not live TickTick/Notion acceptance tests. No browser/UI checks were needed for this backend-only phase.

Existing suites cover all four saves, omitted/unselected providers, invalid input, missing owner/connection, rollback, post-commit failures, independence, slow providers, original text, claims/retries, partial continuation, binding conflicts, owner scoping, public states and safe projections. Added characterization checks explicitly protect the changed bootstrap boundary and retained legacy options. No claim of a new disposable-database concurrency run is made.

## E. Deferred changes

- Migration and consumer retirement of legacy TickTick aliases before removing dual writes.
- Removing persisted TickTick bootstrap in favor of entirely intent-derived queued states would require explicit response-compatibility review.
- Changing pre-commit disconnected-provider failure policy is a separate product/API decision.
- Durable outbox/queue and reconciliation of uncertain external writes remain separate work.
- Decoupling summary/quiz generation from delivery eligibility requires a coordinated legacy-client/delivery contract decision.
- Legacy credential fallback remains inside ticktickCredentials and its explicitly documented owner projection; no account migration/reconnect requirement was added.
