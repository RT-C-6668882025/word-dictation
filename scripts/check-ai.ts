import assert from 'node:assert/strict';
import {executeAi} from '../src/aiBridge.ts';
import {updateWhitelist,type Book} from '../src/wordbook.ts';
import {parseText} from '../src/parser.ts';
let books:Book[]=[{id:'a',name:'A',pageSize:10,words:Array.from({length:25},(_,i)=>({id:'w'+i,en:'word'+i,zh:'释义'+i})),whitelist:{'0':['w0'],'1':['w10']}},{id:'b',name:'B',pageSize:10,words:[],whitelist:{}}];
const ops={books:()=>books,change:(book:Book,ids:string[],need:boolean)=>{const r=updateWhitelist(book,ids,need);books=books.map(b=>b.id===book.id?r.book:b);return r.changedIds},import:(raw:string,name:string,pageSize:number)=>{const words=parseText(raw);if(!words.length)throw Error('Empty');const b={id:'new',name,pageSize,words,whitelist:{'0':words.map(w=>w.id)}};books.push(b);return b}};
assert.equal((await executeAi('list_wordbooks',{},ops) as any[]).length,2);
const rows=await executeAi('get_words',{book_id:'a',offset:9,limit:3},ops) as any;assert.equal(rows.words[1].page,2);assert.equal(rows.words[1].in_whitelist,true);assert.equal(rows.next_offset,12);
const added=await executeAi('add_to_whitelist',{book_id:'a',word_ids:['w0','w2','w11','w24','w24']},ops) as any;assert.deepEqual(added.changed_ids,['w2','w11','w24']);assert.equal(added.requested_count,4);assert.equal(added.unchanged_count,1);
await executeAi('remove_from_whitelist',{book_id:'a',word_ids:added.changed_ids},ops);assert.deepEqual(books[0].whitelist['0'],['w0']);assert.deepEqual(books[0].whitelist['1'],['w10']);assert.deepEqual(books[1].whitelist,{});
const before=JSON.stringify(books);await assert.rejects(()=>executeAi('remove_from_whitelist',{book_id:'a',word_ids:['w0','bad']},ops));assert.equal(JSON.stringify(books),before);
await assert.rejects(()=>executeAi('get_words',{book_id:'a',limit:501},ops));await assert.rejects(()=>executeAi('import_wordbook',{name:'bad',text:'no words'},ops));
const temp=await executeAi('create_temp_wordbook',{name:'金融',text:'money,钱\nbank,银行',page_size:10},ops) as any;assert.equal(temp.name,'[临时] 金融');assert.equal(temp.count,2);assert.equal(temp.saved,true);
await assert.rejects(()=>executeAi('add_to_whitelist',{book_id:'a',word_ids:['w2']},{...ops,change:async()=>{throw Error('disk failed')}}));
console.log('AI operations, counts and persistence failure passed');

const longBooks:Book[]=[{id:'long',name:'长卡片',pageSize:50,whitelist:{},words:Array.from({length:40},(_,i)=>({id:'long'+i,front:'Q'+i,back:'长内容'.repeat(3000)}))}];
let offset=0,read=0;do{const page=await executeAi('get_words',{book_id:'long',offset,limit:40},{...ops,books:()=>longBooks}) as any;assert(page.words.length>0);assert(Buffer.byteLength(JSON.stringify(page))<800000);assert.equal(page.words[0].back,longBooks[0].words[offset].back);read+=page.words.length;offset=page.next_offset}while(offset!==null);assert.equal(read,40);
console.log('Long-card MCP pagination returns complete cards within transport capacity');
