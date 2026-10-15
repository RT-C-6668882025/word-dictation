const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4186','--strictPort'],{stdio:'inherit'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:4186')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 browser=await chromium.launch();const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));let external=false;page.on('request',r=>{if(r.url().includes('example.invalid'))external=true});
 const data={pages:[{id:'first',title:'概念与示例',columns:2,visible_count:2,entries:[{id:'a',visible_count:1,blocks:[{id:'prompt',label:'问题',text:'机会成本是什么？'},{id:'hint',label:'提示',text:'被放弃的选择'},{id:'answer',label:'解析',text:'放弃的最佳替代方案的价值。'}]},{id:'b',visible_count:1,blocks:[{text:'日本語 العربية\n不限语言'}]},{id:'c',blocks:[{text:'第三条隐藏内容'}]}]},{id:'long',title:'长内容',entries:[{id:'long-entry',visible_count:1,blocks:[{text:'长段落测试。\n'.repeat(100)},{text:'```js\nconst value = 42;\n```\n\n$$a^2+b^2=c^2$$\n\n<script>window.pageExecuted=true</script>\n\n![图片](https://example.invalid/track.png)',format:'markdown'}]}]},{id:'last',title:'第三页',entries:[{blocks:[{text:'最后一页'}]}]}]};
 fs.mkdirSync('layout-checks',{recursive:true});
 const swipe=async(dy)=>page.locator('.pageViewport').evaluate((el,dy)=>{const rect=el.getBoundingClientRect(),x=rect.left+20,y=rect.top+150;el.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[new Touch({identifier:1,target:el,clientX:x,clientY:y})]}));el.dispatchEvent(new TouchEvent('touchend',{bubbles:true,changedTouches:[new Touch({identifier:1,target:el,clientX:x,clientY:y+dy})]}))},dy);
 for(const [width,height] of [[360,780],[412,915],[800,1280],[1280,800],[844,390]]){
  await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:4186');await page.evaluate(()=>localStorage.clear());await page.reload();
  assert.equal(await page.locator('#pageSize').count(),0);await page.locator('#bookName').fill('自由页面'.repeat(20));await page.locator('#raw').fill(JSON.stringify(data));await page.getByRole('button',{name:'创建词库',exact:true}).click();
  await page.locator('.pageViewport').waitFor();assert.equal(await page.locator('.contentEntry').count(),2);assert.equal(await page.getByText('放弃的最佳替代方案的价值。',{exact:true}).count(),0);
  assert.equal(await page.getByText('正面',{exact:true}).count(),0);assert.equal(await page.getByText('背面',{exact:true}).count(),0);
  await page.getByRole('button',{name:'显示内容块 3',exact:true}).click();assert(await page.getByText('放弃的最佳替代方案的价值。',{exact:true}).isVisible());
  await page.getByRole('button',{name:'隐藏内容块 3',exact:true}).click();assert.equal(await page.getByText('放弃的最佳替代方案的价值。',{exact:true}).count(),0);
  await page.getByRole('spinbutton',{name:'显示条数',exact:true}).fill('3');assert.equal(await page.locator('.contentEntry').count(),3);
  await page.getByRole('button',{name:'移出白名单：机会成本是什么？',exact:true}).click();assert.equal(await page.locator('.entryNeed').first().getAttribute('aria-pressed'),'true');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow '+width);
  assert(await page.locator('.pageViewport').evaluate(e=>e.clientHeight>80),'study viewport too small '+width);
  await page.screenshot({path:'layout-checks/pages-'+width+'x'+height+'.png',fullPage:true});
  await page.locator('.pageViewport').evaluate(e=>e.scrollTop=e.scrollHeight);await swipe(-130);await page.getByRole('heading',{name:'长内容',exact:true}).waitFor();
  await swipe(-130);assert.equal(await page.locator('.pageNavigation [role=status]').textContent(),'2 / 3','long content skipped');
  await page.getByRole('button',{name:'显示内容块 2',exact:true}).click();await page.locator('.katex').first().waitFor();assert.equal(await page.locator('pre code').count(),1);assert.equal(await page.evaluate(()=>window.pageExecuted),undefined);assert.equal(external,false);
  await page.locator('.pageViewport').evaluate(e=>e.scrollTop=e.scrollHeight);await swipe(-130);await page.getByRole('heading',{name:'第三页',exact:true}).waitFor();
  await swipe(130);await page.getByRole('heading',{name:'长内容',exact:true}).waitFor();
  await page.locator('.homeBtn').click();await page.locator('.book').click();await page.getByRole('heading',{name:'长内容',exact:true}).waitFor();assert.equal(await page.locator('.pageNavigation [role=status]').textContent(),'2 / 3');
  await page.locator('.pageViewport').focus();await page.keyboard.press('PageDown');await page.getByRole('heading',{name:'第三页',exact:true}).waitFor();
 }
 // Old data retains its exact content, page boundaries and membership.
 await page.evaluate(()=>{localStorage.clear();localStorage.setItem('wd_books_v2',JSON.stringify([{id:'old',name:'旧词库',pageSize:2,words:[{id:'a',en:'A',zh:'甲'},{id:'b',en:'B',zh:'乙'},{id:'c',en:'C',zh:'丙'}],whitelist:{0:['b'],1:['c']}}]))});await page.reload();await page.locator('.book').click();assert.equal(await page.locator('.contentEntry').count(),2);assert.equal(await page.locator('.entryNeed').first().getAttribute('aria-pressed'),'true');await page.getByRole('button',{name:'下一页 ↓',exact:true}).click();assert.equal(await page.locator('.contentEntry').count(),1);assert(await page.getByText('C',{exact:true}).isVisible());
 assert.deepEqual(errors,[]);console.log('PASS page UI: 5 viewports, variable page size, arbitrary blocks, visibility, white-list, safe Markdown, touch/keyboard paging, long-page boundaries, progress and legacy data');
}finally{await browser?.close();server.kill()}})().catch(e=>{console.error(e);process.exitCode=1});
