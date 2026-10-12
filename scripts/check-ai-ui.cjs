const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const server=spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4184'],{stdio:'inherit'});let browser;
 try{
  for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:4184')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process']}: {})});
  const page=await browser.newPage();
  await page.route('**/pair',r=>r.fulfill({json:{deviceToken:'test',agentToken:'a'.repeat(64)}}));
  await page.route('**/device/poll',async r=>{await new Promise(resolve=>setTimeout(resolve,100));await r.fulfill({json:[]}).catch(()=>{})});
  await page.route('**/device/close',r=>r.fulfill({json:{}}));
  page.on('dialog',d=>d.accept('https://relay.example.com'));
  await page.goto('http://127.0.0.1:4184');await page.getByRole('button',{name:'关于',exact:true}).click();
  fs.mkdirSync('layout-checks',{recursive:true});
  for(const [width,height] of [[360,780],[412,915],[800,1280]]){
   await page.setViewportSize({width,height});
   await page.locator('.aiCard').scrollIntoViewIfNeeded();
   await page.screenshot({path:`layout-checks/ai-off-${width}.png`});
   await page.getByRole('button',{name:'开启连接',exact:true}).click();
   await page.getByRole('button',{name:'复制连接地址',exact:true}).waitFor();
   assert.equal(await page.locator('.aiStatus').innerText(),'已开启');
   assert((await page.locator('#ai-address').inputValue()).endsWith('a'.repeat(64)));
   assert(await page.locator('.aiCard').evaluate(e=>e.scrollWidth<=e.clientWidth));
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.locator('.aiCard').screenshot({path:`layout-checks/ai-on-${width}.png`});
   await page.getByRole('button',{name:'关闭连接',exact:true}).click();
   await page.getByRole('button',{name:'开启连接',exact:true}).waitFor();
  }
  assert((await page.locator('.aboutMeta').innerText()).includes(require('../package.json').version));
  console.log('AI card phone/tablet states and version passed');
 }finally{await browser?.close();server.kill('SIGTERM')}
})().catch(e=>{console.error(e);process.exitCode=1});
