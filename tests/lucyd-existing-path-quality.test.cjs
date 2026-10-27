'use strict';
// Owner: public/simulatte/system-diagram/CATSCAN.md.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const D=require('../public/simulatte/system-diagram/diagram.js'),E=require('../public/simulatte/system-diagram/engine.js');
const library=require('../public/simulatte/system-diagram/class-library.js').loadSync(path.resolve(__dirname,'../public/data/system-diagram'));
const config=require('../public/data/system-diagram/config.json'),kernels=require('../public/simulatte/system-diagram/kernels-all.js');
const problems=require('../public/data/system-diagram/problems.json').problems,deps={library,config,kernels};
function diagram(id,index){return structuredClone(problems.find(p=>p.id===id).solutions[0].stages.find(st=>st.legacyIndex===index).diagram);}
function run(d,checkpoint=false){const c=D.compile(d,library,config);let s=E.initialize(c,deps);if(checkpoint){E.advance(c,s,1,deps);s=JSON.parse(JSON.stringify(s));}E.advance(c,s,d.run.horizonSec,deps);return {s,v:E.observe(c,s,deps)};}
test('stream recovery stage executes a failure and preserves acknowledged text and durable message identity',()=>{
 const d=diagram('chat-application',2);assert.ok(d.faults.some(f=>f.target.id==='stream'&&f.type==='crash'));
 const {s,v}=run(d),baseline=run(diagram('chat-application',1));
 assert.equal(v.error,null);assert.ok(v.global.retries>baseline.v.global.retries);
 assert.equal(v.global.completed,7);assert.equal(v.global.failed,1);assert.deepEqual(v.global.failedBy,{invalid:1});
 assert.equal(v.global.effects,6);assert.equal(v.global.duplicateEffects,0);
 const records=rows=>rows.map(({committedAtSec,...record})=>record);
 assert.deepEqual(records(s.kernel.conversations.messages),records(baseline.s.kernel.conversations.messages));
 const chunks=s.kernel.client.chunks;assert.equal(chunks.length,16);
 assert.equal(new Set(chunks.map(c=>[c.messageId,c.cursor].join(':'))).size,chunks.length);
 assert.deepEqual(run(d,true).s,s,'serialized checkpoint resumes the same faulted execution');
 const noRetries=structuredClone(d);Object.assign(noRetries.nodes.find(n=>n.id==='chat').params,{retries:0});noRetries.nodes.find(n=>n.id==='client').params.retries=0;
 assert.ok(run(noRetries).v.global.failed>v.global.failed,'recovery must require actual retries');
});
test('dead-letter stage quarantines exhausted fanout and distinguishes queue acceptance from timeline completion',()=>{
 const d=diagram('social-feed',2);assert.ok(d.faults.some(f=>f.target.id==='timelines'&&f.type==='crash'));
 const {s,v}=run(d);assert.equal(v.error,null);assert.ok(s.kernel.queue.stats.deadLettered>0);
 assert.equal(s.kernel.deadletters.kept.length,s.kernel.queue.stats.deadLettered);
 assert.ok(s.kernel.queue.stats.acked>0,'work after recovery still completes');
 assert.equal(s.kernel.queue.stats.acked+s.kernel.queue.stats.deadLettered,s.kernel.queue.stats.enqueued);
 assert.equal(v.global.duplicateEffects,0);assert.ok(s.kernel.feed.missing>0);
 assert.deepEqual(run(d,true).s,s,'serialized checkpoint preserves bounded retry and quarantine state');
 const healthy=structuredClone(d);healthy.faults=healthy.faults.filter(f=>f.target.id!=='timelines');
 assert.ok(run(healthy).s.kernel.queue.stats.deadLettered<s.kernel.queue.stats.deadLettered,'the authored outage must cause quarantine');
});
