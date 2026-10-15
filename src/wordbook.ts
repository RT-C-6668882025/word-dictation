import {contentBlocks,type ParsedWord} from './parser';
export type BookPage={id:string;title?:string;word_ids:string[];columns:1|2|3;visible_count?:number};
export type Book={id:string;name:string;pageSize:number;words:ParsedWord[];whitelist:Record<string,string[]>;pages?:BookPage[]};
export function bookPages(book:Book):BookPage[]{
 if(book.pages)return book.pages;
 const pages:BookPage[]=[];const size=Math.max(1,book.pageSize||book.words.length||1);
 for(let i=0;i<book.words.length;i+=size)pages.push({id:'legacy-'+i/size,word_ids:book.words.slice(i,i+size).map(w=>w.id),columns:1});
 return pages.length?pages:[{id:'legacy-0',word_ids:[],columns:1}];
}
export function pageOf(book:Book,id:string){return bookPages(book).findIndex(p=>p.word_ids.includes(id))}
export function needIds(book:Book){return new Set(bookPages(book).flatMap((p,i)=>p.word_ids.filter(id=>(book.whitelist[String(i)]||[]).includes(id))))}
export function withPages(book:Book,pages:BookPage[],words=book.words,need=needIds(book)):Book {
 const whitelist:Record<string,string[]>={};pages.forEach((p,i)=>{whitelist[String(i)]=p.word_ids.filter(id=>need.has(id))});
 const byId=new Map(words.map(w=>[w.id,w]));return {...book,pages,words:pages.flatMap(p=>p.word_ids.map(id=>byId.get(id)!)),whitelist};
}
export function migrateBook(book:Book):Book{return {...book,pages:bookPages(book),words:book.words.map(w=>w.blocks?w:{id:w.id,blocks:contentBlocks(w),visible_count:1})}}
export function updateWhitelist(book:Book,ids:string[],need:boolean){
 const selected=new Set(ids),whitelist={...book.whitelist},changedIds:string[]=[];
 bookPages(book).forEach((p,i)=>{const entries=new Set(whitelist[String(i)]||[]);for(const id of p.word_ids){if(!selected.has(id)||entries.has(id)===need)continue;need?entries.add(id):entries.delete(id);changedIds.push(id)}whitelist[String(i)]=[...entries]});
 return {book:{...book,whitelist},changedIds};
}
