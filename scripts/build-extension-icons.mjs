import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage();
const svg=await readFile('extension/assets/knowvia-mark.svg','utf8');
for(const size of [16,32,48,128]) {
 const result=await page.evaluate(async ({svg,size})=>{
  const image=new Image();image.src='data:image/svg+xml;base64,'+btoa(svg);await image.decode();
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const ctx=canvas.getContext('2d');const width=size*32/36;ctx.drawImage(image,(size-width)/2,0,width,size);
  return {png:canvas.toDataURL('image/png').split(',')[1],cornerAlpha:ctx.getImageData(0,0,1,1).data[3]};
 },{svg,size});
 await writeFile(`extension/icons/icon${size}.png`,Buffer.from(result.png,'base64'));
 console.log(`${size}px icon: corner alpha ${result.cornerAlpha}`);
}
await browser.close();
