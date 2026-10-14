import assert from 'node:assert/strict';
import{parseText,parseDelimited,parseSheetRows,frontText,backText}from'../src/parser.ts';
for(const [front,back]of [['日本語','意味'],['问题','答案'],['한국어','설명'],['مرحبا','hello'],['bonjour','greeting'],['123','456']]){
 const cards=parseText(front+','+back);assert.equal(cards.length,1);assert.equal(frontText(cards[0]),front);assert.equal(backText(cards[0]),back);
}
assert.equal(parseDelimited('front,back\n"question, with comma","answer\nsecond paragraph"')[0].back,'answer\nsecond paragraph');
assert.equal(parseSheetRows([['正面','背面'],['代码','return 42;']])[0].front,'代码');
assert.equal(parseText('Front → Back')[0].back,'Back');
assert.equal(parseText('abandon 放弃')[0].front,'abandon');
assert.equal(parseText('| front | back |\n| --- | --- |\n| 数学 | 定理 |')[0].front,'数学');
const big='This is unrestricted content.\n'.repeat(2000).trim();const result=parseText(JSON.stringify([{front:'Q',back:big,format:'markdown'}]));assert.equal(result[0].back,big);
assert.equal(frontText({id:'old',en:'legacy',zh:'旧数据'}),'legacy');
assert.throws(()=>parseText('[{"front":"ok","back":"yes"},{"front":"missing"}]'));
console.log('Parser passed: unrestricted languages, multiline CSV/JSON, long content, headers and legacy dictionaries');
