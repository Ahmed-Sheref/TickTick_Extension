# Knowvia image support implementation report

Implementation and automated verification completed locally on 2026-10-29. Live R2/Notion acceptance remains pending configuration; no live provider or production database verification is claimed.

## A. Architecture

The existing extension save operation now uploads selected files only after the user clicks Save. It requests an authenticated upload session, PUTs bytes directly to a private R2 staging object, and asks the backend to verify the result. The backend reads at most 5 MiB, checks size and magic bytes, and writes a separate verified object that the presigned staging URL cannot overwrite.

The original content request carries verified upload IDs and an explicit retention choice. Image ownership claims and content references are committed in the existing MongoDB transaction. Original text is preserved. The existing post-creation dispatcher continues to run Notion and TickTick independently; external synchronization failure does not roll back committed Knowvia content.

Notion consumes verified objects through its File Upload API and appends actual image blocks after existing text blocks, in selection order. Retained objects remain available through authenticated retrieval. Temporary verified objects are removed after confirmed insertion, or after bounded recovery expiration. TickTick receives the existing text/task payload.

## B. Files changed

These are the files created or modified for this image implementation. Existing unrelated working-tree changes were preserved.

| File | Responsibility |
| --- | --- |
| `.gitignore` | Allow the placeholder-only `.env.example`. |
| `.env.example` | R2 credentials/configuration placeholders and image policy settings. |
| `package.json`, `package-lock.json` | AWS S3 client and presigner dependencies. |
| `Models/Content.js` | Optional image references/retention and Notion image phase; no rewrite of old records. |
| `Models/ImageAsset.js` | Ownership, private object keys, lifecycle, retention and Notion progress. |
| `Models/ImageUploadQuota.js` | Durable per-user/day upload reservation counter and counter TTL. |
| `Routes/imageRoute.js` | Authenticated image configuration, initiation, completion, retrieval and deletion. |
| `index.js` | Mount the image router. |
| `Server.js` | Start cleanup alongside existing jobs after database connection. |
| `services/imageConfig.js` | Backend metadata/signature validation and bounded policy configuration. |
| `services/imageStorageService.js` | Private R2 signing, bounded reads, verified writes and deletion. |
| `services/imageAssetService.js` | Upload lifecycle, quota, transactional attachment and owned access/deletion. |
| `services/imageCleanupService.js` | Bounded, guarded staging and temporary-object cleanup. |
| `services/notionImageService.js` | Official file upload, image insertion and per-image recovery. |
| `services/contentService.js` | Extend existing creation transaction with verified image claims. |
| `services/notionContentService.js` | Run images inside the existing claim/page/phase/hash workflow. |
| `services/contentSyncStatusService.js` | Separate text/image progress and stop retry when sources expire. |
| `utils/notionApi.js` | Allowlisted official file-upload routes and bounded native multipart requests. |
| `utils/notionErrors.js` | Safe image failure/expiration messages. |
| `utils/imageCleanup.js` | Startup and 15-minute cleanup scheduling. |
| `config/r2-cors.example.json` | Exact-origin CORS template requiring deployment-specific values. |
| `extension/image-limits.js` | One shared file-count/size/type definition for browser and backend. |
| `extension/attachments.js` | File/clipboard previews, explicit retention, upload queue and recoverable draft state. |
| `extension/popup.html` | Retention choice, image progress and shared limits script. |
| `extension/popup.js` | Upload/verify before existing content save; preserve files/text on failure. |
| `extension/v2-layout.js` | Move image controls into the selected Notion destination. |
| `extension/v2.css` | Compact retention and destination image styling. |
| `extension/sync-status.js` | Distinguish upload, retention, Notion partial/uncertain/expired results. |
| `tests/helpers/imageFixture.js` | Injected asset, quota and object-storage fixtures. |
| `tests/imageAssets.test.js` | Validation, ownership, lifecycle, quotas, cleanup, concurrency and deletion. |
| `tests/imageStorage.test.js` | Bounded object reads and real SDK offline signing assertions. |
| `tests/imageMongo.integration.test.js` | Optional dedicated real-Mongo transaction/ownership/lifecycle checks. |
| `tests/notionImages.test.js` | Upload, insertion order, partial retry and uncertain-write handling. |
| `tests/notionImageApi.test.js` | Multipart transport, authentication and route restrictions. |
| `tests/imageSyncStatus.test.js` | Independent image progress and expired-source retry behavior. |
| `tests/contentSaving.test.js` | Same-transaction image association, rollback, original text and provider independence. |
| `scripts/verify-extension-ui.mjs` | Image retention/save/retry browser checks with mocked APIs. |
| `scripts/verify-fidelity-native.mjs` | Real MV3 Chrome selection, clipboard, upload and receipt checks with mocked APIs. |
| `docs/image-support-implementation.md` | This implementation, API, verification and operations report. |

Swagger, existing general API documentation, TickTick implementation, OAuth, AI, email and Telegram files were not changed by this image task. A hash comparison of 23 protected existing files matched the earlier local baseline.

## C. API contract

All image endpoints are under `/api/v1/images` and require the existing `Authorization: Bearer <Knowvia JWT>` authentication. Ownership comes from the authenticated user, never from request-supplied user IDs or storage keys. Responses use `{ status: "success", data: ... }`; operation failures use `{ status: "error", message }`. Successful operation responses set `Cache-Control: no-store`.

| Method/path | Input | Successful `data` |
| --- | --- | --- |
| `GET /config` | None | `{ maximum: 6, sizeLimit: 5242880, types: [...] }`. |
| `POST /uploads` | `{ filename, size, mimeType }` | HTTP 201: `{ uploadId, uploadUrl, headers: { "Content-Type": ... }, expiresAt }`. |
| `POST /:imageId/complete` | No body required | Verified image metadata. Repeated completion of an uploaded/attached asset is idempotent. |
| `GET /content/:contentId` | None | Array of owned retained image metadata plus `displayUrl` and `expiresIn` seconds. |
| `DELETE /:imageId` | None | `{ deleted: true }`; abort unused uploads or delete retained copies subject to recovery guards. Already-deleted owned assets succeed. |

Image metadata contains `id`, `filename`, `mimeType`, `size`, `retained`, `status`, and `notionStatus`. Private object keys, provider credentials and upload/block identifiers are excluded. Signed URLs are short-lived bearer capabilities; consumers must not log them or persist them as permanent identifiers.

After initiation, the extension PUTs the original File body to `uploadUrl` using the returned Content-Type. The browser supplies Content-Length from the File; both length and type are covered by the signature. Completion is required before content association.

The existing `POST /api/v1/content` body accepts this optional field alongside all original content/destination fields:

```json
{
  "images": {
    "uploadIds": ["24_character_verified_upload_id"],
    "retain": true
  }
}
```

`uploadIds` must contain 1–6 unique verified, unused, owned IDs. `retain` must be a boolean. `false` requires explicitly enabled Notion. Omit `images` entirely for text-only saves. The content transaction rejects any invalid association atomically.

Image operations return 400 for invalid metadata/intent, 404 for inaccessible/missing ownership, 409 for conflicting or recovery-protected state, 410 for expired/missing uploads, 429 for quotas, and a safe 503 for storage failures. Existing authentication middleware supplies authentication errors. No dashboard frontend was present; the focused retrieval/deletion API supports the future dashboard.

## D. Data model and lifecycle

R2 stores bytes; MongoDB stores references and metadata. `Content.images` holds ordered ImageAsset ObjectIds and `Content.imageRetention` records the save intent. Both fields are optional, so existing content needs no migration. ImageAsset holds user/content ownership, filename, verified type/size, SHA-256, private staging/verified keys, retention, timestamps and separate Notion progress.

The image service owns `uploading → verifying → uploaded`; only the content transaction moves verified assets to `attached`. Delete/cleanup claims `deleting` before remote deletion, then marks `deleted`. Deleted records remain as tombstones so consumed IDs cannot be reused and late staging writes can still be removed. There is no TTL on image metadata: deleting metadata before deleting R2 objects would orphan bytes.

Notion progress is independent: `not_requested`, `pending`, `uploading`, `uploaded`, `inserting`, `synced`, `failed`, `uncertain`. The Notion image service owns these transitions. Retained assets are excluded from temporary cleanup even though an expiry timestamp exists. Unattached uploads expire after 24 hours by default; associated temporary recovery sources expire after 7 days. Successful temporary Notion images can be deleted immediately. Cleanup retries failed deletion and removes staging objects only after the presigned PUT expires plus clock slack, preventing a late PUT from leaving an untracked object.

Deletion checks user/content ownership and blocks removal of a source still needed for pending, failed or uncertain Notion recovery. It does not remove an already-inserted image from Notion. Content references to deleted image records remain historical references and are omitted from retained-image retrieval.

## E. Notion synchronization

The existing credential resolution, destination checks, API version `2026-03-11`, content claim, page ID, text progress and content hash remain authoritative. Ordered image IDs participate in the hash for image-bearing saves. Source preflight runs before creating a page; existing text-only hashes retain their previous behavior.

Each image uses `POST /file_uploads` with `mode: single_part`, then multipart `POST /file_uploads/{id}/send`, then `PATCH /blocks/{pageId}/children` with an image block referencing `file_upload.id`. Files of this supported size use the single-part workflow; a multipart `/complete` call is not required. Upload and block responses are validated. See the [official small-file workflow](https://developers.notion.com/guides/data-apis/uploading-small-files).

Upload IDs are persisted and checked with `GET /file_uploads/{id}` before reuse. Confirmed images are skipped; completed text/page work is preserved. Known rejected insertions can retry with the existing upload. The `inserting` state is persisted before the write, so crashes, ambiguous responses or failed acknowledgment persistence require reconciliation instead of automatic duplicate insertion. A previously attached upload (`expiry_time: null`) is also treated as uncertain; see the [File Upload object](https://developers.notion.com/reference/file-upload).

Text can succeed while images remain failed/partial. Expired temporary sources disable retry. Temporary verified bytes are deleted only after confirmed image-block insertion; deletion failure is left to cleanup and does not undo confirmed Notion success. Retained bytes survive all provider outcomes.

## F. TickTick behavior

No native TickTick attachment mechanism, private endpoint or image payload was added. Existing task creation and options remain intact. TickTick-only saves can retain images in Knowvia when explicitly requested. With neither Notion nor retention selected, the extension explains the required choice before uploading; the backend rejects the same invalid intent.

## G. Tests actually executed

| Check | Result |
| --- | --- |
| `npm test` | 434 tests: **430 passed, 0 failed, 4 skipped**. |
| `node scripts/verify-extension-ui.mjs` | **89 checks passed, 0 failed**. |
| `node scripts/verify-fidelity-native.mjs` | **Passed**, real Chrome MV3 runtime, device selection/clipboard and mocked image/content/provider APIs. |
| `node --check` on 31 affected/new JavaScript files | Passed. |
| `git diff --check` | Passed; existing CRLF conversion notices only. |
| Protected-file hash comparison | 23 checked, 0 mismatches. |

The suite covers metadata and magic-byte rejection, wrong owners, expiry/missing objects, duplicate completion, immutable verified copies, concurrent quotas/completion, transaction rollback, secure retrieval/deletion, retained-vs-temporary cleanup, late staging PUTs, recoverable provider failures, no duplicate uncertain insertions, original text and image-free TickTick payloads. Browser checks cover upload failure, preserved drafts, verified-upload reuse after failed content saves, retention choices, destination switching and operation-specific receipts. Native screenshots were inspected, including `.tmp/fidelity-native/native-notion-images-selected.png`.

Four database tests skipped because their optional dedicated test database settings were absent: one image Mongo integration test, two existing Notion Mongo tests and one existing TickTick Mongo test. The new real-Mongo test accepts only a dedicated `knowvia_image_test_*` database, cleans its own test records and never drops a database. External provider behavior is mocked in automated tests; SDK signing is tested offline. **No real R2 or Notion upload was performed.**

## H. Remaining configuration and acceptance work

1. Create/select a private R2 bucket and a bucket-scoped read/write API token. Keep public bucket access disabled. Merge `.env.example` into the existing server environment; never put R2 credentials in the extension. R2 configuration is lazy, preserving existing text-only operation when storage is unconfigured.
2. Set the actual account ID, key, secret and bucket. The optional endpoint must match the account's standard R2 S3 endpoint; the region defaults to `auto`. This implementation does not configure jurisdiction-specific alternative endpoints.
3. Replace placeholder origins in `config/r2-cors.example.json` with actual extension/development/production origins and apply the policy to the bucket. Remove unused origins. See [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/) and [presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/). Existing extension host permissions were sufficient and were not expanded.
4. Run the backend through `Server.js` so startup/15-minute cleanup executes; keep this process running. Each pass processes at most 100 staging objects and 100 eligible canonical objects. Monitor cleanup failures/backlog and storage usage. Cleanup delay grows if jobs stop or backlog exceeds throughput.
5. Use MongoDB with transactions enabled, as already required by content creation. Optionally provide a dedicated `IMAGE_TEST_MONGODB_URI` and rerun tests to exercise real image transaction behavior. Image quota unique indexes are explicitly ensured before reservations.
6. With a test user and real Notion destination, verify retained-only, temporary Notion-only, retained+Notion, deletion and expiry flows. Confirm bucket CORS and content-length signing in the deployed browser/network path. These credential-dependent checks remain outstanding.

The existing post-creation dispatcher is best-effort rather than a newly introduced durable worker queue. Existing status/retry behavior remains the recovery entry point. Ambiguous Notion writes require manual reconciliation rather than a blind retry; no new reconciliation UI is included. Selected File objects survive recoverable errors while the popup remains open, not popup destruction/browser restart. The retained-image dashboard UI itself remains future work.

Dependency installation reported 23 audit findings (4 low, 10 moderate, 6 high, 3 critical) across the installed dependency tree. No unrelated dependency upgrades or automatic audit fixes were applied.

## I. Cost and operational notes

Defaults are 6 images per content, 5 MiB each, PNG/JPEG/WebP/GIF, 5-minute PUT/display URLs, 24-hour abandoned uploads and 7-day temporary recovery. URL lifetimes are configurable from 60–900 seconds, abandoned lifetime to 48 hours and recovery lifetime to 30 days. Daily authorization reservations default to 120 per user, configurable from 1–1000. Failed reservations/transfers can consume quota. Durable quota counters expire after 8 days; image metadata does not expire automatically.

Authenticated routes also limit image requests to 240 per 15 minutes and initiations to 60/hour per user in each process. An account backlog guard rejects new initiation at 1,000 nondeleted assets; this is a soft guard, not a globally atomic storage-byte quota. Daily quota enforcement is durable across workers. Presigned PUTs are reusable until expiry, so request rate limits cannot cap every direct R2 operation. No compression, paid-plan change, billing system or unlimited-free promise was added.

Cloudflare's current Standard free allowance lists 10 GB-month storage, 1 million Class A operations and 10 million Class B operations per month, with no R2 egress charge; see [R2 pricing](https://developers.cloudflare.com/r2/pricing/). Quotas and cleanup reduce usage but do not guarantee remaining within that allowance. Verification adds a staging read and a separate verified write, and retries/Notion transfer/display add operations. Staging copies temporarily coexist with verified copies. Retained images accumulate until the user deletes them. Configure account alerts and review measured usage before raising quotas.
