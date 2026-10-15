import {parseText,parseBlockEntry,contentBlocks,frontText,backText,type ParsedWord} from './parser';
import {bookPages,needIds,withPages,type Book} from './wordbook';
export const managementTools=['add_cards','update_cards','delete_cards','merge_wordbooks','split_wordbook','set_wordbook_page_size'];
type Plan={books:Book[];changedIds:string[];result:Record<string,any>};
function requiredBook(books:Book[],id:unknown){const b=books.find(b=>b.id===id);if(!b)throw Error('词库不存在');return b}
function pageSize(value:unknown,fallback:number){const n=value??fallback;if(!Number.isInteger(n)||Number(n)<10||Number(n)>200)throw Error('page_size 必须为 10–200 的整数');return n as number}
function name(value:unknown){if(typeof value!=='string'||!value.trim())throw Error('词库名称不能为空');return value.trim()}
function needed(book:Book){return needIds(book)}
function rebuild(book:Book,words:ParsedWord[],need:Set<string>,size=book.pageSize):Book{
 if(book.pages){const known=new Set(words.map(w=>w.id)),existing=new Set(book.pages.flatMap(p=>p.word_ids));const added=words.filter(w=>!existing.has(w.id)).map(w=>w.id);const pages=bookPages(book).map((p,i)=>{const ids=p.word_ids.filter(id=>known.has(id));if(i===book.pages!.length-1)ids.push(...added);return {...p,word_ids:ids,visible_count:Math.min(p.visible_count??ids.length,ids.length)}});return withPages(book,pages,words,need)}
 const whitelist:Record<string,string[]>={};words.forEach((w,i)=>{const p=String(Math.floor(i/size));if(!whitelist[p])whitelist[p]=[];if(need.has(w.id))whitelist[p].push(w.id)});return {...book,words,pageSize:size,whitelist};
}
function selection(value:unknown,book:Book){if(!Array.isArray(value)||!value.length||value.length>500||value.some(id=>typeof id!=='string'))throw Error('word_ids 需要 1–500 个内容 ID');const ids=new Set<string>(value);if([...ids].some(id=>!book.words.some(w=>w.id===id)))throw Error('包含不存在的内容 ID，未修改');return ids}
function freshId(used:Set<string>){let id:string;do{id=Math.random().toString(36).slice(2)+Date.now().toString(36)}while(used.has(id));used.add(id);return id}
function content(value:any,old?:ParsedWord){if(!value||typeof value!=='object'||Array.isArray(value))throw Error('卡片格式错误');const allowed=old?['word_id','front','back','format','blocks','visible_count']:['front','back','format','blocks','visible_count'];if(Object.keys(value).some(k=>!allowed.includes(k)))throw Error('不支持的内容字段；请使用 blocks、visible_count，修改时提供 word_id');if(value.blocks!==undefined||value.visible_count!==undefined||old?.blocks){if(value.front!==undefined||value.back!==undefined||value.format!==undefined)throw Error('内容块条目请使用 blocks 和 visible_count');if(old&&value.blocks===undefined&&value.visible_count===undefined)throw Error('修改内容不能为空');return parseBlockEntry({blocks:value.blocks??(old?contentBlocks(old):undefined),visible_count:value.visible_count??old?.visible_count})}if(old&&!['front','back','format'].some(k=>Object.prototype.hasOwnProperty.call(value,k)))throw Error('修改内容不能为空');return parseText(JSON.stringify([{front:value.front===undefined&&old?frontText(old):value.front,back:value.back===undefined&&old?backText(old):value.back,format:value.format===undefined?(old?.format||'text'):value.format}]))[0]}
export function planManagement(tool:string,a:Record<string,any>,books:Book[]):Plan {
 const finish=(next:Book[],ids:string[],result:Record<string,any>):Plan=>({books:next,changedIds:ids,result:{...result,saved:true}});
 if(tool==='merge_wordbooks'){
  if(!Array.isArray(a.book_ids)||a.book_ids.length<2||a.book_ids.length>20||a.book_ids.some((id:any)=>typeof id!=='string')||new Set(a.book_ids).size!==a.book_ids.length)throw Error('book_ids 需要 2–20 个不同词库 ID');
  const sources:Book[]=a.book_ids.map((id:string)=>requiredBook(books,id)),id=freshId(new Set(books.map(b=>b.id))),size=pageSize(a.page_size,sources[0].pages?50:sources[0].pageSize),title=name(a.name),words:ParsedWord[]=[],need=new Set<string>(),used=new Set<string>();let reassigned=0;
  for(const source of sources){const oldNeed=needed(source);for(const word of source.words){let nextId=word.id;if(used.has(nextId)){nextId=freshId(used);reassigned++}else used.add(nextId);words.push({...word,id:nextId});if(oldNeed.has(word.id))need.add(nextId)}}
  let book=rebuild({id,name:title,words:[],pageSize:size,whitelist:{}},words,need,size);if(sources.some(b=>b.pages)){let cursor=0;const pageIds=new Set<string>();const pages=sources.flatMap(source=>{const mapped=new Map(source.words.map((w,i)=>[w.id,words[cursor+i].id]));cursor+=source.words.length;return bookPages(source).map(p=>({...p,id:freshId(pageIds),word_ids:p.word_ids.map(id=>mapped.get(id)!)}))});book=withPages(book,pages,words,need)}
  return finish([...books,book],[id],{book_id:id,name:title,count:words.length,source_book_ids:a.book_ids,sources_preserved:true,reassigned_id_count:reassigned,changed_count:1});
 }
 const stored=requiredBook(books,a.book_id),book=a.page_id&&!stored.pages?{...stored,pages:bookPages(stored)}:stored,need=needed(book),replace=(next:Book,result:Record<string,any>)=>finish(books.map(b=>b.id===book.id?next:b),[book.id],{book_id:book.id,...result});
 if(tool==='set_wordbook_page_size'){if(book.pages)throw Error('该词库采用 Agent 编排页面，请使用 set_wordbook_pages');const size=pageSize(a.page_size,book.pages?50:book.pageSize);return replace(rebuild(book,book.words,need,size),{previous_page_size:book.pageSize,page_size:size,count:book.words.length,changed_count:size===book.pageSize?0:1})}
 if(tool==='add_cards'){
  if(!Array.isArray(a.cards)||!a.cards.length||a.cards.length>500)throw Error('cards 需要 1–500 条卡片');if(a.in_whitelist!==undefined&&typeof a.in_whitelist!=='boolean')throw Error('in_whitelist 必须为布尔值');
  const used=new Set(book.words.map(w=>w.id)),cards=a.cards.map((v:any)=>({...content(v),id:freshId(used)}));if(a.in_whitelist!==false)cards.forEach((w:ParsedWord)=>need.add(w.id));
  const position=a.position??book.words.length+1;if(!Number.isInteger(position)||position<1||position>book.words.length+1)throw Error('position 是从 1 开始的插入位置，最大为内容数 + 1');const words=[...book.words.slice(0,position-1),...cards,...book.words.slice(position-1)];
  let next=rebuild(book,words,need);if(book.pages){const target=a.page_id??book.pages[book.pages.length-1]?.id;if(!book.pages.some(p=>p.id===target))throw Error('新增内容的 page_id 不存在');const addedIds=new Set(cards.map((w:ParsedWord)=>w.id));const pages=book.pages.map(p=>{const ids=p.word_ids.filter(id=>!addedIds.has(id));if(p.id===target){const position=a.position??ids.length+1;if(!Number.isInteger(position)||position<1||position>ids.length+1)throw Error('position 超出页面范围');ids.splice(position-1,0,...cards.map((w:ParsedWord)=>w.id))}return {...p,word_ids:ids,visible_count:p.visible_count===undefined?ids.length:p.visible_count}});next=withPages(book,pages,words,need)}return replace(next,{added_count:cards.length,changed_count:cards.length,added_ids:cards.map((w:ParsedWord)=>w.id),count:words.length});
 }
 if(tool==='update_cards'){
  if(!Array.isArray(a.cards)||!a.cards.length||a.cards.length>500)throw Error('cards 需要 1–500 条修改');const ids=selection(a.cards.map((v:any)=>v?.word_id),book);if(ids.size!==a.cards.length)throw Error('同一内容不能在一批中重复修改');const edits=new Map<string,ParsedWord>();
  for(const patch of a.cards){const old=book.words.find(w=>w.id===patch.word_id)!;edits.set(old.id,{...content(patch,old),id:old.id})}
  const changed:string[]=[];const words=book.words.map(w=>{const edit=edits.get(w.id);if(!edit)return w;if(JSON.stringify({...w,id:''})===JSON.stringify({...edit,id:''}))return w;changed.push(w.id);return edit});
  return replace(rebuild(book,words,need),{changed_count:changed.length,changed_ids:changed,count:words.length});
 }
 if(tool==='delete_cards'){const ids=selection(a.word_ids,book),words=book.words.filter(w=>!ids.has(w.id));return replace(rebuild(book,words,need),{deleted_count:ids.size,changed_count:ids.size,deleted_ids:[...ids],count:words.length})}
 if(tool==='split_wordbook'){
  const ids=selection(a.word_ids,book),title=name(a.name),size=pageSize(a.page_size,book.pages?50:book.pageSize);if(a.move!==undefined&&typeof a.move!=='boolean')throw Error('move 必须为布尔值');if(a.move&&a.expected_name!==book.name)throw Error('原词库名称不匹配，未移动');
  const id=freshId(new Set(books.map(b=>b.id))),selected=book.words.filter(w=>ids.has(w.id)),base={id,name:title,pageSize:size,words:[],whitelist:{}} as Book,created=book.pages?withPages(base,bookPages(book).map(p=>({...p,word_ids:p.word_ids.filter(id=>ids.has(id)),visible_count:Math.min(p.visible_count??p.word_ids.length,p.word_ids.filter(id=>ids.has(id)).length)})).filter(p=>p.word_ids.length),selected,need):rebuild(base,selected,need,size);const next=a.move?books.map(b=>b.id===book.id?rebuild(book,book.words.filter(w=>!ids.has(w.id)),need):b):books;
  return finish([...next,created],a.move?[book.id,id]:[id],{book_id:id,name:title,source_book_id:book.id,count:selected.length,moved:!!a.move,sources_preserved:!a.move,changed_count:selected.length});
 }
 throw Error('未知管理工具');
}
