import {parseBlockEntry,contentBlocks,type ParsedWord} from './parser';
import {bookPages,needIds,withPages,type Book,type BookPage} from './wordbook';
const uid=()=>Math.random().toString(36).slice(2)+Date.now().toString(36);
export const pageTools=['compose_wordbook','set_wordbook_pages'];
export function parsePages(raw:any,old?:Book){
 if(!Array.isArray(raw)||!raw.length)throw Error('pages 需要至少一页');
 const pageIds=new Set<string>(),wordIds=new Set<string>(),words:ParsedWord[]=[],need=new Set<string>();const oldNeed=old?needIds(old):new Set<string>();
 const pages:BookPage[]=raw.map(p=>{
  if(!p||!Array.isArray(p.entries))throw Error('每页需要 entries 数组');const id=p.id??uid();if(typeof id!=='string'||!id||pageIds.has(id))throw Error('页面 ID 不能为空或重复');pageIds.add(id);
  const columns=p.columns??1;if(![1,2,3].includes(columns))throw Error('columns 只能为 1、2、3');if(p.title!==undefined&&typeof p.title!=='string')throw Error('title 必须为文本');
  const ids:string[]=p.entries.map((entry:any)=>{
   if(entry?.in_whitelist!==undefined&&typeof entry.in_whitelist!=='boolean')throw Error('in_whitelist 必须为布尔值');
   const word=parseBlockEntry(entry);if(typeof word.id!=='string'||!word.id||wordIds.has(word.id))throw Error('内容 ID 不能为空或重复');wordIds.add(word.id);words.push(word);
   if(entry.in_whitelist??(old?.words.some(w=>w.id===word.id)?oldNeed.has(word.id):true))need.add(word.id);return word.id;
  });
  const visible=p.visible_count??ids.length;if(!Number.isInteger(visible)||visible<0||visible>ids.length)throw Error('页面 visible_count 必须为 0 到本页条目数的整数');
  return {id,...(p.title!==undefined?{title:p.title}:{}),columns,word_ids:ids,visible_count:visible};
 });return {pages,words,need};
}
export function planPages(tool:string,a:Record<string,any>,books:Book[]){
 const old=a.book_id?books.find(b=>b.id===a.book_id):undefined;if(a.book_id&&!old)throw Error('词库不存在');
 if(tool==='set_wordbook_pages'){
  if(!old)throw Error('需要 book_id');const pages=bookPages(old),ids=new Set<string>();
  if(!Array.isArray(a.pages)||!a.pages.length)throw Error('pages 需要至少一页');
  const next:BookPage[]=a.pages.map((p:any)=>{if(!p||typeof p.id!=='string'||!p.id)throw Error('页面 ID 不能为空');const page=pages.find(v=>v.id===p.id)??{id:p.id,columns:1,word_ids:[]} as BookPage;if(ids.has(p.id))throw Error('页面 ID 重复');ids.add(p.id);
   const word_ids=p.word_ids??page.word_ids;if(!Array.isArray(word_ids)||word_ids.some((id:any)=>typeof id!=='string'||!old.words.some(w=>w.id===id)))throw Error('包含不存在的内容 ID');
   const columns=p.columns??page.columns,visible=p.visible_count??Math.min(page.visible_count??word_ids.length,word_ids.length);if(![1,2,3].includes(columns)||!Number.isInteger(visible)||visible<0||visible>word_ids.length)throw Error('页面排版或显隐数量错误');if(p.title!==undefined&&typeof p.title!=='string')throw Error('title 必须为文本');
   return {...page,...(p.title!==undefined?{title:p.title}:{}),word_ids,columns,visible_count:visible};
  });
  const arranged=next.flatMap(p=>p.word_ids);if(arranged.length!==old.words.length||new Set(arranged).size!==old.words.length)throw Error('重新编排必须包含全部内容且各出现一次；删改正文请用内容管理工具');
  const book=withPages(old,next);return finish(books,book,old);
 }
 if(old&&a.expected_name!==old.name)throw Error('替换词库需要 expected_name 与当前名称一致');
 const name=a.name??old?.name;if(typeof name!=='string'||!name.trim())throw Error('需要词库名称');
 const {pages,words,need}=parsePages(a.pages,old);const book=withPages({id:old?.id??uid(),name:name.trim(),pageSize:1,words,whitelist:{}},pages,words,need);return finish(books,book,old);
}
function finish(books:Book[],book:Book,old?:Book){return {books:old?books.map(b=>b.id===old.id?book:b):[...books,book],changedIds:[book.id],result:{book_id:book.id,id:book.id,name:book.name,count:book.words.length,page_count:bookPages(book).length,pages:bookPages(book),changed_count:1,saved:true}}}
export function exportPages(book:Book){const lookup=new Map(book.words.map(w=>[w.id,w])),need=needIds(book);return bookPages(book).map(p=>({...p,entries:p.word_ids.map(id=>{const w=lookup.get(id)!;return {id,blocks:contentBlocks(w),visible_count:w.visible_count??1,layout:w.layout??'auto',in_whitelist:need.has(id)}})}))}
