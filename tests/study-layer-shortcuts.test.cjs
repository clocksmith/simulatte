'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {transform,ORIGINAL_SHA256}=require('../tools/simulatte/patch-study-excalidraw.cjs');
const prefix='../public/simulatte/system-diagram/study/vendor/';
const patched=fs.readFileSync(require.resolve(prefix+'excalidraw.production.min.js'),'utf8');
function action(source,name,mac=true){
 const start=source.indexOf('name:"'+name+'"'),end=source.indexOf('PanelComponent:',start);
 const expression=source.slice(start,end).match(/keyTest:(function\(e\)\{return[^}]+\})/)[1];
 return Function('_','M','return ('+expression+')')({tW:{CTRL_OR_CMD:mac?'metaKey':'ctrlKey'},aU:{BRACKET_LEFT:'BracketLeft',BRACKET_RIGHT:'BracketRight'}},{Um:mac});
}
test('Mac layer actions match the displayed shortcuts without priority overlap',()=>{
 for(const [one,all,code]of [['sendBackward','sendToBack','BracketLeft'],['bringForward','bringToFront','BracketRight']]){
  const single=action(patched,one),edge=action(patched,all),plain={metaKey:true,ctrlKey:false,shiftKey:false,altKey:false,code};
  assert.equal(single(plain),true);assert.equal(edge(plain),false);
  const option={...plain,altKey:true};assert.equal(single(option),false);assert.equal(edge(option),true);
 }
});
test('Windows/Linux front/back keeps the native Ctrl+Shift shortcuts',()=>{
 for(const [one,all,code]of [['sendBackward','sendToBack','BracketLeft'],['bringForward','bringToFront','BracketRight']]){
  const event={ctrlKey:true,metaKey:false,shiftKey:true,altKey:false,code};
  assert.equal(action(patched,one,false)(event),false);assert.equal(action(patched,all,false)(event),true);
 }
});
test('the two-action patch reconstructs the exact pinned upstream bytes',()=>{
 let original=patched;
 for(const name of ['sendBackward','bringForward']){
  const start=original.indexOf('name:"'+name+'"'),end=original.indexOf('PanelComponent:',start);
  original=original.slice(0,start)+original.slice(start,end).replace('&&!e.shiftKey&&!e.altKey&&e.code','&&!e.shiftKey&&e.code')+original.slice(end);
 }
 assert.equal(crypto.createHash('sha256').update(original).digest('hex'),ORIGINAL_SHA256);
 assert.equal(transform(original),patched);
 const receipt=JSON.parse(fs.readFileSync(require.resolve(prefix+'versions.json'),'utf8'));
 assert.equal(receipt.sha256['excalidraw.production.min.js'],crypto.createHash('sha256').update(patched).digest('hex'));
});
