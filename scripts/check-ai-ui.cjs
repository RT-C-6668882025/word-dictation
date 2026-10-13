const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const server=spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4184'],{stdio:'inherit'});let browser;
 try{
  for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:4184')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process']}: {})});
  const page=await browser.newPage();let pairCount=0,offline=false,queue=[],responses=[];
  await page.route('**/health',r=>r.fulfill({json:{ok:true,protocol:2,persistent:true}}));
  await page.route('**/pair',r=>{pairCount++;return r.fulfill({json:{deviceToken:'test',agentToken:'a'.repeat(64)}})});
  await page.route('**/device/poll',async r=>{await new Promise(resolve=>setTimeout(resolve,100));if(offline)return r.abort();const requests=queue.splice(0);await r.fulfill({json:requests}).catch(()=>{})});
  await page.route('**/device/result',async r=>{const data=r.request().postDataJSON();if(data.result?.saved){const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('wd_state_v3')));assert(state.receipts[data.id],'result sent before saved receipt')}responses.push(data);await r.fulfill({json:{accepted:true}})});
  await page.route('**/device/close',r=>r.fulfill({json:{}}));
  page.on('dialog',d=>d.accept('https://relay.example.com'));
  await page.goto('http://127.0.0.1:4184');await page.getByRole('button',{name:'关于',exact:true}).click();
  await page.getByRole('button',{name:'配对连接',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.aiConnectionBadge')?.textContent==='已就绪');
  const address=await page.locator('#ai-address').inputValue();await page.reload();
  await page.waitForFunction(()=>document.querySelector('.aiConnectionBadge')?.textContent==='已就绪');assert.equal(pairCount,1);
  await page.locator('.aiConnectionBadge').click();assert.equal(await page.locator('#ai-address').inputValue(),address);
  fs.mkdirSync('layout-checks',{recursive:true});
  for(const [width,height] of [[360,780],[412,915],[800,1280]]){await page.setViewportSize({width,height});await page.locator('.aiCard').scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('.aiCard').screenshot({path:`layout-checks/ai-paired-${width}.png`})}
  offline=true;await page.waitForFunction(()=>document.querySelector('.aiConnectionBadge')?.textContent==='重连中');offline=false;await page.getByRole('button',{name:'重新连接',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.aiConnectionBadge')?.textContent==='已就绪');assert.equal(pairCount,1);
  const command={id:'import-1',name:'import_wordbook',arguments:{name:'金融',text:'money,钱\nbank,银行'}};queue.push(command);
  for(let i=0;i<100&&!responses.length;i++)await page.waitForTimeout(50);assert.equal(responses[0].result.count,2);assert.equal(responses[0].result.saved,true);
  assert((await page.locator('.aiNotice').innerText()).includes('AI 已导入词库'));
  queue.push(command);for(let i=0;i<100&&responses.length<2;i++)await page.waitForTimeout(50);assert.equal(responses[1].result.id,responses[0].result.id);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('wd_state_v3')).books.length),1);
  await page.reload();await page.waitForFunction(()=>document.querySelector('.aiConnectionBadge')?.textContent==='已就绪');queue.push(command);
  for(let i=0;i<100&&responses.length<3;i++)await page.waitForTimeout(50);assert.equal(responses[2].result.id,responses[0].result.id);
  await page.locator('.aiConnectionBadge').click();await page.getByRole('button',{name:'解除配对',exact:true}).click();await page.getByRole('button',{name:'配对连接',exact:true}).waitFor();await page.reload();assert.equal(await page.locator('.aiConnectionBadge').innerText(),'未配对');assert.equal(pairCount,1);
  console.log('Pair persistence, status, reconnect, saved responses and duplicate imports passed');
 }finally{await browser?.close();server.kill('SIGTERM')}
})().catch(e=>{console.error(e);process.exitCode=1});
