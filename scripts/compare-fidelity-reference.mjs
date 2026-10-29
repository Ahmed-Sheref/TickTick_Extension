import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const out=path.resolve('.tmp/fidelity-native');
const ref=pathToFileURL(path.join(process.env.KNOWVIA_REFERENCE_DIR || 'C:/Users/Ahmed/AppData/Local/Temp','01-APPROVED-V2-MAIN.png')).href;
const actual=pathToFileURL(path.join(out,'01-main.png')).href;
const html=`<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#e7edf2;font-family:Segoe UI,sans-serif;color:#13294b;padding:16px}main{display:flex;gap:16px}h2{font-size:15px;margin:0 0 12px}section{width:635px}.frame{position:relative;width:635px;height:444.5px;overflow:hidden;border-radius:12px;background:white}.reference img{position:absolute;width:720px;height:523px;left:-42.5px;top:-33.5px}.actual img{display:block;width:635px;height:444.5px}p{font-size:12px;margin:12px 0 0}</style><main><section><h2>Approved reference — capture surface</h2><div class="frame reference"><img src="${ref}"></div></section><section><h2>Rendered MV3 extension — API fixtures only</h2><div class="frame actual"><img src="${actual}"></div></section></main><p>Same 1270 × 889 surface, displayed at 50%. Historical reference retains the removed preview. Current capture uses one column and local image previews; uploads remain unsupported. No live provider operations.</p>`;
await fs.writeFile(path.join(out,'comparison.html'),html);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{const page=await browser.newPage({viewport:{width:1318,height:540}});await page.goto(pathToFileURL(path.join(out,'comparison.html')).href);await page.screenshot({path:path.join(out,'12-reference-comparison.png')});}finally{await browser.close();}
