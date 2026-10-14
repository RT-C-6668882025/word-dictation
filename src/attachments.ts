export type Attachment={id:string;name:string;mime:string;size:number;side:'front'|'back'};
export const attachmentMimes=['image/jpeg','image/png','image/webp','image/gif','audio/mpeg','audio/mp4','audio/wav','audio/ogg','audio/flac','audio/webm','application/pdf'];
export function validateAttachments(value:unknown):Attachment[]{
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>20)throw Error('每条卡片最多 20 个附件');
 const ids=new Set<string>();return value.map(a=>{if(!a||typeof a!=='object'||typeof a.id!=='string'||!/^att_[a-zA-Z0-9_-]{8,80}$/.test(a.id)||typeof a.name!=='string'||!a.name.trim()||a.name.length>200||!attachmentMimes.includes(a.mime)||!Number.isInteger(a.size)||a.size<1||a.size>50*1024*1024||!['front','back'].includes(a.side)||ids.has(a.id))throw Error('附件信息无效或重复');ids.add(a.id);return {id:a.id,name:a.name,mime:a.mime,size:a.size,side:a.side}});
}
