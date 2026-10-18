const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4186','--strictPort'],{stdio:'inherit'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:4186')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 browser=await chromium.launch();const page=await browser.newPage({hasTouch:true});const cdp=await page.context().newCDPSession(page),errors=[];page.on('pageerror',e=>errors.push(e.message));
 fs.mkdirSync('layout-checks',{recursive:true});const active=()=>page.locator('.snapPage.isActive');
 const status=async n=>page.waitForFunction(n=>document.querySelector('.pageNavigation [role=status]').textContent.startsWith(n+' /'),n);
 const open=async(raw,width,height)=>{await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:4186');await page.evaluate(()=>localStorage.clear());await page.reload();await page.locator('#raw').fill(raw);await page.getByRole('button',{name:'创建词库',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.snapPage.isActive .contentEntry')&&document.querySelectorAll('.snapPage').length>1)};
 const words=Array.from({length:122},(_,i)=>`word${i+1},meaning${i+1}`).join('\n');
 let phoneAmount=0;
 for(const [width,height] of [[412,780],[800,1280]]){
  await open(words,width,height);
  const amount=await active().locator('.contentEntry').count();assert(amount>1&&amount<122,`one swipe must show several of 122 words, got ${amount}`);
  if(width===412)phoneAmount=amount;else assert(amount>phoneAmount,'tablet must fit more words than phone');
  assert.equal(await page.getByRole('button',{name:'整页看',exact:true}).count(),0);
  assert(await page.locator('.pageViewport').evaluate(e=>e.clientHeight>80));
  const first=active().locator('.contentEntry').first();assert.equal(await first.locator('.hiddenBlock,.hideBlock').count(),0);await first.getByRole('button',{name:'显示内容块 2'}).click();await first.getByText('meaning1',{exact:true}).waitFor();await first.getByRole('button',{name:'隐藏内容块 2'}).click();assert.equal(await first.getByText('meaning1',{exact:true}).count(),0);
  await page.getByRole('button',{name:'右侧显示（长按切换动作）'}).click();await first.getByText('meaning1',{exact:true}).waitFor();
  const right=page.locator('.bulkToggle').last();await right.hover();await page.mouse.down();await page.waitForTimeout(620);await page.mouse.up();await page.getByRole('button',{name:'右侧隐藏（长按切换动作）'}).click();assert.equal(await first.getByText('meaning1',{exact:true}).count(),0);
  await page.getByRole('button',{name:'左侧隐藏（长按切换动作）'}).click();assert.equal(await first.getByText('word1',{exact:true}).count(),0);
  const left=page.locator('.bulkToggle').first();await left.hover();await page.mouse.down();await page.waitForTimeout(620);await page.mouse.up();await page.getByRole('button',{name:'左侧显示（长按切换动作）'}).click();await first.getByText('word1',{exact:true}).waitFor();
  await first.getByRole('button',{name:'朗读 word1',exact:true}).tap();
  await page.screenshot({path:`layout-checks/swipe-${width}x${height}.png`});
  if(width===412){const r=await page.locator('.pageViewport').boundingBox(),x=r.x+r.width*.6,y=r.y+r.height*.8;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=12;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-r.height*.55*i/12}]});await page.waitForTimeout(20)}assert(await page.locator('.pageViewport').evaluate(e=>e.scrollTop)>15,'page follows the finger');await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}
  await page.getByRole('button',{name:'下一页 ↓',exact:true}).click();await status(2);
  assert.equal(await active().getByText('word1',{exact:true}).count(),0,'next swipe advances the group');
  await page.getByRole('button',{name:'打开学习菜单'}).click();await page.getByRole('button',{name:'索引',exact:true}).click();await page.locator('.indexRow').last().click();await active().getByText('word122',{exact:true}).waitFor();
 }
 // Agent-authored pages use the same viewport grouping, even if the source page
 // claims that only one of its many entries is visible.
 const data={pages:[{id:'unit',title:'Unit 1',columns:2,visible_count:1,entries:Array.from({length:30},(_,i)=>({id:'a'+i,blocks:[{text:'entry'+i},{text:'answer'+i}]}))}]};
 await open(JSON.stringify(data),800,1280);
 assert(await active().locator('.contentEntry').count()>1,'Agent page must not collapse to one entry');
 assert(await page.locator('.snapPage').count()>1,'long Agent page must produce multiple swipe pages');
 assert.equal(await active().locator('.composedGrid').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length),1,'tablet swipe page uses full width');
 await page.getByRole('button',{name:'下一页 ↓',exact:true}).click();await status(2);
 await page.goto('http://127.0.0.1:4186/pager.html');await page.waitForFunction(()=>typeof window.receiveStudyPage==='function');
 await page.evaluate(()=>{window.nativeActions=[];window.StudyPageHost={postMessage:raw=>window.nativeActions.push(JSON.parse(raw))};window.receiveStudyPage({page:{id:'native',columns:1,word_ids:['n']},entries:[{id:'n',needed:true,blocks:[{id:'q',text:'本地问题'},{id:'a',text:'本地答案'}],visible_count:1}],scope:'all',count:null,reset:0})});
 await page.getByRole('button',{name:'显示内容块 2'}).click();await page.getByText('本地答案',{exact:true}).waitFor();await page.getByRole('button',{name:'朗读 本地问题'}).click();assert.deepEqual((await page.evaluate(()=>window.nativeActions)).at(-1),{action:'speak',value:'本地问题'});
 assert.deepEqual(errors,[]);console.log('PASS viewport grouping, tablet swipe, touch drag, index, blocks and native renderer');
}finally{await browser?.close();server.kill()}})().catch(e=>{console.error(e);process.exitCode=1});
