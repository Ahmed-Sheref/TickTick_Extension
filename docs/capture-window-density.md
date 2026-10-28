# Capture window density follow-up

Changed `extension/v2.css` and `extension/background.js` to reduce unnecessary initial scrolling and oversized controls. The capture window reserves 32px rather than 80px from the originating browser height. Shared wide-screen fields are 40px, editor text 15px, provider row padding 8px, card radius 12px. At constrained heights, redundant introductory copy is removed, the preview image becomes a short strip, and the unavailable upload control becomes compact. Main content and actions remain available. Settings use two columns at wide widths and constrained heights.

Verification: actual MV3 fixture-backed capture and settings both have scrollHeight <= clientHeight at 1000x650, 1270x700 and 1366x768. Capture also checked at 1440x900 and 1920x1080. No overflow hiding was added to mask missing controls. Expanded fields, additional tags, receipts, narrow windows and unusually long content can still require natural scrolling. Tests exercise real extension APIs with mocked provider responses, not live writes.

Native harness passed; 49 focused window/auth tests passed. Representative capture and settings screenshots inspected at `.tmp/fidelity-native/density-1000-650.png` and `density-settings-1000.png`. DOM browser regression results are logged in `.tmp/density-browser.log`.
