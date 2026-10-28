# Knowvia frontend polish — 2026-10-27

> Updated saving behavior: see [Explicit content destinations](explicit-content-destinations.md). That phase supersedes historical automatic-sync and frontend-availability statements below.
## Scope and audit

The shipped frontend is the Manifest V3 action popup: `extension/popup.html`, `popup.css`, and `popup.js`. It uses plain HTML, CSS custom properties, DOM components, and Chrome storage/runtime APIs. No frontend framework, bundler, TypeScript configuration, lint configuration, or build script is present. The main screens are Google onboarding, capture (including its editor, optional AI controls, lists and tags), and settings (account, TickTick, Notion, email and Telegram).

The initial audit inspected those screens, the manifest and assets, theme and navigation code, dynamically rendered picker/tag components, existing browser checks and auth tests. The existing browser harness was run before editing: **23 checks passed**. Baseline screenshots were inspected for capture, settings, onboarding, narrow layouts and dark mode.

Root causes found:

- The raster wordmark contained an opaque background. Light mode disguised it using `mix-blend-mode`; dark mode explicitly added a white plate. Several provider marks also had white containers.
- Icons came from independent inline paths and text characters, with inconsistent grids, strokes, alignment and sizing. The same provider used different artwork across screens.
- Header actions were 30px, preview actions 25px, and picker actions 28px. Click target sizes and glyph dimensions were coupled. Preview actions were only visible on hover.
- Many captions were 8–9px. Independent radii, selected borders, gradients, inset outlines, tinted backgrounds and shadows competed with the content.
- Dark mode retained light-specific selected colors and logo treatments. The destructive status-pill class had no matching style.
- Dropdowns always opened downward, then scrolled the form to show themselves. The Back button left keyboard focus on a hidden control.
- Narrow layouts reduced icon and text sizes or hid option icons instead of adapting the composition.

There were substantial pre-existing uncommitted changes. This pass preserves that work. `extension/index.html` is a labeled, standalone design prototype rather than the manifest entry point; it is outside the shipped-frontend scope. The older ZIP and brand PNG remain available. This record supplements the previous frontend completion document.

## Implementation

- Replaced the header's raster lockup with a transparent SVG mark and theme-aware text, keeping Knowvia's blue/violet mark and navy identity. Removed the blend-mode workaround and white plate. Retained intentional backgrounds in the launcher icon and onboarding feature panel.
- Consolidated UI glyphs into one inline SVG symbol set in `popup.html`, including dynamically generated picker, theme, selection and tag-removal icons. Interface glyphs share a 24px grid and 1.75 stroke. Provider marks retain their own viewboxes and brand colors and now match between settings and capture.
- Established shared tokens for action and semantic colors, surfaces, text, typography, spacing, radii, icon sizes, hit targets, controls, menu elevation and motion. The existing stylesheet remains the only styling system.
- Refined buttons, inputs, cards, destination tiles, format selectors, chips, status pills, switches, disclosures and dropdowns. Removed competing selected gradients, excess icon tiles and decorative shadows. Menus retain purposeful elevation.
- Separated 16/20/24px interface glyph sizes from 32/36px compact/standard click targets. Touch devices receive 44px icon actions and 46px controls without enlarging their glyphs. Preview actions stay visible and reserve enough room beside text.
- Used readable type, consistent labels and semantic text colors. Light and dark text/semantic token pairs are checked at a minimum 4.5:1 contrast ratio. Busy buttons retain full-opacity labels. Loading feedback uses circular spinners and respects reduced motion.
- At narrow widths, destination tiles stack and format selectors retain their icons with vertical composition. Short popups scroll internally with save/feedback controls visible. The default connected 480 × 600 capture fits without scrolling, including two tags.
- Shared picker placement chooses above/below the input and limits the menu to available space. Returning from settings restores keyboard focus to its trigger.

No dependencies, backend routes, save payloads, OAuth contracts, storage keys or provider business logic were changed in this pass.

## Rendered verification

The actual popup files were rendered in installed headless Chrome using the existing Playwright harness. Chrome APIs and backend responses are fixtures confined to the harness. The harness is not imported by the extension.

| Viewport | Theme / input | Reviewed states |
| --- | --- | --- |
| 320 × 480 | Light, touch | Capture, upward list picker, tags, editor/options, upper/lower settings, validation, onboarding and cancellation |
| 375 × 600 | Dark, touch | Capture, lists/tags, editor/options, upper/lower settings, validation, onboarding and cancellation |
| 420 × 600 | Light, mouse/keyboard | Capture, lists/tags, editor/options, upper/lower settings, validation |
| 480 × 600 | Light and dark | Capture with/without connections, tags, list creation, editor/options, settings, save failure, saving, confirmed success, cover fallback |
| 768 × 768 | Dark, touch; light onboarding | Capture, lists/tags, editor/options, upper/lower settings, validation, onboarding and cancellation |
| 1280 × 800 | Light, mouse/keyboard | Capture, lists/tags, editor/options, upper/lower settings, validation |

At larger viewports the extension retains its intentional 480px popup width and 600px maximum height; it is not a full-width dashboard. Narrow/short and touch layouts intentionally scroll rather than shrinking text.

Screenshots were inspected and compared with the baseline. Initial QA exposed a clipped bottom row and preview text competing with larger touch actions. Shared spacing and reserved action space were corrected. The final review also corrected the loading spinner shape and faded busy labels. Final screenshot captures wait for theme transitions to settle.

Screenshot directories (local, ignored by Git):

- Baseline: `.tmp/polish-before/`
- Final: `.tmp/polish-after/` — includes capture, onboarding, settings top/bottom, editor, both pickers, error, saving and saved states.

## Checks and results

| Check | Result |
| --- | --- |
| `npm test` | 239 tests: **237 passed, 2 skipped, 0 failed**. The skipped tests require explicitly configured disposable MongoDB databases. |
| `node scripts/verify-extension-ui.mjs` | **38 checks passed, 0 failed** after corrections. Existing auth, capture/save, list/tag and preference regression coverage remains. |
| Responsive/accessibility browser checks | No horizontal overflow, visible save action, rendered vector glyphs, 44px touch action targets, picker/input viewport containment, reachable preferences, keyboard focus restoration, visible focus rings, shared text contrast and reduced motion passed. |
| Browser console | No JavaScript console errors in the checked fixture flows. |
| JavaScript syntax | `node --check extension/popup.js` and `node --check scripts/verify-extension-ui.mjs` passed. |
| Patch whitespace | `git diff --check` passed. Git reports Windows line-ending normalization notices. |
| Build / lint / type-check | No corresponding scripts or configurations are defined; no success is claimed for nonexistent checks. |

To reproduce the browser checks, run `node scripts/verify-extension-ui.mjs`. Playwright is available from the parent development environment; no dependency was installed. `CHROME_PATH` and `KNOWVIA_QA_DIR` can override the installed Chrome executable and screenshot directory. Load the `extension` directory through Chrome's existing unpacked-extension workflow to use the changes; the older ZIP was not regenerated.

## Remaining limits

- Live Google/TickTick/Notion OAuth and actual downstream delivery were not exercised with real accounts. Fixtures and existing auth tests establish UI behavior and existing request contracts, not live service availability.
- Native Chrome popup mounting, real-device touch, browser zoom and OS font scaling still warrant a manual release check; the responsive review uses browser viewport and touch emulation.
- Notion saving remains unavailable as declared by the existing product. Its connection controls remain available in settings.
- No obvious visual defects remain in the reviewed fixture screens. Arbitrary external article imagery and exceptionally long real-world content can vary; existing truncation, wrapping and image fallbacks remain in place.
