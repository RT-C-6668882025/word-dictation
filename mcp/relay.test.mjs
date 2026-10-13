import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRelay} from './relay.mjs';
async function launch(options={}){const s=createRelay({pollWait:5,timeout:100,...options});await new Promise(r=>s.listen(0,'127.0.0.1',r));return {server:s,base:'http://127.0.0.1:'+s.address().port}}
const close=s=>new Promise(r=>s.close(r));
const json=async(url,options={})=>{const r=await fetch(url,options);assert(r.ok,'HTTP '+r.status);return r.json()};
function client(base,pair){const headers={Authorization:'Bearer '+pair.deviceToken};return {poll:()=>json(base+'/device/poll',{headers}),result:data=>json(base+'/device/result',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(data)}),rpc:(name,args={})=>json(base+'/mcp/'+pair.agentToken,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}).then(r=>r.result.structuredContent),headers}}
test('offline, live operations, idempotent retry, timeout query and isolation',async()=>{
 const {server,base}=await launch();try{
  const pair=await json(base+'/pair',{method:'POST'}),c=client(base,pair);assert.equal((await c.rpc('list_wordbooks')).status,'offline');await c.poll();
  const other=client(base,await json(base+'/pair',{method:'POST'}));assert.equal((await fetch(base+'/device/poll')).status,401);assert.equal((await fetch(base+'/pair',{method:'POST',headers:{Origin:'https://evil.test'}})).status,403);
  const args={operation_id:'import-1',name:'金融',text:'money,钱'};const request=c.rpc('import_wordbook',args);const rows=await c.poll();assert.equal(rows[0].id,'import-1');
  await c.result({id:'import-1',result:{id:'new',count:1,saved:true}});assert.equal((await request).status,'succeeded');
  assert.equal((await c.rpc('import_wordbook',args)).result.id,'new');assert.equal((await c.poll()).length,0);
  assert.equal((await c.rpc('import_wordbook',{...args,text:'bank,银行'})).status,'conflict');assert.equal((await other.rpc('get_operation_result',{request_id:'import-1'})).status,'not_found');
  const timed=await c.rpc('list_wordbooks',{operation_id:'read-1'});assert.equal(timed.status,'pending');assert.equal((await c.rpc('get_operation_result',{request_id:'read-1'})).status,'pending');
  const later=await c.poll();assert.equal(later[0].id,'read-1');await c.result({id:'read-1',result:[]});assert.equal((await c.rpc('get_operation_result',{request_id:'read-1'})).status,'succeeded');
  await json(base+'/device/close',{method:'POST',headers:c.headers});assert.equal((await fetch(base+'/mcp/'+pair.agentToken,{method:'POST'})).status,404);
 }finally{await close(server)}
});
test('pairing and completed results survive server restart; leased delivery retries same ID',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'word-relay-')),dataFile=join(dir,'relay.json');let server;
 try{
  let env=await launch({dataFile,deliveryLease:10});server=env.server;const pair=await json(env.base+'/pair',{method:'POST'});let c=client(env.base,pair);await c.poll();
  const pending=c.rpc('import_wordbook',{operation_id:'restart-1',name:'旅行',text:'trip,旅行'});let rows=await c.poll();assert.equal(rows[0].id,'restart-1');await pending;
  await close(server);server=null;env=await launch({dataFile,deliveryLease:10});server=env.server;c=client(env.base,pair);
  rows=await c.poll();assert.equal(rows[0].id,'restart-1');await c.result({id:'restart-1',result:{id:'book-1',saved:true}});
  await close(server);server=null;env=await launch({dataFile});server=env.server;c=client(env.base,pair);
  assert.equal((await c.rpc('get_operation_result',{request_id:'restart-1'})).result.id,'book-1');assert.equal((await c.rpc('import_wordbook',{operation_id:'restart-1',name:'旅行',text:'trip,旅行'})).status,'succeeded');
 }finally{if(server)await close(server);rmSync(dir,{recursive:true,force:true})}
});
