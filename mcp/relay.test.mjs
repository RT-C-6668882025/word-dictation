import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRelay} from './relay.mjs';
test('Agent MCP → phone request → response → disconnect',async()=>{
 const server=createRelay({timeout:3000});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  const pair=await (await fetch(base+'/pair',{method:'POST'})).json();const url=base+'/mcp/'+pair.agentToken,headers={Authorization:'Bearer '+pair.deviceToken};
  const rpc=(method,params={})=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}).then(r=>r.json());
  assert.equal((await rpc('initialize',{protocolVersion:'2025-06-18'})).result.protocolVersion,'2025-06-18');assert.equal((await rpc('tools/list')).result.tools.length,6);
  assert.equal((await fetch(base+'/device/poll')).status,401);
  assert.equal((await fetch(base+'/pair',{method:'POST',headers:{Origin:'https://evil.test'}})).status,403);
  const call=rpc('tools/call',{name:'get_words',arguments:{book_id:'a'}});
  const requests=await(await fetch(base+'/device/poll',{headers})).json();assert.equal(requests[0].name,'get_words');assert.equal(requests[0].arguments.book_id,'a');
  await fetch(base+'/device/result',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({id:requests[0].id,result:{words:[{en:'money',zh:'钱'}]}})});
  assert.equal(JSON.parse((await call).result.content[0].text).words[0].zh,'钱');
  const timeout=await rpc('tools/call',{name:'list_wordbooks'});assert.equal(timeout.result.isError,true);
  await fetch(base+'/device/close',{method:'POST',headers});assert.equal((await fetch(url,{method:'POST'})).status,404);
 }finally{await new Promise(r=>server.close(r))}
});
