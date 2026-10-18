import {useEffect,useMemo,useRef,useState} from 'react';
import {CardContent} from './CardContent';
import {blockInitiallyVisible,contentBlocks,type ParsedWord} from './parser';
import type {BookPage} from './wordbook';
export type StudyPageModel={page:BookPage;entries:(ParsedWord&{needed:boolean})[];scope:'all'|'need';count:number|null;reset:number;focusId?:string;bulk?:{revision:number;side:0|1;visible:boolean}};
export function StudyPageContent({model,onNeed,onSpeak}:{model:StudyPageModel;onNeed:(id:string)=>void;onSpeak:(text:string)=>void}){
 const {page,entries,scope,count,reset,focusId}=model;
 const [revealed,setRevealed]=useState<Record<string,boolean>>({});const root=useRef<HTMLDivElement>(null);
 const signature=useMemo(()=>JSON.stringify(entries.map(w=>[w.id,w.visible_count,w.layout,w.blocks?.map(b=>[b.id,b.initially_visible])])),[entries]);
 useEffect(()=>setRevealed({}),[page.id,reset,signature]);
 const eligible=entries.filter(w=>scope==='all'||w.needed),visible=Math.min(count??page.visible_count??eligible.length,eligible.length),rows=eligible.slice(0,visible);
 useEffect(()=>{if(!model.bulk)return;const {side,visible:show}=model.bulk;setRevealed(previous=>{const next={...previous};for(const word of rows){const block=contentBlocks(word)[side];if(block)next[word.id+':'+block.id]=show}return next})},[model.bulk?.revision,page.id]);
 useEffect(()=>{if(!focusId)return;const frame=requestAnimationFrame(()=>Array.from(root.current?.querySelectorAll<HTMLElement>('[data-entry-id]')??[]).find(el=>el.dataset.entryId===focusId)?.scrollIntoView({block:'nearest'}));return()=>cancelAnimationFrame(frame)},[focusId,visible]);
 return <div className={'composedPage'+(page.id.startsWith('feed:')?' feedEntry':'')} ref={root}>
  {page.title&&<h2 className="pageTitle">{page.title}</h2>}
  <div className="composedGrid" style={{'--page-columns':page.columns} as React.CSSProperties}>
   {rows.map((w,index)=>{const blocks=contentBlocks(w),isLong=w.layout==='reading'||(w.layout!=='compact'&&blocks.some(b=>b.text.length>160||/[\r\n]/.test(b.text)||b.format==='markdown'));return <article className={'contentEntry'+(w.needed?'':' isExcluded')+(isLong?' isLong':'')+(w.layout==='compact'?' isCompact':'')} key={w.id} data-entry-id={w.id}>
    <span className="entryNumber">{String(index+1).padStart(2,'0')}</span>
    <div className="entryBlocks" style={{'--block-count':blocks.length} as React.CSSProperties}>
     {blocks.map((block,i)=>{const id=w.id+':'+block.id,open=revealed[id]??blockInitiallyVisible(block,i,w),toggle=()=>setRevealed(r=>({...r,[id]:!open}));return <div className={'contentBlock'+(open?'':' isHidden')} key={block.id} role="button" tabIndex={0} aria-label={(open?'隐藏':'显示')+'内容块 '+(i+1)} aria-expanded={open} onClick={e=>{if((e.target as HTMLElement).closest('a,button'))return;toggle()}} onKeyDown={e=>{if(e.target!==e.currentTarget)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle()}}}>
      {block.label&&<small className="contentLabel">{block.label}</small>}
      {open?<div className="blockBody" dir="auto"><div className="blockText"><CardContent text={block.text} format={block.format}/></div></div>:<span className="blockPlaceholder">轻触显示</span>}
      {i===0&&<div className="blockActions"><button className="entrySpeak blockSpeak" aria-label={'朗读 '+block.text} onClick={e=>{e.stopPropagation();onSpeak(block.text)}}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor"/><path d="M16 8c2 2 2 6 0 8m3-11c4 4 4 10 0 14" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg></button></div>}
     </div>})}
    </div>
    <div className="entryActions"><button className={'entryNeed'+(w.needed?'':' marked')} aria-label={(w.needed?'移出白名单：':'加入白名单：')+blocks[0]?.text} aria-pressed={!w.needed} onClick={()=>onNeed(w.id)}>{w.needed?'':'✓'}</button></div>
   </article>})}
  </div>
  {!rows.length&&<div className="empty"><h2>{eligible.length?'当前内容已隐藏':'本页暂无内容'}</h2><p>{eligible.length?'调整显示条数即可查看。':'切换显示范围，或让 Agent 编排本页。'}</p></div>}
 </div>
}
