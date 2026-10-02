const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 assert(!fs.existsSync('dist/sw.js'),'Android build must not contain a Service Worker');
 assert(!fs.readFileSync('dist/index.html','utf8').includes('registerSW'),'Android must not register PWA');
 fs.writeFileSync('dist/legacy-sw.js',"self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));");
 const server=spawn('npm',['run','preview','--','--host','127.0.0.1'],{stdio:'inherit'});let browser;
 try{
  for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:4173')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
  browser=await chromium.launch();const page=await browser.newPage();await page.goto('http://127.0.0.1:4173');
  await page.evaluate(async()=>{
   localStorage.setItem('wd_books_v2','preserve-library');localStorage.setItem('wd_tts_voice','3');
   await navigator.serviceWorker.register('/legacy-sw.js');
   await navigator.serviceWorker.ready;
   const cache=await caches.open('workbox-old-app');await cache.put('/old.css',new Response('.word{grid-template-columns:1fr}'));
  });
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await page.evaluate(fs.readFileSync('native/clear-web-cache.js','utf8'));
  await page.waitForFunction(()=>sessionStorage.getItem('wd-native-cache-migration-0.4.21')==='done');
  await page.waitForFunction(()=>!navigator.serviceWorker.controller);
  const out=await page.evaluate(async()=>({registrations:(await navigator.serviceWorker.getRegistrations()).length,caches:await caches.keys(),book:localStorage.getItem('wd_books_v2'),voice:localStorage.getItem('wd_tts_voice')}));
  assert.equal(out.registrations,0);assert(!out.caches.includes('workbox-old-app'));assert.equal(out.book,'preserve-library');assert.equal(out.voice,'3');
  console.log('PASS native cache migration removes legacy controller/cache while preserving library and voice settings');
 }finally{if(browser)await browser.close();server.kill();fs.rmSync('dist/legacy-sw.js',{force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
