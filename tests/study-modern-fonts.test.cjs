'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const DIR=path.join(__dirname,'../public/simulatte/system-diagram/study/vendor/modern');
const receipt=JSON.parse(fs.readFileSync(path.join(DIR,'versions.json'),'utf8'));
test('vendored modern modules and font assets match their recorded bytes',()=>{
 for(const row of receipt.files){const file=path.resolve(DIR,row.path);assert.ok(file.startsWith(DIR+path.sep));assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),row.sha256,row.path);}
});
function predicate(name,mac=true){const source=fs.readFileSync(path.join(DIR,'index.js'),'utf8'),start=source.indexOf('name:"'+name+'"'),end=source.indexOf('PanelComponent:',start),expression=source.slice(start,end).match(/keyTest:(e=>[^,]+)/)[1];return Function('y','te','so','return ('+expression+')')({CTRL_OR_CMD:mac?'metaKey':'ctrlKey'},{BRACKET_LEFT:'BracketLeft',BRACKET_RIGHT:'BracketRight'},mac);}
test('modern native layer actions preserve both Mac single-step and front/back shortcuts',()=>{
 for(const [one,all,code]of [['sendBackward','sendToBack','BracketLeft'],['bringForward','bringToFront','BracketRight']]){const event={metaKey:true,altKey:false,shiftKey:false,code};assert.equal(predicate(one)(event),true);assert.equal(predicate(all)(event),false);const option={...event,altKey:true};assert.equal(predicate(one)(option),false);assert.equal(predicate(all)(option),true);}
});
test('modern Windows/Linux layer actions keep Ctrl+Shift for front/back',()=>{
 for(const [one,all,code]of [['sendBackward','sendToBack','BracketLeft'],['bringForward','bringToFront','BracketRight']]){const event={ctrlKey:true,altKey:false,shiftKey:true,code};assert.equal(predicate(one,false)(event),false);assert.equal(predicate(all,false)(event),true);}
});
