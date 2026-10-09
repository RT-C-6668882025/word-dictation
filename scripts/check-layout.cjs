const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const server=spawn('npm',['run','preview','--','--host','127.0.0.1'],{stdio:'inherit'});
 let browser;
 try{
  for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:4173')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process','--disable-gpu','--disable-software-rasterizer']}: {})});
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4173');
  const words=Array.from({length:30},(_,i)=>({id:'w'+i,en:i%3===0?'business':i%3===1?'central':i%2?'take responsibility for something':'A'.repeat(120),zh:i%3===0?'能力':i%3===1?'承担某事的责任；扩展释义'.repeat(5):'中文'.repeat(60)}));
  await page.evaluate(words=>localStorage.setItem('wd_books_v2',JSON.stringify([{id:'test',name:'新概念英语第一册单词汇总打印版'.repeat(40)+'A'.repeat(400),pageSize:20,words,whitelist:{'0':words.slice(0,20).map(w=>w.id),'1':words.slice(20).map(w=>w.id)}}])),words);
  let checks=0;
  fs.mkdirSync('layout-checks',{recursive:true});
  const bounds=async(selector)=>page.locator(selector).evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return{left:r.left,right:r.right,width:r.width}}));
  const contained=async(selector,width)=>{const rs=await bounds(selector);assert(rs.length);assert(rs.every(r=>r.left>=-1&&r.right<=width+1),selector+' outside viewport '+width)};
  for(const [width,height] of [[360,780],[412,915],[600,960],[800,1280],[1024,768],[1280,800],[844,390],[1600,1000]]){
   await page.setViewportSize({width,height});
   await page.evaluate(()=>localStorage.clear());await page.reload();
   if(process.env.TEST_FONT_CSS){await page.addStyleTag({path:process.env.TEST_FONT_CSS});await page.evaluate(()=>document.fonts.ready);}
   // Exercise the same CSS variables injected by Capacitor SystemBars.
   await page.evaluate(({width,height})=>{
    const s=document.documentElement.style;
    s.setProperty('--safe-area-inset-top','28px');s.setProperty('--safe-area-inset-bottom','24px');
    s.setProperty('--safe-area-inset-left',width>height?'32px':'0px');
    s.setProperty('--safe-area-inset-right',width>height?'32px':'0px');
   },{width,height});
   await contained('header,#bookName,#pageSize,#raw,.row > *',width);
   assert(await page.locator('header').evaluate(e=>e.getBoundingClientRect().top>=28),'status bar overlap');
   assert(await page.locator('.import').evaluate(e=>e.getBoundingClientRect().top-document.querySelector('header').getBoundingClientRect().bottom<=30),'excess form gap');
   if(width===360||width===800)await page.screenshot({path:`layout-checks/import-${width}.png`,fullPage:true});
   await page.getByRole('button',{name:'关于',exact:true}).click();
   await contained('.aboutHero,.aboutMeta,.aboutActions button',width);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'about overflow');
   await page.getByRole('button',{name:'← 首页',exact:true}).click();
   if(width===360){
    await page.setViewportSize({width,height:430});
    await page.locator('#raw').focus();await page.locator('#raw').fill('keyboard,键盘');
    await page.getByRole('button',{name:'创建词库',exact:true}).scrollIntoViewIfNeeded();
    assert(await page.getByRole('button',{name:'创建词库',exact:true}).isVisible(),'import action unreachable in short window');
    await page.setViewportSize({width,height});
   }
   await page.locator('#bookName').fill('新建词库测试'.repeat(80));
   await page.locator('#pageSize').fill('25');
   await page.locator('#raw').fill(words.map((w,i)=>w.en+' '+String.fromCharCode(97+i)+','+w.zh).join('\n'));
   await page.getByRole('button',{name:'创建词库',exact:true}).click();
   await page.locator('.word').first().waitFor();
   await page.locator('.homeBtn').click();await page.locator('.book').waitFor();
   await contained('.book,.bookInfo strong,.bookRight button',width);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'library overflow');
   await page.locator('.book').click();
   await contained('.headerActions button',width);
   const geometry=()=>page.locator('.word').evaluateAll(els=>els.map(e=>[e,e.querySelector('.englishCell'),e.querySelector('strong'),e.querySelector('.answer'),e.querySelector('.speaker')].map(node=>{const r=node.getBoundingClientRect();return [r.x+scrollX,r.y+scrollY,r.width,r.height]})));
   await page.locator('.seg button').nth(2).click();
   const baseline=await geometry();
   for(const mode of ['zh','en','both']){
    await page.locator('.seg button').nth(['zh','en','both'].indexOf(mode)).click();
    await page.waitForFunction(mode=>[...document.querySelectorAll('.word')].every(e=>e.classList.contains('view-'+mode)),mode);
    assert.deepEqual(await geometry(),baseline,'bulk switch moved text at '+width+'/'+mode);
    const visibility=await page.locator('.word').evaluateAll(els=>els.map(e=>[getComputedStyle(e.querySelector('.englishCell')).visibility,getComputedStyle(e.querySelector('.answer')).visibility]));
    assert(visibility.every(([en,zh])=>en===(mode==='zh'?'hidden':'visible')&&zh===(mode==='en'?'hidden':'visible')),'incorrect language visibility');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'study overflow');
    await contained('.card,.need,.customCount,.countControl button,.countControl input',width);
    assert(await page.locator('.answer').evaluateAll(els=>els.every(e=>getComputedStyle(e).textAlign==='left')),'definitions must be left aligned');
    const intact=await page.locator('.word strong').evaluateAll(els=>els.filter(e=>/^(business|central)\b/.test(e.textContent)).map(e=>{const token=e.textContent.split(' ')[0];const range=document.createRange();range.setStart(e.firstChild,0);range.setEnd(e.firstChild,token.length);return range.getClientRects().length===1}));
    assert(intact.length>0&&intact.every(Boolean),'ordinary English word split at '+width+'/'+mode);
    checks++;
    if((width===800||width===360)&&mode==='both')await page.screenshot({path:`layout-checks/study-${width}.png`});
   }
   await page.locator('.seg button').nth(0).click();
   const first=page.locator('.word').first();
   for(const mode of ['both','zh','both','zh']){await first.click({position:{x:8,y:8}});await page.waitForFunction(mode=>document.querySelector('.word').classList.contains('view-'+mode),mode);assert.deepEqual(await geometry(),baseline,'individual switch moved text at '+width+'/'+mode)}
   await page.locator('.seg button').nth(1).click();
   for(const mode of ['both','en']){await first.click({position:{x:8,y:8}});await page.waitForFunction(mode=>document.querySelector('.word').classList.contains('view-'+mode),mode);assert.deepEqual(await geometry(),baseline,'English prompt toggle moved text')}
   await page.locator('#custom-count').fill('7');await page.locator('.customCount button').click();assert.equal(await page.locator('.card').count(),7,'custom count not applied');
   await contained('footer button,footer input',width);
   await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
   await page.waitForTimeout(100);
   assert(await page.evaluate(()=>{
    const last=document.querySelector('.card:last-child').getBoundingClientRect();
    const footer=document.querySelector('footer').getBoundingClientRect();
    return getComputedStyle(document.querySelector('footer')).position!=='fixed'||last.bottom<=footer.top+1;
   }),'last card obscured by footer');
   await page.getByRole('button',{name:'索引',exact:true}).click();
   await page.locator('.indexSearch input').fill('business');
   await contained('.indexSearch,.indexRow',width);
   assert(await page.locator('.indexRow').count()>0,'index search empty');
   await page.locator('.indexRow').first().click();
   await page.locator('.headerActions button').filter({hasText:'下一页'}).click();await page.waitForFunction(()=>document.querySelector('.headerTitle span').textContent.includes('第 2/2 页'));
   await page.locator('.homeBtn').click();await page.locator('.book').waitFor();
   if(width===800||width===1280)await page.screenshot({path:'layout-checks/library-'+width+'.png',fullPage:true});
  }
  assert.deepEqual(errors,[]);console.log('PASS '+checks+' viewport/mode combinations plus five screens, portrait/landscape, safe insets, footer clearance, word wrapping and navigation');
 }finally{if(browser)await browser.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});

