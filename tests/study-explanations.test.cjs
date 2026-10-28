'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {build}=require('../tools/simulatte/build-study-solutions.cjs');
const {words}=require('../tools/simulatte/study-explanations.cjs');
const Text=require('../public/simulatte/system-diagram/study/inline-text.js');
const Theme=require('../public/simulatte/system-diagram/study/theme-preference.js');
const Store=require('../public/simulatte/system-diagram/study/workspace-store.js');
const data=path.resolve(__dirname,'../public/data/system-diagram/composable-solutions');
test('every published stage has 50–75 visible explanation words and safe background links',()=>{
 const {files}=build();let stages=0;
 for(const [name,raw]of files){if(!/^l\d+\.json$/.test(name))continue;const d=JSON.parse(raw);for(const s of d.solutions)for(const t of s.stages){
  const parts=Text.parts(t.explanation),plain=parts.map(p=>typeof p==='string'?p:p.label).join(''),count=plain.trim().split(/\s+/).length;
  assert.ok(count>=50&&count<=75,d.problem.referenceId+'/'+t.id+' words='+count);assert.equal(words(t.explanation),count);
  const links=parts.filter(p=>typeof p!=='string');assert.ok(links.length,d.problem.referenceId+'/'+t.id);
  for(const link of links)assert.equal(new URL(link.url).origin,'https://en.wikipedia.org');
  stages++;
 }}assert.equal(stages,747);
});
test('inline links preserve surrounding text and never interpret HTML or unsafe destinations',()=>{
 assert.deepEqual(Text.parts('An [immutable value](https://en.wikipedia.org/wiki/Immutable_object) stays fixed.'),['An ',{label:'immutable value',url:'https://en.wikipedia.org/wiki/Immutable_object'},' stays fixed.']);
 const malicious='<img src=x onerror=alert(1)> [run](javascript:alert) [user](https://user:pass@example.com/)';assert.deepEqual(Text.parts(malicious),[malicious]);
});
test('System is the default, while explicit Light and Dark remain overrides',()=>{
 for(const value of [null,undefined,'invalid','system']){assert.equal(Theme.preference(value),'system');assert.equal(Theme.resolve(value,false),'light');assert.equal(Theme.resolve(value,true),'dark');}
 for(const mode of ['light','dark'])for(const os of [false,true])assert.equal(Theme.resolve(mode,os),mode);
});
test('teaching-text refresh keeps overlays, notes and view but never replaces changed imported designs',()=>{
 const published=JSON.parse(fs.readFileSync(path.join(data,'l038.json'))),old=structuredClone(published);for(const s of old.solutions)for(const t of s.stages)t.explanation='Old caption';
 const workspace=Store.create(old,{notes:'Keep my notes',extension:{preserve:true}});workspace.overlays={probe:{}};workspace.view.stageIndex=7;
 const refreshed=Store.refreshExplanations(workspace,published);assert.deepEqual(refreshed.document,published);assert.equal(refreshed.overlays,workspace.overlays);assert.equal(refreshed.view,workspace.view);assert.equal(refreshed.notes,'Keep my notes');assert.deepEqual(refreshed.extension,{preserve:true});assert.equal(old.solutions[0].stages[0].explanation,'Old caption');
 const custom=structuredClone(workspace);custom.document.problem.scope+=' Learner-specific assumptions.';assert.equal(Store.refreshExplanations(custom,published),custom);
});
test('background topics match complete words rather than misleading substrings',()=>{
 const {topicFor}=require('../tools/simulatte/study-explanations.cjs'),p={problem:{referenceId:'L035'}},stage=(title)=>({title,reason:'Explain this decision.',invariants:[]});
 for(const title of ['Terminal outcome','Release the buffer','Logical ownership','Separate the catalog'])assert.equal(topicFor(p,stage(title)).id,'cache',title);
 assert.equal(topicFor(p,stage('A new leader term')).id,'replication');
 assert.equal(topicFor(p,stage('Write-ahead log recovery')).id,'log');
 assert.equal(topicFor(p,stage('RAG retrieval')).id,'rag');
});
