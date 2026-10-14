import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
GlobalWorkerOptions.workerSrc=pdfWorker;
export async function extractAttachmentPdf(data:ArrayBuffer){const pdf=await getDocument({data}).promise;try{const parts:string[]=[];for(let page=1;page<=pdf.numPages;page++){const content=await(await pdf.getPage(page)).getTextContent();parts.push('[第 '+page+' 页]\n'+content.items.map(item=>'str'in item?item.str:'').join(' '))}return parts.some(p=>p.split('\n').slice(1).join('').trim())?parts.join('\n\n'):''}finally{await pdf.destroy()}}
