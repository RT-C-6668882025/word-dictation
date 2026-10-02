const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const server=spawn('npm',['run','preview','--','--host','127.0.0.1'],{stdio:'inherit'});
 let browser;
 try{
  for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:4173')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4173');
  const words=Array.from({length:30},(_,i)=>({id:'w'+i,en:i%3===0?'business':i%3===1?'central':i%2?'take responsibility for something':'A'.repeat(120),zh:i%3===0?'能力':i%3===1?'承担某事的责任；扩展释义'.repeat(5):'中文'.repeat(60)}));
  await page.evaluate(words=>localStorage.setItem('wd_books_v2',JSON.stringify([{id:'test',name:'新概念英语第一册单词汇总打印版'.repeat(40)+'A'.repeat(400),pageSize:20,words,whitelist:{'0':words.slice(0,20).map(w=>w.id),'1':words.slice(20).map(w=>w.id)}}])),words);
  let checks=0;
  fs.mkdirSync('layout-checks',{recursive:true});
  const bounds=async(selector)=>page.locator(selector).evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return{left:r.left,right:r.right,width:r.width}}));
  const contained=async(selector,width)=>{const rs=await bounds(selector);assert(rs.length);assert(rs.every(r=>r.left>=-1&&r.right<=width+1),selector+' outside viewport '+width)};
  for(const width of [360,600,800,1024,1280,1600]){
   await page.setViewportSize({width,height:1000});
   await page.evaluate(()=>localStorage.clear());await page.reload();
   await page.locator('#bookName').fill('新建词库测试'.repeat(80));
   await page.locator('#pageSize').fill('20');
   await page.locator('#raw').fill(words.map((w,i)=>w.en+' '+String.fromCharCode(97+i)+','+w.zh).join('\n'));
   await page.getByRole('button',{name:'创建词库',exact:true}).click();
   await page.locator('.word').first().waitFor();
   await page.locator('.homeBtn').click();await page.locator('.book').waitFor();
   await contained('.book,.bookInfo strong,.bookRight button',width);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'library overflow');
   await page.locator('.book').click();
   await contained('.headerActions button',width);
   const geometry=()=>page.locator('.word').evaluateAll(els=>els.map(e=>[e,e.querySelector('.englishCell'),e.querySelector('strong'),e.querySelector('.answer'),e.querySelector('.speaker')].map(node=>{const r=node.getBoundingClientRect();return [r.x,r.y,r.width,r.height]})));
   await page.locator('.seg button').nth(2).click();
   const baseline=await geometry();
   for(const mode of ['zh','en','both']){
    await page.locator('.seg button').nth(['zh','en','both'].indexOf(mode)).click();
    await page.waitForFunction(mode=>[...document.querySelectorAll('.word')].every(e=>e.classList.contains('view-'+mode)),mode);
    assert.deepEqual(await geometry(),baseline,'bulk switch moved text at '+width+'/'+mode);
    const visibility=await page.locator('.word').evaluateAll(els=>els.map(e=>[getComputedStyle(e.querySelector('.englishCell')).visibility,getComputedStyle(e.querySelector('.answer')).visibility]));
    assert(visibility.every(([en,zh])=>en===(mode==='zh'?'hidden':'visible')&&zh===(mode==='en'?'hidden':'visible')),'incorrect language visibility');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'study overflow');
    await contained('.card,.need',width);
    const intact=await page.locator('.word strong').evaluateAll(els=>els.filter(e=>/^(business|central)\\b/.test(e.textContent)).every(e=>{const token=e.textContent.split(' ')[0];const range=document.createRange();range.setStart(e.firstChild,0);range.setEnd(e.firstChild,token.length);return range.getClientRects().length===1}));
    assert(intact,'ordinary English word split at '+width+'/'+mode);
    checks++;
    if(width===800)await page.screenshot({path:'layout-checks/study-'+mode+'.png',fullPage:true});
   }
   await page.locator('.seg button').nth(0).click();
   const first=page.locator('.word').first();
   for(const mode of ['both','en','zh']){await first.click();await page.waitForFunction(mode=>document.querySelector('.word').classList.contains('view-'+mode),mode);assert.deepEqual(await geometry(),baseline,'individual switch moved text at '+width+'/'+mode)}
   await page.locator('.headerActions button').filter({hasText:'下一页'}).click();await page.waitForFunction(()=>document.querySelector('.headerTitle span').textContent.includes('第 2/2 页'));
   await page.locator('.homeBtn').click();await page.locator('.book').waitFor();
   if(width===800||width===1280)await page.screenshot({path:'layout-checks/library-'+width+'.png',fullPage:true});
  }
  assert.deepEqual(errors,[]);console.log('PASS '+checks+' actual app viewport/mode combinations, individual cycles, long titles, clickable navigation');
 }finally{if(browser)await browser.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
