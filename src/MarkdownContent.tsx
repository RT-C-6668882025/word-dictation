import ReactMarkdown,{type Options} from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
const remarkPlugins=[remarkGfm,remarkMath];
const rehypePlugins:NonNullable<Options['rehypePlugins']>=[[rehypeKatex,{strict:false,trust:false}]];
export default function MarkdownContent({text}:{text:string}){
 return <div className="cardMarkdown"><ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} skipHtml components={{a:({children})=><span>{children}</span>,img:({alt})=><span>{alt||''}</span>}}>{text}</ReactMarkdown></div>;
}
