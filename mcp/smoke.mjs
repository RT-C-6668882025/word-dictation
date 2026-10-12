// Verify a deployed relay without reading any user's real wordbooks.
import assert from 'node:assert/strict';
const base=(process.argv[2]||'').replace(/\/$/,'');
if(!/^https:\/\//.test(base))throw Error('Usage: node mcp/smoke.mjs https://your-relay-domain');
const request=async(path,options={})=>{const r=await fetch(base+path,{...options,signal:AbortSignal.timeout(35000)});if(!r.ok)throw Error('HTTP '+r.status);return r.status===204?null:r.json()};
assert.equal((await request('/health')).ok,true);
const pair=await request('/pair',{method:'POST'}),headers={Authorization:'Bearer '+pair.deviceToken};
const endpoint='/mcp/'+pair.agentToken;
const rpc=(method,params={})=>request(endpoint,{method:'POST',headers:{'Content-Type':'application/json','MCP-Protocol-Version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
try{
 assert.equal((await rpc('initialize',{protocolVersion:'2025-06-18'})).result.serverInfo.name,'word-dictation');
 assert.equal((await rpc('tools/list')).result.tools.length,6);
 const call=rpc('tools/call',{name:'list_wordbooks'});
 const rows=await request('/device/poll',{headers});assert.equal(rows.length,1);
 await request('/device/result',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({id:rows[0].id,result:[]})});
 assert.deepEqual(JSON.parse((await call).result.content[0].text),[]);
 console.log('Public HTTPS relay check passed');
}finally{await request('/device/close',{method:'POST',headers})}
const closed=await fetch(base+endpoint,{method:'POST'});assert.equal(closed.status,404);console.log('Disconnect check passed');
