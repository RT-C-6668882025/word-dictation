import {useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {bookPages,needIds,type Book} from './wordbook';
import {StudyPageContent,type StudyPageModel} from './StudyPageContent';
import {useNativeStudyPager} from './useNativeStudyPager';

type Props={book:Book;page:number;focusId?:string;suspended?:boolean;menuOpen?:boolean;onOpenMenu?:()=>void;onCloseMenu?:()=>void;menuContent?:ReactNode;onPage:(page:number)=>void;onNeed:(id:string)=>void;onSpeak:(text:string)=>void};
export function PageStudy({book,page,focusId,suspended=false,menuOpen=false,onOpenMenu=()=>{},onCloseMenu=()=>{},menuContent,onPage,onNeed,onSpeak}:Props){
 const pages=useMemo(()=>bookPages(book),[book]),safe=Math.max(0,Math.min(page,pages.length-1)),current=pages[safe];
 const lookup=useMemo(()=>new Map(book.words.map(w=>[w.id,w])),[book.words]),need=useMemo(()=>needIds(book),[book]);
 const [scope,setScope]=useState<'all'|'need'>('all'),[feedIndex,setFeedIndex]=useState(0),[reset,setReset]=useState(0);
 const [bulkModes,setBulkModes]=useState<[boolean,boolean]>([false,true]);
 const [bulkAction,setBulkAction]=useState<{pageId:string;revision:number;side:0|1;visible:boolean}|null>(null);
 const [measuredGroups,setMeasuredGroups]=useState<Record<string,number[]>>({});
 const measureRoot=useRef<HTMLDivElement>(null),viewport=useRef<HTMLDivElement>(null);
 const settleTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),lastIndex=useRef(0),external=useRef(false),targetId=useRef<string|null>(null);
 const measureModels=useMemo<StudyPageModel[]>(()=>pages.map(p=>({
  page:{...p,columns:1,visible_count:p.word_ids.length},
  entries:p.word_ids.flatMap(id=>{const w=lookup.get(id);return w&&(scope==='all'||need.has(id))?[{...w,needed:need.has(id)}]:[]}),
  scope:'all',count:null,reset
 })),[pages,lookup,need,scope,reset]);
 useLayoutEffect(()=>{
  const root=measureRoot.current,view=viewport.current;if(!root||!view)return;
  let frame=0;
  const calculate=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
   const available=view.clientHeight-24;if(available<=0)return;
   const next:Record<string,number[]>={};
   root.querySelectorAll<HTMLElement>('[data-measure-page]').forEach(section=>{
    const heights=Array.from(section.querySelectorAll<HTMLElement>('.contentEntry'),row=>row.getBoundingClientRect().height+1);
    const title=section.querySelector('.pageTitle')?.getBoundingClientRect().height??0;
    const groups:number[]=[];let used=title?title+24:0,items=0;
    for(const height of heights){if(items&&used+height>available){groups.push(items);used=0;items=0}used+=height;items++}
    if(items)groups.push(items);
    next[section.dataset.measurePage!]=groups;
   });
   setMeasuredGroups(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);
  })};
  const observer=new ResizeObserver(calculate);observer.observe(view);observer.observe(root);calculate();
  return()=>{observer.disconnect();cancelAnimationFrame(frame)};
 },[measureModels]);
 const feed=useMemo(()=>pages.flatMap((p,source)=>{
  const ids=p.word_ids.filter(id=>lookup.has(id)&&(scope==='all'||need.has(id)));
  const sizes=measuredGroups[p.id]??[ids.length],batches=[];
  for(let start=0,part=0;start<ids.length;part++){
   const group=ids.slice(start,start+Math.max(1,sizes[part]??ids.length-start));
   const id='feed:'+p.id+':'+start;
   batches.push({source,ids:group,model:{page:{id,word_ids:group,columns:1 as const,visible_count:group.length,...(start===0&&p.title?{title:p.title}:{})},entries:group.map(wordId=>({...lookup.get(wordId)!,needed:need.has(wordId)})),scope:'all' as const,count:null,reset,focusId:group.includes(focusId||'')?focusId:undefined,bulk:bulkAction?.pageId===id?{revision:bulkAction.revision,side:bulkAction.side,visible:bulkAction.visible}:undefined}});
   start+=group.length;
  }
  return batches;
 }),[pages,lookup,need,scope,reset,focusId,measuredGroups,bulkAction]);
 const activeIndex=Math.max(0,Math.min(feedIndex,feed.length-1));
 const activeModels:StudyPageModel[]=feed.length?feed.map(item=>item.model):[{page:{id:'feed-empty',word_ids:[],columns:1},entries:[],scope:'all',count:null,reset}];
 const selectIndex=(index:number)=>{const item=feed[index];if(!item)return;setFeedIndex(index);if(item.source!==safe)onPage(item.source)};
 const {native,error}=useNativeStudyPager(viewport,activeModels,activeIndex,suspended,selectIndex,onNeed,onSpeak,onOpenMenu);
 useEffect(()=>{const index=feed.findIndex(item=>item.source===safe);setFeedIndex(index>=0?index:0)},[book.id]);
 useEffect(()=>{if(!targetId.current)return;const index=feed.findIndex(item=>item.ids.includes(targetId.current!));setFeedIndex(index>=0?index:Math.min(feedIndex,Math.max(0,feed.length-1)));targetId.current=null},[feed]);
 useEffect(()=>{if(!focusId)return;setScope('all');const index=feed.findIndex(item=>item.ids.includes(focusId));if(index>=0)setFeedIndex(index)},[focusId,feed]);
 useEffect(()=>{try{localStorage.setItem('wd_page_'+book.id,current.id)}catch{}},[book.id,current.id]);
 useEffect(()=>{if(native||!viewport.current)return;const el=viewport.current,top=activeIndex*el.clientHeight;if(Math.abs(el.scrollTop-top)>2){external.current=true;el.scrollTo({top,behavior:lastIndex.current===activeIndex?'instant':'smooth'});clearTimeout(settleTimer.current);settleTimer.current=setTimeout(()=>external.current=false,500)}lastIndex.current=activeIndex},[native,activeIndex]);
 useEffect(()=>{if(native||!viewport.current)return;const el=viewport.current;const observer=new ResizeObserver(()=>el.scrollTo({top:lastIndex.current*el.clientHeight,behavior:'instant'}));observer.observe(el);return()=>{observer.disconnect();clearTimeout(settleTimer.current)}},[native]);
 const move=(delta:number)=>{const next=activeIndex+delta;if(next>=0&&next<activeModels.length)selectIndex(next)};
 const applyBulk=(side:0|1)=>{const pageId=feed[activeIndex]?.model.page.id;if(pageId)setBulkAction(previous=>({pageId,revision:(previous?.revision??0)+1,side,visible:bulkModes[side]}))};
 const flipBulk=(side:0|1)=>setBulkModes(current=>{const next:[boolean,boolean]=[...current];next[side]=!current[side];return next});
 const bulkButton=(side:0|1)=><BulkButton side={side} show={bulkModes[side]} disabled={!feed.length} onApply={()=>applyBulk(side)} onFlip={()=>flipBulk(side)}/>;
 return <section className="pageStudy" aria-label="背记页面">
  <div className={'studyDrawerLayer'+(menuOpen?' isOpen':'')} aria-hidden={!menuOpen} onKeyDown={e=>{if(e.key==='Escape')onCloseMenu()}}><button className="studyDrawerBackdrop" tabIndex={menuOpen?0:-1} aria-label="关闭菜单" onClick={onCloseMenu}/><nav className="studyDrawer" aria-label="学习菜单"><div className="studyDrawerHeading"><b>学习菜单</b><button className="ghost" aria-label="关闭菜单" onClick={onCloseMenu}>×</button></div>{menuContent}<div className="studyDrawerDivider"/><span className="studyDrawerLabel">练习范围</span><div className="scopeControl" role="group" aria-label="练习范围"><button aria-pressed={scope==='all'} className={scope==='all'?'on':''} onClick={()=>{targetId.current=feed[activeIndex]?.ids[0]??null;setScope('all');onCloseMenu()}}>全部</button><button aria-pressed={scope==='need'} className={scope==='need'?'on':''} onClick={()=>{targetId.current=feed[activeIndex]?.ids[0]??null;setScope('need');onCloseMenu()}}>白名单</button></div><button className="ghost studyReset" onClick={()=>{setReset(r=>r+1);onCloseMenu()}}>重置显隐</button></nav></div>
  <div className={'pageViewport'+(native?' nativePagerSlot':' snapPager')} ref={viewport} tabIndex={0} aria-label="上下拖动翻页，松手吸附"
   onTouchStart={()=>{external.current=false;clearTimeout(settleTimer.current)}} onWheel={()=>{external.current=false}}
   onScroll={()=>{if(native||external.current)return;clearTimeout(settleTimer.current);settleTimer.current=setTimeout(()=>{const el=viewport.current;if(!el||!el.clientHeight)return;const index=Math.max(0,Math.min(activeModels.length-1,Math.round(el.scrollTop/el.clientHeight)));if(index!==lastIndex.current){lastIndex.current=index;selectIndex(index)}},100)}}
   onKeyDown={e=>{if((e.target as HTMLElement).closest('button,input'))return;if(e.key==='PageDown'||e.key==='ArrowDown'){e.preventDefault();move(1)}if(e.key==='PageUp'||e.key==='ArrowUp'){e.preventDefault();move(-1)}}}>
   {native?<span className="nativePagerMessage" role="status">{error||'正在加载原生学习页…'}</span>:activeModels.map((model,i)=><section className={'snapPage'+(i===activeIndex?' isActive':'')} key={model.page.id} aria-label={'第 '+(i+1)+' 页'}><div className="pageScroller"><StudyPageContent model={model} onNeed={onNeed} onSpeak={onSpeak}/></div></section>)}
  </div>
  <div className="studyMeasure" ref={measureRoot} aria-hidden="true">{measureModels.map(model=><div key={model.page.id} data-measure-page={model.page.id}><StudyPageContent model={model} onNeed={()=>{}} onSpeak={()=>{}}/></div>)}</div>
  <div className="pageNavigation"><div className="navSide"><button className="ghost" disabled={activeIndex===0||!feed.length} onClick={()=>move(-1)}>↑ 上一页</button>{bulkButton(0)}</div><span role="status">{!feed.length?'暂无内容':(activeIndex+1)+' / '+activeModels.length}</span><div className="navSide">{bulkButton(1)}<button className="ghost" disabled={activeIndex===activeModels.length-1||!feed.length} onClick={()=>move(1)}>下一页 ↓</button></div></div>
 </section>;
}
function BulkButton({side,show,disabled,onApply,onFlip}:{side:0|1;show:boolean;disabled:boolean;onApply:()=>void;onFlip:()=>void}){
 const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),pressed=useRef(false);
 const stop=()=>{if(timer.current)clearTimeout(timer.current);timer.current=undefined};
 useEffect(()=>stop,[]);
 const label=(side===0?'左侧':'右侧')+(show?'显示':'隐藏');
 return <button className="ghost bulkToggle" disabled={disabled} title="点按批量操作当前页；长按切换显示／隐藏" aria-label={label+'（长按切换动作）'} onPointerDown={e=>{if(e.pointerType==='mouse'&&e.button!==0)return;pressed.current=false;stop();timer.current=setTimeout(()=>{pressed.current=true;onFlip()},550)}} onPointerUp={stop} onPointerCancel={stop} onPointerLeave={stop} onContextMenu={e=>e.preventDefault()} onClick={e=>{if(pressed.current){e.preventDefault();pressed.current=false;return}onApply()}}>{label}</button>;
}
