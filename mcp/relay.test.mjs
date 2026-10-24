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

test('management mutations require operation IDs and removed attachment tools are unavailable',async()=>{
 const {server,base}=await launch();try{const pair=await json(base+'/pair',{method:'POST'}),c=client(base,pair);await c.poll();
 for(const name of ['delete_wordbook','rename_wordbook','add_cards','update_cards','delete_cards','merge_wordbooks','split_wordbook','compose_wordbook','set_wordbook_pages']){const r=await c.rpc(name,{book_id:'book',name:'new',expected_name:'old'});assert.equal(r.status,'failed');assert.equal(r.data_changed,false);assert.match(r.error,/operation_id/)}
 assert.equal((await c.rpc('get_attachment',{})).status,'failed');assert.equal((await c.rpc('upload_attachment',{})).status,'failed');assert.deepEqual(await c.poll(),[]);
 }finally{await close(server)}
});

test('Streamable HTTP handshake, version negotiation and credential routing over real HTTP',async()=>{
 const {server,base}=await launch();try{
  const pair=await json(base+'/pair',{method:'POST'}),endpoint=base+'/mcp/'+pair.agentToken;
  const headers={'Content-Type':'application/json',Accept:'application/json, text/event-stream'};
  const post=(url,message,extra={})=>fetch(url,{method:'POST',headers:{...headers,...extra},body:JSON.stringify(message)});
  const versions=['2024-11-05','2025-03-26','2025-06-18','2025-11-25'];
  for(const version of versions){
   const r=await post(endpoint,{jsonrpc:'2.0',id:0,method:'initialize',params:{protocolVersion:version,capabilities:{},clientInfo:{name:'handshake-test',version:'1'}}});
   assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/application\/json/);assert.equal(r.headers.get('mcp-session-id'),null);
   const m=await r.json();assert.equal(m.id,0);assert.equal(m.result.protocolVersion,version);assert.deepEqual(m.result.capabilities,{tools:{}});
   const initialized=await post(endpoint,{jsonrpc:'2.0',method:'notifications/initialized'},{'MCP-Protocol-Version':version});
   assert.equal(initialized.status,202);assert.equal(await initialized.text(),'');
   const list=await post(endpoint,{jsonrpc:'2.0',id:'tools',method:'tools/list'},{'MCP-Protocol-Version':version});
   assert.equal(list.status,200);assert.deepEqual((await list.json()).result.tools,(await import('./relay.mjs')).tools);
  }
  const fallback=await post(endpoint,{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2099-01-01'}});
  assert.equal((await fallback.json()).result.protocolVersion,'2025-11-25');
  assert.equal((await post(endpoint,{jsonrpc:'2.0',id:1,method:'tools/list'},{'MCP-Protocol-Version':'2099-01-01'})).status,400);
  const get=await fetch(endpoint,{headers:{Accept:'text/event-stream'}});assert.equal(get.status,405);assert.equal(get.headers.get('allow'),'POST');
  for(const suffix of ['?operation_id=not-a-token','/'])assert.equal((await post(endpoint+suffix,{jsonrpc:'2.0',id:1,method:'tools/list'})).status,200);
  const encoded=endpoint.replace(/.$/,c=>'%'+c.charCodeAt(0).toString(16));assert.equal((await post(encoded,{jsonrpc:'2.0',id:1,method:'ping'})).status,200);
  for(const url of [base+'/mcp/'+pair.deviceToken,endpoint+'/operation-1',base+'/mcp/operation-1'])assert.equal((await post(url,{jsonrpc:'2.0',id:1,method:'initialize'})).status,404);
  assert.equal((await post(base+'/mcp/%ZZ',{jsonrpc:'2.0',id:1,method:'initialize'})).status,400);
  assert.equal((await post(endpoint,{jsonrpc:'2.0',id:1,method:'initialize'},{Origin:'https://evil.test'})).status,403);
  assert.equal((await post(endpoint,{jsonrpc:'2.0',id:1,result:{}})).status,202);
  assert.deepEqual(await client(base,pair).poll(),[]); // Handshake never queues a device operation.
 }finally{await close(server)}
});

test('malformed handshake requests return client errors instead of HTTP 500',async()=>{
 const {server,base}=await launch();try{
  const pair=await json(base+'/pair',{method:'POST'}),endpoint=base+'/mcp/'+pair.agentToken;
  for(const [body,status,code]of [['{',400,-32700],['null',400,-32600],['[]',400,-32600],['1',400,-32600],[JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:null}),400,-32600],['x'.repeat(1048577),413,-32600]]){
   const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body});assert.equal(r.status,status);
   const m=await r.json();assert.equal(m.error.code,code);assert.equal(m.error.data.diagnostic_id,r.headers.get('x-request-id'));
   assert(!JSON.stringify(m).includes(pair.agentToken));
  }
 }finally{await close(server)}
});

test('unexpected persistence failure has a traceable, credential-free internal error',async t=>{
 const {writeFileSync}=await import('node:fs');const dir=mkdtempSync(join(tmpdir(),'word-relay-failure-')),dataFile=join(dir,'data','relay.json');
 const {server,base}=await launch({dataFile});const logs=[];t.mock.method(console,'error',(...args)=>logs.push(args));
 try{
  const pair=await json(base+'/pair',{method:'POST'}),c=client(base,pair);await c.poll();
  rmSync(join(dir,'data'),{recursive:true});writeFileSync(join(dir,'data'),'not a directory');
  const r=await fetch(base+'/mcp/'+pair.agentToken,{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:8,method:'tools/call',params:{name:'list_wordbooks'}})});
  assert.equal(r.status,500);const m=await r.json();assert.equal(m.id,8);assert.equal(m.error.code,-32603);
  assert.equal(m.error.data.diagnostic_id,r.headers.get('x-request-id'));assert.equal(logs.length,1);
  const log=JSON.stringify(logs);assert(log.includes('tools/call'));assert(log.includes(m.error.data.diagnostic_id));assert(!log.includes(pair.agentToken));assert(!log.includes(pair.deviceToken));
  // initialize performs no persistence or device operations, even when storage is broken.
  const init=await fetch(base+'/mcp/'+pair.agentToken,{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:9,method:'initialize'})});assert.equal(init.status,200);
 }finally{await close(server);rmSync(dir,{recursive:true,force:true})}
});
