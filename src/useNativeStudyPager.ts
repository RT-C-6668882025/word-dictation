import {useEffect,useRef,useState,type RefObject} from 'react';
import {Capacitor,registerPlugin,type PluginListenerHandle} from '@capacitor/core';
import type {StudyPageModel} from './StudyPageContent';
const Pager=registerPlugin<{update:(data:any)=>Promise<void>;layout:(data:any)=>Promise<void>;close:(data:any)=>Promise<void>;addListener:(event:string,fn:(data:any)=>void)=>Promise<PluginListenerHandle>}>('StudyPager');
export function useNativeStudyPager(view:RefObject<HTMLDivElement|null>,models:StudyPageModel[],current:number,suspended:boolean,onPage:(page:number)=>void,onNeed:(id:string)=>void,onSpeak:(text:string)=>void){
 const native=Capacitor.isNativePlatform(),owner=useRef('pager-'+Math.random().toString(36).slice(2)),[error,setError]=useState('');
 const latest=useRef({models,current,suspended,onPage,onNeed,onSpeak});latest.current={models,current,suspended,onPage,onNeed,onSpeak};
 const [connected,setConnected]=useState(false);
 useEffect(()=>{if(!native)return;let stopped=false,handle:PluginListenerHandle|undefined;
  Pager.addListener('action',event=>{if(stopped||event.owner!==owner.current)return;const data=latest.current;if(event.action==='page'&&Number.isInteger(event.index)&&data.models[event.index])data.onPage(event.index);if(event.action==='need'&&data.models.some(m=>m.entries.some(w=>w.id===event.value)))data.onNeed(event.value);if(event.action==='speak'&&typeof event.value==='string')data.onSpeak(event.value);if(event.action==='error')setError('原生学习页加载失败，请退出词库后重试。')}).then(h=>{if(stopped){h.remove();return}handle=h;setConnected(true)}).catch(()=>setError('原生翻页启动失败，请更新安装包后重试。'));
  return()=>{stopped=true;handle?.remove();Pager.close({owner:owner.current}).catch(()=>{})};
 },[native]);
 useEffect(()=>{if(!native||!connected)return;const el=view.current;if(!el)return;
  const rect=()=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,viewportWidth:window.innerWidth}};
  Pager.update({owner:owner.current,models:JSON.stringify(models),current,visible:!suspended,...rect()}).catch(()=>setError('原生翻页更新失败，请退出词库后重试。'));
 },[native,connected,models,current,suspended,view]);
 useEffect(()=>{if(!native||!connected||!view.current)return;const el=view.current;let frame=0;const measure=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const r=el.getBoundingClientRect();Pager.layout({owner:owner.current,x:r.x,y:r.y,width:r.width,height:r.height,viewportWidth:window.innerWidth}).catch(()=>{})})};const observer=new ResizeObserver(measure);observer.observe(el);window.addEventListener('resize',measure);window.visualViewport?.addEventListener('resize',measure);measure();return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',measure);window.visualViewport?.removeEventListener('resize',measure)}},[native,connected,view]);
 return {native,error};
}
