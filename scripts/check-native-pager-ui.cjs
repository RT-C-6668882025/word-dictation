const {chromium}=require('playwright'),{spawn}=require('node:child_process'),assert=require('node:assert/strict');
(async()=>{const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4188','--strictPort'],{stdio:'inherit'});let browser;
try{for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:4188')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 browser=await chromium.launch();const page=await browser.newPage({viewport:{width:412,height:915}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.nativeCalls=[];window.nativeListeners={};window.androidBridge={};let seq=0;
  let state={revision:0,receipts:{},books:[{id:'book',name:'原生桥接测试',pageSize:1,words:[{id:'a',blocks:[{id:'q',text:'第一条'},{id:'a',text:'答案'}],visible_count:1},{id:'b',blocks:[{id:'q',text:'第二页'}],visible_count:1}],pages:[{id:'first',word_ids:['a'],columns:1},{id:'second',word_ids:['b'],columns:1}],whitelist:{0:['a'],1:['b']}}]};
  const methods={StudyPager:['update','layout','close'],AiConnection:['getWordState','saveBooks','backgroundStatus','start','stop'],Preferences:['get','set'],AppUpdater:['getPendingUpdate','getUpdateDiagnostics','downloadAndInstall','installPending'],PocketTts:['getStatus','speakSystem'],App:[]};
  window.Capacitor={PluginHeaders:Object.entries(methods).map(([name,list])=>({name,methods:[...list.map(name=>({name,rtype:'promise'})),{name:'addListener',rtype:'callback'},{name:'removeListener',rtype:'promise'}]})),nativeCallback:(plugin,method,options,callback)=>{const id='listener'+(++seq);window.nativeListeners[id]={plugin,...options,callback};return id},nativePromise:async(plugin,method,options)=>{
   window.nativeCalls.push({plugin,method,options});
   if(method==='removeListener'){delete window.nativeListeners[options.callbackId];return {}}
   if(plugin==='Preferences'&&method==='get')return {value:null};
   if(plugin==='AiConnection'){if(method==='getWordState')return JSON.parse(JSON.stringify(state));if(method==='saveBooks'){state={...state,books:JSON.parse(options.books),revision:state.revision+1};return JSON.parse(JSON.stringify(state))}if(method==='backgroundStatus')return {allowed:true}}
   if(plugin==='PocketTts')return {installed:false,downloading:false};if(plugin==='AppUpdater'){if(method==='getUpdateDiagnostics')return {stage:'install_incomplete',detail:'INSTALL_FAILED_ABORTED: User rejected permissions '+ '完整原因'.repeat(60)};return {pending:true}};return {};
  }};
  window.emitPager=data=>Object.values(window.nativeListeners).filter(l=>l.plugin==='StudyPager'&&l.eventName==='action').forEach(l=>l.callback(data));
 });
 await page.goto('http://127.0.0.1:4188');await page.locator('.book').click();await page.waitForFunction(()=>window.nativeCalls.some(c=>c.plugin==='StudyPager'&&c.method==='update'));
 assert.equal(await page.locator('.nativePagerSlot').count(),1);assert.equal(await page.locator('.snapPager').count(),0,'Android must use native container');
 const update=await page.evaluate(()=>window.nativeCalls.filter(c=>c.plugin==='StudyPager'&&c.method==='update').at(-1).options);assert.equal(JSON.parse(update.models).length,2);assert(update.width>0&&update.height>80);const owner=update.owner;
 await page.evaluate(owner=>window.emitPager({owner,action:'page',index:1}),owner);await page.waitForFunction(()=>document.querySelector('.pageNavigation [role=status]').textContent==='2 / 2');
 await page.evaluate(owner=>window.emitPager({owner,action:'need',value:'b'}),owner);await page.waitForFunction(()=>window.nativeCalls.some(c=>c.plugin==='AiConnection'&&c.method==='saveBooks'));assert.equal(await page.evaluate(()=>JSON.parse(window.nativeCalls.filter(c=>c.method==='saveBooks').at(-1).options.books)[0].whitelist['1'].length),0);
 await page.getByRole('button',{name:'整页看',exact:true}).click();
 await page.getByRole('spinbutton',{name:'显示条数'}).fill('0');await page.waitForFunction(()=>JSON.parse(window.nativeCalls.filter(c=>c.plugin==='StudyPager'&&c.method==='update').at(-1).options.models)[1].count===0);
 await page.evaluate(()=>{const snapshot=JSON.parse(localStorage.getItem('wd_state_v3'));snapshot.books[0].pages[1].visible_count=1;window.dispatchEvent(new CustomEvent('wd-native-state',{detail:{snapshot,authoritative:true}}))});await page.waitForFunction(()=>document.querySelector('[aria-label=显示条数]').value==='1');
 await page.getByRole('button',{name:'语音设置'}).click();await page.waitForFunction(()=>window.nativeCalls.filter(c=>c.plugin==='StudyPager'&&c.method==='update').at(-1).options.visible===false);await page.getByRole('button',{name:'关闭语音设置'}).click();await page.waitForFunction(()=>window.nativeCalls.filter(c=>c.plugin==='StudyPager'&&c.method==='update').at(-1).options.visible===true);
 await page.setViewportSize({width:915,height:412});await page.waitForFunction(()=>window.nativeCalls.some(c=>c.plugin==='StudyPager'&&c.method==='layout'&&c.options.viewportWidth===915));
 await page.locator('.homeBtn').click();await page.waitForFunction(owner=>window.nativeCalls.some(c=>c.plugin==='StudyPager'&&c.method==='close'&&c.options.owner===owner),owner);
 await page.getByRole('button',{name:'关于',exact:true}).click();await page.locator('.updateDiagnostics pre').waitFor();assert((await page.locator('.updateDiagnostics pre').textContent()).includes('完整原因'.repeat(60)));assert(await page.locator('.updateDiagnostics').getAttribute('open')!==null);
 await page.route('https://api.github.com/repos/RT-C-6668882025/word-dictation/releases/latest',route=>route.fulfill({json:{tag_name:'v9.9.9',assets:[{name:'word-dictation.apk',browser_download_url:'https://github.com/RT-C-6668882025/word-dictation/releases/download/v9.9.9/word-dictation.apk',digest:'sha256:new-version'}]}}));page.on('dialog',d=>d.accept());
 await page.locator('.updateButton').click();await page.waitForFunction(()=>window.nativeCalls.some(c=>c.plugin==='AppUpdater'&&c.method==='downloadAndInstall'));assert.equal(await page.evaluate(()=>window.nativeCalls.filter(c=>c.method==='downloadAndInstall').at(-1).options.digest),'sha256:new-version');
 await page.getByRole('button',{name:'重试已下载的安装包',exact:true}).click();await page.waitForFunction(()=>window.nativeCalls.some(c=>c.plugin==='AppUpdater'&&c.method==='installPending'));
 assert.deepEqual(errors,[]);console.log('PASS Android pager bridge: native container, page events, durable whitelist update, voice-dialog layering, rotation, owner-scoped cleanup, full installer diagnostics and latest-version retry');
}finally{await browser?.close();server.kill()}})().catch(e=>{console.error(e);process.exitCode=1});
