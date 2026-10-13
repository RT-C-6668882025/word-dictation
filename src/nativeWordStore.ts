import {Capacitor,registerPlugin} from '@capacitor/core';
export const NativeAi=registerPlugin<any>('AiConnection');
export const nativeStateEvent='wd-native-state';
let saves:Promise<unknown>=Promise.resolve(),pending=0;
export function publishNativeState(snapshot:any,authoritative=false){if(pending&&!authoritative)return;window.dispatchEvent(new CustomEvent(nativeStateEvent,{detail:{snapshot,authoritative}}))}
export function saveNativeBooks(revision:number,books:unknown){
 pending++;const result=saves.catch(()=>{}).then(()=>NativeAi.saveBooks({revision,books:JSON.stringify(books)})).finally(()=>pending--);
 saves=result;return result;
}
export async function refreshNativeState(initial?:string):Promise<any>{const checkpoint=saves;await checkpoint.catch(()=>{});const state=await NativeAi.getWordState({initial});if(checkpoint!==saves)return refreshNativeState(initial);publishNativeState(state,true);return state}
export async function allowBackground(){if(Capacitor.isNativePlatform())await NativeAi.allowBackground()}
