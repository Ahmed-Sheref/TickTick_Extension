// Real DOM extraction regression checks; no accounts or external requests.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
let checks = 0;
try {
    const page = await browser.newPage();
    await page.route('https://capture.example.test/**', route => route.fulfill({ body: '<html></html>', contentType: 'text/html' }));
    await page.goto('https://capture.example.test/article');
    async function capture(html, selected) {
        await page.setContent(html);
        await page.evaluate(() => {
            window.chrome = { runtime: { id: 'capture-test', onMessage: { addListener: listener => { window.captureListener = listener; } } }, storage: { local: { set() {} } } };
        });
        await page.addScriptTag({ content: source });
        if (selected) await page.evaluate(selector => {
            const range = document.createRange(); range.selectNodeContents(document.querySelector(selector));
            const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
        }, selected);
        return page.evaluate(() => new Promise(resolve => window.captureListener({ type: 'GET_PAGE_CONTEXT' }, {}, resolve)));
    }
    const normal = await capture('<title>A useful article | Example</title><nav>Site navigation</nav><article><h1>A useful article</h1><p>First readable paragraph.</p><p>Second paragraph with <a href="/reference">a reference</a>.</p><ul><li>First item</li><li>Second item</li></ul></article>');
    assert.equal(normal.ok, true);
    assert.equal(normal.data.title, 'A useful article');
    assert.match(normal.data.pageText, /First readable paragraph\.\n\nSecond paragraph/);
    assert.match(normal.data.pageText, /a reference \(https:\/\/capture.example.test\/reference\)/);
    assert.match(normal.data.pageText, /• First item/);
    assert.doesNotMatch(normal.data.pageText, /Site navigation/); checks++;

    const scripts = await capture('<article><h1>Readable heading</h1><p>Visible prose.</p><script type="application/json">{"private_script_marker":true}</script><style>.private_style_marker {display:block}</style><p hidden>Hidden marker</p><p style="display:none">Display marker</p><p aria-hidden="true">Aria marker</p><template>Template marker</template><pre><code>&lt;script&gt;\n  const intentional = document.querySelector("article");\n&lt;/script&gt;</code></pre></article>');
    assert.doesNotMatch(scripts.data.pageText, /private_script_marker|private_style_marker|Hidden marker|Display marker|Aria marker|Template marker/);
    assert.match(scripts.data.pageText, /<script>\n  const intentional = document.querySelector\("article"\);\n<\/script>/); checks++;

    const selection = await capture('<article><h1>Selection test article</h1><p id="selected">Selected العربية text.</p><p>Other text.</p></article>', '#selected');
    assert.equal(selection.data.selectedText, 'Selected العربية text.'); checks++;
    const empty = await capture('<body><script>const app_shell = true;</script><style>body {color:red}</style><div hidden>Not readable</div></body>');
    assert.equal(empty.ok, false); assert.match(empty.error, /No readable content/); checks++;
    console.log(`${checks} capture extraction checks passed: article, scripts/styles with intentional code, selection, unreadable shell.`);
} finally { await browser.close(); }
