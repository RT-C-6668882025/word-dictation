import {createRoot} from 'react-dom/client';
import {StudyPageContent,type StudyPageModel} from './StudyPageContent';
import './pageStudy.css';
declare global{interface Window{StudyPageHost?:{postMessage:(json:string)=>void};receiveStudyPage?:(model:StudyPageModel)=>void}}
const root=createRoot(document.getElementById('root')!);
const post=(action:string,value:string)=>window.StudyPageHost?.postMessage(JSON.stringify({action,value}));
window.receiveStudyPage=model=>root.render(<StudyPageContent model={model} onNeed={id=>post('need',id)} onSpeak={text=>post('speak',text)}/>);
