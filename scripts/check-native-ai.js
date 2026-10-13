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
