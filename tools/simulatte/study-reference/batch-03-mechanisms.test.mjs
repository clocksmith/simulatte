import test from 'node:test';import assert from 'node:assert/strict';
import {reducerOf,partitionedCounts,recoverBlocks,planCheckpointReuse,createIncrementalState,incrementalStep,createMicrobatchStore,commitMicrobatch,createCommit,tryCommit,cleanupStaged,reserveCommit,publishReserved,recoverPublication,committedPrefix,createTask,selectWinner,invalidateOnLoss,createChild,deliverCompletion,revokeCompletion,arbitrate,recoverShard,receiveCompletion} from './batch-03-mechanisms.mjs';

const input=['/a','/b','/a','/a','/b','/c'];
const serial=()=>{const m=new Map();for(const url of input)m.set(url,(m.get(url)||0)+1);return m;};
const attempts=[
 {mapId:0,attemptId:'m0-a1',rows:['/a','/b']},
 {mapId:1,attemptId:'m1-a0',rows:['/a']},
 {mapId:1,attemptId:'m1-a1',rows:['/a','/a']},
 {mapId:1,attemptId:'m1-a2',rows:['/a','/a']},
 {mapId:2,attemptId:'m2-a1',rows:['/b','/c']}
];
const sorted=m=>[...m].sort(([a],[b])=>a.localeCompare(b));

test('L022 only the selected map attempt contributes to URL counts',()=>{
 const selected=new Map([[0,'m0-a1'],[1,'m1-a2'],[2,'m2-a1']]);
 assert.deepEqual(sorted(partitionedCounts(attempts,selected)),sorted(serial()));
 assert.deepEqual(sorted(partitionedCounts(attempts,new Map([...selected,[1,'m1-a1']]))),sorted(serial()));
 assert.equal(partitionedCounts(attempts,new Map([...selected,[1,'m1-a0']])).get('/a'),2);
 assert.throws(()=>partitionedCounts(attempts,new Map([[0,'m0-a1'],[2,'m2-a1']])),/map 1/);
 assert.throws(()=>partitionedCounts(attempts,new Map()),/selected attempt/);
});

test('L022 driver recovery recomputes only maps whose shuffle blocks were lost',()=>{
 const selected=attempts.filter(a=>['m0-a1','m1-a2','m2-a1'].includes(a.attemptId));
 const blocks=selected.flatMap(a=>[...new Set(a.rows.map(reducerOf))].map(store=>({map:a.mapId,store})));
 assert.deepEqual(recoverBlocks(blocks,{kind:'cpu',cpuId:1}),[]);
 assert.deepEqual(recoverBlocks(blocks,{kind:'store',lostStores:new Set([reducerOf('/b')])}),[0,2]);
 assert.deepEqual(recoverBlocks(blocks,{kind:'store',lostStores:new Set([reducerOf('/c')])}),[2]);
});

test('L022 checkpoints reuse map checkpoints only for the same inputHash and codeVersion',()=>{
 const catalogue=[0,1,2].map(mapId=>({mapId,inputHash:'H',codeVersion:'7',checksumValid:true,selectedAttemptId:['m0-a1','m1-a2','m2-a1'][mapId]}));
 const same=planCheckpointReuse(catalogue,{inputHash:'H',codeVersion:'7'});
 assert.deepEqual(same.run,[]);
 assert.deepEqual(sorted(partitionedCounts(attempts,same.reuse)),sorted(serial()));
 assert.deepEqual(planCheckpointReuse(catalogue,{inputHash:'H',codeVersion:'8'}).run,[0,1,2]);
 assert.deepEqual(planCheckpointReuse(catalogue,{inputHash:'H2',codeVersion:'7'}).run,[0,1,2]);
 catalogue[2].checksumValid=false;
 const repaired=planCheckpointReuse(catalogue,{inputHash:'H',codeVersion:'7'});
 assert.deepEqual(repaired.run,[2]);assert.deepEqual([...repaired.reuse.keys()],[0,1]);
});

test('L030 incremental windows follow window-end lateness and evict finalized state',()=>{
 const opts={width:10,lateness:5},s=createIncrementalState();
 const routes=[{id:'a',schema:1,time:9,value:2},{id:'b',schema:2,time:10,amount:3},{id:'a',schema:1,time:9,value:2},{id:'d',schema:1,time:4,value:1},{id:'bad',schema:3,time:8,value:9},{id:'e',schema:1,time:25,value:4},{id:'f',schema:1,time:7,value:5},{id:'b',schema:2,time:10,amount:3}].map(e=>incrementalStep(s,e,opts));
 assert.deepEqual(routes,['window','window','duplicate','window','quarantine','window','quarantine','quarantine']);
 assert.deepEqual([...s.emitted],[[0,{sum:3,count:2}],[10,{sum:3,count:1}]]);
 assert.deepEqual([...s.open.keys()],[20]);assert.deepEqual([...s.open.get(20).ids],['e']);
 assert.deepEqual(s.quarantine,[{id:'bad',reason:'schema'},{id:'f',reason:'late'},{id:'b',reason:'late'}]);
 const late=createIncrementalState();incrementalStep(late,{id:'g',schema:1,time:17,value:1},opts);assert.equal(late.watermark,12);
 assert.equal(incrementalStep(late,{id:'h',schema:1,time:4,value:1},opts),'quarantine');
 assert.equal(incrementalStep(late,{id:'i',schema:1,time:11,value:1},opts),'window');
 assert.deepEqual(late.open.get(10),{sum:2,count:2,ids:new Set(['g','i'])});
});

test('L030 microbatch commits window deltas with a per-window event-ID index and batch receipt',()=>{
 let store=createMicrobatchStore();
 store=commitMicrobatch(store,{id:'b1',watermark:0,events:[{id:'a',schema:1,time:9,value:2},{id:'a',schema:1,time:9,value:2},{id:'b',schema:2,time:10,amount:3}]},10).store;
 assert.deepEqual([store.windows.get(0).sum,store.windows.get(0).count],[2,1]);
 const b2={id:'b2',watermark:5,events:[{id:'a',schema:1,time:9,value:2},{id:'d',schema:1,time:4,value:1},{id:'bad',schema:3,time:8,value:9}]};
 store=commitMicrobatch(store,b2,10).store;
 assert.deepEqual([store.windows.get(0).sum,store.windows.get(0).count],[3,2]);
 const replay=commitMicrobatch(store,b2,10);assert.equal(replay.state,'already-committed');assert.equal(replay.store,store);
 store=commitMicrobatch(store,{id:'b3',watermark:20,events:[{id:'s',schema:1,time:4,value:9},{id:'e',schema:1,time:25,value:4}]},10).store;
 assert.deepEqual(store.windows.get(0),{sum:3,count:2,ids:new Set(),final:true});
 assert.deepEqual(store.windows.get(10),{sum:3,count:1,ids:new Set(),final:true});
 assert.deepEqual(store.windows.get(20),{sum:4,count:1,ids:new Set(['e']),final:false});
 assert.deepEqual(store.quarantine.map(q=>[q.id,q.reason]),[['bad','schema'],['s','late']]);
 assert.deepEqual([...store.receipts],['b1','b2','b3']);
});

test('L044 conditional create commits once, rebases disjoint writers and aborts slow writers through the log',()=>{
 const log=new Map([0,1,2,3,4].map(v=>[v,{txId:'t'+v,writes:['p0']}]));
 const A={id:'A',readVersion:4,reads:['p1'],writes:['p1'],files:['fa']},B={id:'B',readVersion:4,reads:['p1'],writes:['p1'],files:['fb']},C={id:'C',readVersion:4,reads:['p2'],writes:['p2'],files:['fc']};
 assert.deepEqual(tryCommit(log,A),{state:'committed',version:5});
 assert.equal(createCommit(log,5,{txId:'B',writes:['p1']}),false);assert.equal(log.get(5).txId,'A');
 assert.deepEqual(tryCommit(log,B),{state:'conflict'});
 assert.deepEqual(tryCommit(log,C),{state:'committed',version:6});
 const D={id:'D',readVersion:6,reads:['p3'],writes:['p3'],files:['fd']},staged={txId:'D',files:['fd'],stagedAt:0};
 assert.deepEqual(cleanupStaged(log,staged,30,50),{state:'retained'});
 assert.deepEqual(cleanupStaged(log,staged,100,50),{state:'deleted',files:['fd']});assert.equal(log.get(7).abortTransactionId,'D');
 assert.deepEqual(tryCommit(log,D),{state:'aborted'});
 assert.ok(![...log.values()].some(c=>c.files?.includes('fd')));
 const E={id:'E',readVersion:7,reads:['p4'],writes:['p4'],files:['fe']};
 assert.deepEqual(tryCommit(log,E),{state:'committed',version:8});
 assert.deepEqual(cleanupStaged(log,{txId:'E',files:['fe'],stagedAt:0},100,50),{state:'retained'});
 assert.equal(log.size,9);
});

test('L044 coordinator serializes fenced reservations and recovers missing log objects',()=>{
 const ledger={epoch:3,base:4,head:4,versions:[]},objects=new Map();
 const tx=(id,part)=>({id,baseVersion:4,reads:[part],writes:[part],actions:[{add:'f'+id}]});
 assert.deepEqual(reserveCommit(ledger,tx('A','p1'),3),{state:'pending',version:5});
 assert.deepEqual(reserveCommit(ledger,tx('B','p1'),3),{state:'conflict'});
 assert.deepEqual(reserveCommit(ledger,tx('C','p2'),3),{state:'pending',version:6});
 assert.deepEqual(reserveCommit(ledger,tx('X','p9'),2),{state:'fenced'});
 assert.deepEqual(publishReserved(ledger,objects,6,2),{state:'fenced'});
 assert.equal(committedPrefix(ledger),4);
 publishReserved(ledger,objects,6,3);assert.equal(committedPrefix(ledger),4);
 assert.deepEqual(recoverPublication(ledger,objects,'A',2),{state:'fenced'});
 assert.deepEqual(recoverPublication(ledger,objects,'A',3),{state:'committed',version:5});
 assert.deepEqual(objects.get('v5-A').actions,[{add:'fA'}]);assert.equal(committedPrefix(ledger),6);
 assert.deepEqual(reserveCommit(ledger,{...tx('D','p3'),baseVersion:6},3),{state:'pending',version:7});
 ledger.versions.find(v=>v.txId==='D').actions=null;
 assert.deepEqual(recoverPublication(ledger,objects,'D',3),{state:'aborted',version:7});assert.deepEqual(objects.get('v7-D').actions,[]);
 assert.equal(committedPrefix(ledger),7);
 assert.deepEqual(reserveCommit(ledger,{...tx('E','p3'),baseVersion:6},3),{state:'pending',version:8});
 publishReserved(ledger,objects,8,3);assert.equal(committedPrefix(ledger),8);
 assert.deepEqual(recoverPublication(ledger,objects,'A',3),{state:'committed',version:5});
});

test('L045 central winner is keyed by generation and readiness by declared parents',()=>{
 const task=createTask();
 assert.equal(selectWinner(task,{id:'a',generation:0,artifact:'art-a'}),'a');
 assert.equal(selectWinner(task,{id:'b',generation:0,artifact:'art-b'}),'a');
 assert.equal(invalidateOnLoss(task),1);
 assert.equal(selectWinner(task,{id:'b',generation:0,artifact:'art-b'}),null);
 assert.equal(selectWinner(task,{id:'c',generation:1,artifact:'art-c'}),'c');
 assert.equal(task.winners.get(0),'a');assert.equal(task.artifacts.get(1),'art-c');
 const child=createChild(['P1','P2']);
 assert.deepEqual(deliverCompletion(child,'P1','P1@0'),{accepted:true,ready:false});
 assert.deepEqual(deliverCompletion(child,'P1','P1@0'),{accepted:true,ready:false});
 assert.deepEqual(deliverCompletion(child,'PX','PX@0'),{accepted:false,ready:false});
 assert.deepEqual(deliverCompletion(child,'P2','P2@0'),{accepted:true,ready:true});
 assert.equal(revokeCompletion(child,'P1'),false);
 assert.deepEqual(deliverCompletion(child,'P1','P1@1'),{accepted:true,ready:true});
});

test('L045 partitioned owner epoch fences arbitration and failover recomputes lost artifacts',()=>{
 const task=()=>({...createTask(),children:['C'],ready:true});
 const shard={epoch:1,tasks:new Map([['T1',task()],['T2',task()]]),outbox:[]};
 assert.deepEqual(arbitrate(shard,'T1',{id:'a1',generation:0,artifact:'t1-a1'},0),{state:'fenced'});
 assert.deepEqual(arbitrate(shard,'T1',{id:'a1',generation:0,artifact:'t1-a1'},1),{state:'selected',winner:'a1'});
 assert.deepEqual(arbitrate(shard,'T1',{id:'a2',generation:0,artifact:'t1-a2'},1),{state:'selected',winner:'a1'});
 arbitrate(shard,'T2',{id:'x1',generation:0,artifact:'t2-x1'},1);
 assert.deepEqual(shard.outbox.map(e=>e.eventId),['T1@0->C','T2@0->C']);
 const inbox={seen:new Set(),child:createChild(['T1','T2'])},deliver=id=>{const e=shard.outbox.find(q=>q.eventId===id);e.delivered=true;return receiveCompletion(inbox,e);};
 assert.deepEqual(deliver('T1@0->C'),{accepted:true,ready:false});
 assert.deepEqual(deliver('T1@0->C'),{accepted:false,ready:false});
 const recovery=recoverShard(shard,new Set(['t2-x1']));
 assert.deepEqual(recovery,{epoch:2,resent:['T2@0->C','T1@0->C:revoke'],rescheduled:['T1']});
 assert.equal(shard.tasks.get('T1').generation,1);assert.equal(shard.tasks.get('T2').generation,0);
 assert.deepEqual(deliver('T2@0->C'),{accepted:true,ready:true});
 assert.deepEqual(deliver('T1@0->C:revoke'),{accepted:true,ready:false});
 assert.deepEqual(deliver('T1@0->C'),{accepted:false,ready:false});
 assert.deepEqual(arbitrate(shard,'T1',{id:'a3',generation:1,artifact:'t1-a3'},1),{state:'fenced'});
 assert.deepEqual(arbitrate(shard,'T1',{id:'a2',generation:0,artifact:'t1-a2'},2),{state:'stale-generation'});
 assert.deepEqual(arbitrate(shard,'T1',{id:'a3',generation:1,artifact:'t1-a3'},2),{state:'selected',winner:'a3'});
 assert.deepEqual(deliver('T1@1->C'),{accepted:true,ready:true});
});
