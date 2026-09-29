import Papa from 'papaparse';

export type ParsedWord={id:string;en:string;zh:string};
const uid=()=>Math.random().toString(36).slice(2);
const HAN=/[\u3400-\u9fff]/,LATIN=/[A-Za-z]/;
const HEADER_EN=/^(english|英文|word|words|单词|词汇|vocabulary)$/i;
const HEADER_ZH=/^(chinese|中文|meaning|meanings|释义|意思|翻译)$/i;
const POS_TAIL=/\s+(?:(?:n|v|vt|vi|adj|adv|prep|pron|conj|num|art|aux|modal)\.)+$/i;
const clean=(v:unknown)=>String(v??'').replace(/^\uFEFF/,'').trim().replace(/^\`+|\`+$/g,'').replace(/\*\*/g,'').trim();
const header=(a:string,b:string)=>(HEADER_EN.test(a)&&HEADER_ZH.test(b))||(HEADER_ZH.test(a)&&HEADER_EN.test(b));
const separator=(c:string[])=>c.length>0&&c.every(x=>/^:?-{3,}:?$/.test(x.replace(/\s/g,'')));

function word(a0:unknown,b0:unknown):ParsedWord|null{
 let a=clean(a0),b=clean(b0);if(!a||!b||header(a,b))return null;
 const ah=HAN.test(a),bh=HAN.test(b),ae=LATIN.test(a),be=LATIN.test(b);let en='',zh='';
 if(ae&&!ah&&bh){en=a;zh=b}else if(be&&!bh&&ah){en=b;zh=a}else if(ae&&bh){en=a;zh=b}else if(be&&ah){en=b;zh=a}else return null;
 en=en.replace(POS_TAIL,'').trim();if(!en||!zh||!LATIN.test(en)||!HAN.test(zh))return null;
 return{id:uid(),en,zh:zh.trim()};
}
function rowsToWords(rows:unknown[][]):ParsedWord[]{
 const out:ParsedWord[]=[],seen=new Set<string>();
 for(const raw of rows){const c=raw.map(clean).filter(Boolean);if(c.length<2||separator(c))continue;
  const pair:[string,string]=HAN.test(c[0])&&LATIN.test(c[1])&&!HAN.test(c[1])?[c.slice(1).join('；'),c[0]]:[c[0],c.slice(1).join('；')];
  const w=word(...pair);if(!w)continue;const k=w.en.toLowerCase()+'\0'+w.zh;if(!seen.has(k)){seen.add(k);out.push(w)}
 }return out;
}
function mdRow(line:string){const s=line.trim().replace(/^\|/,'').replace(/\|$/,'');const out:string[]=[];let cur='',esc=false;for(const ch of s){if(esc){cur+=ch;esc=false}else if(ch==='\\'){esc=true}else if(ch==='|'){out.push(cur.trim());cur=''}else cur+=ch}out.push(cur.trim());return out}
function loose(line:string){
 let s=line.trim().replace(/^[-*+]\s+/,'').replace(/^\d+[.)、]\s*/,'').trim();if(!s||/^#{1,6}\s/.test(s)||/^\`\`\`/.test(s))return null;
 if(s.includes('|')){const c=mdRow(s);if(c.length>=2&&!separator(c)){const w=word(c[0],c.slice(1).join('；'));if(w)return w}}
 const e=s.match(/^(.+?)\s*(?:<>|=>|→|：|:\s+|\s+[—–-]\s+)\s*(.+)$/);if(e){const w=word(e[1],e[2]);if(w)return w}
 const normal=s.match(/^(.+?[A-Za-z).])\s+([\u3400-\u9fff].*)$/);if(normal){const w=word(normal[1],normal[2]);if(w)return w}
 const rev=s.match(/^([\u3400-\u9fff].*?)\s+([A-Za-z].*)$/);return rev?word(rev[1],rev[2]):null;
}
export function parseDelimited(raw:string,delimiter?:string){const r=Papa.parse<string[]>(raw,{delimiter:delimiter||'',skipEmptyLines:'greedy'});return rowsToWords(r.data as unknown[][])}
export function parseText(raw:string){
 const lines=raw.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());
 const isMd=lines.some(x=>x.includes('|'))&&lines.some(x=>/^\s*\|?\s*:?-{3,}/.test(x));if(isMd)return rowsToWords(lines.filter(x=>!/^\s*#{1,6}\s/.test(x)).map(mdRow));
 const r=Papa.parse<string[]>(raw,{skipEmptyLines:'greedy'}),rows=r.data as unknown[][];const multi=rows.filter(x=>x.filter(v=>clean(v)).length>=2).length;
 if(r.meta.delimiter&&r.meta.delimiter!==' '&&multi>=Math.max(1,Math.floor(rows.length*.6))){const p=rowsToWords(rows);if(p.length)return p}
 const out:ParsedWord[]=[],seen=new Set<string>();for(const l of lines){const w=loose(l);if(w){const k=w.en.toLowerCase()+'\0'+w.zh;if(!seen.has(k)){seen.add(k);out.push(w)}}}return out;
}
export const parseSheetRows=(rows:unknown[][])=>rowsToWords(rows);
