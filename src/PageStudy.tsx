import {useEffect,useMemo,useRef,useState} from 'react';
import {bookPages,needIds,type Book} from './wordbook';
import {StudyPageContent,type StudyPageModel} from './StudyPageContent';
import {useNativeStudyPager} from './useNativeStudyPager';

type Props={book:Book;page:number;focusId?:string;suspended?:boolean;onPage:(page:number)=>void;onNeed:(id:string)=>void;onSpeak:(text:string)=>void};
export function PageStudy({book,page,focusId,suspended=false,onPage,onNeed,onSpeak}:Props){
 const pages=useMemo(()=>bookPages(book),[book]),safe=Math.max(0,Math.min(page,pages.length-1)),current=pages[safe];
 const lookup=useMemo(()=>new Map(book.words.map(w=>[w.id,w])),[book.words]),need=useMemo(()=>needIds(book),[book]);
 const [scope,setScope]=useState<'all'|'need'>('all'),[mode,setMode]=useState<'feed'|'page'>('feed'),[feedIndex,setFeedIndex]=useState(0),[counts,setCounts]=useState<Record<string,number>>({}),[reset,setReset]=useState(0);
 const viewport=useRef<HTMLDivElement>(null),settleTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),lastIndex=useRef(safe),external=useRef(false);
 const pageKey=book.id+':'+current.id;
 const rules=useMemo(()=>JSON.stringify(pages.map(p=>[p.id,p.visible_count,p.word_ids])),[pages]);
 useEffect(()=>setCounts({}),[book.id,rules]);
 const entries=current.word_ids.filter(id=>lookup.has(id)&&(scope==='all'||need.has(id))),count=counts[current.id]??null,shown=Math.min(count??current.visible_count??entries.length,entries.length);
 const models=useMemo<StudyPageModel[]>(()=>pages.map(p=>({page:p,entries:p.word_ids.map(id=>lookup.get(id)).filter(w=>!!w).map(w=>({...w,needed:need.has(w.id)})),scope,count:counts[p.id]??null,reset,focusId:p.word_ids.includes(focusId||'')?focusId:undefined})),[pages,lookup,need,scope,counts,reset,focusId]);
 const feed=useMemo(()=>pages.flatMap((p,source)=>p.word_ids.flatMap((id,position)=>{const word=lookup.get(id);return word&&(scope==='all'||need.has(id))?[{source,id,model:{page:{id:'feed:'+p.id+':'+position,word_ids:[id],columns:1 as const,visible_count:1},entries:[{...word,needed:need.has(id)}],scope:'all' as const,count:null,reset,focusId:id===focusId?id:undefined}}]:[]})),[pages,lookup,need,scope,reset,focusId]);
 const targetId=useRef<string|null>(null);
 const activeFeed=Math.max(0,Math.min(feedIndex,feed.length-1));
 const activeIndex=mode==='feed'?activeFeed:safe,activeModels=mode==='feed'?(feed.length?feed.map(item=>item.model):[{page:{id:'feed-empty',word_ids:[],columns:1 as const},entries:[],scope:'all' as const,count:null,reset}]):models;
 const selectIndex=(index:number)=>{if(mode==='page'){onPage(index);return}const item=feed[index];if(!item)return;setFeedIndex(index);if(item.source!==safe)onPage(item.source)};
 const {native,error}=useNativeStudyPager(viewport,activeModels,activeIndex,suspended,selectIndex,onNeed,onSpeak);
 useEffect(()=>{const index=feed.findIndex(item=>item.source===safe);setFeedIndex(index>=0?index:0)},[book.id]);
 useEffect(()=>{if(!targetId.current)return;const index=feed.findIndex(item=>item.id===targetId.current);setFeedIndex(index>=0?index:Math.min(feedIndex,Math.max(0,feed.length-1)));targetId.current=null},[feed]);
 useEffect(()=>{if(mode!=='feed'||!focusId)return;const index=feed.findIndex(item=>item.id===focusId);if(index>=0)setFeedIndex(index)},[mode,focusId,feed]);
 useEffect(()=>{try{localStorage.setItem('wd_page_'+book.id,current.id)}catch{}},[book.id,current.id]);
 useEffect(()=>{if(!focusId)return;const index=current.word_ids.indexOf(focusId);if(index>=0){setScope('all');setCounts(c=>({...c,[current.id]:Math.max(index+1,current.visible_count??current.word_ids.length)}))}},[focusId,pageKey]);
 useEffect(()=>{if(native||!viewport.current)return;const el=viewport.current;const top=activeIndex*el.clientHeight;if(Math.abs(el.scrollTop-top)>2){external.current=true;el.scrollTo({top,behavior:lastIndex.current===activeIndex?'instant':'smooth'});clearTimeout(settleTimer.current);settleTimer.current=setTimeout(()=>external.current=false,500)}lastIndex.current=activeIndex},[native,activeIndex,mode]);
 useEffect(()=>{if(native||!viewport.current)return;const el=viewport.current;const observer=new ResizeObserver(()=>{el.scrollTo({top:lastIndex.current*el.clientHeight,behavior:'instant'})});observer.observe(el);return()=>{observer.disconnect();clearTimeout(settleTimer.current)}},[native]);
 const move=(delta:number)=>{const next=activeIndex+delta;if(next>=0&&next<activeModels.length)selectIndex(next)};
 return <section className="pageStudy" aria-label="背记页面">
  <div className="pageControls"><div className="scopeControl" role="group" aria-label="浏览方式"><button aria-pressed={mode==='feed'} className={mode==='feed'?'on':''} onClick={()=>{const index=feed.findIndex(item=>item.source===safe);setFeedIndex(index>=0?index:0);setMode('feed')}}>逐条刷</button><button aria-pressed={mode==='page'} className={mode==='page'?'on':''} onClick={()=>{if(feed[activeFeed])onPage(feed[activeFeed].source);setMode('page')}}>整页看</button></div><div className="scopeControl" role="group" aria-label="练习范围"><button aria-pressed={scope==='all'} className={scope==='all'?'on':''} onClick={()=>{targetId.current=feed[activeFeed]?.id??null;setScope('all')}}>全部</button><button aria-pressed={scope==='need'} className={scope==='need'?'on':''} onClick={()=>{targetId.current=feed[activeFeed]?.id??null;setScope('need')}}>白名单</button></div>{mode==='page'&&<div className="countControl" role="group" aria-label="显示条数"><span>显示条数</span><button aria-label="减少显示条数" disabled={shown===0} onClick={()=>setCounts(c=>({...c,[current.id]:shown-1}))}>−</button><input aria-label="显示条数" type="number" inputMode="numeric" min="0" max={entries.length} value={shown} onChange={e=>setCounts(c=>({...c,[current.id]:Math.max(0,Math.min(entries.length,Math.floor(Number(e.target.value)||0)))}))}/><button aria-label="增加显示条数" disabled={shown===entries.length} onClick={()=>setCounts(c=>({...c,[current.id]:shown+1}))}>+</button><span>/ {entries.length}</span></div>}<button className="ghost" onClick={()=>{setCounts({});setReset(r=>r+1)}}>重置显隐</button></div>
  <div className={'pageViewport'+(native?' nativePagerSlot':' snapPager')} ref={viewport} tabIndex={0} aria-label="上下拖动翻页，松手吸附"
   onTouchStart={()=>{external.current=false;clearTimeout(settleTimer.current)}} onWheel={()=>{external.current=false}}
   onScroll={()=>{if(native||external.current)return;clearTimeout(settleTimer.current);settleTimer.current=setTimeout(()=>{const el=viewport.current;if(!el||!el.clientHeight)return;const index=Math.max(0,Math.min(activeModels.length-1,Math.round(el.scrollTop/el.clientHeight)));if(index!==lastIndex.current){lastIndex.current=index;selectIndex(index)}},100)}}
   onKeyDown={e=>{if((e.target as HTMLElement).closest('button,input'))return;if(e.key==='PageDown'||e.key==='ArrowDown'){e.preventDefault();move(1)}if(e.key==='PageUp'||e.key==='ArrowUp'){e.preventDefault();move(-1)}}}>
   {native?<span className="nativePagerMessage" role="status">{error||'正在加载原生学习页…'}</span>:activeModels.map((model,i)=><section className={'snapPage'+(i===activeIndex?' isActive':'')} key={model.page.id} aria-label={mode==='feed'?'第 '+(i+1)+' 条':'第 '+(i+1)+' 页'}><div className="pageScroller"><StudyPageContent model={model} onNeed={onNeed} onSpeak={onSpeak}/></div></section>)}
  </div>
  <div className="pageNavigation"><button className="ghost" disabled={activeIndex===0||!feed.length&&mode==='feed'} onClick={()=>move(-1)}>↑ 上一{mode==='feed'?'条':'页'}</button><span role="status">{mode==='feed'&&!feed.length?'暂无内容':(activeIndex+1)+' / '+activeModels.length}</span><button className="ghost" disabled={activeIndex===activeModels.length-1||!feed.length&&mode==='feed'} onClick={()=>move(1)}>下一{mode==='feed'?'条':'页'} ↓</button></div>
 </section>
}
