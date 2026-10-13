import {Capacitor,registerPlugin} from '@capacitor/core';
export const NativeAi=registerPlugin<any>('AiConnection');
export const nativeStateEvent='wd-native-state';
let saves:Promise<unknown>=Promise.resolve();
export function publishNativeState(snapshot:any,authoritative=false){window.dispatchEvent(new CustomEvent(nativeStateEvent,{detail:{snapshot,authoritative}}))}
export function saveNativeBooks(revision:number,books:unknown){
 const result=saves.catch(()=>{}).then(()=>NativeAi.saveBooks({revision,books:JSON.stringify(books)}));
 saves=result;return result;
}
export async function refreshNativeState(initial?:string){await saves.catch(()=>{});const state=await NativeAi.getWordState({initial});publishNativeState(state,true);return state}
export async function allowBackground(){if(Capacitor.isNativePlatform())await NativeAi.allowBackground()}
