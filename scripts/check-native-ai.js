// ES5 deliberately: executed by the same Rhino version used on Android.
(function () {
 var state={books:[],receipts:{}},id=0;
 function assert(ok,message){if(!ok)throw Error(message)}
 function call(name,args,operationId){var t=JSON.parse(WordAiEngine.transact(JSON.stringify(state),JSON.stringify({id:operationId||('op'+(++id)),name:name,arguments:args})));state=t.state;return t}
 var imported=call('import_wordbook',{name:'银行',text:'bank,银行\nmoney,钱',page_size:10},'import-one');
 assert(imported.changed&&imported.response.result.count===2,'import');
 var replay=call('import_wordbook',{name:'银行',text:'bank,银行\nmoney,钱',page_size:10},'import-one');
 assert(!replay.changed&&state.books.length===1&&replay.response.result.id===imported.response.result.id,'durable import replay');
 assert(call('import_wordbook',{name:'别的',text:'new,新的'},'import-one').response.error,'operation conflict');
 var book=state.books[0],word=book.words[0];
 var removed=call('remove_from_whitelist',{book_id:book.id,word_ids:[word.id,word.id]});
 assert(removed.response.result.changed_count===1&&removed.response.result.requested_count===1,'remove count');
 var query=call('get_words',{book_id:book.id,query:'bank'});
 assert(query.response.result.words[0].in_whitelist===false,'actual membership');
 var before=JSON.stringify(state);
 assert(call('add_to_whitelist',{book_id:book.id,word_ids:[word.id,'missing']}).response.error,'invalid ID');
 assert(JSON.stringify(state)===before,'all-or-nothing invalid mutation');
 assert(call('add_to_whitelist',{book_id:book.id,word_ids:[word.id]}).response.result.changed_count===1,'add');
 assert(call('add_to_whitelist',{book_id:book.id,word_ids:[word.id]}).response.result.changed_count===0,'no-op count');
 assert(call('list_wordbooks',{}).response.result.length===1,'list');
 assert(call('get_words',{book_id:book.id,limit:501}).response.error,'validation');
 assert(call('import_wordbook',{name:'empty',text:'no words'}).response.error,'empty import');
 assert(call('create_temp_wordbook',{name:'短语',text:'| English | Chinese |\n| --- | --- |\n| take care | 照顾 |'}).response.result.name==='[临时] 短语','same Markdown parser');
 assert(state.revision===5,'revision advances only on committed mutations');
 var special=call('import_wordbook',{name:'编号测试',text:'test,测试'},'__proto__');
 assert(special.changed,'special operation id');
 assert(!call('import_wordbook',{name:'编号测试',text:'test,测试'},'__proto__').changed,'special operation id replay');
 print('Native engine: imports, replay, conflict, whitelist, validation and parser passed');
})();
(function(){
 var cards=[{front:'日本語の質問',back:'日本語の答え'},{front:'机会成本是什么？',back:'放弃的最佳替代方案的价值。'},{front:'ما هي الذاكرة؟',back:'القدرة على تذكر المعلومات'},{front:'长问题\n第二行',back:new Array(1201).join('长答案\n'),format:'markdown'},{front:'函数返回什么？',back:'```js\nreturn 42;\n```\n\n$$a^2+b^2=c^2$$',format:'markdown'}];
 var state={books:[],receipts:{}},request={id:'universal',name:'import_wordbook',arguments:{name:'通用卡片',text:JSON.stringify(cards)}};
 var result=JSON.parse(WordAiEngine.transact(JSON.stringify(state),JSON.stringify(request)));
 if(result.response.error||result.response.result.count!==5)throw Error('universal import failed');
 var book=result.state.books[0];
 if(book.words[3].back!==cards[3].back||book.words[4].format!=='markdown')throw Error('content lost');
 var query={id:'read-universal',name:'get_words',arguments:{book_id:book.id,query:'日本語'}};
 var read=JSON.parse(WordAiEngine.transact(JSON.stringify(result.state),JSON.stringify(query)));
 if(read.response.result.words[0].front!==cards[0].front)throw Error('generic query');
 request.id='bad-universal';request.arguments.text=JSON.stringify([cards[0],{front:'missing back'}]);
 var failed=JSON.parse(WordAiEngine.transact(JSON.stringify(result.state),JSON.stringify(request)));
 if(!failed.response.error||failed.state.books.length!==1)throw Error('malformed cards must not partially save');
 print('Native universal cards: languages, long text, Markdown, query and atomic validation passed');
})();
