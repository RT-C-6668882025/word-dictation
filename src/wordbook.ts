import type {ParsedWord} from './parser';
export type Book={id:string;name:string;pageSize:number;words:ParsedWord[];whitelist:Record<string,string[]>};
export function updateWhitelist(book:Book,ids:string[],need:boolean){
 const selected=new Set(ids),whitelist={...book.whitelist},changedIds:string[]=[];
 book.words.forEach((w,i)=>{if(!selected.has(w.id))return;const k=String(Math.floor(i/book.pageSize)),entries=new Set(whitelist[k]||[]);if(entries.has(w.id)===need)return;need?entries.add(w.id):entries.delete(w.id);whitelist[k]=[...entries];changedIds.push(w.id)});
 return {book:{...book,whitelist},changedIds};
}
