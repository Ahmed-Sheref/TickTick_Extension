# Final save experience refinement

Implemented and checked on 2026-10-29. Swagger, OAuth, credential storage and TickTick task creation were not edited by this refinement. Original article content is not changed by provider/image processing.

## Save progress

The existing MongoDB-first response and independent provider dispatch remain intact. The primary action is now **Save capture**, reflecting mandatory Knowvia persistence. After the confirmed response, a contextual receipt continues to show requested provider states independently of the button. It distinguishes pending article/image work, confirmed completion, partial failure, uncertainty, and lookup failure. It uses bounded existing polling and the same content ID and owner/session checks.

The receipt has an indeterminate stage indicator rather than a percentage. Confirmed successes survive a failed status check. Provider retries remain separate explicit actions governed by existing claims. A new draft moves the old receipt into Previous save; late responses cannot overwrite a newer receipt. The cleared form cannot immediately resubmit after a confirmed save; entering a new capture enables saving again.

## Images and intent

The Images section is fixed below the editor, before destination selection. It never moves into a provider card. Choose images is the primary action; Ctrl+V pastes image files, while an optional Clipboard disclosure retains the existing supported asynchronous paste action. Ordinary text paste remains native. Files stay local until Save, and preview object URLs retain their existing cleanup behavior. No image-URL import backend exists, so no image-URL fetch control was added.

**Keep images in Knowvia** is independent of **Include selected images in Notion**. The latter appears in the Notion card only when selected images and the Notion destination are present. Platform/inclusion toggles preserve files and previews.

The existing content request's optional `images` object now accepts `notion: boolean` alongside `uploadIds` and `retain`. The server persists `Content.imageNotionIncluded` as an optional boolean. Legacy requests/records retain their prior behavior when this field is omitted. Explicit false skips Notion image validation, image hashing and insertion while leaving ordinary Notion text export intact. Retained-only images still belong to their Knowvia content and remain retrievable. Status projection does not imply Notion image progress for those files.

| Retain | Include in Notion | Outcome |
| --- | --- | --- |
| true | true | Keep the R2 copy and insert into Notion. |
| true | false | Keep in Knowvia; Notion receives ordinary text only. |
| false | true | Temporary source; existing confirmed-insertion cleanup/recovery rules apply. |
| false | false | Reject before upload/save; explain the required choice. |

Notion inclusion requires Notion selection. No image payload is added to TickTick, and no new R2 lifecycle or cleanup policy is introduced.

## Tags

The existing provider-specific Notion tag implementation is retained. Normal page destinations use visible `Tags: #...` text blocks, not native database tags. Data Source destinations can additionally populate a uniquely identified existing `Tag`/`Tags` Multi-select property, using existing matching option IDs only. Missing, ambiguous or incompatible properties/options fall back to visible body tags; all selected tags remain represented. No schema or option is created automatically. TickTick tags remain separate.

A fresh read-only check of the latest existing save found one stored Notion tag, one stored TickTick tag, confirmed provider statuses, a live Notion image block and a visible Notion tag block containing the selected Notion tag. Thus this existing page uses body tags. The earlier tagless page had zero stored Notion tags and two TickTick tags; provider isolation explains its lack of a Notion tag block.

## Provider opening actions

Open in Notion retains the acknowledged, validated Notion page URL and appears only for confirmed synchronization. Open TickTick appears only with a requested, confirmed task and safe persisted task identifier. Its URL is the fixed TickTick web-app entry point; **it is not a direct task or list link**. No documented/reliably verified desktop task-link contract was established from the current integration response, so no task URL is manufactured. The action's label/tooltip make the generic scope explicit. Provider link validation lives in `extension/provider-links.js` and never includes credentials.

## Files changed in this refinement

| File | Responsibility |
| --- | --- |
| `extension/popup.html` | Global image copy, optional Clipboard action, retention label, link helper loading. |
| `extension/attachments.js` | Fixed image location and independent inclusion/retention intent. |
| `extension/v2-layout.js` | Notion image option and honest tag representation help. |
| `extension/v2.css` | Single-column Images/Source layout and compact responsive progress presentation. |
| `extension/popup.js` | Save capture label and prevent immediate empty-form resubmission. |
| `extension/sync-status.js` | Aggregate progress stage and confirmed TickTick opening action. |
| `extension/provider-links.js` | New safe Notion and generic TickTick link resolver. |
| `Models/Content.js` | Optional image-inclusion intent; no migration required. |
| `services/imageAssetService.js` | Validate explicit image destination intent and backward compatibility. |
| `services/contentService.js` | Persist intent and attach assets with the correct Notion state in the existing transaction. |
| `services/notionContentService.js` | Respect explicit image exclusion while preserving text and existing image claims/retries. |
| `services/contentSyncStatusService.js` | Project only requested image synchronization. |
| `tests/imageAssets.test.js` | Independent intent combinations and invalid combinations. |
| `tests/contentSaving.test.js` | Transactional retained-only association without Notion images. |
| `tests/notionImages.test.js` | Explicitly excluded images never enter Notion validation/insertion. |
| `tests/imageSyncStatus.test.js` | Retained-only assets do not imply image progress. |
| `tests/providerLinks.test.js` | New confirmed-only generic TickTick action and unsafe Notion URL rejection. |
| `scripts/verify-extension-ui.mjs` | Global image, inclusion, retention, progress, links and responsive regressions. |
| `scripts/verify-fidelity-native.mjs` | Actual MV3 global picker, clipboard, duplicate prevention and visual checks. |
| `docs/final-save-experience.md` | This focused implementation/verification report. |

## Actual verification

- `npm test`: **451 tests, 447 passed, 4 skipped, 0 failed**. Skips require optional dedicated MongoDB test settings.
- `node scripts/verify-extension-ui.mjs`: **96 passed, 0 failed**, including narrow/dark layouts, previous receipts, safe retries, independent provider outcomes, retained-only images, and provider actions.
- `node scripts/verify-fidelity-native.mjs`: **passed**, real Chrome MV3 extension runtime, device chooser, native image/text clipboard and rendered screenshots; backend/provider API responses are fixtures.
- Syntax checks: **17 affected JavaScript files passed**. `git diff --check` passed with existing CRLF notices.
- Protected-file hash comparison: **18 files, zero mismatches** against the prior local baseline.
- Real read-only checks: existing MongoDB states remain readable; existing Notion page returned HTTP 200 with its selected tag block and one image. No existing record/page/schema was changed by this inspection.

Rendered screenshots inspected include `.tmp/fidelity-native/native-notion-images-selected.png` and `.tmp/knowvia-ui/final-progress-complete.png`. The latter shows the completed receipt and opening actions within a 400px window. Images/Source now stack naturally; the fixed footer remains visible while longer forms scroll.

## Remaining acceptance

Restart the backend and reload the extension to load the optional request field and new script. Test the four intent combinations above through the signed-in extension, including confirmed temporary deletion and preservation on uncertainty. **No new live provider save, Data Source property write, or new image-inclusion combination was executed during this refinement.** These paths are covered by automated tests, while the live checks only read existing saves. TickTick direct task/list opening remains unverified and intentionally unavailable. Retained-image dashboard UI remains future work.
