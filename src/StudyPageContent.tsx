import {useEffect,useMemo,useRef,useState} from 'react';
import {CardContent} from './CardContent';
import {contentBlocks,type ParsedWord} from './parser';
import type {BookPage} from './wordbook';
export type StudyPageModel={page:BookPage;entries:(ParsedWord&{needed:boolean})[];scope:'all'|'need';count:number|null;reset:number;focusId?:string};
export function StudyPageContent({model,onNeed,onSpeak}:{model:StudyPageModel;onNeed:(id:string)=>void;onSpeak:(text:string)=>void}){
 const {page,entries,scope,count,reset,focusId}=model;
 const [revealed,setRevealed]=useState<Record<string,boolean>>({});const root=useRef<HTMLDivElement>(null);
 const signature=useMemo(()=>JSON.stringify(entries.map(w=>[w.id,w.visible_count,w.blocks?.map(b=>b.id)])),[entries]);
 useEffect(()=>setRevealed({}),[page.id,reset,signature]);
 const eligible=entries.filter(w=>scope==='all'||w.needed),visible=Math.min(count??page.visible_count??eligible.length,eligible.length),rows=eligible.slice(0,visible);
 useEffect(()=>{if(!focusId)return;const frame=requestAnimationFrame(()=>Array.from(root.current?.querySelectorAll<HTMLElement>('[data-entry-id]')??[]).find(el=>el.dataset.entryId===focusId)?.scrollIntoView({block:'nearest'}));return()=>cancelAnimationFrame(frame)},[focusId,visible]);
 return <div className="composedPage" ref={root}>
  {page.title&&<h2 className="pageTitle">{page.title}</h2>}
  <div className="composedGrid" style={{'--page-columns':page.columns} as React.CSSProperties}>
   {rows.map((w,index)=>{const blocks=contentBlocks(w),initial=w.visible_count??1,isLong=blocks.some(b=>b.text.length>160||/[\r\n]/.test(b.text)||b.format==='markdown');return <article className={'contentEntry'+(w.needed?'':' isExcluded')+(isLong?' isLong':'')} key={w.id} data-entry-id={w.id}>
    <span className="entryNumber">{String(index+1).padStart(2,'0')}</span>
    <div className="entryBlocks" style={{'--block-count':blocks.length} as React.CSSProperties}>
     {blocks.map((block,i)=>{const id=w.id+':'+block.id,open=revealed[id]??i<initial;return <div className="contentBlock" key={block.id}>
      {i===0&&<button className="entrySpeak blockSpeak" aria-label={'朗读 '+block.text} onClick={()=>onSpeak(block.text)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor"/><path d="M16 8c2 2 2 6 0 8m3-11c4 4 4 10 0 14" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg></button>}
      {block.label&&<small className="contentLabel">{block.label}</small>}
      {open?<div className="blockBody" dir="auto"><div className="blockText"><CardContent text={block.text} format={block.format}/></div><button className="hideBlock" aria-label={'隐藏内容块 '+(i+1)} onClick={()=>setRevealed(r=>({...r,[id]:false}))} aria-expanded={true}>隐藏</button></div>:<button className="hiddenBlock" aria-label={'显示内容块 '+(i+1)} aria-expanded={false} onClick={()=>setRevealed(r=>({...r,[id]:true}))}><span aria-hidden="true">···</span></button>}
     </div>})}
    </div>
    <div className="entryActions"><button className={'entryNeed'+(w.needed?'':' marked')} aria-label={(w.needed?'移出白名单：':'加入白名单：')+blocks[0]?.text} aria-pressed={!w.needed} onClick={()=>onNeed(w.id)}>{w.needed?'':'✓'}</button></div>
   </article>})}
  </div>
  {!rows.length&&<div className="empty"><h2>{eligible.length?'当前内容已隐藏':'本页暂无内容'}</h2><p>{eligible.length?'调整显示条数即可查看。':'切换显示范围，或让 Agent 编排本页。'}</p></div>}
 </div>
}
