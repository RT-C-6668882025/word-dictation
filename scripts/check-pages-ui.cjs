const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4186','--strictPort'],{stdio:'inherit'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:4186')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 browser=await chromium.launch();const context=await browser.newContext({hasTouch:true});const page=await context.newPage();const cdp=await context.newCDPSession(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));let external=false;page.on('request',r=>{if(r.url().includes('example.invalid'))external=true});
 const data={pages:[{id:'first',title:'概念与示例',columns:1,visible_count:2,entries:[{id:'a',visible_count:1,blocks:[{id:'prompt',text:'机会成本是什么？'},{id:'hint',text:'被放弃的选择'},{id:'answer',text:'放弃的最佳替代方案的价值。'}]},{id:'b',visible_count:1,blocks:[{text:'日本語 العربية'}]},{id:'c',blocks:[{text:'第三条隐藏内容'}]}]},{id:'long',title:'长内容',entries:[{id:'long-entry',visible_count:1,blocks:[{text:'长段落测试。\n'.repeat(100)},{text:'```js\nconst value = 42;\n```\n\n$$a^2+b^2=c^2$$\n\n<script>window.pageExecuted=true</script>\n\n![图片](https://example.invalid/track.png)',format:'markdown'}]}]},{id:'last',title:'第三页',entries:[{blocks:[{text:'最后一页'}]}]}]};
 fs.mkdirSync('layout-checks',{recursive:true});
 const active=()=>page.locator('.snapPage.isActive');
 const status=async n=>page.waitForFunction(n=>document.querySelector('.pageNavigation [role=status]').textContent.startsWith(n+' /'),n);
 const drag=async(fraction,release=true)=>{const r=await page.locator('.pageViewport').boundingBox(),x=r.x+r.width*.6,y=r.y+r.height*.8;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=12;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-r.height*fraction*i/12}]});await page.waitForTimeout(20)}if(release)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});return r};
 for(const [width,height] of [[360,780],[412,915],[800,1280],[1280,800],[844,390]]){
  await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:4186');await page.evaluate(()=>localStorage.clear());await page.reload();await page.locator('#bookName').fill('紧凑排版'.repeat(20));await page.locator('#raw').fill(JSON.stringify(data));await page.getByRole('button',{name:'创建词库',exact:true}).click();await status(1);
  assert.equal(await active().locator('.contentEntry').count(),1,'default feed shows one entry per screen');
  await page.getByRole('button',{name:'整页看',exact:true}).click();await status(1);
  assert.equal(await active().locator('.contentEntry').count(),2);assert.equal(await active().getByText('内容 1',{exact:true}).count(),0);assert.equal(await active().getByText('点击显示',{exact:true}).count(),0);
  assert(await active().locator('.contentEntry').first().evaluate(e=>e.getBoundingClientRect().height<220),'short entries should fit without a full-screen scroll');
  await active().getByRole('button',{name:'显示内容块 3',exact:true}).click();await active().getByText('放弃的最佳替代方案的价值。',{exact:true}).waitFor();await active().getByRole('button',{name:'隐藏内容块 3',exact:true}).click();assert.equal(await active().getByText('放弃的最佳替代方案的价值。',{exact:true}).count(),0);
  // Touch controls must work at tablet widths without a preceding hover.
  const first=active().locator('.contentEntry').first();
  const hidePrompt=first.getByRole('button',{name:'隐藏内容块 1',exact:true});
  assert.equal(await hidePrompt.evaluate(e=>getComputedStyle(e).opacity),'1');
  assert(await hidePrompt.evaluate(e=>e.getBoundingClientRect().width>=40&&e.getBoundingClientRect().height>=40));
  await hidePrompt.tap();assert.equal(await first.locator('.blockText').filter({hasText:'机会成本是什么？'}).count(),0);
  await first.getByRole('button',{name:'显示内容块 1',exact:true}).tap();await first.getByText('机会成本是什么？',{exact:true}).waitFor();
  await page.getByRole('spinbutton',{name:'显示条数',exact:true}).fill('3');assert.equal(await active().locator('.contentEntry').count(),3);
  await active().getByRole('button',{name:'移出白名单：机会成本是什么？',exact:true}).click();assert.equal(await active().locator('.entryNeed').first().getAttribute('aria-pressed'),'true');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow '+width);assert(await page.locator('.pageViewport').evaluate(e=>e.clientHeight>80),'viewport too small');
  await page.screenshot({path:'layout-checks/compact-'+width+'x'+height+'.png',fullPage:true});
  if(width===412){
   await active().locator('.pageScroller').evaluate(e=>e.scrollTop=e.scrollHeight);
   const r=await drag(.45,false);const offset=await page.locator('.pageViewport').evaluate(e=>e.scrollTop);assert(offset>15&&offset<r.height,'page must move BEFORE touch release');
   const next=await page.locator('.snapPage').nth(1).boundingBox();assert(next.y<r.y+r.height,'adjacent page must be visible during drag');await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(700);
  }
  await page.getByRole('button',{name:'下一页 ↓',exact:true}).click().catch(()=>{});await page.waitForTimeout(700);
  // Select page 2 deterministically after the real gesture assertion.
  await page.locator('.pageViewport').evaluate(e=>e.scrollTo({top:e.clientHeight,behavior:'instant'}));await status(2);
  await active().getByRole('button',{name:'显示内容块 2',exact:true}).click();await active().locator('.katex').first().waitFor();assert.equal(await active().locator('pre code').count(),1);assert.equal(await page.evaluate(()=>window.pageExecuted),undefined);assert.equal(external,false);
  await active().locator('.pageScroller').evaluate(e=>e.scrollTop=0);const before=await page.locator('.pageViewport').evaluate(e=>e.scrollTop);if(width===412){await drag(.3);await page.waitForTimeout(500);assert(Math.abs(await page.locator('.pageViewport').evaluate(e=>e.scrollTop)-before)<5,'long page reading must not skip to next page')}
  await page.getByRole('button',{name:'下一页 ↓',exact:true}).click();await status(3);await page.getByRole('button',{name:'↑ 上一页',exact:true}).click();await status(2);
  await page.locator('.homeBtn').click();await page.locator('.book').click();await status(2);
  if(width===360){await page.getByRole('button',{name:'索引',exact:true}).click();await page.locator('.indexRow').nth(2).click();await active().locator('[data-entry-id=c]').waitFor();assert.equal(await active().locator('.contentEntry').count(),3)}
 }
 // Exercise the same local page renderer used inside each native ViewPager2 page.
 await page.goto('http://127.0.0.1:4186/pager.html');await page.waitForFunction(()=>typeof window.receiveStudyPage==='function');
 await page.evaluate(()=>{window.nativeActions=[];window.StudyPageHost={postMessage:raw=>window.nativeActions.push(JSON.parse(raw))};window.receiveStudyPage({page:{id:'native',title:'原生页内容',columns:1,word_ids:['n']},entries:[{id:'n',needed:true,blocks:[{id:'q',text:'本地问题'},{id:'a',text:'本地答案'}],visible_count:1}],scope:'all',count:null,reset:0})});
 await page.getByText('本地问题',{exact:true}).waitFor();await page.getByRole('button',{name:'显示内容块 2'}).click();await page.getByText('本地答案',{exact:true}).waitFor();await page.getByRole('button',{name:'移出白名单：本地问题'}).click();assert.equal((await page.evaluate(()=>window.nativeActions))[0].value,'n');
 // Speaking always targets the first block, even after revealing the answer or hiding the prompt.
 await page.getByRole('button',{name:'朗读 本地问题',exact:true}).tap();
 assert.deepEqual((await page.evaluate(()=>window.nativeActions)).at(-1),{action:'speak',value:'本地问题'});
 assert.equal(await page.locator('.contentBlock').first().locator('.entrySpeak').count(),1);
 assert.equal(await page.locator('.contentBlock').nth(1).locator('.entrySpeak').count(),0);
 await page.getByRole('button',{name:'隐藏内容块 1',exact:true}).tap();
 await page.getByRole('button',{name:'朗读 本地问题',exact:true}).tap();
 assert.deepEqual((await page.evaluate(()=>window.nativeActions)).at(-1),{action:'speak',value:'本地问题'});
 await page.getByRole('button',{name:'显示内容块 1',exact:true}).tap();await page.getByText('本地问题',{exact:true}).waitFor();
 assert.deepEqual(errors,[]);console.log('PASS compact pages: 5 viewports, real finger drag before release, adjacent page, snap, long content, blocks, whitelist, index/progress and native local renderer');
}finally{await browser?.close();server.kill()}})().catch(e=>{console.error(e);process.exitCode=1});
