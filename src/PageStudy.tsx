import {useEffect,useMemo,useRef,useState} from 'react';
import {CardContent} from './CardContent';
import {contentBlocks} from './parser';
import {bookPages,needIds,type Book} from './wordbook';


type Props={book:Book;page:number;onPage:(page:number)=>void;onNeed:(id:string)=>void;onSpeak:(text:string)=>void};
export function PageStudy({book,page,onPage,onNeed,onSpeak}:Props){
 const pages=useMemo(()=>bookPages(book),[book]);const safe=Math.max(0,Math.min(page,pages.length-1)),current=pages[safe];
 const lookup=useMemo(()=>new Map(book.words.map(w=>[w.id,w])),[book.words]),need=useMemo(()=>needIds(book),[book]);
 const [scope,setScope]=useState<'all'|'need'>('all');
 const [count,setCount]=useState<number|null>(null),[revealed,setRevealed]=useState<Record<string,boolean>>({});
 const scroller=useRef<HTMLDivElement>(null),gesture=useRef<{x:number;y:number;top:boolean;bottom:boolean;blocked:boolean}|null>(null),wheelLock=useRef(0),wheelSum=useRef(0);
 const key=book.id+':'+current.id;const signature=JSON.stringify([current,current.word_ids.map(id=>{const w=lookup.get(id);return [id,w?.visible_count,w?.blocks?.map(b=>b.id)]})]);
 useEffect(()=>{setCount(null);setRevealed({});if(scroller.current)scroller.current.scrollTop=0;wheelSum.current=0},[key,signature]);
 useEffect(()=>{try{localStorage.setItem('wd_page_'+book.id,current.id)}catch{}},[book.id,current.id]);
 const entries=current.word_ids.map(id=>lookup.get(id)!).filter(w=>w&&(scope==='all'||need.has(w.id)));
 const shown=Math.min(count??current.visible_count??entries.length,entries.length),rows=entries.slice(0,shown);
 const move=(delta:number)=>{const next=safe+delta;if(next<0||next>=pages.length)return;onPage(next)};
 const boundary=()=>{const e=scroller.current;return {top:!e||e.scrollTop<=2,bottom:!e||e.scrollTop+e.clientHeight>=e.scrollHeight-2}};
 return <section className="pageStudy" aria-label="背记页面">
  <div className="pageControls"><div className="scopeControl"><button className={scope==='all'?'on':''} onClick={()=>setScope('all')}>本页全部</button><button className={scope==='need'?'on':''} onClick={()=>setScope('need')}>白名单</button></div><label>显示条数 <input aria-label="显示条数" type="number" min="0" max={entries.length} value={shown} onChange={e=>setCount(Math.max(0,Math.min(entries.length,Math.floor(Number(e.target.value)||0))))}/><span>/ {entries.length}</span></label><button className="ghost" onClick={()=>{setCount(null);setRevealed({})}}>重置显隐</button></div>
  <div className="pageViewport" ref={scroller} tabIndex={0} aria-label="上滑下一页，下滑上一页"
   onKeyDown={e=>{if(e.target!==e.currentTarget)return;if(e.key==='PageDown'||e.key==='ArrowDown'&&boundary().bottom){e.preventDefault();move(1)}if(e.key==='PageUp'||e.key==='ArrowUp'&&boundary().top){e.preventDefault();move(-1)}}}
   onTouchStart={e=>{if(e.touches.length!==1){gesture.current=null;return}const t=e.touches[0];gesture.current={x:t.clientX,y:t.clientY,...boundary(),blocked:!!(e.target as HTMLElement).closest('input,select,textarea,pre,table,.katex-display')}}}
   onTouchEnd={e=>{const g=gesture.current;gesture.current=null;if(!g||g.blocked||!e.changedTouches.length)return;const t=e.changedTouches[0],dy=t.clientY-g.y,dx=t.clientX-g.x;if(Math.abs(dy)<75||Math.abs(dy)<Math.abs(dx)*1.5)return;if(dy<0&&g.bottom)move(1);if(dy>0&&g.top)move(-1)}}
   onWheel={e=>{if(Date.now()<wheelLock.current||Math.abs(e.deltaX)>Math.abs(e.deltaY))return;const b=boundary();if(!(e.deltaY>0&&b.bottom||e.deltaY<0&&b.top)){wheelSum.current=0;return}if(Math.sign(wheelSum.current)!==Math.sign(e.deltaY))wheelSum.current=0;wheelSum.current+=e.deltaY;if(Math.abs(wheelSum.current)>100){move(Math.sign(e.deltaY));wheelSum.current=0;wheelLock.current=Date.now()+650}}}>
   <div className="composedPage" key={key}>
    {current.title&&<h2 className="pageTitle">{current.title}</h2>}
    <div className="composedGrid" style={{'--page-columns':current.columns} as React.CSSProperties}>
     {rows.map((w,index)=>{const blocks=contentBlocks(w),visible=w.visible_count??1;return <article className={'contentEntry'+(need.has(w.id)?'':' isExcluded')} key={w.id} data-entry-id={w.id}>
      <div className="entryHead"><span>{String(index+1).padStart(2,'0')}</span><button className="ghost mini" aria-label={'朗读 '+blocks[0]?.text} onClick={()=>onSpeak(blocks.filter((b,i)=>revealed[w.id+':'+b.id]??i<visible).map(b=>b.text).join('\n\n'))}>朗读</button><button className={'entryNeed'+(need.has(w.id)?'':' marked')} aria-label={(need.has(w.id)?'移出白名单：':'加入白名单：')+blocks[0]?.text} aria-pressed={!need.has(w.id)} onClick={()=>onNeed(w.id)}>{need.has(w.id)?'□':'✓'}</button></div>
      {blocks.map((block,i)=>{const id=w.id+':'+block.id,open=revealed[id]??i<visible;return <div className="contentBlock" key={block.id}>
       <button className="blockToggle" aria-label={(open?'隐藏':'显示')+'内容块 '+(i+1)} aria-expanded={open} onClick={()=>setRevealed(r=>({...r,[id]:!open}))}>{block.label||'内容 '+(i+1)}<span>{open?'隐藏':'显示'}</span></button>
       {open?<div className="blockBody" dir="auto"><CardContent text={block.text} format={block.format}/></div>:<button className="hiddenBlock" onClick={()=>setRevealed(r=>({...r,[id]:true}))}>点击显示</button>}
      </div>})}
     </article>})}
    </div>
    {!rows.length&&<div className="empty"><h2>{entries.length?'当前内容已隐藏':'本页暂无内容'}</h2><p>{entries.length?'调整显示条数即可查看。':'可以切换显示范围，或让 Agent 编排本页。'}</p></div>}
    <p className="swipeHint">{safe<pages.length-1?'上滑下一页':'已到最后一页'} · 下滑上一页</p>
   </div>
  </div>
  <div className="pageNavigation"><button className="ghost" disabled={safe===0} onClick={()=>move(-1)}>↑ 上一页</button><span role="status">{safe+1} / {pages.length}</span><button className="ghost" disabled={safe===pages.length-1} onClick={()=>move(1)}>下一页 ↓</button></div>
 </section>
}
