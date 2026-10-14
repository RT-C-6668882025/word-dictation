import{lazy,memo,Suspense}from'react';
const MarkdownContent=lazy(()=>import('./MarkdownContent'));
export const CardContent=memo(function CardContent({text,format}:{text:string;format?:'text'|'markdown'}){return format==='markdown'?<Suspense fallback={<span>{text}</span>}><MarkdownContent text={text}/></Suspense>:<>{text}</>});
