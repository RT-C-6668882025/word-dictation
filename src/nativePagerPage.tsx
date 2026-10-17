import {createRoot} from 'react-dom/client';
import {StudyPageContent,type StudyPageModel} from './StudyPageContent';
import './pageStudy.css';
declare global{interface Window{StudyPageHost?:{postMessage:(json:string)=>void};receiveStudyPage?:(model:StudyPageModel)=>void}}
const root=createRoot(document.getElementById('root')!);
const post=(action:string,value:string)=>window.StudyPageHost?.postMessage(JSON.stringify({action,value}));
let startX=0,startY=0,startTime=0;
window.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;startX=e.touches[0].clientX;startY=e.touches[0].clientY;startTime=Date.now()},{passive:true});
window.addEventListener('touchend',e=>{if(!startTime||!e.changedTouches.length)return;const dx=e.changedTouches[0].clientX-startX,dy=e.changedTouches[0].clientY-startY;if(startX<=48&&dx>70&&Math.abs(dx)>Math.abs(dy)*1.6&&Date.now()-startTime<900)post('menu','');startTime=0},{passive:true});
window.receiveStudyPage=model=>root.render(<StudyPageContent model={model} onNeed={id=>post('need',id)} onSpeak={text=>post('speak',text)}/>);
