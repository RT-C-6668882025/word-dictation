const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const server=spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4182'],{stdio:'inherit'});let browser;
 try{
  for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:4182')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--no-zygote','--single-process','--disable-gpu','--disable-software-rasterizer']}: {})});
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:4182');
  await page.evaluate(()=>{const words=Array.from({length:25},(_,i)=>({id:'w'+i,en:'word'+i,zh:'释义'+i}));localStorage.setItem('wd_books_v2',JSON.stringify([{id:'a',name:'白名单交互检查',pageSize:10,words,whitelist:{'0':words.slice(0,10).map(w=>w.id),'1':words.slice(10,20).map(w=>w.id),'2':words.slice(20).map(w=>w.id)}},{id:'b',name:'另一词库',pageSize:10,words:[{id:'other',en:'other',zh:'其他'}],whitelist:{'0':['other']}}]))});
  await page.reload();if(process.env.TEST_FONT_CSS){await page.addStyleTag({path:process.env.TEST_FONT_CSS});await page.evaluate(()=>document.fonts.ready)}
  await page.locator('.book').first().click();await page.locator('.countControl button').getByText('10',{exact:true}).click();await page.locator('.seg button').getByText('英文',{exact:true}).click();
  const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('wd_books_v2')));
  const ids=()=>page.locator('.num').allTextContents();const refresh=()=>page.getByRole('button',{name:'刷新当前页',exact:true}).click();
  const snapshot=await ids();
  await page.locator('.need').first().click();assert.deepEqual(await ids(),snapshot);assert.equal(await page.locator('.need').first().getAttribute('aria-pressed'),'true');
  assert(!(await saved())[0].whitelist['0'].includes('w0'));
  await page.locator('.need').first().click();assert.deepEqual(await ids(),snapshot);assert.equal(await page.locator('.need').first().getAttribute('aria-pressed'),'false');
  assert((await saved())[0].whitelist['0'].includes('w0'));
  await page.locator('.need').nth(1).click();
  const cdp=await context.newCDPSession(page);
  const gesture=async(dx,dy,cancel=false)=>{
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:8,y:240}]});
   for(let i=1;i<=10;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:8+dx*i/10,y:240+dy*i/10}]});
   await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});await page.waitForTimeout(80);
  };
  await page.evaluate(()=>scrollTo(0,0));await gesture(0,35);assert.deepEqual(await ids(),snapshot,'short pull refreshed');
  await gesture(110,10);assert.deepEqual(await ids(),snapshot,'horizontal swipe refreshed');
  await gesture(0,120,true);assert.deepEqual(await ids(),snapshot,'cancelled gesture refreshed');
  await page.evaluate(()=>scrollTo(0,500));await gesture(0,120);assert.deepEqual(await ids(),snapshot,'normal scrolling refreshed');
  await page.evaluate(()=>scrollTo(0,0));await gesture(0,120);
  assert.deepEqual(await ids(),['001','003','004','005','006','007','008','009','010']);assert.equal(await page.locator('.word.view-en').count(),9);
  assert.equal(await page.locator('.countControl button.on').innerText(),'10');
  await page.locator('.headerActions button').filter({hasText:'下一页'}).click();
  await page.locator('.need').first().click();assert.equal(await page.locator('.card').count(),10);await refresh();
  assert.equal((await ids())[0],'012');assert((await page.locator('.headerTitle span').innerText()).includes('第 2/3 页'));
  // Every marked card stays available for an immediate undo before refreshing.
  for(let i=0;i<9;i++)await page.locator('.need').nth(i).click();
  assert.equal(await page.locator('.need[aria-pressed="true"]').count(),9);assert.equal(await page.locator('.card').count(),9);
  await page.locator('.need').first().click();assert.equal(await page.locator('.need[aria-pressed="true"]').count(),8);
  await page.locator('.need').first().click();await refresh();assert.equal(await page.locator('.card').count(),0);
  await page.getByRole('button',{name:'查看本页全部单词',exact:true}).click();assert.equal(await page.locator('.card').count(),10);assert.equal(await page.locator('.need[aria-pressed="true"]').count(),10);
  await page.locator('.need').first().click();assert.equal(await page.locator('.card').count(),10);await refresh();assert.equal(await page.locator('.card').count(),10,'all-words view lost excluded words');
  await page.locator('.scopeControl button').getByText('白名单',{exact:true}).click();assert.deepEqual(await ids(),['011']);
  assert.deepEqual((await saved())[0].whitelist['1'],['w10']);assert.deepEqual((await saved())[1].whitelist,{'0':['other']});
  assert(!/已会|已掌握|全部会背|完成并/.test(await page.locator('main').innerText()));
  fs.mkdirSync('layout-checks',{recursive:true});
  // All dismissal routes, short landscape, focus isolation, and post-close interaction.
  for(const [width,height] of [[390,844],[800,1280],[1280,800],[844,390]]){
   await page.setViewportSize({width,height});await page.getByRole('button',{name:'语音设置',exact:true}).click();
   assert(await page.locator('.voiceDialog').evaluate(e=>e.open));
   const box=await page.locator('.voiceDialog').boundingBox();assert(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1);
   await page.keyboard.press('Tab');assert(await page.locator('.voiceDialog').evaluate(e=>e.contains(document.activeElement)));
   await page.screenshot({path:`layout-checks/voice-${width}.png`});
   await page.getByRole('button',{name:'关闭语音设置',exact:true}).click();assert.equal(await page.locator('.voiceDialog').count(),0);
   await page.getByRole('button',{name:'语音设置',exact:true}).click();await page.mouse.click(3,3);assert.equal(await page.locator('.voiceDialog').count(),0,'backdrop did not close');
   await page.getByRole('button',{name:'语音设置',exact:true}).click();await page.keyboard.press('Escape');assert.equal(await page.locator('.voiceDialog').count(),0,'Escape did not close');
   assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
   await refresh();assert.deepEqual(await ids(),['011']);
  }
  const before=await saved();await page.reload();assert.deepEqual(await saved(),before);
  await page.locator('.book').first().click();assert(!(await ids()).includes('002'),'removed word returned after restart');
  assert.deepEqual(errors,[]);
  console.log('PASS mark/unmark without movement, saved membership, real touch pull/short/cancel/scroll guards, refresh state, empty/all/add-back, persistence, and modal close/backdrop/Escape/focus at four sizes');
 }finally{await browser?.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
