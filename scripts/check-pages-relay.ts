import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRelay,tools} from '../mcp/relay.mjs';
import {transact} from '../src/nativeAiEngine';
const dir=mkdtempSync(join(tmpdir(),'pages-relay-'));let server:any;
try {
 server=createRelay({dataFile:join(dir,'relay.json'),pollWait:5,timeout:1500});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const json=async(url:string,body?:any,token?:string)=>{const r=await fetch(base+url,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});assert(r.ok);return r.json()};
 const pair=await json('/pair',{});const rpc=async(method:string,params:any,version?:string)=>{const r=await fetch(base+'/mcp/'+pair.agentToken,{method:'POST',headers:{'Content-Type':'application/json',...(version?{'MCP-Protocol-Version':version}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});assert(r.ok);return (await r.json()).result};
 for(const version of ['2025-11-25','2025-06-18','2025-03-26','2024-11-05'])assert.equal((await rpc('initialize',{protocolVersion:version},version)).protocolVersion,version);
 assert.equal((await rpc('tools/list',{})).tools.length,26);assert.equal(tools.some(t=>t.name==='set_wordbook_page_size'),false);
 let state:any={books:[],receipts:{}};
 async function call(name:string,args:any){await json('/device/poll',undefined,pair.deviceToken);const result=rpc('tools/call',{name,arguments:args});const rows=await json('/device/poll',undefined,pair.deviceToken);for(const row of rows){const next=JSON.parse(transact(JSON.stringify(state),JSON.stringify(row)));state=next.state;await json('/device/result',{id:row.id,...next.response},pair.deviceToken)}return (await result).structuredContent}
 const args={operation_id:'e2e-compose',name:'端到端页面',pages:[{id:'p',columns:2,entries:[{id:'w',blocks:[{text:'问题'},{text:'提示'},{text:'解析'}],visible_count:1}]}]};
 const created=await call('compose_wordbook',args);assert.equal(created.status,'succeeded');assert.equal(created.data_changed,true);assert.equal(state.books.length,1);const id=created.result.book_id;
 const read=await call('get_wordbook_pages',{book_id:id});assert.equal(read.result.pages[0].entries[0].blocks.length,3);
 const edit=await call('update_cards',{operation_id:'e2e-hide',book_id:id,cards:[{word_id:'w',visible_count:0}]});assert.equal(edit.status,'succeeded');assert.equal(state.books[0].words[0].visible_count,0);
 const before=JSON.stringify(state);const bad=await call('set_wordbook_pages',{operation_id:'e2e-bad',book_id:id,pages:[{id:'p',word_ids:['missing']}]});assert.equal(bad.status,'failed');assert.equal(bad.data_changed,false);assert.equal(JSON.stringify(state),before);
 const repeat=(await rpc('tools/call',{name:'compose_wordbook',arguments:args})).structuredContent;assert.equal(repeat.result.book_id,id);assert.equal(state.books.length,1);assert.deepEqual(await json('/device/poll',undefined,pair.deviceToken),[]);
 const wl=JSON.stringify(state.books[0].whitelist);
 const profile={id:'e2e-rule',name:'原顺序',version:1,algorithm:{kind:'rules',rules:{sort:'original'}}};
 assert.equal((await call('create_algorithm',{operation_id:'algo-create',profile})).status,'succeeded');
 assert.equal((await call('set_algorithm',{operation_id:'algo-set',deckId:id,profileId:profile.id})).status,'succeeded');
 const preview=await call('test_algorithm',{deckId:id,profileId:profile.id});assert.equal(preview.status,'succeeded');assert.deepEqual(preview.result.data.itemIds,['w']);assert.equal(preview.data_changed,false);
 assert.equal(JSON.stringify(state.books[0].whitelist),wl);
 assert.equal((await call('reset_algorithm',{operation_id:'algo-reset',deckId:id})).status,'succeeded');assert.equal(state.books[0].learningProfileId,null);
 console.log('PASS relay → native engine → persisted state → receipt: 26 tools, four protocols, composed blocks, visibility edit, atomic failure and idempotent replay');
}finally{if(server)await new Promise<void>(r=>server.close(r));rmSync(dir,{recursive:true,force:true})}

