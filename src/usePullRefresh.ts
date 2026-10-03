import {useEffect,useRef,useState} from 'react';

// Refresh the list, never the WebView: saved selections and screen state survive.
export function usePullRefresh(enabled:boolean,refresh:()=>void){
 const latest=useRef(refresh);latest.current=refresh;
 const [distance,setDistance]=useState(0);
 useEffect(()=>{
  if(!enabled){setDistance(0);return;}
  let startX=0,startY=0,active=false,dy=0;
  const root=document.documentElement,previous=root.style.overscrollBehaviorY;
  root.style.overscrollBehaviorY='contain';
  const cancel=()=>{active=false;dy=0;setDistance(0)};
  const start=(e:TouchEvent)=>{
   cancel();
   if(e.touches.length!==1||window.scrollY>1||(e.target as HTMLElement).closest('input,textarea,select,dialog'))return;
   active=true;startX=e.touches[0].clientX;startY=e.touches[0].clientY;
  };
  const move=(e:TouchEvent)=>{
   if(!active)return;
   if(e.touches.length!==1){cancel();return;}
   const dx=e.touches[0].clientX-startX,next=e.touches[0].clientY-startY;
   if(next<0||Math.abs(dx)>Math.max(12,next)){cancel();return;}
   if(next>8&&next>Math.abs(dx)*1.2){
    if(e.cancelable)e.preventDefault();
    dy=next;setDistance(Math.min(next,140));
   }
  };
  const end=()=>{const ready=active&&dy>=80;cancel();if(ready)latest.current()};
  document.addEventListener('touchstart',start,{passive:true});
  document.addEventListener('touchmove',move,{passive:false});
  document.addEventListener('touchend',end);
  document.addEventListener('touchcancel',cancel);
  return()=>{root.style.overscrollBehaviorY=previous;document.removeEventListener('touchstart',start);document.removeEventListener('touchmove',move);document.removeEventListener('touchend',end);document.removeEventListener('touchcancel',cancel)};
 },[enabled]);
 return distance;
}
