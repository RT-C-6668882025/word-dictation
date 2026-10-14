import {Capacitor} from '@capacitor/core';
import {NativeAi} from './nativeWordStore';
import {attachmentMimes,type Attachment} from './attachments';

type Stored={created?:number;id:string;blob:Blob;preview?:string;text?:string;mime:string};
let dbPromise:Promise<IDBDatabase>|undefined;
function db(){return dbPromise??=(new Promise((resolve,reject)=>{const r=indexedDB.open('wd_attachments_v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('files',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('附件存储无法打开'))}))}
async function load(id:string):Promise<Stored>{const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction('files').objectStore('files').get(id);r.onsuccess=()=>r.result?resolve(r.result):reject(Error('附件文件不存在，请重新添加'));r.onerror=()=>reject(Error('附件读取失败'))})}
export function toBase64(bytes:Uint8Array){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s)}
export function fromBase64(value:string){return Uint8Array.from(atob(value),c=>c.charCodeAt(0))}
async function imagePreview(file:File){const url=URL.createObjectURL(file);try{const image=new Image();image.src=url;await image.decode();const scale=Math.min(1,1280/image.width,1280/image.height),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.getContext('2d')!.drawImage(image,0,0,canvas.width,canvas.height);let result=canvas.toDataURL('image/jpeg',.75);for(let i=0;result.length>360000&&i<5;i++){const smaller=document.createElement('canvas');smaller.width=Math.max(1,canvas.width>>1);smaller.height=Math.max(1,canvas.height>>1);smaller.getContext('2d')!.drawImage(canvas,0,0,smaller.width,smaller.height);canvas.width=smaller.width;canvas.height=smaller.height;canvas.getContext('2d')!.drawImage(smaller,0,0);result=canvas.toDataURL('image/jpeg',.65)}return result}catch{throw Error('图片无法解码，请换一个文件')}finally{URL.revokeObjectURL(url)}}
export async function saveAttachment(file:File,side:Attachment['side']):Promise<Attachment>{
 const extension=file.name.split('.').pop()?.toLowerCase();const inferred:Record<string,string>={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',mp3:'audio/mpeg',m4a:'audio/mp4',wav:'audio/wav',ogg:'audio/ogg',flac:'audio/flac',webm:'audio/webm',pdf:'application/pdf'};
 const mime=attachmentMimes.includes(file.type)?file.type:inferred[extension||''];
 if(!attachmentMimes.includes(mime)||!file.size||file.size>50*1024*1024)throw Error('请选择图片、音频或 PDF，单个文件需为 1 字节至 50 MB');
 const id='att_'+crypto.randomUUID().replace(/-/g,''),name=file.name.slice(0,200),preview=mime.startsWith('image/')?await imagePreview(file):undefined;
 let text:string|undefined;
 if(mime==='application/pdf'){const {extractAttachmentPdf}=await import('./attachmentPdf');text=await extractAttachmentPdf(await file.arrayBuffer())}
 if(Capacitor.isNativePlatform()){
  for(let offset=0;offset<file.size;offset+=196608){const bytes=new Uint8Array(await file.slice(offset,offset+196608).arrayBuffer());await NativeAi.writeAttachment({id,offset,data:toBase64(bytes),size:file.size,mime,final:offset+bytes.length===file.size,...(offset+bytes.length===file.size?{preview,text}:{})})}
 }else{const d=await db();await new Promise<void>((resolve,reject)=>{const t=d.transaction('files','readwrite');t.objectStore('files').put({created:Date.now(),id,blob:new Blob([file],{type:mime}),preview,text,mime});t.oncomplete=()=>resolve();t.onerror=()=>reject(Error('附件保存失败，可能没有足够存储空间'));t.onabort=()=>reject(Error('附件保存未完成'))})}
 return {id,name,mime,size:file.size,side};
}
export async function readAttachment(id:string,mode:'bytes'|'preview'|'text'='bytes',offset=0,limit=49152):Promise<any>{
 if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>65536||!['bytes','text','preview'].includes(mode))throw Error('附件读取参数无效');
 if(Capacitor.isNativePlatform())return NativeAi.readAttachment({id,mode,offset,limit});
 const stored=await load(id);
 if(mode==='preview'){if(!stored.preview)throw Error('此附件没有图片预览');return {mime:'image/jpeg',data:stored.preview.split(',')[1],encoding:'base64',complete:true}}
 if(mode==='text'){if(stored.text===undefined)throw Error('此附件没有提取文本，请读取原文件');return {text:stored.text.slice(offset,offset+limit),total:stored.text.length,next_offset:offset+limit<stored.text.length?offset+limit:null,empty:!stored.text.length}}
 const end=Math.min(stored.blob.size,offset+limit);return {mime:stored.mime,data:toBase64(new Uint8Array(await stored.blob.slice(offset,end).arrayBuffer())),encoding:'base64',total:stored.blob.size,offset,next_offset:end<stored.blob.size?end:null};
}
export async function attachmentBlob(a:Attachment){const chunks:Uint8Array<ArrayBuffer>[]=[];let offset=0;do{const part=await readAttachment(a.id,'bytes',offset,49152);chunks.push(fromBase64(part.data));offset=part.next_offset}while(offset!==null);return new Blob(chunks,{type:a.mime})}

export async function uploadAttachmentChunk(a:Record<string,any>){
 const bytes=fromBase64(a.data_base64);
 if(!bytes.length||bytes.length>196608||a.offset+bytes.length>a.size)throw Error('附件分块无效');
 if(Capacitor.isNativePlatform())return NativeAi.writeAttachment({...a,id:a.attachment_id,data:a.data_base64});
 const d=await db();let old:Stored|undefined;try{old=await load(a.attachment_id)}catch{}
 const offset=a.offset;
 if(old&&(old.mime!==a.mime||old.blob.size<offset))throw Error('附件分块顺序或格式不正确');
 if(!old&&offset!==0)throw Error('附件需要从 offset=0 开始上传');
 if(old&&old.blob.size>offset){const existing=new Uint8Array(await old.blob.slice(offset,offset+bytes.length).arrayBuffer());if(existing.length!==bytes.length||existing.some((v,i)=>v!==bytes[i]))throw Error('附件 ID 或分块冲突');}
 const blob=old&&old.blob.size>=offset+bytes.length?old.blob:new Blob([...(old?[old.blob]:[]),bytes],{type:a.mime});
 if(a.final&&blob.size!==a.size)throw Error('附件尚未上传完整');
 let preview=old?.preview,text=old?.text;
 if(a.final&&a.mime.startsWith('image/')&&!preview)preview=await imagePreview(new File([blob],a.name,{type:a.mime}));
 if(a.final&&a.mime==='application/pdf'&&text===undefined){const {extractAttachmentPdf}=await import('./attachmentPdf');text=await extractAttachmentPdf(await blob.arrayBuffer())}
 await new Promise<void>((resolve,reject)=>{const t=d.transaction('files','readwrite');t.objectStore('files').put({created:old?.created??Date.now(),id:a.attachment_id,blob,preview,text,mime:a.mime});t.oncomplete=()=>resolve();t.onerror=()=>reject(Error('附件分块保存失败'));t.onabort=()=>reject(Error('附件分块保存未完成'))});
 return {saved:!!a.final,next_offset:offset+bytes.length};
}

export async function cleanupAttachments(books:{words:{attachments?:Attachment[]}[]}[]){
 if(Capacitor.isNativePlatform())return;
 const used=new Set(books.flatMap(b=>b.words.flatMap(w=>(w.attachments||[]).map(a=>a.id))));const d=await db();
 return new Promise<void>((resolve,reject)=>{const t=d.transaction('files','readwrite'),r=t.objectStore('files').openCursor();r.onsuccess=()=>{const cursor=r.result;if(!cursor)return;const stored=cursor.value as Stored;if(stored.created&&!used.has(stored.id)&&stored.created<Date.now()-7*86400000)cursor.delete();cursor.continue()};t.oncomplete=()=>resolve();t.onerror=()=>reject(Error('附件清理失败'))});
}
