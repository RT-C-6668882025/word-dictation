import {executeAiCore} from './aiOperations';
import {parseText} from './parser';
import {updateWhitelist,type Book} from './wordbook';

// Runs in Rhino inside the Android service: no DOM, WebView or Capacitor bridge.
export function transact(raw:string,requestRaw:string):string {
 const state=JSON.parse(raw),r=JSON.parse(requestRaw),args={...r.arguments};delete args.operation_id;
 const fingerprint=JSON.stringify([r.name,args]);let next:Book[]=state.books,changedId='';
 try {
  const old=Object.prototype.hasOwnProperty.call(state.receipts||{},r.id)?state.receipts[r.id]:null;
  if(old){if(old.fingerprint!==fingerprint)throw Error('指令编号已被用于其他内容');return JSON.stringify({response:{result:old.result},state,changed:false})}
  const result=executeAiCore(r.name,args,{learning:()=>state.learning||{profiles:[],events:[]},saveLearning:learning=>{state.learning=learning;changedId='learning'},replaceBooks:(books,ids)=>{next=books;changedId=ids[0]},books:()=>state.books,remove:(book)=>{next=next.filter(b=>b.id!==book.id);changedId=book.id},rename:(book,name)=>{next=next.map(b=>b.id===book.id?{...b,name}:b);changedId=book.id},change:(book,ids,need)=>{const update=updateWhitelist(book,ids,need);next=next.map(b=>b.id===book.id?update.book:b);changedId=book.id;return update.changedIds},import:(raw,name,pageSize)=>{
   const words=parseText(raw);if(!words.length)throw Error('没有识别到正面 + 背面数据；未修改词库');
   const whitelist:Record<string,string[]>={};for(let i=0;i<words.length;i+=pageSize)whitelist[String(i/pageSize)]=words.slice(i,i+pageSize).map(w=>w.id);
   const book={id:Math.random().toString(36).slice(2),name:name.trim(),pageSize,words,whitelist};next=[...next,book];changedId=book.id;return book;
  }});
  if(changedId){const receipts:Record<string,any>=Object.create(null);for(const id of Object.keys(state.receipts||{})){const entry=state.receipts[id];if(Date.now()-entry.created<7*86400000)receipts[id]=entry}receipts[r.id]={fingerprint,result,created:Date.now()};state.books=next;state.receipts=receipts;state.revision=(state.revision||0)+1}
  return JSON.stringify({response:{result},state,changed:!!changedId});
 }catch(e){return JSON.stringify({response:{error:e instanceof Error?e.message:String(e),data_changed:false},state,changed:false})}
}

