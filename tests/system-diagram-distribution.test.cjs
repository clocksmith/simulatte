'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const libraryApi = require('../public/simulatte/system-diagram/class-library.js');
const documents = require('../public/simulatte/system-diagram/diagram.js');
const engine = require('../public/simulatte/system-diagram/engine.js');
const runnerApi = require('../public/simulatte/system-diagram/runner.js');
const kernels = require('../public/simulatte/system-diagram/kernels-all.js');
require('../public/simulatte/system-diagram/kernels-distribution.js');
const memory = require('../public/simulatte/system-diagram/engine-observability.js');
const network = require('../public/simulatte/system-diagram/engine-network.js');
const config = require('../public/data/system-diagram/config.json');
const directory = path.resolve(__dirname, '../public/data/system-diagram');
const library = libraryApi.loadSync(directory);
const deps = { library, config, kernels };
const example = id => structuredClone(require('../public/data/system-diagram/examples/' + id + '.json'));
const params = (d, id, values) => Object.assign(d.nodes.find(n => n.id === id).params, values);
function run(d, until = d.run.horizonSec, customDeps = deps) {
  const c = documents.compile(d, library, config), s = engine.initialize(c, customDeps); engine.advance(c, s, until, customDeps);
  const view = engine.observe(c, s, customDeps); assert.equal(view.error, null); memory.reconcile(s); network.reconcile(s);
  assert.equal(view.global.offered, view.global.completed + view.global.failed + view.global.inFlight);
  return { c, s, view };
}
function smallVideo(values = {}) {
  const d = example('video-distribution'); d.faults = [];
  params(d, 'viewers', { viewers: 40, cohorts: 4, segments: 3, segmentKiB: 16, startSpreadSec: .3, segmentDurationSec: .2, ...values });
  params(d, 'origin', { segments: 3, segmentKiB: 16, serviceMs: 4 });
  for (const edge of d.edges) Object.assign(edge.params, { latencyMs: 0, bandwidthMbps: 100000 });
  return d;
}
function smallSpark(values = {}) {
  const d = example('spark-job'); d.faults = [];
  params(d, 'driver', { recordCount: 12, keyCount: 4, hotFraction: .5, mapPartitions: 3, reducePartitions: 2, recordKiB: 1, parallelTasks: 3, ...values });
  return d;
}
const counts = [{ url: '/url-0', count: 6 }, { url: '/url-1', count: 2 }, { url: '/url-2', count: 2 }, { url: '/url-3', count: 2 }];

test('thousands of video viewers retain exact segment byte conservation without thousands of graph nodes', () => {
  const d = example('video-distribution'), { s, view } = run(d), v = s.kernel.viewers;
  assert.equal(d.nodes.length, 4); assert.equal(v.cohorts.length, 12); assert.equal(v.completedViewers, 3000); assert.equal(v.failedViewers, 0);
  assert.equal(v.deliveredSegments, 24000); assert.equal(v.cdnKiB + v.peerKiB, 3000 * 8 * 256);
  assert.equal(s.kernel.origin.originKiB, 8 * 256); assert.ok(s.kernel.cdn.hits > 0); assert.ok(v.peerKiB > 0); assert.ok(v.peerFallbackViewers > 0);
  assert.ok(v.startupViewerSec > 0); assert.ok(v.rebufferViewerSec > 0); assert.ok(s.kernel.peers.churned > 0);
  assert.equal(view.global.inFlight, 0); assert.equal(view.global.completed, 96);
  const input = view.requests[0].input; assert.ok(input.fields.video.cohortId); assert.equal(input.fields.video.assetId, 1);
});

test('CDN fetches one real copy per segment and coalesces simultaneous misses', () => {
  const { s } = run(smallVideo({ peerAssistance: false, startSpreadSec: 0 }));
  assert.equal(s.kernel.origin.segments, 3); assert.equal(s.kernel.cdn.originKiB, 48); assert.equal(s.kernel.viewers.cdnKiB, 40 * 3 * 16);
  assert.ok(s.kernel.cdn.coalesced >= 3); assert.deepEqual(Object.keys(s.kernel.cdn.cache).sort(), ['asset-1:segment-0','asset-1:segment-1','asset-1:segment-2']);
});

test('unavailable and upload-limited peers fall back to CDN rather than manufacturing segments', () => {
  const unavailable = smallVideo(); params(unavailable, 'peers', { availabilityFraction: 0 });
  const a = run(unavailable); assert.equal(a.s.kernel.viewers.peerKiB, 0); assert.equal(a.s.kernel.viewers.cdnKiB, 1920); assert.equal(a.s.kernel.viewers.completedViewers, 40);
  const bounded = smallVideo(); params(bounded, 'peers', { availabilityFraction: 1, uploadKiBpsPerPeer: 1, uploadWindowSec: 1, churnFraction: 0 });
  const b = run(bounded); assert.equal(b.s.kernel.viewers.cdnKiB + b.s.kernel.viewers.peerKiB, 1920); assert.ok(b.s.kernel.viewers.peerKiB < 1920);
  for (const [id, amount] of Object.entries(b.s.kernel.peers.uploaded)) assert.ok(amount <= b.s.kernel.peers.cohorts[id].online, 'one KiB upload per peer per one-second window across segment identities');
});

test('peer assistance consumes previously downloaded identities, never its own cohort, and relay bytes incur stated cost', () => {
  const solo = smallVideo({ viewers: 10, cohorts: 1 }); params(solo, 'peers', { availabilityFraction: 1, uploadKiBpsPerPeer: 100000 });
  assert.equal(run(solo).s.kernel.viewers.peerKiB, 0);
  const d = smallVideo(); params(d, 'peers', { availabilityFraction: 1, uploadKiBpsPerPeer: 100000, relayFraction: .5, relayUsdPerGiB: 2, churnFraction: 0 });
  params(d, 'cdn', { egressUsdPerGiB: 0 }); params(d, 'origin', { egressUsdPerGiB: 0 });
  const { s, view } = run(d); assert.ok(s.kernel.viewers.peerKiB > 0); assert.equal(s.kernel.peers.relayKiB, s.kernel.peers.peerKiB / 2);
  assert.equal(view.global.cost, s.kernel.peers.relayKiB / 1048576 * 2);
});

test('origin refuses a mismatched asset rather than returning fabricated content', () => {
  const d = smallVideo({ peerAssistance: false, assetId: 99 }); const { s, view } = run(d);
  assert.equal(s.kernel.viewers.completedViewers, 0); assert.equal(s.kernel.viewers.failedViewers, 40); assert.equal(s.kernel.origin.originKiB, 0); assert.equal(Object.keys(s.kernel.cdn.cache).length, 0); assert.equal(view.global.failed, 4);
});

test('CDN and peer crashes discard volatile identities and allow repaired delivery through actual graph edges', () => {
  const d = smallVideo({ startSpreadSec: 1, peerAssistance: false }); d.faults = [{ id: 'cache-lost', atSec: .25, untilSec: .4, target: { kind: 'node', id: 'cdn' }, type: 'crash', params: {} }];
  const { s } = run(d); assert.equal(s.kernel.viewers.completedViewers, 40); assert.ok(s.kernel.origin.segments > 3);
  const peer = smallVideo(); peer.faults = [{ id: 'peers-lost', atSec: 0, untilSec: 2, target: { kind: 'node', id: 'peers' }, type: 'crash', params: {} }];
  const p = run(peer); assert.equal(p.s.kernel.viewers.completedViewers, 40); assert.equal(p.s.kernel.viewers.peerKiB, 0); assert.equal(p.s.kernel.viewers.cdnKiB, 1920);
});

test('Spark independently reduces generated URL inputs and delivers those counts to the result node', () => {
  const { s, view } = run(smallSpark()); assert.equal(s.kernel.driver.phase, 'completed'); assert.deepEqual(s.kernel.driver.output, counts);
  assert.deepEqual(s.kernel.driver.inputs.map(i => i.records.length), [4,4,4]);
  assert.ok(s.kernel.driver.stages.every(stage => stage.state === 'completed'));
  assert.ok(Object.values(s.kernel.driver.tasks).filter(t => t.kind === 'reduce').every(t => t.startedAt >= s.kernel.driver.stages[0].completedAt));
  assert.ok(Object.values(s.kernel.driver.reduces).some(r => r.shuffleKiB > 0));
  assert.equal(view.nodes.results.detail.writes, 1);
  const jobs = Object.values(s.observability.jobs); assert.equal(jobs.length, 0);
  const history = engine.inspect(documents.compile(smallSpark(), library, config), s, view.requests[0].id, deps);
  const sink = history.jobs.find(j => j.nodeId === 'results'); assert.deepEqual(sink.msg.fields.sparkResult.urlCounts, counts);
});

test('different input skew changes real keyed outputs and reduce task cost, not a canned terminal result', () => {
  const d = smallSpark({ recordCount: 60, hotFraction: .9 }); const { s } = run(d);
  assert.deepEqual(s.kernel.driver.output, [{url:'/url-0',count:54},{url:'/url-1',count:2},{url:'/url-2',count:2},{url:'/url-3',count:2}]);
  const sizes = Object.values(s.kernel.driver.reduces).map(r => r.rows.reduce((n, row) => n + row.count, 0)); assert.ok(Math.max(...sizes) > Math.min(...sizes) * 5);
});

test('Spark map and reduce spill is an observable bounded-buffer cost', () => {
  const d = smallSpark({ recordCount: 60, recordKiB: 128 });
  for (const n of d.nodes.filter(n => n.classId === 'spark-executor')) Object.assign(n.params, { taskBufferMiB: .125, shuffleBufferMiB: .125, spillMiBps: 10 });
  const spilling = run(d), clear = structuredClone(d);
  for (const n of clear.nodes.filter(n => n.classId === 'spark-executor')) Object.assign(n.params, { taskBufferMiB: 100, shuffleBufferMiB: 100 });
  const resident = run(clear);
  assert.deepEqual(spilling.s.kernel.driver.output, resident.s.kernel.driver.output);
  assert.ok(spilling.s.kernel.driver.completedAt > resident.s.kernel.driver.completedAt);
  for (const id of ['executor-a','executor-b','executor-c']) { assert.ok(spilling.s.kernel[id].spillKiB > 0); assert.ok(spilling.s.kernel[id].residentKiB <= 128); }
});

test('lost executor shuffle data forces lineage recomputation with unchanged independent output', () => {
  const faulted = run(example('spark-job')), healthy = example('spark-job'); healthy.faults = []; const baseline = run(healthy);
  assert.deepEqual(faulted.s.kernel.driver.output, baseline.s.kernel.driver.output); assert.ok(faulted.s.kernel.driver.recomputed > 0); assert.ok(faulted.s.kernel['executor-a'].lostBlocks > 0); assert.ok(faulted.s.kernel.driver.fetchFailures > 0); assert.equal(faulted.view.global.completed, 1);
});

test('removing required shuffle connectivity prevents output rather than reading a shadow copy', () => {
  const d = smallSpark({ maxAttempts: 2 }); d.edges = d.edges.filter(e => !e.id.startsWith('shuffle-'));
  const { s, view } = run(d); assert.equal(s.kernel.driver.phase, 'failed'); assert.deepEqual(s.kernel.driver.output, []); assert.equal(view.global.completed, 0); assert.equal(view.global.failed, 1); assert.equal(view.nodes.results.arrivals, 0);
});

test('executor faults and repair retry queued map work; a finite retry budget stays terminal', () => {
  const d = smallSpark({ parallelTasks: 1, maxAttempts: 4, retryBackoffMs: 100 });
  d.nodes = d.nodes.filter(n => !['executor-b','executor-c'].includes(n.id)); d.edges = d.edges.filter(e => ['driver','executor-a','results'].includes(e.from.nodeId) && ['driver','executor-a','results'].includes(e.to.nodeId));
  d.faults = [{id:'lost',atSec:0,untilSec:.15,target:{kind:'node',id:'executor-a'},type:'crash',params:{}}];
  const repaired = run(d); assert.deepEqual(repaired.s.kernel.driver.output, counts); assert.ok(repaired.s.kernel.driver.retries > 0);
  const exhausted = structuredClone(d); params(exhausted, 'driver', { maxAttempts: 1 }); const failRun = run(exhausted); assert.equal(failRun.s.kernel.driver.phase,'failed'); assert.equal(failRun.view.global.inFlight,0);
});

test('asynchronous segment and Spark task edges fail closed because they cannot establish delivery or dependencies', () => {
  for (const [id,edgeId] of [['video-distribution','viewers-cdn'],['spark-job','driver-a']]) {
    const d=example(id);d.edges.find(e=>e.id===edgeId).params.mode='async';assert.throws(()=>run(d),/requires synchronous/);
  }
});

for (const id of ['video-distribution','spark-job']) test(id + ' restores active transfers, retained blocks and RNG exactly from a JSON checkpoint', () => {
  const d=example(id),direct=run(d),state=engine.initialize(direct.c,deps);engine.advance(direct.c,state,.42,deps);
  const restored=JSON.parse(JSON.stringify(state));engine.advance(direct.c,restored,d.run.horizonSec,deps);assert.deepEqual(restored,direct.s);assert.deepEqual(engine.observe(direct.c,restored,deps),direct.view);memory.reconcile(restored);network.reconcile(restored);
});

test('shared coordinator checkpoint and ledger replay reproduce both real distribution outputs', async () => {
  for(const id of ['video-distribution','spark-job']) {
    const runner=await runnerApi.create({diagram:example(id),...deps});
    try {runner.advanceTo(.42);const checkpoint=await runner.checkpoint();runner.advanceTo(30);const done=runner.view();await runner.restore(checkpoint);runner.advanceTo(30);assert.deepEqual(runner.view(),done);assert.equal((await runner.verify()).status,'match');}
    finally {await runner.dispose();}
  }
});

test('rewiring viewers straight to the origin changes actual origin bytes without changing delivered content', () => {
  const cached = smallVideo({ peerAssistance: false }), direct = structuredClone(cached);
  direct.edges.find(e => e.id === 'viewers-cdn').to.nodeId = 'origin';
  const a = run(cached), b = run(direct);
  assert.equal(a.s.kernel.viewers.cdnKiB, b.s.kernel.viewers.cdnKiB);
  assert.equal(a.s.kernel.origin.originKiB, 48); assert.equal(b.s.kernel.origin.originKiB, 1920); assert.equal(b.view.nodes.cdn.arrivals, 0);
});

test('Spark executors obey a shared resource-group slot budget while preserving URL reductions', () => {
  const serial = smallSpark({ recordCount: 60 }), parallel = structuredClone(serial);
  serial.groups = [{ id:'compute', label:'One shared CPU slot', kind:'resource', capacity:1, x:240, y:-40, w:260, h:550 }];
  for(const n of serial.nodes.filter(n=>n.classId==='spark-executor'))n.groupId='compute';
  const a=run(serial),b=run(parallel);assert.deepEqual(a.s.kernel.driver.output,b.s.kernel.driver.output);assert.ok(a.s.kernel.driver.completedAt>b.s.kernel.driver.completedAt);
  assert.equal(Object.values(a.s.observability.slots).reduce((sum, rows)=>sum+Object.keys(rows).length,0),0);
});

test('domain observation records are detached, bounded inputs and outputs rather than mutable kernel references', () => {
  for(const [id,node,collection] of [['video-distribution','viewers','cohorts'],['spark-job','driver','output']]){
    const r=run(example(id)),before=JSON.stringify(r.s);assert.ok(r.view.nodes[node].records[collection].length>0);
    r.view.nodes[node].records[collection][0].id='mutated';assert.equal(JSON.stringify(r.s),before);assert.notDeepEqual(engine.observe(r.c,r.s,deps),r.view);
  }
});

test('executor service error bursts settle the job and clean ephemeral shuffle work without inventing output', () => {
  const d=smallSpark({maxAttempts:2});for(const n of d.nodes.filter(n=>n.classId==='spark-executor'))n.params.errorRate=1;
  const r=run(d);assert.equal(r.s.kernel.driver.phase,'failed');assert.equal(r.view.global.inFlight,0);assert.deepEqual(r.s.kernel.driver.output,[]);
  for(const id of ['executor-a','executor-b','executor-c']){assert.deepEqual(r.s.kernel[id].reducing,{});assert.deepEqual(r.s.kernel[id].pendingMaps,{});}
});

test('accepted video segment duration cannot retroactively rewrite playback or introduce artificial rebuffer', () => {
  const d=smallVideo({viewers:1,cohorts:1,segments:4,segmentKiB:1,startSpreadSec:0,segmentDurationSec:2,prefetchSegments:1,peerAssistance:false});
  params(d,'origin',{segments:4,segmentKiB:1,serviceMs:0});params(d,'cdn',{serviceMs:0});
  const c=documents.compile(d,library,config),s=engine.initialize(c,deps);engine.advance(c,s,1,deps);assert.equal(s.kernel.viewers.cohorts[0].segment,2);
  const before=JSON.stringify(s);assert.throws(()=>engine.applyControl(c,s,{kind:'setParams',target:{kind:'node',id:'viewers'},params:{segmentDurationSec:.1}},deps),/immutable parameter/);assert.equal(JSON.stringify(s),before);
  engine.advance(c,s,10,deps);assert.equal(s.kernel.viewers.completedViewers,1);assert.equal(s.kernel.viewers.rebufferViewerSec,0);
  const changed=structuredClone(d);params(changed,'viewers',{segmentDurationSec:.1});assert.equal(run(changed).s.kernel.viewers.completedViewers,1,'draft restart remains configurable');
});

test('CDN authoring rejects multiple origins rather than silently ignoring a connected origin', () => {
  const d=smallVideo(),second=structuredClone(d.nodes.find(n=>n.id==='origin'));second.id='origin-two';d.nodes.push(second);
  d.edges.push({id:'second-origin',label:'Second origin',from:{nodeId:'cdn',portId:'origin'},to:{nodeId:'origin-two',portId:'in'},params:{}});
  assert.throws(()=>documents.compile(d,library,config),/multiple|one|connection|port/i);
});

function corruptExecutorReply(mutate) {
  const original=kernels.get('sparkExecutor');let changed=0;
  const alternate={...original,onServed(ctx,job){ original.onServed({...ctx,reply(replyJob,response){const copy=structuredClone(response);if(mutate(copy,job))changed++;return ctx.reply(replyJob,copy);}},job); }};
  return {deps:{...deps,kernels:{has:id=>kernels.has(id),get:id=>id==='sparkExecutor'?alternate:kernels.get(id)}},changed:()=>changed};
}
for(const field of ['jobId','map','partition','executor','epoch','records','kb'])test('shuffle reply binds requested '+field+' before accepting any reduced counts',()=>{
  const corrupt=corruptExecutorReply(r=>{const b=r.fields?.sparkBlock;if(!b)return false;if(field==='jobId'||field==='executor')b[field]+='-wrong';else b[field]++;
    if(['jobId','map','partition'].includes(field))b.id=`${b.jobId}:map-${b.map}:reduce-${b.partition}`;
    if(field==='records')b.rows.push({url:'/url-0',count:1});return true;});
  const d=smallSpark({maxAttempts:1}),r=run(d,30,corrupt.deps);assert.ok(corrupt.changed()>0);assert.equal(r.s.kernel.driver.phase,'failed');assert.deepEqual(r.s.kernel.driver.output,[]);assert.equal(r.view.nodes.results.arrivals,0);
});
for(const corruption of ['wrong-map','wrong-executor','missing-count','duplicate-count','wrong-bytes'])test('driver rejects map response '+corruption+' from dependency metadata rather than canned expected output',()=>{
  const corrupt=corruptExecutorReply(r=>{const v=r.fields?.sparkResult;if(v?.kind!=='map')return false;const b=v.blocks.find(b=>b.records>0);
    if(corruption==='wrong-map'){b.map++;b.id=`${b.jobId}:map-${b.map}:reduce-${b.partition}`;}else if(corruption==='wrong-executor')b.executor='other-executor';else if(corruption==='missing-count')b.records--;else if(corruption==='duplicate-count')b.records++;else b.kb++;return true;});
  const r=run(smallSpark(),30,corrupt.deps);assert.ok(corrupt.changed()>0);assert.equal(r.s.kernel.driver.phase,'failed');assert.deepEqual(r.s.kernel.driver.output,[]);assert.equal(r.view.global.failed,1);
});

test('a legal CDN origin rewire to an empty peer cannot manufacture a cache copy from a zero-byte receipt',()=>{
  const d=smallVideo({viewers:1,cohorts:1,segments:1,peerAssistance:false});d.edges.find(e=>e.id==='cdn-origin').to.nodeId='peers';
  const r=run(d);assert.equal(r.s.kernel.viewers.completedViewers,0);assert.equal(r.s.kernel.viewers.failedViewers,1);
  assert.equal(r.s.kernel.cdn.deliveredKiB,0);assert.equal(r.s.kernel.cdn.originKiB,0);assert.deepEqual(r.s.kernel.cdn.cache,{});assert.equal(r.s.kernel.origin.segments,0);assert.equal(r.s.kernel.peers.peerKiB,0);
});

test('video KiB wire bytes and retained MiB agree independently with decimal Mbps serialization',()=>{
  const d=smallVideo({viewers:1,cohorts:1,segments:1,segmentKiB:1024,peerAssistance:false,startSpreadSec:0});params(d,'origin',{segments:1,segmentKiB:1024,serviceMs:0});params(d,'cdn',{serviceMs:0});
  const cached=run(d);assert.equal(cached.s.kernel.cdn.originKiB,1024);assert.equal(cached.view.nodes.cdn.heldMiB,1);assert.equal(cached.view.global.memoryMiB,1);
  assert.ok(Math.abs(cached.s.network.deliveredKbit-((1024*1024*2+256*2)*8/1000))<1e-9);
  d.edges.find(e=>e.id==='viewers-cdn').to.nodeId='origin';d.edges.find(e=>e.id==='viewers-cdn').params.bandwidthMbps=1;
  const direct=run(d);assert.ok(Math.abs(direct.view.requests[0].completedAt-(256+1024*1024)*8/1000000)<1e-9);assert.equal(direct.s.kernel.origin.originKiB,1024);
});

test('Spark KiB inputs and shuffle blocks use decimal wire kB but binary retained MiB',()=>{
  const d=smallSpark({recordCount:1,keyCount:1,mapPartitions:1,reducePartitions:1,recordKiB:1024});
  for(const n of d.nodes.filter(n=>n.classId==='spark-executor'))Object.assign(n.params,{taskBufferMiB:2,shuffleBufferMiB:2});
  const r=run(d),history=engine.inspect(r.c,r.s,r.view.requests[0].id,deps),map=history.jobs.find(j=>j.msg.fields.spark?.kind==='map');assert.equal(map.msg.kb,1048.576);
  const block=Object.values(r.s.kernel['executor-a'].blocks)[0];assert.equal(block.kb,1048.576);assert.equal(block.residentKiB,1024);assert.equal(r.view.nodes['executor-a'].heldMiB,1);assert.deepEqual(r.s.kernel.driver.output,[{url:'/url-0',count:1}]);
});
