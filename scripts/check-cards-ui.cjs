const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4185','--strictPort'],{stdio:'inherit'});let browser;
try{for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:4185')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 browser=await chromium.launch();const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const cards=[{front:'日本語の質問',back:'日本語の答え'},{front:'机会成本是什么？',back:'放弃的最佳替代方案的价值。'},{front:'ما هي الذاكرة؟',back:'القدرة على تذكر المعلومات'},{front:'解释这个概念。\n注意条件。',back:'这是完整的长段落。'.repeat(150)+'\n第二段。'},{front:'代码与公式',back:'```js\nconst veryLongName = "'+ 'a'.repeat(200)+'";\n```\n\n$$a^2+b^2=c^2$$\n\n- 第一点\n- 第二点',format:'markdown'},{front:'安全内容',back:'<script>window.cardExecuted=true</script>\n\n[链接](javascript:alert(1))\n\n![图片](https://example.invalid/track.png)',format:'markdown'}];
 let imageFetch=false;page.on('request',r=>{if(r.url().includes('example.invalid'))imageFetch=true});
 fs.mkdirSync('layout-checks',{recursive:true});
 for(const width of [360,412,800,1280]){
  await page.setViewportSize({width,height:900});await page.goto('http://127.0.0.1:4185');await page.evaluate(()=>localStorage.clear());await page.reload();
  await page.locator('#bookName').fill('通用记忆');await page.locator('#raw').fill(JSON.stringify(cards));await page.getByRole('button',{name:'创建词库',exact:true}).click();
  await page.locator('.seg button').nth(2).click();await page.locator('.katex').first().waitFor();await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('.card').count(),6);assert.equal(await page.locator('.answer').nth(3).textContent(),cards[3].back);
  assert.equal(await page.locator('.answer').nth(4).locator('pre code').count(),1);assert.equal(await page.evaluate(()=>window.cardExecuted),undefined);assert.equal(imageFetch,false);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow '+width);
  assert(await page.locator('.card').evaluateAll(els=>els.every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1})),'card overflow');
  const geometry=()=>page.locator('.card').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();const f=e.querySelector('.englishCell').getBoundingClientRect(),b=e.querySelector('.answer').getBoundingClientRect();return[r.x,r.y,r.width,r.height,f.x,f.y,f.width,b.x,b.y,b.width]}));
  const all=await geometry();
  for(const i of [0,1,2]){await page.locator('.seg button').nth(i).click();assert.deepEqual(await geometry(),all,'flip moved layout');}
  assert(await page.locator('.frontContent').evaluateAll(els=>els.every(e=>getComputedStyle(e).fontSize===getComputedStyle(e.closest('.word').querySelector('.answer')).fontSize)),'inconsistent font size');
  await page.screenshot({path:'layout-checks/cards-'+width+'.png',fullPage:true});
 }
 assert.deepEqual(errors,[]);console.log('PASS generic cards: 4 viewports, multilingual/long/Markdown/code/formula, safe rendering and stable layout');
}finally{await browser?.close();server.kill()}})().catch(e=>{console.error(e);process.exitCode=1});
