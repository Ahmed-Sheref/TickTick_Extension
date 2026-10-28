import { chromium } from 'playwright';
import path from 'node:path';
const extension=path.resolve('extension');
const context=await chromium.launchPersistentContext(path.resolve('.tmp/v2-extension-profile'),{headless:true,executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],viewport:{width:780,height:600}});
try {
 const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker',{timeout:7000});
 const id=await worker.evaluate(()=>chrome.runtime.id);
 const page=await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`chrome-extension://${id}/popup.html`);
 await page.waitForSelector('#onboardingView',{state:'visible'});
 console.log(JSON.stringify({extensionRuntime:true,errors,logo:await page.locator('.v2-wordmark').evaluateAll(images=>images.length>0 && images.every(image=>image.complete && image.naturalWidth>0))}));
 await page.screenshot({path:'.tmp/knowvia-ui/v2-real-extension.png'});
} catch(e) {console.log('Extension runtime unavailable in installed Chrome: '+e.message);process.exitCode=2;} finally {await context.close();}
