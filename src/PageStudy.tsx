import {useEffect,useMemo,useRef,useState} from 'react';
import {bookPages,needIds,type Book} from './wordbook';
import {StudyPageContent,type StudyPageModel} from './StudyPageContent';
import {useNativeStudyPager} from './useNativeStudyPager';

type Props={book:Book;page:number;focusId?:string;suspended?:boolean;onPage:(page:number)=>void;onNeed:(id:string)=>void;onSpeak:(text:string)=>void};
export function PageStudy({book,page,focusId,suspended=false,onPage,onNeed,onSpeak}:Props){
 const pages=useMemo(()=>bookPages(book),[book]),safe=Math.max(0,Math.min(page,pages.length-1)),current=pages[safe];
 const lookup=useMemo(()=>new Map(book.words.map(w=>[w.id,w])),[book.words]),need=useMemo(()=>needIds(book),[book]);
 const [scope,setScope]=useState<'all'|'need'>('all'),[counts,setCounts]=useState<Record<string,number>>({}),[reset,setReset]=useState(0);
 const viewport=useRef<HTMLDivElement>(null),settleTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),lastIndex=useRef(safe),external=useRef(false);
 const pageKey=book.id+':'+current.id;
 const rules=useMemo(()=>JSON.stringify(pages.map(p=>[p.id,p.visible_count,p.word_ids])),[pages]);
 useEffect(()=>setCounts({}),[book.id,rules]);
 const entries=current.word_ids.filter(id=>lookup.has(id)&&(scope==='all'||need.has(id))),count=counts[current.id]??null,shown=Math.min(count??current.visible_count??entries.length,entries.length);
 const models=useMemo<StudyPageModel[]>(()=>pages.map(p=>({page:p,entries:p.word_ids.map(id=>lookup.get(id)).filter(w=>!!w).map(w=>({...w,needed:need.has(w.id)})),scope,count:counts[p.id]??null,reset,focusId:p.word_ids.includes(focusId||'')?focusId:undefined})),[pages,lookup,need,scope,counts,reset,focusId]);
 const {native,error}=useNativeStudyPager(viewport,models,safe,suspended,onPage,onNeed,onSpeak);
 useEffect(()=>{try{localStorage.setItem('wd_page_'+book.id,current.id)}catch{}},[book.id,current.id]);
 useEffect(()=>{if(!focusId)return;const index=current.word_ids.indexOf(focusId);if(index>=0){setScope('all');setCounts(c=>({...c,[current.id]:Math.max(index+1,current.visible_count??current.word_ids.length)}))}},[focusId,pageKey]);
 useEffect(()=>{if(native||!viewport.current)return;const el=viewport.current;const top=safe*el.clientHeight;if(Math.abs(el.scrollTop-top)>2){external.current=true;el.scrollTo({top,behavior:lastIndex.current===safe?'instant':'smooth'});clearTimeout(settleTimer.current);settleTimer.current=setTimeout(()=>external.current=false,500)}lastIndex.current=safe},[native,safe]);
 useEffect(()=>{if(native||!viewport.current)return;const el=viewport.current;const observer=new ResizeObserver(()=>{el.scrollTo({top:lastIndex.current*el.clientHeight,behavior:'instant'})});observer.observe(el);return()=>{observer.disconnect();clearTimeout(settleTimer.current)}},[native]);
 const move=(delta:number)=>{if(safe+delta>=0&&safe+delta<pages.length)onPage(safe+delta)};
 return <section className="pageStudy" aria-label="背记页面">
  <div className="pageControls"><div className="scopeControl"><button className={scope==='all'?'on':''} onClick={()=>setScope('all')}>本页全部</button><button className={scope==='need'?'on':''} onClick={()=>setScope('need')}>白名单</button></div><label>显示条数 <input aria-label="显示条数" type="number" min="0" max={entries.length} value={shown} onChange={e=>setCounts(c=>({...c,[current.id]:Math.max(0,Math.min(entries.length,Math.floor(Number(e.target.value)||0)))}))}/><span>/ {entries.length}</span></label><button className="ghost" onClick={()=>{setCounts({});setReset(r=>r+1)}}>重置显隐</button></div>
  <div className={'pageViewport'+(native?' nativePagerSlot':' snapPager')} ref={viewport} tabIndex={0} aria-label="上下拖动翻页，松手吸附"
   onTouchStart={()=>{external.current=false;clearTimeout(settleTimer.current)}} onWheel={()=>{external.current=false}}
   onScroll={()=>{if(native||external.current)return;clearTimeout(settleTimer.current);settleTimer.current=setTimeout(()=>{const el=viewport.current;if(!el||!el.clientHeight)return;const index=Math.max(0,Math.min(pages.length-1,Math.round(el.scrollTop/el.clientHeight)));if(index!==lastIndex.current){lastIndex.current=index;onPage(index)}},100)}}
   onKeyDown={e=>{if((e.target as HTMLElement).closest('button,input'))return;if(e.key==='PageDown'){e.preventDefault();move(1)}if(e.key==='PageUp'){e.preventDefault();move(-1)}}}>
   {native?<span className="nativePagerMessage" role="status">{error||'正在加载原生学习页…'}</span>:models.map((model,i)=><section className={'snapPage'+(i===safe?' isActive':'')} key={model.page.id} aria-label={'第 '+(i+1)+' 页'}><div className="pageScroller"><StudyPageContent model={model} onNeed={onNeed} onSpeak={onSpeak}/></div></section>)}
  </div>
  <div className="pageNavigation"><button className="ghost" disabled={safe===0} onClick={()=>move(-1)}>↑ 上一页</button><span role="status">{safe+1} / {pages.length}</span><button className="ghost" disabled={safe===pages.length-1} onClick={()=>move(1)}>下一页 ↓</button></div>
 </section>
}
