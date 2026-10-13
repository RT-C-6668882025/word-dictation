import {Capacitor,registerPlugin} from '@capacitor/core';
import {Preferences} from '@capacitor/preferences';
import type {Book} from './wordbook';
export type Operations={books:()=>Book[];change:(book:Book,ids:string[],need:boolean)=>string[]|Promise<string[]>;import:(raw:string,name:string,pageSize:number)=>Book|Promise<Book>};
export async function executeAi(name:string,a:Record<string,any>,ops:Operations){
 if(name==='list_wordbooks')return ops.books().map(b=>({id:b.id,name:b.name,count:b.words.length,pageSize:b.pageSize}));
 if(name==='import_wordbook'||name==='create_temp_wordbook'){
  if(typeof a.text!=='string'||!a.text.trim()||typeof a.name!=='string'||!a.name.trim())throw Error('需要词库名称和中英词表 text');
  const ps=a.page_size??50;if(!Number.isInteger(ps)||ps<10||ps>200)throw Error('page_size 必须为 10–200 的整数');
  const b=await ops.import(a.text,name==='create_temp_wordbook'?'[临时] '+a.name:a.name,ps);return {id:b.id,name:b.name,count:b.words.length,saved:true};
 }
 const b=ops.books().find(b=>b.id===a.book_id);if(!b)throw Error('词库不存在');
 if(name==='get_words'){
  const offset=a.offset??0,limit=a.limit??200;if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>500)throw Error('offset >= 0；limit 为 1–500');
  if(a.query!==undefined&&typeof a.query!=='string')throw Error('query 必须为文本');
  const q=(a.query||'').toLowerCase();const rows=b.words.map((w,i)=>({...w,page:Math.floor(i/b.pageSize)+1,in_whitelist:(b.whitelist[String(Math.floor(i/b.pageSize))]||[]).includes(w.id)})).filter(w=>!q||w.en.toLowerCase().includes(q)||w.zh.toLowerCase().includes(q));
  return {total:rows.length,words:rows.slice(offset,offset+limit),next_offset:offset+limit<rows.length?offset+limit:null};
 }
 if(name==='add_to_whitelist'||name==='remove_from_whitelist'){
  if(!Array.isArray(a.word_ids)||!a.word_ids.length||a.word_ids.length>500||a.word_ids.some((x:any)=>typeof x!=='string'))throw Error('word_ids 需要 1–500 个单词 ID');
  const ids=[...new Set<string>(a.word_ids)],known=new Set(b.words.map(w=>w.id));if(ids.some(id=>!known.has(id)))throw Error('包含不存在的单词 ID，未修改');
  const changed=await ops.change(b,ids,name==='add_to_whitelist');return {book_id:b.id,requested_count:ids.length,changed_count:changed.length,unchanged_count:ids.length-changed.length,changed_ids:changed,saved:true};
 }
 throw Error('未知工具');
}
export type Connection={url:string;token:string;mcpUrl:string};
export type AiState='unpaired'|'connecting'|'ready'|'working'|'reconnecting'|'revoked';
const PAIR_KEY='wd_ai_pair_v1';
async function storageGet(key:string){const local=localStorage.getItem(key);if(local)return local;if(Capacitor.isNativePlatform())return (await Preferences.get({key})).value;return null}
async function storageSet(key:string,value:string){localStorage.setItem(key,value);if(Capacitor.isNativePlatform())await Preferences.set({key,value})}
export async function loadPair():Promise<Connection|null>{try{const raw=await storageGet(PAIR_KEY);if(!raw)return null;const c=JSON.parse(raw);if(typeof c.url!=='string'||!c.url.startsWith('https://')||typeof c.token!=='string'||typeof c.mcpUrl!=='string')return null;return c}catch{return null}}
export async function savePair(c:Connection){await storageSet(PAIR_KEY,JSON.stringify(c))}
export async function forgetPair(){localStorage.removeItem(PAIR_KEY);if(Capacitor.isNativePlatform())await Preferences.remove({key:PAIR_KEY})}
async function api(c:Connection,path:string,body?:unknown,signal?:AbortSignal){
 const timeout=AbortSignal.timeout(15000);const r=await fetch(c.url+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+c.token,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:signal?AbortSignal.any([timeout,signal]):timeout});
 if(r.status===401)throw Error('PAIR_REVOKED');if(!r.ok)throw Error('服务暂时不可用');return r.json();
}
export async function connectAi(url:string):Promise<Connection>{const base=url.replace(/\/$/,'');if(!base.startsWith('https://'))throw Error('连接服务需要 HTTPS 地址');const health=await fetch(base+'/health',{signal:AbortSignal.timeout(15000)});if(!health.ok)throw Error('连接服务暂时不可用');const info=await health.json();if(info.protocol!==2||!info.persistent)throw Error('连接服务尚未升级为固定配对版本，请先更新服务');const r=await fetch(base+'/pair',{method:'POST',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('连接服务暂时不可用');const data=await r.json();const c={url:base,token:data.deviceToken,mcpUrl:base+'/mcp/'+data.agentToken};await savePair(c);return c}
export type AiRequest={id:string;name:string;arguments:Record<string,any>};
export function attachAi(c:Connection,execute:(r:AiRequest)=>Promise<unknown>,onState:(s:AiState)=>void,onResult:(r:AiRequest,result:any,error?:string)=>void){
 if(Capacitor.isNativePlatform())return attachNativeAi(c,execute,onState,onResult);
 const controller=new AbortController();let stopped=false,failures=0;
 const sleep=(ms:number)=>new Promise<void>(resolve=>{if(controller.signal.aborted)return resolve();const t=setTimeout(done,ms);function done(){clearTimeout(t);controller.signal.removeEventListener('abort',done);resolve()}controller.signal.addEventListener('abort',done,{once:true})});
 const outbox=new Map<string,any>();
 (async()=>{onState('connecting');while(!stopped){try{
  for(const [id,response]of outbox){await api(c,'/device/result',{id,...response},controller.signal);outbox.delete(id)}
  const requests=await api(c,'/device/poll',undefined,controller.signal);if(stopped)break;failures=0;onState('ready');
  for(const request of requests){if(stopped)break;onState('working');let response;try{const result=await execute(request);response={result};onResult(request,result)}catch(e){const error=e instanceof Error?e.message:String(e);response={error,data_changed:(e as any)?.dataChanged??false};onResult(request,null,error)}
   outbox.set(request.id,response);await api(c,'/device/result',{id:request.id,...response},controller.signal);outbox.delete(request.id);if(!stopped)onState('ready');
  }
 }catch(e){if(stopped)break;if(e instanceof Error&&e.message==='PAIR_REVOKED'){onState('revoked');break}onState('reconnecting');await sleep(Math.min(15000,1000*2**Math.min(failures++,4)))}}})();
 const offline=()=>onState('reconnecting');window.addEventListener('offline',offline);
 return ()=>{stopped=true;controller.abort();window.removeEventListener('offline',offline)};
}
export async function disconnectAi(c:Connection){try{await api(c,'/device/close',{})}catch(e){if(!(e instanceof Error)||e.message!=='PAIR_REVOKED')throw e}await forgetPair()}

const NativeAi=registerPlugin<any>('AiConnection');
function attachNativeAi(c:Connection,execute:(r:AiRequest)=>Promise<unknown>,onState:(s:AiState)=>void,onResult:(r:AiRequest,result:any,error?:string)=>void){
 const owner=crypto.randomUUID();let disposed=false,handle:any;
 onState('connecting');
 (async()=>{try{
  const listener=await NativeAi.addListener('event',async(event:any)=>{
   if(disposed||event.owner!==owner)return;
   if(event.type==='state'){onState(event.state);return}
   if(event.type==='request'){let response;try{const result=await execute(event);response={result};onResult(event,result)}catch(e){const error=e instanceof Error?e.message:String(e);response={error,data_changed:(e as any)?.dataChanged??false};onResult(event,null,error)}await NativeAi.respond({owner,id:event.id,...response}).catch(()=>{if(!disposed)onState('reconnecting')})}
  });if(disposed){await listener.remove();return}handle=listener;
  await NativeAi.start({owner,url:c.url,token:c.token});
  if(disposed)await NativeAi.stop({owner});
 }catch{if(!disposed)onState('reconnecting')}})();
 return()=>{disposed=true;handle?.remove();NativeAi.stop({owner}).catch(()=>{})};
}
