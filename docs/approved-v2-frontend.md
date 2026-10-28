# Approved V2 frontend implementation

Historical V2 report. The subsequent [final fidelity repair](final-ui-fidelity-repair.md) supersedes its palette, platform-management UI and native-verification limitations.

## 1. Files changed

This report covers the V2 phase only. Earlier uncommitted backend and frontend work was preserved.

Created:

- `extension/v2-layout.js`: composes the approved editor/preview columns using the existing production controls; destination rows, keyboard/drag reordering, owner-scoped visibility preferences, reset and full-settings navigation. It never simulates provider operations.
- `extension/v2.css`: V2 proportions, field sizes, preview, rows, chips, footer, responsive single-column layout, and confirmation indicators. Existing palette is deliberately retained per the user's latest instruction.
- `extension/assets/knowvia-approved-wordmark.png`: byte-for-byte copy of the supplied approved logo; no reinterpretation or image generation.
- `scripts/verify-v2-runtime.mjs`: separate optional attempt to load the actual unpacked extension in a persistent browser context. Supports `CHROME_PATH` for a browser that permits extension automation.
- `docs/approved-v2-frontend.md`: implementation and verification report.

Modified:

- `extension/popup.html`: load V2 styles/composition before the existing production scripts.
- `extension/popup.js`: always-available editable content, ordinary tags independent of TickTick selection, honest tag submission using existing `user_input`, hidden legacy mode section, and SVG confirmation icon in the save button.
- `extension/background.js`: consistent preferred OAuth window dimensions of 560 × 700 for Google, TickTick and Notion; existing clamp to originating window minus margins, centering and focus restoration retained. No redirect, nonce, PKCE, exchange or credential behavior changed.
- `extension/sync-status.js`: provider rows expose confirmed status to the visual indicator; confirmation is still based on authoritative status GET results.
- `tests/extensionAuthUI.test.js`: verify the consistent preferred dimensions for all three providers; retain narrow-window and all authentication security regressions.
- `scripts/verify-extension-ui.mjs`: adapt obsolete collapsed-editor/mode-card checks to V2 and add ordering, visibility, reopen, reset, hidden-provider exclusion and wide-layout checks. Existing provider, save, session, picker, settings, theme and keyboard regressions retained.

No files were removed. Legacy mode controls remain hidden compatibility backing elements, outside the visible/accessibility flow; they are not presented as global saving modes.

## 2. Approved-design fidelity

Implemented the approved wide editor/preview composition, supplied wordmark, rounded preview surface, ordinary content editing, source metadata, chip styling, attachment area, destination rows with ordering controls, platform management, and persistent save/status footer. Narrow surfaces deliberately become one column with preview above the editor, matching the compact reference hierarchy. Header/save remain outside the internally scrolling content.

Intentional deviations:

- The user explicitly deferred colors in the latest message. Existing blue/navy palette and dark theme are retained; Coastal Teal has not been substituted.
- Chrome action popups are limited surfaces. The default surface requests 780 × 600 and uses the compact composition; a wide rendering of the same extension page uses two columns. No new navigation, window, host permission or expanded-view launcher was added.
- Editable source URL is retained in a small disclosure. The description is the real `rawText` field with its existing 100,000-character limit, not a fictitious independent summary field or the prototype's demo limits.
- No decorative progress wizard or simulated numeric progress was copied. Provider progress remains factual, read-only backend status.
- Current backend does not implement attachments, due dates, priority, arbitrary Notion workspace switching, or Notion custom page-type properties. Unsupported options are not presented as working controls.

## 3. Current backend integration

All existing API contracts remain unchanged. Paths below are relative to `/api/v1`:

| Endpoint | Frontend use |
| --- | --- |
| Google auth/exchange | Existing Chrome Identity, nonce, PKCE and one-time exchange flow |
| POST `/integrations/ticktick/link` | Connect/reconnect current application account |
| GET/POST `/content/projects` | Real connected lists and list creation |
| POST `/integrations/notion/link` | Existing Notion OAuth flow |
| GET `/integrations/notion/status` | Verified connection and workspace status |
| GET `/integrations/notion/destinations` | Search and bounded pagination |
| GET/PUT/DELETE `/integrations/notion/destination` | Read/manage verified default without automatic per-save selection |
| GET `/content/tags` | Real tag suggestions; manual entry still works on read failure |
| POST `/content` | Explicit per-save provider selections, existing content/tag/quiz/TickTick settings |
| GET `/content/:id/sync-status` | Independent authoritative provider outcomes, never a provider write |
| POST `/content/:id/sync/ticktick` | Safe explicit retry using saved intent |
| POST `/integrations/notion/sync/:id` | Existing safe Notion retry using saved intent/claims |
| GET `/User/preferences/me` | Existing account/delivery preferences |
| POST `/User/email` | Existing email and weekly delivery preferences |
| POST `/User/quiz-preferences` | Existing Telegram quiz delivery preference |

The existing active API base and local/ngrok OAuth configuration were not changed in this phase. No `.env` edits were made.

## 4. Functional capabilities

Page/selection/clipboard capture, editable title/content/source URL, live preview, tags and their preview chips, real provider selection and configuration, list search/create, Notion discovery/search/default management, source image preview, draft preservation, expired-session handling and duplicate-save prevention remain connected to their original implementation.

Knowvia remains mandatory primary storage. Hiding a provider deselects it, cannot revoke credentials, and cannot enable a hidden export. Restoring visibility does not automatically select that provider. The save button confirms only a valid primary saved ID; separate provider checkmarks appear only for backend-confirmed `synced` states. Pending, failed, partial and uncertain results keep their distinct semantics and safe retry rules.

## 5. Settings preservation

The full existing settings page remains: Google account/details/copy ID/sign in again; TickTick and Notion connect/reconnect; real workspace/default management; delivery email; weekly email preference; Telegram connection status, bot link, command copy and quiz preference; theme; refresh/back navigation. The V2 platform visibility section extends this page rather than replacing it with the prototype's small modal.

The existing per-capture Telegram quiz toggle remains under a focused delivery-options disclosure. Existing authenticated/backend settings contracts were not renamed or changed.

## 6. TickTick AI correction

Actual `useSummaryAi`, `useTagsAi` and append-summary controls now live inside **TickTick → Task content / AI**, beneath its real project/list control. They submit the existing `ticktickOptions` fields and remain specific to that export. Notion has no AI controls. The generic main-screen advanced section and Article/Summary/Custom cards are not visible or keyboard-accessible.

## 7. Personalization

Notion then TickTick are visible by default. Rows support drag ordering and labeled keyboard-accessible up/down buttons. Order and visibility are stored in `chrome.storage.local` under an owner-scoped `knowvia_platform_layout_<userId>` key. Only provider names/booleans are stored there, never authentication material. Settings switches and reset persist immediately; a change of application owner reloads that owner's preferences. Reordering/hiding/reset are guarded during a primary save.

## 8. Verification

- `npm test`: **377 tests; 374 passed, 0 failed, 3 skipped**. The skipped tests require explicitly configured disposable MongoDB instances. No live provider writes or OAuth logins were performed by automated tests.
- `node scripts/verify-extension-ui.mjs`: **68 browser checks passed, 0 failed**. Uses installed headless Chrome, actual popup DOM/CSS/scripts, and mocked Chrome/backend responses. Checks include authentication controls, all four provider combinations, settings writes/rollback, drafts/reopen, personalization, hidden-provider exclusion, real IDs/URLs, picker boundaries, focus trapping, reduced motion, touch, themes and console errors.
- Widths tested: 320, 375, 420, 480, 768, 1280 and 1440; short 360px modal case included. Wide editor/preview column geometry is asserted. Persistent save action and no horizontal overflow are checked.
- Visual screenshots inspected for the wide V2 composition and compact popup. Screenshots are under `.tmp/knowvia-ui/`; `v2-approved-wide.png` shows the production composition with fixture content, not a replacement production demo.
- `node scripts/verify-v2-runtime.mjs`: **not verified**. Installed branded Chrome did not expose an extension service worker when launched with unpacked-extension arguments; the test timed out. This is recorded separately from DOM/browser checks. Real Chrome action-popup/OAuth-window inspection with a loaded extension remains a manual acceptance check.
- No frontend build, lint or type-check configuration exists in this plain-JavaScript extension. No such success is claimed. Changed JavaScript parsing and `git diff --check` are checked separately.

## 9. Security, compatibility and remaining gaps

Hash comparison against the start of this V2 phase confirms **no backend controllers, routes, services, models, validators, utilities or authentication middleware changed**. No database schema/index, permissions, dependency, credential, OAuth security check, API contract, Email/Telegram backend behavior or deployment setting changed. The approved logo is an exact copy.

Attachments are intentionally disabled with an explicit explanation because no upload/storage/export contract exists. Selecting temporary files and pretending they were saved would be misleading; adding backend upload support is outside this authorized frontend phase. Source thumbnails remain independent and display-only. Unsupported due-date/priority and custom Notion properties are omitted.

Implementation for current backend capabilities is complete and browser regressions pass. Full visual parity intentionally excludes the deferred palette, unsupported backend fields and demo-only effects. Native loaded-extension and live OAuth acceptance remain unverified; the report does not claim pixel-perfect certification, live provider authorization, or successful attachment upload.


## Correction: actual toolbar entry point and transparent icons

The earlier action popup still entered the narrow responsive layout, which did not reproduce the approved desktop design in the real toolbar flow. Corrected the manifest to remove `action.default_popup`; the toolbar now opens/reuses `popup.html` in a centered extension window up to 1270 × 960, bounded by its originating browser window. No permissions were added. A `sourceTab` query parameter preserves the original tab for capture/recapture using Chrome's actual tab APIs. OAuth completion refocuses/reopens that capture window. Reload the unpacked extension after this manifest change; reopening an old popup does not apply a new manifest.

Rebuilt 16/32/48/128px toolbar icons from the existing vector mark on a transparent canvas. All four corner-alpha checks returned zero. No white image background is included; Chrome's own hover/selection surface remains browser-controlled. `scripts/build-extension-icons.mjs` reproduces the assets. The wordmark is unchanged.

Files additionally changed: `extension/manifest.json`, `extension/icons/icon16.png`, `icon32.png`, `icon48.png`, `icon128.png`; toolbar/OAuth surface handling in `extension/background.js`; original-tab lookup in `extension/popup.js`. Added `tests/extensionCaptureWindow.test.js` covering the real manifest action contract, dimensions, source-tab preservation and window reuse.

Correction verification: `npm test` reports 378 tests, 375 passed, zero failed, three database-dependent skips. Existing browser regressions remain 68 passed, zero failed. The window-entry-point test uses Chrome API mocks; loaded-extension/manual visual validation remains unverified for the installed Chrome automation limitation described above.
