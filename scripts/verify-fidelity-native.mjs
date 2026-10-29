// Real MV3 extension, real storage/content script/window; provider API responses are isolated fixtures.
// No production credentials, network writes or provider authorizations are used.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const output=path.resolve('.tmp/fidelity-native'); await fs.mkdir(output,{recursive:true});
const executablePath=process.env.CHROME_PATH || path.resolve('.tmp/browsers/chromium-1243/chrome-win64/chrome.exe');
const context=await chromium.launchPersistentContext(path.resolve('.tmp/fidelity-native-profile'),{executablePath,headless:true,args:[`--disable-extensions-except=${path.resolve('extension')}`,`--load-extension=${path.resolve('extension')}`],viewport:{width:1440,height:1046}});
const errors=[],requests=[]; let imageCounter=0,imagePuts=0; let saveMode='success',delay=0,lastIntent={},states=null;
const title='10 Ways to Build a More Focused Workday';
const summary='Practical, science-backed strategies to reduce distractions, protect your attention, and get meaningful work done. These tips can help you create a calmer, more focused workday.';
const destination={id:'11111111-1111-1111-1111-111111111111',type:'data_source',title:'Knowledge Hub',url:null};
const prototype=await fs.readFile(path.join(process.env.KNOWVIA_REFERENCE_DIR || 'C:/Users/Ahmed/AppData/Local/Temp','06-REFERENCE-INTERACTIVE-PROTOTYPE.html'),'utf8');
const allImages=[...prototype.matchAll(/<img\b[^>]*>/g)].map(m=>m[0]);
const coverTag=allImages.find(tag=>/preview-img/.test(tag));
const cover=coverTag?.match(/src="([^"]+)"/)?.[1];
if(!cover?.startsWith('data:image/')) throw new Error('Reference cover missing; pass the approved prototype for matched-content comparison');
await context.route('**/*',async route=>{
 const url=new URL(route.request().url());
 if(url.protocol==='chrome-extension:') return route.continue();
 if(url.hostname==='uploads.example.test') {assert.equal(route.request().method(),'PUT');assert.ok(route.request().postDataBuffer().length>0);imagePuts++;return route.fulfill({status:200,body:''});}
 if(url.hostname==='capture.example.test') {
   if(url.pathname==='/cover.png') {const [,mime,data]=cover.match(/^data:([^;]+);base64,(.*)$/);return route.fulfill({contentType:mime,body:Buffer.from(data,'base64')});}
   return route.fulfill({contentType:'text/html',body:`<!doctype html><title>${title}</title><meta property="og:image" content="https://capture.example.test/cover.png"><article><h1>${title}</h1><p>${summary}</p><script type="application/json">{"not_article_script_marker":true}</script><style>.not_article_style_marker {color:blue}</style></article>`});
 }
 if(url.origin==='http://localhost:3000') {
  const endpoint=url.pathname.replace('/api/v1',''); const method=route.request().method();
  const body=route.request().postDataJSON();requests.push({endpoint,method,body});
  let data={},status=200;
  if(endpoint==='/images/uploads') data={uploadId:String(++imageCounter).padStart(24,'0'),uploadUrl:'https://uploads.example.test/'+imageCounter,headers:{'Content-Type':body.mimeType}};
  else if(/^\/images\/[a-f0-9]{24}\/complete$/.test(endpoint)) data={status:'uploaded'};
  else if(endpoint==='/content/projects') data=[{id:'inbox',name:'Inbox'},{id:'reading',name:'Reading'}];
  else if(endpoint==='/content/tags') data=['Productivity','Focus','Wellbeing'];
  else if(endpoint==='/User/preferences/me') data={email:'reader@example.test',weeklyEmailEnabled:true,receiveTelegramQuiz:false,telegramConnected:false};
  else if(endpoint==='/integrations/notion/status') data={connected:true,reconnectRequired:false,workspaceName:'Personal',workspaceIcon:null};
  else if(endpoint==='/integrations/notion/destination') data={destination};
  else if(endpoint==='/integrations/notion/destinations') data={destinations:[destination],hasMore:false,nextCursor:null};
  else if(endpoint==='/content') {
   if(delay) await new Promise(resolve=>setTimeout(resolve,delay));
   assert.equal(body.use_quiz,false);
   assert.equal(body.user_input, "");
   if(body.notionOptions) assert.ok(!body.notionOptions.tags.includes("productivity"));
   lastIntent=body.destinations;
   if(saveMode==='error') return route.fulfill({status:500,json:{status:'error',message:'Save unavailable. Please try again.'}});
   data={content:{_id:'aaaaaaaaaaaaaaaaaaaaaaaa',imageRetention:body.images?.retain,images:body.images?.uploadIds}};status=201;
  } else if(endpoint.endsWith('/sync-status')) data={contentId:'aaaaaaaaaaaaaaaaaaaaaaaa',...(states || Object.fromEntries(['ticktick','notion'].map(key=>[key,{requested:!!lastIntent[key]?.enabled,status:lastIntent[key]?.enabled?'synced':'not_requested',retryable:false}])))};
  else throw new Error('Unexpected API endpoint '+endpoint);
  return route.fulfill({status,json:{status:'success',data}});
 }
 return route.abort();
});
let page;
const screenshot=async name=>{await page.waitForTimeout(180);await page.screenshot({path:path.join(output,name+'.png')});};
try {
 const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker',{timeout:12000});
 const id=await worker.evaluate(()=>chrome.runtime.id);
 await worker.evaluate(async()=>{await chrome.storage.local.clear();await chrome.storage.local.set({sk_userId:'native-fixture-user',sk_token:'isolated-test-session',sk_signed_in:true,ticktick_connected:true,ticktick_theme:'light'});});
 const source=await context.newPage();await source.goto('https://capture.example.test/article');
 const tab=await worker.evaluate(async()=> (await chrome.tabs.query({})).find(tab=>tab.url==='https://capture.example.test/article'));
 assert.ok(tab?.id);
 await worker.evaluate(async tab=>{await chrome.windows.update(tab.windowId,{left:0,top:0,width:1000,height:700});},tab);
 await worker.evaluate(async tab=>{await showKnowviaWindow(tab);},tab);
 page=context.pages().find(p=>p.url().startsWith('chrome-extension://')) || await context.waitForEvent('page');
 page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(7000);
 await page.waitForURL(`chrome-extension://${id}/popup.html?sourceTab=${tab.id}`);
 await page.setViewportSize({width:1270,height:889});
 await page.waitForFunction(()=>document.getElementById('notionStatus').textContent==='Connected' && document.getElementById('ticktickStatusSecondary').textContent==='Connected');
 assert.equal(await page.locator('#title').inputValue(),title);
 assert.match(await page.locator('#rawText').inputValue(),/Practical, science-backed/);
 assert.doesNotMatch(await page.locator('#rawText').inputValue(),/not_article_script_marker|not_article_style_marker/);
 await page.locator('#rawText').fill(summary);
 assert.equal(await page.locator('#articlePreview, #previewImage').count(),0);
 await page.locator('#notionDestination').click();await page.locator('#connectTickTickFromSaveBtn').click();
 await page.locator('#projectSearchInput').fill('Inbox');await page.locator('#projectSearchInput').press('ArrowDown');await page.locator('#projectSearchInput').press('Enter');
 for(const tag of ['Productivity','Focus','Wellbeing']) {await page.locator('#addTagBtn').click();await page.locator('#tagInput').fill(tag);await page.locator('#tagInput').press('Enter');}
 await page.locator('#tagInput').press('Escape');await page.locator('.v2-intro h1').click();
 await page.locator('.main-scroll').evaluate(node=>node.scrollTop=0);
 assert.equal(await page.locator('#saveButtonLabel').textContent(),'Save capture');
 const geometry=await page.evaluate(()=>Object.fromEntries(['.v2-editor','#imageAttachments','#notionSaveConfig','#projectPickerBtn','#ticktickdueDate','#ticktickpriority','#appFooter'].map(selector=>{const b=document.querySelector(selector).getBoundingClientRect();return[selector,{x:b.x,y:b.y,width:b.width,height:b.height}]})));
 assert.equal(await page.locator('.capture-extras #imageAttachments').count(),1);
 assert.ok(geometry['.v2-editor'].width<=1040);
 for(const selector of ['#projectSearchInput','#chooseNotionSaveDestinationBtn','#notionTagInput']) assert.ok(await page.locator(selector).isVisible(),selector);
 assert.ok(await page.locator('#ticktickdueDate').isDisabled());assert.ok(await page.locator('#ticktickpriority').isDisabled());
 assert.ok(await page.locator('#chooseImagesBtn').isEnabled());
 const initialFit=await page.locator('.main-scroll').evaluate(node=>({height:node.clientHeight,content:node.scrollHeight}));
 assert.ok(initialFit.content<=initialFit.height+1, 'Normal 1270x889 capture fits without scrolling: '+JSON.stringify(initialFit));
 assert.ok((await page.locator('#imageAttachments').boundingBox()).height<=40, 'Empty images are a compact row');
 await screenshot('quality-layout-debug');
 const tickRow=await page.locator('[data-provider="ticktick"]').boundingBox();
 await page.locator('[data-provider="ticktick"]').scrollIntoViewIfNeeded();
 const visibleTick=await page.locator('[data-provider="ticktick"]').boundingBox();
 assert.ok(visibleTick.y+visibleTick.height<=geometry['#appFooter'].y, 'TickTick settings remain reachable above the footer');
 await screenshot('01-main');
 assert.equal(await page.locator('.v2-steps').count(),0);
 for (const size of [{width:1000,height:650},{width:1270,height:700},{width:1366,height:768},{width:1440,height:900},{width:1920,height:1080}]) {
  await page.setViewportSize(size);await page.locator('.main-scroll').evaluate(n=>n.scrollTop=0);
  await screenshot('density-'+size.width+'-'+size.height);
  const scroll=await page.locator('.main-scroll').evaluate(n=>({height:n.clientHeight,content:n.scrollHeight}));
  await page.locator('[data-provider="ticktick"]').scrollIntoViewIfNeeded();
  assert.ok(scroll.height>300, `Capture viewport remains usable: ${JSON.stringify(scroll)}`);
  const row=await page.locator('[data-provider="ticktick"]').boundingBox(), foot=await page.locator('#appFooter').boundingBox();
  await screenshot(`premium-wide-${size.width}`);
  assert.ok(row.y+row.height<=foot.y, `Destinations visible at ${size.width}x${size.height}: row bottom ${row.y+row.height}, footer ${foot.y}`);
 }
 await page.setViewportSize({width:1270,height:889});
 const arrow=page.locator('[data-provider="ticktick"] [data-move="-1"]');
 for(const state of ['normal','hover','focus']) {
  if(state==='hover') await arrow.hover();if(state==='focus') await arrow.focus();
  const a=await arrow.boundingBox(),b=await arrow.locator('svg').boundingBox();
  assert.ok(Math.abs(a.x+a.width/2-b.x-b.width/2)<.6 && Math.abs(a.y+a.height/2-b.y-b.height/2)<.6);
 }
 assert.equal(await page.locator('#selectedTagsContainer .tag-chip').count(),3);
 await page.locator('#notionTagInput').fill('Reference');await page.locator('#notionTagInput').press('Enter');
 assert.equal(await page.locator('#notionTagChips .tag-chip').count(),1);
 await screenshot('provider-manual-tags');
 assert.equal(await page.locator('.v2-ticktick-ai').count(),0);
 assert.equal(await page.locator('#useSummaryAi').isVisible(),false);
 await page.evaluate(()=>{document.getElementById('useSummaryAi').checked=true;document.getElementById('useTagsAi').checked=true;});
 await screenshot('provider-simplified');

 await page.locator('.v2-source summary').click();
 await page.locator('#url').fill('https://example.com/edited-source');
 assert.equal(await page.locator('#sourceHost').textContent(),'example.com');
 await screenshot('quality-source-edit');
 await page.locator('.v2-source summary').click();
 await page.locator('#notionDestination').click();await screenshot('quality-ticktick-only');
 await page.locator('#connectTickTickFromSaveBtn').click();await screenshot('quality-global-tags-no-providers');
 assert.equal(await page.locator('#tagsField').isVisible(),true);
 assert.equal(await page.locator('#selectedTagsContainer .tag-chip').count(),3);
 await page.locator('#notionDestination').click();await screenshot('quality-notion-only');
 await page.locator('#connectTickTickFromSaveBtn').click();

 await page.locator('[data-provider="ticktick"] .drag-handle').dragTo(page.locator('[data-provider="notion"]'));
 assert.equal(await page.locator('#destinationRows > article').first().getAttribute('data-provider'),'ticktick');
 await page.locator('[data-provider="ticktick"] [data-move="1"]').click();
 await page.locator('[data-provider="ticktick"] [data-move="-1"]').click();await page.locator('.main-scroll').evaluate(node=>node.scrollTop=0);await screenshot('02-ticktick-first');
 const selection=await page.locator('#notionDestination').getAttribute('aria-pressed');assert.equal(selection,'true');
 await page.locator('#managePlatformsBtn').click();await screenshot('03-platform-visibility');
 assert.equal(await page.locator('#visiblePlatformCount').textContent(),'2 of 2 visible');
 await page.locator('#showNotionPlatform').uncheck();assert.equal(await page.locator('#visiblePlatformCount').textContent(),'1 of 2 visible');
 await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'managePlatformsBtn');
 assert.equal(await page.locator('[data-provider="notion"]').isVisible(),false);
 await page.reload();await page.waitForFunction(()=>document.getElementById('notionStatus').textContent==='Connected');
 assert.equal(await page.locator('[data-provider="notion"]').isVisible(),false);
 assert.equal(await page.locator('#destinationRows > article').first().getAttribute('data-provider'),'ticktick');
 await page.locator('#managePlatformsBtn').click();await page.locator('#resetPlatformsBtn').click();await page.locator('#donePlatformsBtn').click();
 await page.locator('#tabSettings').click();await screenshot('04-settings');assert.equal(await page.locator('#openTelegramBotBtn').isVisible(),false);assert.equal(await page.locator('#email').isVisible(),false);await screenshot('04b-settings-bottom');
 for(const s of ['#reauthGoogleBtn','#email','#weeklyEmailToggle','#telegramQuizToggle','#connectTickTickBtn','#connectNotionBtn']) assert.equal(await page.locator(s).count(),1);
 for (const size of [{width:1000,height:650},{width:1270,height:700},{width:1366,height:768}]) {
  await page.setViewportSize(size);
  await screenshot(`density-settings-${size.width}`);
  const bounds=await page.locator('.main-scroll').evaluate(n=>({height:n.clientHeight,content:n.scrollHeight}));
  assert.ok(bounds.content<=bounds.height+1,`Settings should fit at ${size.width}x${size.height}: ${JSON.stringify(bounds)}`);
 }
 await page.setViewportSize({width:1270,height:889});
 assert.equal(await page.locator('#showNotionPlatform').isVisible(),true);await page.locator('#tabSave').click();
 await page.locator('.main-scroll').evaluate(n=>n.scrollTop=0);await screenshot('05-empty-images');assert.equal(await page.locator('#imageGrid').isVisible(),false);
 for(const width of [320,400,780,900]) {
   await page.setViewportSize({width,height:800});await page.locator('.main-scroll').evaluate(n=>n.scrollTop=0);await screenshot(`06-narrow-${width}`);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.locator('#notionTagInput').scrollIntoViewIfNeeded();const footer=await page.locator('#appFooter').boundingBox();assert.ok(footer.y+footer.height<=801);
   await page.locator('#managePlatformsBtn').click();const bounds=await page.locator('#platformVisibilityDialog').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width&&bounds.y>=0&&bounds.y+bounds.height<=801);await page.keyboard.press('Escape');
 }
 await page.setViewportSize({width:1270,height:889});

 const pngData=await page.evaluate(async src=>{
  const image=new Image();image.src=src;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  canvas.getContext('2d').drawImage(image,0,0);return canvas.toDataURL('image/png').split(',')[1];
 },cover);
 const png=Buffer.from(pngData,'base64');
 const chooser=page.waitForEvent('filechooser');await page.locator('#chooseImagesBtn').click();
 await (await chooser).setFiles({name:'Device image.png',mimeType:'image/png',buffer:png});
 await page.waitForFunction(()=>document.querySelectorAll('#imageGrid img').length===1);
 await screenshot('images-native-device');
 await page.evaluate(async bytes=>{
  await navigator.clipboard.write([new ClipboardItem({'image/png':new Blob([new Uint8Array(bytes)],{type:'image/png'})})]);
 },[...png]);
 await page.locator('#imageAttachments').focus();await page.keyboard.press('Control+v');
 await page.waitForFunction(()=>document.querySelectorAll('#imageGrid img').length===2);
 await screenshot('images-native-clipboard-paste');
 assert.equal(await page.locator('#pasteImageBtn').count(),0);
 assert.equal(await page.locator('#retainImages').count(),0);
 await page.evaluate(()=>navigator.clipboard.writeText('A normal pasted note.'));
 await page.locator('#rawText').fill('');await page.locator('#rawText').press('Control+v');
 await page.waitForFunction(()=>document.getElementById('rawText').value==='A normal pasted note.');
 assert.equal(await page.locator('#imageGrid img').count(),2);
 await page.locator('#notionDestination').click();
 assert.equal(await page.locator('.capture-extras #imageAttachments').count(),1);await page.locator('#imageAttachments').scrollIntoViewIfNeeded();await screenshot('native-notion-images-selected');
 await page.locator('#notionDestination').click();assert.equal(await page.locator('#imageGrid img').count(),2);
 await page.locator('#saveArticleBtn').click();
 await page.waitForFunction(()=>document.getElementById('statusText').textContent==='Saved to Knowvia.');
 assert.equal(imagePuts,2);assert.equal(requests.filter(r=>r.endpoint==='/content').at(-1).body.images.uploadIds.length,2);
 assert.equal(requests.filter(r=>r.endpoint==='/content').at(-1).body.images.retain,true);
 assert.equal(await page.locator('.image-save-result').count(),0);
 await screenshot('native-retained-images-confirmed');
 assert.equal(await page.locator('#imageGrid img').count(),0);
 assert.equal(await page.locator('#saveArticleBtn').isDisabled(),true);
 await page.locator('#rawText').fill('A new draft.');await page.locator('#title').fill('');await page.locator('#saveArticleBtn').click();assert.equal(await page.locator('#titleError').isVisible(),true);await screenshot('07-validation');
 await page.locator('#title').fill(title);await page.locator('#rawText').fill(summary);
 saveMode='error';await page.locator('#saveArticleBtn').click();await page.waitForFunction(()=>document.getElementById('statusText').textContent.includes('Save unavailable'));await screenshot('08-save-error');assert.equal(await page.locator('#title').inputValue(),title);
 await page.locator('#notionDestination').click();await page.locator('#connectTickTickFromSaveBtn').click();
 await page.locator('#projectSearchInput').fill('Inbox');await page.locator('#projectSearchInput').press('ArrowDown');await page.locator('#projectSearchInput').press('Enter');
 saveMode='success';delay=700;states={ticktick:{requested:true,status:'synced',retryable:false},notion:{requested:true,status:'failed',retryable:true}};
 const before=requests.filter(r=>r.endpoint==='/content').length;
 await page.locator('#saveArticleBtn').click();await page.waitForFunction(()=>document.getElementById('saveArticleBtn').getAttribute('aria-busy')==='true');await screenshot('09-saving');
 await page.keyboard.press('Control+s');await page.waitForFunction(()=>document.getElementById('notionSyncState').textContent==="Couldn't save");await page.locator('#syncReceipt').scrollIntoViewIfNeeded();await screenshot('10-partial-success');
 assert.equal(requests.filter(r=>r.endpoint==='/content').length,before+1);assert.equal(await page.locator('#ticktickSyncState').textContent(),'TickTick ✓');assert.equal(await page.locator('#notionSyncState').textContent(),"Couldn't save");
 states={ticktick:{requested:true,status:'synced',retryable:false},notion:{requested:true,status:'synced',retryable:false}};
 await page.locator('#refreshSyncStatusBtn').click();await page.waitForFunction(()=>document.getElementById('notionSyncState').textContent==='Notion ✓');await screenshot('11-confirmed-success');
 assert.deepEqual(errors,[]);
 const capturePage=page;
 page=await context.newPage();
 await page.addInitScript(()=>{
  const get=chrome.storage.local.get.bind(chrome.storage.local), until=Date.now()+900;
  chrome.storage.local.get=(keys,callback)=>{const pending=new Promise(resolve=>setTimeout(resolve,Math.max(0,until-Date.now()))).then(()=>get(keys));if(callback)pending.then(callback);return pending;};
 });
 await page.goto(`chrome-extension://${id}/popup.html?sourceTab=${tab.id}`,{waitUntil:'domcontentloaded'});
 assert.equal(await page.locator('#bootShell').isVisible(),true);
 await screenshot('premium-initial-shell');
 await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-booting'));
 await screenshot('premium-initialized');
 assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(245, 248, 251)');
 await page.close();page=capturePage;
 await page.evaluate(()=>localStorage.setItem('knowvia_paint_theme','dark'));
 await worker.evaluate(()=>chrome.storage.local.set({ticktick_theme:'dark',sk_signed_in:false,sk_token:null,sk_userId:null}));
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForSelector('#onboardingView',{state:'visible'});
 assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(13, 22, 38)');
 await screenshot('premium-dark-onboarding');
 await fs.writeFile(path.join(output,'evidence.json'),JSON.stringify({runtime:'Real MV3, content script, chrome.storage and capture window. API fixtures; no live OAuth/provider writes.',geometry,errors,checks:['source tab capture','inline fields','unsupported fields disabled','reorder and persistence','visibility exclusion','full settings','no-image compact preview','320/400/780/900 responsiveness','field errors','save failure draft preservation','single save request','partial and confirmed progress']},null,2));
 console.log('PASS real MV3 fidelity flow. Screenshots: '+output);
} finally {await context.close();}
