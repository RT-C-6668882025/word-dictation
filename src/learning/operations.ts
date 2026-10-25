import {DEFAULT_PROFILE,scheduleLearning,validateProfile,type LearningProfile,type LearningEvent} from './strategy';
import {needIds,type Book} from '../wordbook';
import type {Operations} from '../aiOperations';
export type LearningState={profiles:LearningProfile[];events:LearningEvent[]};
export const learningTools=['get_learning_context','create_algorithm','test_algorithm','set_algorithm','get_algorithm','reset_algorithm','list_algorithms','record_learning_event'];
export function executeLearning(name:string,a:Record<string,any>,ops:Operations):any{
 const state=ops.learning?.()||{profiles:[],events:[]};
 const profiles=[DEFAULT_PROFILE,...state.profiles];
 const data=(value:unknown)=>({ok:true,data:value});
 if(name==='list_algorithms')return data({profiles,plugin_ids:[]});
 if(name==='create_algorithm'){
  const profile=JSON.parse(JSON.stringify(a.profile??null));validateProfile(profile);
  if(profile.id==='none'||profiles.some(p=>p.id===profile.id))throw Error('算法 ID 已存在，请使用新 ID');
  if(profile.algorithm.kind==='plugin')throw Error('尚未安装该算法插件');
  if(state.profiles.length>=100)throw Error('最多保存 100 个算法');
  if(!ops.saveLearning)throw Error('当前环境不支持保存算法');
  ops.saveLearning({...state,profiles:[...state.profiles,profile]});return data({profile,saved:true});
 }
 const book=ops.books().find(b=>b.id===(a.deckId??a.book_id));if(!book)throw Error('词库不存在');
 const active=profiles.find(p=>p.id===book.learningProfileId)||DEFAULT_PROFILE;
 if(name==='get_algorithm')return data({deckId:book.id,profile:active});
 if(name==='get_learning_context')return data({deckId:book.id,whitelistIds:[...needIds(book)],activeProfileId:active.id,profiles,event_types:['viewed','revealed','remembered','forgotten','answered_correctly','answered_incorrectly']});
 if(name==='record_learning_event'){
  const event=a.event as LearningEvent;
  if(!event||typeof event.id!=='string'||!event.id||event.id.length>128||event.deckId!==book.id||!book.words.some(w=>w.id===event.itemId)||!['viewed','revealed','remembered','forgotten','answered_correctly','answered_incorrectly'].includes(event.type)||!Number.isSafeInteger(event.at)||event.at<0)throw Error('学习事件无效');
  const old=state.events.find(e=>e.id===event.id);if(old){if(JSON.stringify(old)!==JSON.stringify(event))throw Error('事件 ID 已存在');return data({saved:true,duplicate:true})}
  if(state.events.length>=50000)throw Error('学习事件已达到容量限制');
  if(!ops.saveLearning)throw Error('当前环境不支持保存事件');ops.saveLearning({...state,events:[...state.events,event]});return data({saved:true});
 }
 const profile=name==='reset_algorithm'?DEFAULT_PROFILE:profiles.find(p=>p.id===a.profileId);
 if(!profile)throw Error('算法不存在');
 if(name==='test_algorithm')return data(scheduleBook(book,state,profile));
 if(!ops.replaceBooks)throw Error('当前环境不支持保存算法');
 const updated={...book,learningProfileId:profile.id==='none'?null:profile.id,learningAlgorithm:profile.algorithm};
 const result=ops.replaceBooks(ops.books().map(b=>b.id===book.id?updated:b),[book.id]);
 const response=()=>data({deckId:book.id,profile,saved:true});
 return result&&typeof (result as any).then==='function'?(result as Promise<void>).then(response):response();
}
export function scheduleBook(book:Book,state:LearningState,profile:LearningProfile){return scheduleLearning({deckId:book.id,items:book.words.map((w,order)=>({id:w.id,order})),whitelistIds:[...needIds(book)],events:state.events,now:Date.now()},profile.algorithm)}
