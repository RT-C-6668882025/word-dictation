const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
(async()=>{
 const server=spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4182'],{stdio:'inherit'});
 let browser;
 try{
  for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:4182')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4182');
  await page.evaluate(()=>{
   const words=Array.from({length:50},(_,i)=>({id:'w'+i,en:'word'+i,zh:'释义'+i}));
   localStorage.setItem('wd_books_v2',JSON.stringify([
    {id:'a',name:'白名单回归',pageSize:25,words,whitelist:{'0':words.slice(0,25).map(w=>w.id),'1':words.slice(25).map(w=>w.id)}},
    {id:'b',name:'另一词库',pageSize:25,words:[{id:'other',en:'other',zh:'其他'}],whitelist:{'0':['other']}}
   ]));
  });await page.reload();await page.locator('.book').first().click();
  const list=()=>page.locator('.num').allTextContents();
  const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('wd_books_v2')));
  const first=async n=>{assert.equal((await list())[0],String(n).padStart(3,'0'));assert(!/已会|已掌握|全部会背|完成并/.test(await page.locator('main').innerText()),'whitelist must not infer mastery');};
  const stats=async text=>assert((await page.locator('.pageStats').innerText()).includes(text));
  const index=()=>page.getByRole('button',{name:'索引',exact:true}).click();
  const back=()=>page.getByRole('button',{name:'返回学习',exact:true}).click();
  await page.locator('.countControl button').getByText('10',{exact:true}).click();
  await page.locator('.seg button').getByText('英文',{exact:true}).click();
  await page.locator('.nextSizes button').getByText('10',{exact:true}).click();await first(11);
  await page.locator('.need').first().click(); // Remove w10 from the second batch.
  await first(1);assert.equal(await page.locator('.card').count(),10);await stats('需要背 24');await stats('本轮未展示 14');
  assert.equal(await page.locator('.word.view-en').count(),10);
  assert.equal(await page.locator('.countControl button.on').innerText(),'10');
  assert(!(await saved())[0].whitelist['0'].includes('w10'));
  await page.getByRole('button',{name:'本批移出白名单',exact:true}).click();
  await first(12);await stats('需要背 14');
  assert.deepEqual((await saved())[0].whitelist['0'],Array.from({length:14},(_,i)=>'w'+(i+11)));
  await index();await page.getByRole('button',{name:'加入白名单：word0',exact:true}).click();
  assert.equal(await page.locator('.screen-index').count(),1);await back();await first(1);
  assert.equal(await page.locator('.word.view-en').count(),10);await stats('需要背 15');await stats('本轮未展示 5');
  // Editing a different page in the index must not change the study page or its list.
  await page.locator('.headerActions button').filter({hasText:'下一页'}).click();await first(26);
  await index();await page.getByRole('button',{name:'移出白名单：word0',exact:true}).click();await back();await first(26);
  assert((await page.locator('.headerTitle span').innerText()).includes('第 2/2 页'));
  await page.getByRole('button',{name:'本批移出白名单',exact:true}).click();await first(36);
  await page.getByRole('button',{name:'本批移出白名单',exact:true}).click();await first(46);
  await page.getByRole('button',{name:'本批移出白名单',exact:true}).click();
  assert.equal(await page.locator('.card').count(),0);assert.equal(await page.getByText('本页白名单为空。',{exact:true}).count(),1);
  assert(!/已会|已掌握|全部会背|完成并/.test(await page.locator('main').innerText()));
  assert(await page.getByRole('button',{name:'加入白名单',exact:true}).isEnabled());
  await page.getByRole('button',{name:'选择单词加入白名单',exact:true}).click();
  assert.equal(await page.locator('.indexEntry').count(),25);
  assert.equal(await page.getByRole('button',{name:'加入白名单：word0',exact:true}).count(),0);
  await page.getByRole('button',{name:'加入白名单：word49',exact:true}).click();await back();await first(50);
  assert.equal(await page.locator('.countControl button.on').innerText(),'10');
  await page.getByRole('button',{name:'重新显示本页白名单',exact:true}).click();await first(50);
  assert.equal(await page.getByRole('button',{name:'完成并返回首页',exact:true}).count(),0);
  const before=await saved();assert.deepEqual(before[0].whitelist['1'],['w49']);assert.deepEqual(before[1].whitelist,{'0':['other']});
  await page.reload();assert.deepEqual(await saved(),before);
  // Opening an index from another book must not retain the previous book's batch.
  await page.locator('.book').nth(1).getByRole('button',{name:'索引',exact:true}).click();await back();
  assert.equal(await page.locator('.card').count(),1);
  await page.locator('.seg button').getByText('英文',{exact:true}).click();
  assert.equal(await page.locator('.word strong').innerText(),'other');
  // Empty an entire one-word library, restart, then restore through the empty page.
  await page.getByRole('button',{name:'本批移出白名单',exact:true}).click();
  assert.equal(await page.locator('.card').count(),0);
  await page.reload();await page.locator('.book').nth(1).click();
  assert.equal(await page.locator('.card').count(),0);
  await page.getByRole('button',{name:'加入白名单',exact:true}).click();
  assert.equal(await page.locator('.indexEntry').count(),1);
  await page.getByRole('button',{name:'加入白名单：other',exact:true}).click();await back();
  assert.equal(await page.locator('.card').count(),1);
  assert.deepEqual((await saved())[1].whitelist,{'0':['other']});
  await page.reload();await page.locator('.book').nth(1).click();
  assert.equal(await page.locator('.card').count(),1);
  assert.deepEqual(errors,[]);
  console.log('PASS whitelist: single/bulk reset, original order, page/size/language preservation, cross-page edits, empty/add-back, repeat, persistence and book isolation');
 }finally{await browser?.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
