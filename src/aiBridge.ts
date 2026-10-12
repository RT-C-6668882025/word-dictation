
import type {Book} from './wordbook';

export type Operations={books:()=>Book[];change:(book:Book,ids:string[],need:boolean)=>string[];import:(raw:string,name:string,pageSize:number)=>Book};
export function executeAi(name:string,a:Record<string,any>,ops:Operations){
 if(name==='list_wordbooks')return ops.books().map(b=>({id:b.id,name:b.name,count:b.words.length,pageSize:b.pageSize}));
 if(name==='import_wordbook'||name==='create_temp_wordbook'){
  if(typeof a.text!=='string'||!a.text.trim()||typeof a.name!=='string'||!a.name.trim())throw Error('需要词库名称和中英词表 text');
  const ps=a.page_size??50;if(!Number.isInteger(ps)||ps<10||ps>200)throw Error('page_size 必须为 10–200 的整数');
  const b=ops.import(a.text,name==='create_temp_wordbook'?'[临时] '+a.name:a.name,ps);return {id:b.id,name:b.name,count:b.words.length};
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
  const known=new Set(b.words.map(w=>w.id));if(a.word_ids.some((id:string)=>!known.has(id)))throw Error('包含不存在的单词 ID，未修改');
  return {book_id:b.id,changed_ids:ops.change(b,a.word_ids,name==='add_to_whitelist')};
 }
 throw Error('未知工具');
}
export type Connection={url:string;token:string;mcpUrl:string};
export async function connectAi(url:string):Promise<Connection>{
 const base=url.replace(/\/$/,'');if(!base.startsWith('https://'))throw Error('连接服务需要 HTTPS 地址');
 const r=await fetch(base+'/pair',{method:'POST'});if(!r.ok)throw Error('连接服务暂时不可用');
 const data=await r.json();return {url:base,token:data.deviceToken,mcpUrl:base+'/mcp/'+data.agentToken};
}
export function attachAi(connection:Connection,ops:()=>Operations){
 const controller=new AbortController();let stopped=false;
 (async()=>{while(!stopped){try{
  const r=await fetch(connection.url+'/device/poll',{headers:{Authorization:'Bearer '+connection.token},signal:controller.signal});if(!r.ok)throw Error('连接失效');
  const requests=await r.json();for(const request of requests){if(stopped)break;let response;try{response={result:executeAi(request.name,request.arguments||{},ops())}}catch(e){response={error:e instanceof Error?e.message:String(e)}}
   await fetch(connection.url+'/device/result',{method:'POST',headers:{Authorization:'Bearer '+connection.token,'Content-Type':'application/json'},body:JSON.stringify({id:request.id,...response}),signal:controller.signal});
  }
 }catch{if(!stopped)await new Promise(resolve=>setTimeout(resolve,3000))}}})();
 return ()=>{stopped=true;controller.abort()};
}

export async function disconnectAi(c:Connection){const r=await fetch(c.url+'/device/close',{method:'POST',headers:{Authorization:'Bearer '+c.token}});if(!r.ok&&r.status!==401)throw Error('关闭连接失败，请重试')}
