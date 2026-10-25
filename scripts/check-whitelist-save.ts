import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['src/nativeWordStore.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'native-mock',setup(b){b.onResolve({filter:/^@capacitor\/core$/},()=>({path:'mock',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const Capacitor={isNativePlatform:()=>true};export const registerPlugin=()=>globalThis.nativeMock;'}))}}]});
let state:any={revision:3,books:[{id:'a',name:'a',pageSize:3,words:['x','y','z'].map(id=>({id,blocks:[{id:'b',text:id}]})),whitelist:{'0':['x','y','z']}}]};
const clone=(x:any)=>JSON.parse(JSON.stringify(x));
const initial=clone(state.books);
(globalThis as any).nativeMock={getWordState:async()=>clone(state),saveBooks:async({revision,books}:any)=>{assert.equal(revision,state.revision);state={...state,revision:revision+1,books:JSON.parse(books)};return clone(state)}};
(globalThis as any).window={dispatchEvent:()=>{}};
const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const first=clone(initial);first[0].whitelist={'0':['x','z']};
const final=clone(initial);final[0].whitelist={'0':['z']};
// AI changed revision while the user was editing. Latest user whitelist wins.
await Promise.all([api.saveNativeBooks(1,first,initial),api.saveNativeBooks(2,final,first)]);
assert.deepEqual(state.books[0].whitelist['0'],['z']);
assert.equal(state.revision,5);
assert.equal(state.books[0].name,'a');
console.log('Queued whitelist saves rebase safely and preserve the final user list');
