const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const base = '../public/simulatte/system-diagram/';
const library = require(base+'class-library.js').loadSync(path.resolve(__dirname,'../public/data/system-diagram'));
const D = require(base+'diagram.js'), E = require(base+'engine.js'), kernels = require(base+'kernels-all.js');
const O = require(base+'engine-observability.js'), config = require('../public/data/system-diagram/config.json');
const deps = {library,config,kernels}, clone = x => JSON.parse(JSON.stringify(x));
const fixture = id => clone(require('../public/data/system-diagram/examples/'+id+'.json'));
function run(d,t=d.run.horizonSec) {const c=D.compile(d,library,config),s=E.initialize(c,deps);E.advance(c,s,t,deps);return {c,s,v:E.observe(c,s,deps)};}
function continuation(d,split,end){const c=D.compile(d,library,config),s=E.initialize(c,deps);E.advance(c,s,split,deps);const restored=clone(s);E.advance(c,s,end,deps);E.advance(c,restored,end,deps);assert.deepEqual(restored,s);assert.ok(O.reconcile(s));return {c,s,v:E.observe(c,s,deps)};}
test('finite streaming burst exposes bounded slow-consumer backpressure, cache reuse and a faster repair under identical demand',()=>{
 const d=fixture('streaming-burst'),a=run(d),b=run(d);assert.deepEqual(a.s,b.s);assert.equal(a.v.requests.length,24);
 // All 24 chunks arrive before the first 600 ms subscriber acknowledgement:
 // the two acknowledgement slots plus eight waiting places admit exactly ten.
 assert.equal(a.v.global.completed,10);assert.equal(a.v.global.failed,14,'bounded fanout rejects rather than silently growing');assert.ok(a.v.nodes.subscriber.served>0);assert.ok(a.v.nodes.cdn.detail.hits>0 || a.v.nodes.cdn.detail.Hits>0);
 assert.ok(a.v.nodes.fanout.queue<=8);assert.ok(a.v.requests.every(r=>r.status!=='in-flight'));assert.ok(a.v.requests.some(r=>r.deadlineMissed));
 const repaired=clone(d);Object.assign(repaired.nodes.find(n=>n.id==='subscriber').params,{concurrency:4,queueCapacity:8});Object.assign(repaired.nodes.find(n=>n.id==='fanout').params,{concurrency:4,queueCapacity:20});const p=run(repaired);
 assert.deepEqual(a.v.requests.map(r=>[r.id,r.arrival,r.sourceId]),p.v.requests.map(r=>[r.id,r.arrival,r.sourceId]));assert.equal(p.v.global.completed,24);assert.equal(p.v.global.failed,0);assert.ok(O.reconcile(a.s));assert.ok(O.reconcile(p.s));
 continuation(d,.09,8);
});
test('replica recovery preserves missing writes until the failed follower actually catches up',()=>{
 const d=fixture('replica-recovery');d.faults=[{id:'follower',atSec:0,untilSec:1,target:{kind:'node',id:'db'},type:'failReplica',params:{index:1}}];Object.assign(d.nodes[0].params,{pattern:'constant',ratePerSec:10,maxRequests:5,readFraction:0,retries:0});Object.assign(d.nodes[1].params,{replication:'async',replicationLagMs:500,readFrom:'followers',readQuorum:1});
 const a=run(d,.9);assert.ok(a.s.kernel.db.log.length>0,'offline replica data cannot be pruned as replicated');assert.ok(a.s.kernel.db.log.every(e=>e.applied[1]===null));
 E.advance(a.c,a.s,1.01,deps);assert.ok(a.s.kernel.db.replicas[1].catchUpUntil>1);assert.ok(a.s.kernel.db.log.some(e=>e.applied[1]>1));E.advance(a.c,a.s,3,deps);assert.ok(a.s.kernel.db.replicas.every(r=>r.up));assert.equal(a.v.nodes.db.detail['Lost writes'],0);continuation(d,.7,3);
});
test('declared quorum journey exposes partition failures, elects once and recovers with no acknowledged-write loss',()=>{
 const d=fixture('replica-recovery'),a=continuation(d,1.2,5),b=run(d);assert.deepEqual(a.s,b.s);assert.equal(a.v.nodes.db.detail.Elections,1);assert.equal(a.v.nodes.db.detail['Lost writes'],0);assert.ok(a.v.attempts.some(r=>r.status==='failed'),'partition and election failures stay visible even when bounded retries mask them');assert.ok(a.v.global.retries>0);assert.ok(a.v.nodes.db.detail.Leader.startsWith('replica '));assert.equal(a.v.nodes.db.detail['Replicas up'],'3/3');assert.ok(a.v.requests.every(r=>r.status!=='in-flight'));
});
test('a memory-change notification hook does not imply ownership of shared worker slots',()=>{
 const d=fixture('streaming-burst');d.nodes.push({id:'model',classId:'llm',label:'Model',x:0,y:400,params:{},groupId:'pool'});d.groups.push({id:'pool',label:'Pool',kind:'resource',capacity:1,x:0,y:350,w:300,h:180});
 const c=D.compile(d,library,config);assert.throws(()=>E.initialize(c,deps),/explicit resource slot ownership/);
});
