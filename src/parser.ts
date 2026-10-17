import Papa from 'papaparse';

// en/zh remain compatibility aliases for previously stored libraries and Agents.
export type ContentBlock={id:string;text:string;label?:string;format?:'text'|'markdown';initially_visible?:boolean};
export type CardLayout='auto'|'compact'|'reading';
export type ParsedWord={id:string;blocks?:ContentBlock[];visible_count?:number;layout?:CardLayout;en?:string;zh?:string;front?:string;back?:string;format?:'text'|'markdown'};
export const frontText=(card:ParsedWord)=>card.blocks?.[0]?.text??card.front??card.en??'';
export const backText=(card:ParsedWord)=>card.blocks?card.blocks.slice(1).map(b=>b.text).join('\n\n'):card.back??card.zh??'';
const uid=()=>Math.random().toString(36).slice(2);
const clean=(v:unknown)=>String(v??'').replace(/^\uFEFF/,'').trim();
const fronts=/^(front|prompt|question|正面|提示|问题|english|英文|word|words|单词|词汇|vocabulary)$/i;
const backs=/^(back|answer|背面|答案|chinese|中文|meaning|meanings|释义|意思|翻译)$/i;
const separator=(cells:string[])=>cells.length>0&&cells.every(x=>/^:?-{3,}:?$/.test(x.replace(/\s/g,'')));
function card(front:unknown,back:unknown,format:'text'|'markdown'='text',exact=false):ParsedWord|null{
 const a=exact?String(front):clean(front),b=exact?String(back):clean(back);if(!a.trim()||!b.trim())return null;
 return {id:uid(),front:a,back:b,format};
}
function unique(cards:ParsedWord[]){const seen=new Set<string>();return cards.filter(c=>{if(c.blocks)return true;const key=JSON.stringify([frontText(c),backText(c),c.format||'text']);if(seen.has(key))return false;seen.add(key);return true})}
function rowsToWords(rows:unknown[][]):ParsedWord[]{
 const out:ParsedWord[]=[];let first=true,reverse=false;
 for(const raw of rows){const cells=raw.map(clean);if(!cells.some(Boolean)||separator(cells))continue;
  if(first){first=false;if(rows.length>1&&cells.length>=2&&fronts.test(cells[0])&&backs.test(cells[1]))continue;if(rows.length>1&&cells.length>=2&&backs.test(cells[0])&&fronts.test(cells[1])){reverse=true;continue}}
  const item=reverse?card(cells[1],cells[0]):card(cells[0],cells.slice(1).join('；'));if(item)out.push(item);
 }return unique(out);
}
function mdRow(line:string){const cells:string[]=[];let current='',escaped=false;for(const ch of line.trim().replace(/^\|/,'').replace(/\|$/,'')){if(escaped){current+=ch;escaped=false}else if(ch==='\\')escaped=true;else if(ch==='|'){cells.push(current.trim());current=''}else current+=ch}cells.push(current.trim());return cells}
export function parseDelimited(raw:string,delimiter?:string){return rowsToWords(Papa.parse<string[]>(raw,{delimiter:delimiter||'',skipEmptyLines:'greedy'}).data)}
export function parseText(raw:string):ParsedWord[]{
 const input=raw.replace(/^\uFEFF/,'').trim();if(!input)return [];
 // JSON is the lossless AI import path for multiline text, code, Markdown and formulas.
 if(/^\[\s*(?:\{|\])/.test(input)||/^\{\s*"(?:cards|words)"\s*:/.test(input)){
  let data:any;try{data=JSON.parse(input)}catch{throw Error('卡片 JSON 格式错误，请检查引号和换行转义')}
  const rows=Array.isArray(data)?data:data.cards??data.words;if(!Array.isArray(rows))throw Error('需要卡片数组');
  return unique(rows.map((row:any,i:number)=>{if(!row||typeof row!=='object')throw Error(`第 ${i+1} 条卡片格式错误`);const a=row.front??row.prompt??row.question??row.en,b=row.back??row.answer??row.zh;
   if(row.blocks!==undefined)return parseBlockEntry(row);
   if(typeof a!=='string'||typeof b!=='string')throw Error(`第 ${i+1} 条需要文本正面和背面`);
   if(row.format!==undefined&&row.format!=='text'&&row.format!=='markdown')throw Error(`第 ${i+1} 条 format 只能为 text 或 markdown`);
   const value=card(a,b,row.format||'text',true);if(!value)throw Error(`第 ${i+1} 条正面或背面为空`);return value;
  }));
 }
 const lines=input.split(/\r?\n/).filter(x=>x.trim());
 if(lines.some(x=>x.includes('|'))&&lines.some(x=>/^\s*\|?\s*:?-{3,}/.test(x)))return rowsToWords(lines.filter(x=>!/^\s*#{1,6}\s/.test(x)).map(mdRow));
 const parsed=Papa.parse<string[]>(input,{skipEmptyLines:'greedy'}),rows=parsed.data;const paired=rows.filter(x=>x.length>=2).length;
 if(parsed.meta.delimiter&&parsed.meta.delimiter!==' '&&paired>=Math.max(1,Math.ceil(rows.length*.6))){const found=rowsToWords(rows);if(found.length)return found}
 const out:ParsedWord[]=[];
 for(const line of lines){const s=line.trim().replace(/^[-*+]\s+/,'').replace(/^\d+[.)、]\s*/,'');
  const pair=s.match(/^(.+?)\s*(?:<>|=>|→|：|:\s+|\s+[—–-]\s+|\t+)\s*(.+)$/);if(pair){const item=card(pair[1],pair[2]);if(item)out.push(item);continue}
  // Preserve old dictionary-style imports as a fallback, without requiring any language for paired data.
  const dictionary=s.match(/^(.+?[A-Za-z).\]])\s+([\u3400-\u9fff].*)$/);if(dictionary){const left=dictionary[1].replace(/\s*\[[^\]]*\].*$/,'').replace(/\s+(?:n|v|vt|vi|adj|adv|prep|pron|conj|num|art|aux)\.$/i,'');const item=card(left,dictionary[2]);if(item)out.push(item)}
 }return unique(out);
}
export const parseSheetRows=(rows:unknown[][])=>rowsToWords(rows);

export function parseBlockEntry(row:any):ParsedWord {
 if(!row||typeof row!=='object'||!Array.isArray(row.blocks)||!row.blocks.length)throw Error('每条内容需要至少一个内容块');
 if(row.layout!==undefined&&!['auto','compact','reading'].includes(row.layout))throw Error('layout 只能为 auto、compact 或 reading');
 const used=new Set<string>();const blocks:ContentBlock[]=row.blocks.map((b:any)=>{
  if(!b||typeof b.text!=='string'||!b.text.trim())throw Error('内容块 text 不能为空');
  if(b.format!==undefined&&!['text','markdown'].includes(b.format))throw Error('format 只能为 text 或 markdown');
  if(b.label!==undefined&&typeof b.label!=='string')throw Error('label 必须为文本');
  if(b.initially_visible!==undefined&&typeof b.initially_visible!=='boolean')throw Error('initially_visible 必须为布尔值');
  const id=b.id??uid();if(typeof id!=='string'||!id||used.has(id))throw Error('内容块 ID 必须非空且不重复');used.add(id);
  return {id,text:b.text,...(b.label!==undefined?{label:b.label}:{}),format:b.format||'text',...(b.initially_visible!==undefined?{initially_visible:b.initially_visible}:{})};
 });
 const count=row.visible_count??1;if(!Number.isInteger(count)||count<0||count>blocks.length)throw Error('visible_count 必须为 0 到内容块总数的整数');
 return {id:row.id??uid(),blocks,visible_count:count,...(row.layout!==undefined?{layout:row.layout}:{})};
}
export function contentBlocks(w:ParsedWord):ContentBlock[]{return w.blocks??[{id:'legacy-1',text:frontText(w),format:w.format},{id:'legacy-2',text:backText(w),format:w.format}]}
export function blockInitiallyVisible(block:ContentBlock,index:number,entry:ParsedWord){return block.initially_visible??index<(entry.visible_count??1)}
export function allText(w:ParsedWord){return contentBlocks(w).map(b=>b.text).join('\n\n')}
