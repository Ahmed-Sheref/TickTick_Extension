# Save flow and provider status audit

Local implementation and verification: 2026-10-29. No production content, provider page, token, or image record was modified during the audit. Existing unrelated working-tree edits were preserved.

## 1. Confirmed causes and repairs

### Readable capture

`extension/content.js` read `article`, `main`, or `body` through `textContent`. This includes script/style source and ignores rendered visibility. The popup also automatically preferred clipboard text without distinguishing a full HTML document from a normal copied note.

The extractor now walks visible DOM content, excluding scripts, styles, templates, hidden content and navigation/application containers. It preserves paragraph/heading boundaries, list items, readable links, selected text, and intentional rendered code with its indentation. Empty script-only shells produce a capture error. Automatic clipboard imports containing an HTML-document signature require an intentional paste instead; direct editing/pasting of legitimate code remains supported.

A read-only audit inspected six recent records and two additional historical records with Notion page references. The historical record from 2026-10-28 12:02 UTC already contained HTML/JavaScript in MongoDB. A real GET of its existing Notion children returned HTTP 200, with matching stored text and markup in paragraph blocks. This locates corruption before Notion construction. The original historical HTTP request was unavailable, so the precise capture source of that particular request cannot be proven. Both unsafe capture paths were reproduced independently. Historical records and pages were not rewritten.

### Missing image

The recent image-bearing record from 2026-10-29 17:21 UTC has an owned, retained ImageAsset. A real R2 read found its verified object and confirmed its size. Its Notion status is `failed`, error `NOTION_INVALID_CONTENT`; there is no Notion page ID, upload ID or image-block ID.

The mapper rejected this record's `chrome:` source URL before any page/image operation. It was not an R2 failure or an image-block acknowledgment. The mapper now preserves browser-source metadata (`chrome:`, `edge:`, `about:`, `chrome-extension:`) as plain text instead of a web hyperlink. HTTP(S) sources remain linked. Executable/unsupported URLs and credentials in URLs remain rejected. The same stored record now passes the pure mapper without changing its text or source URL.

The existing Notion mechanism remains create file upload → multipart send → append an image block referencing `file_upload.id`. This matches the [official small-file workflow](https://developers.notion.com/guides/data-apis/uploading-small-files). Private R2 URLs are not sent as permanent Notion image sources. Ordered image insertion, claims, retry state, and recovery-source retention remain intact.

### Status feedback

The popup discarded the initial provider state available at save completion and began from unknown. A failed first GET could therefore obscure an existing acknowledgment. Status-check failures also set detail text while leaving the detail hidden. Image progress could claim success on a corrupt overall Notion acknowledgment, and some image failure wording assumed text was already saved.

The response now includes an additive safe `syncStatus` snapshot. The popup initializes the receipt from it and uses queued fallback only when talking to older responses. Confirmed provider outcomes survive lookup failure; the lookup error is displayed separately. TickTick says `Task saved`; Notion says `Page saved` or `Text and images saved`. Partial image messages depend on confirmed text progress. Missing Notion acknowledgments project uncertainty, including image uncertainty, with no automatic retry.

Retention confirmation now depends on committed response fields (`imageRetention` plus image references), not only the submitted checkbox. Cleanup failures log the nonsecret image record ID, without object URLs, credentials or raw SDK errors, so the affected record can be located. Existing cleanup retries are preserved.

## 2. Files changed in this audit

| File | Reason |
| --- | --- |
| `extension/content.js` | Visible text extraction, preserved intentional code and unreadable-shell errors. |
| `extension/popup.js` | Guard automatic HTML-document clipboard imports, preserve extracted title, consume initial provider status and committed retention acknowledgment. |
| `extension/sync-status.js` | Provider-specific feedback, visible lookup errors, preserved confirmed states and accurate image retry progress. |
| `services/contentService.js` | Add safe provider snapshot after the existing successful content transaction. |
| `services/contentSyncStatusService.js` | Do not project image success when Notion's overall acknowledgment is incomplete. |
| `utils/notionContentBlocks.js` | Preserve browser-source URLs as plain metadata without changing stored text/URL. |
| `services/notionImageService.js` | Identify failed temporary-object deletion by safe image record ID. |
| `services/imageCleanupService.js` | Identify cleanup failures by safe image record ID. |
| `tests/contentSaving.test.js` | Verify additive response contract and queued provider snapshot after commit. |
| `tests/notionContent.test.js` | Reproduce browser-source validation failure and verify plain source metadata. |
| `tests/notionImages.test.js` | Confirm browser-source content reaches the existing image phase unchanged. |
| `tests/imageSyncStatus.test.js` | Reject image-success projection for incomplete acknowledgments. |
| `scripts/verify-capture-extraction.mjs` | New real-DOM article, selection, scripts/styles/code and unreadable-shell checks. |
| `scripts/verify-extension-ui.mjs` | Initial-state/poll failure, partial images, clipboard source and inaccessible-page regressions. |
| `scripts/verify-fidelity-native.mjs` | Real extension capture excludes embedded scripts/styles; updated provider-specific receipt assertions. |
| `docs/save-flow-audit.md` | This focused audit report. |

Ignored `.tmp` scripts/logs hold local read-only diagnostics and verification evidence. Swagger/general API documentation, TickTick implementation, authentication and AI behavior were not edited by this audit. A comparison of 23 protected files against the earlier local snapshot found no mismatches.

## 3. Response and synchronization contract

Before: HTTP 201 `{ status: "success", data: { content, ai } }`, followed by a read-only status GET. The frontend inferred requested providers and initially represented them as unknown.

After: HTTP 201 `{ status: "success", data: { content, ai, syncStatus } }`. `syncStatus` uses the same safe projection as the status endpoint: content ID plus TickTick/Notion requested state, status, safe error/retry information and acknowledged resource references. The existing fields remain compatible.

The article is committed before best-effort asynchronous provider dispatch. Providers continue to update the same Content record read by authenticated `GET /api/v1/content/:id/sync-status`. The frontend polls the returned committed content ID. Existing state enums, ownership checks, provider claims and separate explicit retry endpoints are unchanged. Polling is bounded; GET failures cannot start a provider write or mark a provider failed. Ambiguous writes retain their claims and prevent blind duplicate creation.

Retained image success is independent of Notion and TickTick. Temporary verified sources are removed only after confirmed image-block insertion, or after the existing bounded recovery expiration policy. Failed/uncertain insertion preserves the recoverable copy within that policy. No cleanup run was invoked against production data during the audit.

## 4. Verification

| Check | Actual result |
| --- | --- |
| `npm test` | 438 tests: **434 passed, 0 failed, 4 optional MongoDB tests skipped**. |
| `node scripts/verify-capture-extraction.mjs` | **4 passed**, real browser DOM. |
| `node scripts/verify-extension-ui.mjs` | **92 passed, 0 failed**; mocked backend/provider APIs. |
| `node scripts/verify-fidelity-native.mjs` | **Passed**, actual Chrome MV3 runtime and content script; mocked backend/provider APIs. |
| Syntax check | **15 affected JavaScript files passed**. |
| `git diff --check` | Passed; existing CRLF notices only. |
| Real read-only MongoDB/R2 audit | Retained source exists and matches recorded size; Notion preflight rejection identified. |
| Real existing Notion page reads | HTTP 200 for two pages; stored text matched returned paragraphs, including the historical markup case. |

Automated coverage includes Knowvia persistence while providers are pending, TickTick success/failure/uncertainty and temporary polling failure, readable Notion text, actual image-block request shape, text/image partial failure, retained and temporary images, confirmed-only temporary deletion, uncertain-source preservation, and status wording. The four skipped tests require optional dedicated MongoDB integration-test settings. Ordinary automated backend/provider operations use fixtures; these are not live provider save claims.

**Live Notion image insertion was not executed or verified.** The recent failed record never reached a Notion request. **Live TickTick task creation was not re-executed**; the existing record's persisted state is `synced`, and its status handling was verified with automated backend/UI tests. No authenticated extension session was available for a new end-to-end save. The prior environment check found the configured local backend unavailable (`ECONNREFUSED` at localhost:3000).

## 5. Remaining manual acceptance

1. Restart the local backend to load the mapper/response changes. Reload Knowvia in `chrome://extensions`, then reload the article tab to load the changed content script.
2. Sign in normally, connect/select Notion and open a normal readable article. Clear any old draft before recapturing. Verify that the editor contains prose and intentional code only. Historical stored markup is not automatically repaired.
3. Select one harmless image, enable Notion and Knowvia retention, disable TickTick, and Save. Confirm Knowvia acknowledgment first, then `Text and images saved`. Open the Notion page and verify the image block and readable text. Check that retained-image retrieval and its R2 object remain available, and MongoDB `rawText` matches the submitted article text.
4. Repeat with retention disabled. Verify an actual Notion image block and `notionStatus: synced`, followed by canonical object deletion. Staging copies can remain until signed-PUT expiry plus the scheduled cleanup pass; defaults allow roughly 21 minutes in a healthy process without backlog.
5. For the previously failed retained-image capture, refresh its saved status and explicitly retry Notion after the backend restart. Its original article and retained image remain untouched. Reconcile first if any later attempt reports uncertainty.
6. Verify a TickTick-only save, its task in TickTick and `Task saved`. Temporarily take the backend offline while checking status; the confirmed task result should remain visible with a separate lookup error. Restore connectivity and check status again. Do not use Save to recheck a provider outcome.

Do not share raw HAR exports, authorization headers, provider response bodies or signed URLs while collecting evidence. No application secrets or article excerpts are included in this report.
