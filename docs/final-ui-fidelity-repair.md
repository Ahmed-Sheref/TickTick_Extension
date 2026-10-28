# Knowvia — final UI fidelity repair

Implemented and visually checked on 2026-10-28. This report supersedes the earlier V2 report's retained-blue palette, settings-navigation approach, and unavailable native-extension verification.

## What changed

The existing extension now uses the approved Coastal Teal composition: official wordmark at left, a non-interactive workflow indicator at right, editor and preview in two columns, aligned destination rows below, and a persistent status/progress/save footer. At the approved 1270 × 889 capture size, both complete provider rows fit above the footer. Narrow layouts use a single content scroll region with the Save action outside it.

The main geometry follows the supplied prototype: 1270px maximum surface, 32px wide-layout gutters, 1.03:0.97 columns separated by 26px, 176px wordmark, 45px title input, 104px description textarea, 169px source image, 17px preview corners, and 14px provider-row corners. Existing authentication and full Settings remain connected to their original handlers.

- **Palette:** shared Coastal Teal tokens, navy text, restrained borders and shadows. Primary buttons use `#087b89`; small teal text uses a slightly darker accessible token. Existing dark mode remains available with separate readable tokens.
- **Header:** the supplied wordmark remains byte-for-byte identical. Content / Destinations / Save describe the current state and are not wizard buttons.
- **TickTick:** List, Due date and Priority stay in an inline three-column configuration. List selection uses the real project picker and existing list creation endpoint. Optional AI controls remain within the TickTick row, independent of these fields.
- **Notion:** Workspace, Page / database and Page type appear inline. The current workspace is read-only, the real destination picker is directly accessible, and the supported output is identified as a standard page.
- **Platform visibility:** the approved 525px native dialog has a dimmed/blurred backdrop, provider switches, live visible count, Reset defaults and Done. Escape, backdrop dismissal and focus restoration work. The dialog opens from both capture and the complete Settings page.
- **Ordering:** drag handles and accessible arrow buttons move whole rows. Account-scoped preferences persist in real extension storage. Hiding deselects a provider for the current save without disconnecting its account.
- **Tags:** compact teal chips, removal buttons, a separate Add tag action and synchronized preview chips. Existing normalization and submission format remain unchanged.
- **Preview:** real source images retain the approved dimensions; missing, rejected or failed images reserve no large blank area. Text, title, tags and available source metadata remain visible. Source URL and per-capture delivery controls remain available below the destination section.
- **Feedback:** required-field errors appear next to their inputs. OAuth outcomes appear beside the relevant integration and on onboarding, rather than replacing capture feedback. Save failures retain edits. Provider failure/partial/uncertain states use distinct indicators; retries still follow backend permissions.
- **Footer:** labels follow the current selection: Save to Knowvia / TickTick / Notion / 2 platforms. Incomplete destination setup says Choose destinations. Progress counts only provider states confirmed as synchronized by the existing status endpoint; it is never timer-generated progress.

## Capability boundaries preserved honestly

| Reference feature | Actual support and presentation |
| --- | --- |
| Multiple uploaded images, thumbnails and removal | No upload route, attachment payload or stored attachment contract exists in this backend. Add images stays disabled with a specific explanation. No local-only attachments or fake successful uploads were introduced. |
| TickTick Due date / Priority | The destination/options validators accept neither field. Both remain visible but disabled as Unavailable, with explanatory titles and accessible descriptions. No unsupported fields are sent. |
| Notion Workspace | Displays the connected workspace from the status API; changing workspace remains an OAuth operation. |
| Notion Page / database | Uses the existing real page/data-source discovery and verified default destination. No fictional production destinations are inserted. |
| Notion Page type | The backend creates standard pages. The field is read-only; custom types/properties are not invented. |
| Description optional for URL-only capture | The actual backend requires non-empty `rawText`, including URL captures. This validation is retained and explained next to the field. |
| Prototype title/description counters | Production limits remain 500 title characters and 100,000 content characters, rather than the demo's 200/500 limits. |

These are deliberate capability differences from the reference. The upload flow, editable due date/priority and custom page types cannot be completed within the requested frontend-only/API-preserving scope.

## Existing functionality preserved

Google sign-in and session handling; TickTick and Notion connection/reconnection; Email, Telegram, weekly and quiz preferences; source extraction; clipboard/selection capture; drafts; project search and creation; Notion destination discovery and confirmation; independent provider receipts; safe explicit retry; theme settings; and account-scoped preferences.

No global advanced-options or Article / Summary / Custom mode section is exposed. The editable Summary / description field is ordinary captured content, not a global AI processing mode. AI options affect only the TickTick copy.

## Scope and files

This repair modifies:

- `extension/v2-layout.js`: composition, inline fields, visibility dialog, header/footer presentation and preferences.
- `extension/v2.css`: shared tokens, approved geometry, responsive layout, dialog and state styling.
- `extension/popup.js`: live action labels, directly accessible project controls, field validation, contextual connection feedback and tag rendering.
- `extension/notion.js`: real workspace display, inline destination state and action-label refresh.
- `extension/sync-status.js`: passes confirmed status data to the footer.
- `scripts/verify-extension-ui.mjs`: preserves and updates existing regressions for the new UX.
- `scripts/verify-fidelity-native.mjs`: actual unpacked MV3/content-script/storage/window verification with isolated API fixtures.
- `scripts/compare-fidelity-reference.mjs`: renders the approved reference and actual extension screenshot side by side.

No new framework or package dependency. No new browser permissions. No backend, schema, API contract, credential encryption, JWT, refresh-token, OAuth state or exchange-code changes in this repair. SHA-256 comparison against the V2 baseline confirmed **57 backend files unchanged**. Earlier unrelated uncommitted work remains intact.

The existing wide capture-window entry point and transparent toolbar icons from the preceding correction are preserved. Reload the unpacked extension after applying these files, and close/reopen an existing capture window so it uses the new scripts and styles.

## Verification evidence

| Layer | Result |
| --- | --- |
| Node tests | `npm test`: 378 total, **375 passed**, **0 failed**, **3 skipped**. |
| Skipped integration tests | Two Notion MongoDB integration tests and one TickTick MongoDB integration test need their dedicated test MongoDB environment variables. |
| Browser regressions | `node scripts/verify-extension-ui.mjs`: **68 passed, 0 failed**. Includes account/session, OAuth UI states, settings, provider payloads, explicit retries, keyboard behavior, theme contrast and viewport checks. Chrome APIs/backend responses are mocked in this suite. |
| Real extension runtime | `node scripts/verify-fidelity-native.mjs`: **passed** using the actual unpacked MV3 extension, service worker, content script, source tab, capture-window function and `chrome.storage`. No page/runtime errors. |
| Actual source extraction | Captured the test article's real title and content through the production content script and retained its original source tab after opening the capture window. |
| UI → API | Intercepted requests retain explicit provider intent and existing payloads. Duplicate Save/Ctrl+S during an in-flight save produces one request. |
| Response → UI | Verified retained input after failure, field validation, separate partial success, and confirmed progress moving from 1/2 to 2/2 only after a changed status response. |
| Layout | Both provider rows above the footer at 1270 × 889; no horizontal page overflow at 320, 400, 780 and 900px. Platform dialog bounds, Escape and focus return verified. |
| Preferences | Drag and arrow reorder, hide/show, reset, deselection and persistence after actual page reload verified. |
| Logo | SHA-256 matches the supplied approved PNG. |
| Static checks | Modified extension scripts pass `node --check`; `git diff --check` reports no whitespace errors. |

**Native browser verification uses test API responses, not live connected accounts.** Real Google consent, Notion/TickTick authorization, live provider writes and MongoDB persistence were not exercised end to end. No live success is claimed.

Playwright's official extension guidance recommends its Chromium build because branded Chrome removed extension side-loading flags: https://playwright.dev/docs/chrome-extensions . The isolated browser was downloaded under ignored `.tmp/browsers`; it does not change the extension's dependencies or the user's browser profile.

## Screenshots visually reviewed

Artifacts are under `.tmp/fidelity-native/`:

- `01-main.png`: both providers, inline fields, tags and source image.
- `02-ticktick-first.png`: reordered complete rows.
- `03-platform-visibility.png`: approved visibility dialog.
- `04-settings.png`, `04b-settings-bottom.png`: preserved account, integrations, Email and Telegram settings.
- `05-no-source-image.png`: compact text preview.
- `06-narrow-320.png`, `06-narrow-400.png`, `06-narrow-780.png`, `06-narrow-900.png`: responsive rendering.
- `07-validation.png`, `08-save-error.png`, `09-saving.png`: field/save feedback.
- `10-partial-success.png`, `11-confirmed-success.png`: actual UI driven by distinct fixture response states.
- `12-reference-comparison.png`: same 1270 × 889 capture surface, reference left and rendered extension right, displayed at 50%.
- `evidence.json`: measured main geometry and runtime verification scope.

The reference article and mountain image are used only by the isolated test harness for a meaningful comparison. No demo article, workspace or image was added to production. An attached-images success screenshot is intentionally absent because that capability is unsupported.

To rerun native checks, point `CHROME_PATH` at a Playwright-compatible Chromium binary. `KNOWVIA_REFERENCE_DIR` may override the local directory containing the supplied PNG/HTML references. The screenshot harness never uses production credentials or writes to live providers.
