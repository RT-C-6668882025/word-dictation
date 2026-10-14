import {memo,useEffect,useState} from 'react';
import type {Attachment} from './attachments';
import {readAttachment,attachmentBlob} from './attachmentStore';
export const AttachmentPanel=memo(function AttachmentPanel({attachments,visible,onOpen}:{attachments:Attachment[];visible:boolean;onOpen:(a:Attachment)=>void}){
 return <div className="attachmentSide" style={{visibility:visible?'visible':'hidden'}} aria-hidden={!visible}>{attachments.length?<span className="attachmentSideLabel">{attachments[0].side==='front'?'正面附件':'背面附件'}</span>:null}{attachments.map(a=><AttachmentTile key={a.id} attachment={a} visible={visible} onOpen={onOpen}/>)}</div>;
});
function AttachmentTile({attachment:a,visible,onOpen}:{attachment:Attachment;visible:boolean;onOpen:(a:Attachment)=>void}){
 const [preview,setPreview]=useState(''),[error,setError]=useState('');
 useEffect(()=>{if(!visible||!a.mime.startsWith('image/'))return;let stopped=false;readAttachment(a.id,'preview').then(r=>{if(!stopped)setPreview('data:image/jpeg;base64,'+r.data)}).catch(()=>{if(!stopped)setError('预览不可用')});return()=>{stopped=true}},[a.id,a.mime,visible]);
 return <button className="attachmentTile" tabIndex={visible?0:-1} onClick={()=>onOpen(a)} aria-label={'查看附件：'+a.name}>{a.mime.startsWith('image/')?<span className="attachmentThumb">{preview?<img src={preview} alt={a.name}/>:error||'图片'}</span>:null}<span>{a.name}</span><small>{a.mime.startsWith('audio/')?'音频':a.mime==='application/pdf'?'PDF':'图片'} · {(a.size/1024).toFixed(0)} KB</small></button>;
}
export function AttachmentViewer({attachment:a,onClose}:{attachment:Attachment;onClose:()=>void}){
 const [url,setUrl]=useState(''),[error,setError]=useState('');
 useEffect(()=>{let stopped=false,objectUrl='';attachmentBlob(a).then(blob=>{if(stopped)return;objectUrl=URL.createObjectURL(blob);setUrl(objectUrl)}).catch(e=>{if(!stopped)setError(e.message)});return()=>{stopped=true;if(objectUrl)URL.revokeObjectURL(objectUrl)}},[a]);
 return <div className="attachmentViewer"><header><b>{a.name}</b><button onClick={onClose}>返回附件列表</button></header>{error?<p role="alert">{error}</p>:!url?<p role="status">正在读取附件…</p>:a.mime.startsWith('image/')?<img className="attachmentFullImage" src={url} alt={a.name}/>:a.mime.startsWith('audio/')?<audio controls src={url} preload="metadata" onError={()=>setError('此设备无法播放该音频格式')}/>:<PdfViewer url={url}/>}</div>;
}
function PdfViewer({url}:{url:string}){
 const [page,setPage]=useState(1),[count,setCount]=useState(0),[error,setError]=useState('');
 const [canvas,setCanvas]=useState<HTMLCanvasElement|null>(null);
 useEffect(()=>{if(!canvas)return;let stopped=false,pdf:any,task:any,render:any;(async()=>{try{const {getDocument,GlobalWorkerOptions}=await import('pdfjs-dist');const worker=(await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;GlobalWorkerOptions.workerSrc=worker;task=getDocument(url);pdf=await task.promise;if(stopped)return;setCount(pdf.numPages);const item=await pdf.getPage(page);if(stopped)return;const viewport=item.getViewport({scale:1}),scale=Math.min(2,Math.max(1,600/viewport.width)),sized=item.getViewport({scale});canvas.width=sized.width;canvas.height=sized.height;render=item.render({canvas,viewport:sized});await render.promise}catch(e:any){if(!stopped)setError(e.message||'PDF 无法显示')}})();return()=>{stopped=true;render?.cancel();task?.destroy()};},[url,page,canvas]);
 return <div className="attachmentPdf"><div className="row"><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>上一页</button><span>{page} / {count||'…'}</span><button disabled={!count||page>=count} onClick={()=>setPage(p=>p+1)}>下一页</button></div>{error?<p role="alert">{error}</p>:null}<canvas ref={setCanvas}/></div>;
}
