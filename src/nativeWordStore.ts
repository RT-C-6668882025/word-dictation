import {needIds,updateWhitelist,type Book} from './wordbook';
import {Capacitor,registerPlugin} from '@capacitor/core';
export const NativeAi=registerPlugin<any>('AiConnection');
export const nativeStateEvent='wd-native-state';
let saves:Promise<unknown>=Promise.resolve(),pending=0;
export function publishNativeState(snapshot:any,authoritative=false){if(pending&&!authoritative)return;window.dispatchEvent(new CustomEvent(nativeStateEvent,{detail:{snapshot,authoritative}}))}
export function saveNativeBooks(revision:number,books:Book[],baseBooks?:Book[]){
 const strip=(b:Book)=>({...b,whitelist:{}});
 const whitelistOnly=baseBooks&&baseBooks.length===books.length&&books.every((b,i)=>JSON.stringify(strip(b))===JSON.stringify(strip(baseBooks[i])));
 const changes=whitelistOnly?books.filter((b,i)=>JSON.stringify(b.whitelist)!==JSON.stringify(baseBooks![i].whitelist)):[];
 pending++;const result=saves.catch(()=>{}).then(async()=>{const state=await NativeAi.getWordState({});let next=books;if(state.revision!==revision){if(!whitelistOnly)throw Error('词库版本已变化，请重试本次操作');next=state.books.map((book:Book)=>{const desired=changes.find(b=>b.id===book.id);if(!desired)return book;const known=new Set(baseBooks!.find(b=>b.id===book.id)!.words.map(w=>w.id));const wanted=needIds(desired);const cleared=updateWhitelist(book,book.words.filter(w=>known.has(w.id)).map(w=>w.id),false).book;return updateWhitelist(cleared,[...wanted],true).book})}return NativeAi.saveBooks({revision:state.revision,books:JSON.stringify(next)})}).finally(()=>pending--);
 saves=result;return result;
}
export async function refreshNativeState(initial?:string):Promise<any>{const checkpoint=saves;await checkpoint.catch(()=>{});const state=await NativeAi.getWordState({initial});if(checkpoint!==saves)return refreshNativeState(initial);publishNativeState(state,true);return state}
export async function allowBackground(){if(Capacitor.isNativePlatform())await NativeAi.allowBackground()}

