import type {Book} from './wordbook';
export type Operations={books:()=>Book[];change:(book:Book,ids:string[],need:boolean)=>string[]|Promise<string[]>;import:(raw:string,name:string,pageSize:number)=>Book|Promise<Book>};
export function executeAiCore(name:string,a:Record<string,any>,ops:Operations){
 if(name==='list_wordbooks')return ops.books().map(b=>({id:b.id,name:b.name,count:b.words.length,pageSize:b.pageSize}));
 if(name==='import_wordbook'||name==='create_temp_wordbook'){
  if(typeof a.text!=='string'||!a.text.trim()||typeof a.name!=='string'||!a.name.trim())throw Error('需要词库名称和中英词表 text');
  const ps=a.page_size??50;if(!Number.isInteger(ps)||ps<10||ps>200)throw Error('page_size 必须为 10–200 的整数');
  return mapResult(ops.import(a.text,name==='create_temp_wordbook'?'[临时] '+a.name:a.name,ps),b=>({id:b.id,name:b.name,count:b.words.length,saved:true}));
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
  return mapResult(ops.change(b,ids,name==='add_to_whitelist'),changed=>({book_id:b.id,requested_count:ids.length,changed_count:changed.length,unchanged_count:ids.length-changed.length,changed_ids:changed,saved:true}));
 }
 throw Error('未知工具');
}

function mapResult<T>(value:T|Promise<T>,map:(v:T)=>any):any{return value&&typeof (value as any).then==='function'?(value as Promise<T>).then(map):map(value as T)}
export async function executeAi(name:string,a:Record<string,any>,ops:Operations){return executeAiCore(name,a,ops)}
