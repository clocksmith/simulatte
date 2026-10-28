import test from 'node:test';
import assert from 'node:assert/strict';
import {QueueTransitions,SignalingTakers,TwoLockQueue,CasRingCounter,StripedDequeCounter,PushPipeline,FanoutSlots,CoalescedFill,PullSpool,IllustrativeSyncReports,IllustrativeJobs} from './batch-08-mechanisms.mjs';
const lcg=seed=>()=>(seed=(Math.imul(seed,1103515245)+12345)>>>0);
test('batch-08 queue: blocked predicates wakeups close and cancellation',()=>{
 const q=new QueueTransitions(1);assert.equal(q.request('p1','put','a').state,'done');assert.equal(q.request('p2','put','b').state,'waiting');
 q.wake();assert.equal(q.outcomes.has('p2'),false);assert.deepEqual(q.items,['a']);assert.equal(q.request('c1','take').item,'a');assert.equal(q.outcomes.get('p2').state,'done');assert.deepEqual(q.items,['b']);
 assert.equal(q.request('p3','put','c').state,'waiting');assert.equal(q.cancel('p3'),true);q.close();assert.equal(q.request('p4','put','d').state,'closed');assert.equal(q.request('c2','take').item,'b');assert.equal(q.request('c3','take').state,'closed-empty');assert.equal(q.outcomes.get('p3').state,'canceled');
 const empty=new QueueTransitions(2);empty.request('take','take');empty.wake();assert.equal(empty.outcomes.has('take'),false);empty.close();assert.equal(empty.outcomes.get('take').state,'closed-empty');
 // Enumerate operation orders: reference predicates retain FIFO data and capacity.
 for(let cap=1;cap<=3;cap++){const m=new QueueTransitions(cap);for(let i=0;i<20;i++){m.request('p'+i,'put',i);if(i%2===0)m.request('c'+i,'take');m.wake();assert.ok(m.items.length<=cap);}m.close();while(m.items.length)m.request('drain'+m.items.length,'take');assert.equal(m.waiters.length,0);}
});
test('batch-08 queue: interrupted waiter passes a consumed signal on',()=>{
 const q=new SignalingTakers();q.take('t1');q.take('t2');q.put('x');assert.deepEqual(q.signaled,['t1']);
 assert.equal(q.interrupt('t1'),true);assert.deepEqual(q.outcomes.get('t1'),{state:'canceled'});assert.deepEqual(q.items,['x']);
 assert.deepEqual(q.signaled,['t2']);assert.deepEqual(q.resume('t2'),{state:'done',item:'x'});
 // Interrupting an unsignaled waiter consumes nothing and signals nobody.
 const idle=new SignalingTakers();idle.take('a');idle.take('b');idle.interrupt('a');assert.deepEqual([idle.signaled,idle.waiting],[[],['b']]);
 // A spurious resume with no item goes back to waiting.
 const spurious=new SignalingTakers();spurious.take('s');spurious.signal();assert.deepEqual(spurious.resume('s'),{state:'waiting'});assert.deepEqual(spurious.waiting,['s']);
});
test('batch-08 queue two-lock: lock order and crossing signals',()=>{
 const q=new TwoLockQueue(2);assert.equal(q.take().state,'empty');
 assert.equal(q.put('a').state,'done');assert.equal(q.put('b').state,'done');assert.equal(q.put('c').state,'full');
 assert.deepEqual(q.take(),{state:'done',item:'a'});assert.equal(q.put('c').state,'done');assert.deepEqual(q.take(),{state:'done',item:'b'});
 q.close();assert.equal(q.put('d').state,'closed');assert.deepEqual(q.take(),{state:'done',item:'c'});assert.equal(q.take().state,'closed-empty');assert.throws(()=>q.put(null),TypeError);
 const nested=q.trace.filter(e=>e.acquire&&e.holding.length).map(e=>[e.op,e.acquire,e.holding.join()]);
 assert.deepEqual(nested,[['close','takeLock','putLock']]);
 assert.deepEqual(q.trace.filter(e=>e.op==='close'&&e.acquire).map(e=>e.acquire),['putLock','takeLock']);
 const crossing=(op,signal,lock)=>{const rows=q.trace.filter(e=>e.op===op&&e.signal===signal);assert.ok(rows.length>0,op+' '+signal);for(const r of rows)assert.deepEqual(r.holding,[lock]);};
 crossing('put','notEmpty','takeLock');crossing('take','notFull','putLock');assert.deepEqual(q.held,[]);
 const random=lcg(5),m=new TwoLockQueue(3),oracle=[];let next=0;
 for(let i=0;i<400;i++){if(random()%2){const r=m.put(next);if(oracle.length<3){assert.equal(r.state,'done');oracle.push(next);}else assert.equal(r.state,'full');next++;}else{const r=m.take();if(oracle.length)assert.deepEqual(r,{state:'done',item:oracle.shift()});else assert.equal(r.state,'empty');}assert.equal(m.count,oracle.length);}
});
test('batch-08 counter ring: CAS slot words, resampling and weakly consistent scan',()=>{
 const c=new CasRingCounter();c.hit(0);c.hit(0);c.hit(299);assert.equal(c.count(299),3);c.hit(300);assert.equal(c.count(300),2);assert.equal(c.count(599),1);assert.equal(c.count(600),0);assert.equal(c.count(500),0);assert.equal(c.rollbacks,1);
 // Two hits race on an epoch change: the loser's CAS fails and it retries from the new word.
 const race=new CasRingCounter();race.hit(0);race.hit(0);race.beforeCas=()=>race.hit(300);race.hit(300);
 assert.equal(race.casFailures,1);assert.deepEqual(race.words[0],{round:1,count:2});assert.equal(race.count(300),2);
 // A hit sampled at second 0 finds slot 0 already advanced to second 300: it resamples instead of moving the slot back.
 const stale=new CasRingCounter();stale.hit(300);stale.hit(undefined,0);assert.deepEqual(stale.words[0],{round:1,count:2});assert.equal(stale.count(),2);
 const full=new CasRingCounter();full.hit(7);full.words[7]=Object.freeze({round:0,count:2**32-1});assert.throws(()=>full.hit(7),RangeError);assert.equal(full.words[7].count,2**32-1);
 // A hit at 1001 reuses the slot of 701 while getHits(1000) is scanning.
 const scan=new CasRingCounter();scan.hit(701);scan.hit(701);scan.hit(1000);
 const view=scan.scan(1000,i=>{if(i===50)scan.hit(1001);}),within=(xs,t)=>xs.filter(x=>x>t-300&&x<=t).length;
 assert.deepEqual(view,{count:2,snapshotTime:1001});assert.ok(within([701,701,1000],view.snapshotTime)<=view.count&&view.count<=within([701,701,1000,1001],view.snapshotTime));
 const limiter=new CasRingCounter({mode:'limiter'});assert.equal(limiter.tryAcquire(5,2),true);
 const a=limiter.beginAdmission(5,2),b=limiter.beginAdmission(5,2),results=[limiter.finishAdmission(a)];results.push(b?limiter.finishAdmission(b):limiter.tryAcquire(5,2));
 assert.deepEqual(results,[true,false]);assert.equal(limiter.count(5),2);assert.throws(()=>limiter.hit(5),/tryAcquire/);
 const random=lcg(91),ring=new CasRingCounter(),admit=new CasRingCounter({mode:'limiter'});let t=0,hits=[],admitted=[];
 for(let i=0;i<3000;i++){const r=random();t+=r%4;if(r%3){ring.hit(t);hits.push(t);const ok=admit.tryAcquire(t,17);assert.equal(ok,within(admitted,t)<17);if(ok)admitted.push(t);}assert.equal(ring.count(t),within(hits,t));assert.equal(admit.count(t),within(admitted,t));}
});
test('batch-08 counter deque: thread stripes, all-stripe snapshot and exact admission',()=>{
 const c=new StripedDequeCounter(4);c.hit(1,0);c.hit(2,0);c.hit(3,299);assert.equal(c.count(299),3);c.hit(1,300);assert.equal(c.count(300),2);assert.equal(c.count(599),1);assert.equal(c.count(600),0);assert.equal(c.count(500),0);assert.equal(c.rollbacks,1);
 const s=new StripedDequeCounter(4),a=s.beginHit(1,10),b=s.beginHit(2,10);assert.ok(a);assert.ok(b,'same key and second, another thread proceeds');assert.equal(s.beginHit(5,10),null,'threads hashing to one stripe serialize');
 s.finishHit(b);assert.throws(()=>s.count(10),/busy/);assert.throws(()=>s.tryAcquire(3,10,5),/busy/);s.finishHit(a);assert.equal(s.count(10),2);
 assert.equal(s.tryAcquire(3,10,3),true);assert.equal(s.tryAcquire(4,10,3),false);assert.equal(s.count(10),3);
 const big=new StripedDequeCounter(2);big.hit(0,1);big.stripes[0].total=Number.MAX_SAFE_INTEGER;const before=JSON.stringify(big.stripes[0].buckets);assert.throws(()=>big.hit(2,1),RangeError);assert.equal(JSON.stringify(big.stripes[0].buckets),before);
 big.stripes[0].total=Number.MAX_SAFE_INTEGER;big.hit(1,1);assert.throws(()=>big.count(1),/sum overflow/);
 const random=lcg(17),d=new StripedDequeCounter(4),within=(xs,t)=>xs.filter(x=>x>t-300&&x<=t).length;let t=0,events=[];
 for(let i=0;i<3000;i++){const r=random();t+=r%4;const thread=r%7;if(r%3===1){d.hit(thread,t);events.push(t);}else if(r%3===2){const ok=d.tryAcquire(thread,t,17);assert.equal(ok,within(events,t)<17);if(ok)events.push(t);}assert.equal(d.count(t),within(events,t));}
});
test('batch-08 streaming push: batch admission and ACK windows',()=>{
 const p=new PushPipeline(4,3,batch=>batch.map(id=>'bytes-'+id));
 assert.deepEqual([...Array(10).keys()].map(id=>p.submit(id)),['queued','queued','queued','queued','rejected','rejected','rejected','rejected','rejected','rejected']);
 assert.deepEqual(p.receipts.map(r=>[r.id,r.state]),[4,5,6,7,8,9].map(id=>[id,'rejected-compute']));
 assert.deepEqual(p.workerStep(),[0,1,2]);assert.deepEqual(p.workerStep(),[3]);assert.deepEqual(p.workerStep(),[]);assert.equal(p.computeCalls,2);
 assert.equal(p.submit(0),'duplicate');assert.equal(p.computed.get(0),'bytes-0');assert.equal(p.submit(10),'queued');
 const slots=new FanoutSlots(1),slow=slots.open('slow'),fast=slots.open('fast');assert.equal(slots.send('slow',1),true);assert.equal(slots.send('slow',2),false);assert.equal(slots.send('fast',1),true);assert.equal(slots.ack('fast',fast,1),true);assert.equal(slots.send('fast',2),true);assert.deepEqual(slots.close('slow'),[1]);const next=slots.open('slow');slots.send('slow',2);assert.equal(slots.ack('slow',slow,2),false);assert.equal(slots.ack('slow',next,2),true);assert.equal(slots.ack('slow',next,2),false);
 assert.deepEqual(slots.receipts.map(r=>[r.id,r.chunk,r.state]),[['slow',2,'rejected-slow'],['slow',1,'unacknowledged']]);
});
test('batch-08 streaming: coalesced fill and cancellation',async()=>{
 let fills=0,finish;const cache=new CoalescedFill(1,2),controller=new AbortController();const loader=()=>{fills++;return new Promise(r=>{finish=r;});};
 const a=cache.get('hash',loader,controller.signal),b=cache.get('hash',loader);await Promise.resolve();controller.abort();await assert.rejects(a,/canceled/);finish('immutable bytes');assert.equal(await b,'immutable bytes');assert.equal(fills,1);assert.equal(cache.inflight.size,0);assert.equal(await cache.get('hash',()=>{throw Error('must not load');}),'immutable bytes');
 await assert.rejects(cache.get('fail',()=>{throw Error('origin failed');}),/origin failed/);assert.equal(cache.inflight.has('fail'),false);assert.equal(await cache.get('fail',()=>Promise.resolve('retry bytes')),'retry bytes');
});
test('batch-08 streaming pull: manifest gaps, retention floor and pinned reads',async()=>{
 const spool=new PullSpool(2),cdn=new CoalescedFill(4,8);
 assert.deepEqual(spool.admit(0),{state:'queued'});assert.deepEqual(spool.admit(1),{state:'queued'});assert.deepEqual(spool.admit(2),{state:'rejected'});
 assert.deepEqual(spool.admit(0),{state:'queued',duplicate:true});assert.deepEqual(spool.admit(2),{state:'rejected',duplicate:true});
 const gapVersion=spool.manifest;spool.complete(0,'zero');spool.complete(1,'one');assert.deepEqual([...gapVersion.entries.keys()],[2]);assert.equal(spool.manifest.version,gapVersion.version+2);
 let cursor={next:0};const seen=[];for(;;){const r=await spool.pull(cursor,cdn);seen.push(r.state);if(r.state==='not-ready')break;cursor={next:r.next};}
 assert.deepEqual(seen,['available','available','gap','not-ready']);
 const s=new PullSpool(8);for(const seq of [0,1,2,3,4])s.admit(seq);for(const [seq,bytes]of [[0,'same'],[1,'a'],[2,'b'],[3,'c'],[4,'same']])s.complete(seq,bytes);
 const pending=s.pull({next:1},new CoalescedFill(4,8)),pruned=s.prune(3);assert.equal(pruned.floor,3);
 assert.equal(s.bytes.has('sha256:same'),true,'key still referenced by retained chunk 4');assert.equal(s.bytes.has('sha256:b'),false);assert.equal(s.bytes.has('sha256:a'),true,'pinned by an in-flight read');
 assert.equal((await pending).bytes,'a');assert.equal(s.bytes.has('sha256:a'),false);
 const fresh=new CoalescedFill(4,8);assert.deepEqual(await s.pull({next:1},fresh),{state:'expired',status:410,floor:3,version:pruned.version});
 const reset=s.reset({next:1});assert.deepEqual(reset,{next:3,skipped:{from:1,to:3,version:pruned.version}});assert.deepEqual(s.resets,[reset.skipped]);
 assert.equal((await s.pull({next:3},fresh)).bytes,'c');assert.equal((await s.pull({next:4},fresh)).bytes,'same');assert.equal(s.versions[5].entries.has(0),true,'older manifest versions keep their entries');
});
test('batch-08 review synchronous: owner-scoped receipts, stored cutoff and first completion',()=>{
 let tick=0;const reports=new IllustrativeSyncReports(()=>'cutoff-'+(++tick));
 const first=reports.begin('alice','alice','K','params',0);assert.deepEqual([first.action,first.attempt,first.cutoff],['render',1,'cutoff-1']);
 const other=reports.begin('bob','bob','K','params',0);assert.equal(other.action,'render');assert.notEqual(other.reportId,first.reportId);assert.throws(()=>reports.begin('bob','alice','K','params',0),/forbidden/);
 assert.deepEqual(reports.begin('alice','alice','K','params',5),{action:'wait',status:'running',reportId:first.reportId});assert.throws(()=>reports.begin('alice','alice','K','other-params',5),/conflict/);
 const second=reports.begin('alice','alice','K','params',31);assert.deepEqual([second.action,second.attempt,second.cutoff,second.reportId],['render',2,'cutoff-1',first.reportId]);
 assert.throws(()=>reports.complete('alice','alice','K',1,'hash-1','corrupt'),/hash/);assert.throws(()=>reports.complete('alice','alice','K',3,'h','h'),/unknown attempt/);
 assert.equal(reports.complete('alice','alice','K',1,'hash-1','hash-1').won,true);
 const lost=reports.complete('alice','alice','K',2,'hash-2','hash-2');assert.equal(lost.won,false);assert.equal(lost.receipt.artifactHash,'hash-1');
 const replay=reports.begin('alice','alice','K','params',40);assert.equal(replay.action,'return');assert.equal(replay.receipt.artifactHash,'hash-1');
 const bob=reports.begin('bob','bob','K','params',10);assert.deepEqual([bob.action,bob.reportId],['wait',other.reportId]);assert.throws(()=>reports.complete('bob','alice','K',1,'hash-1','hash-1'),/forbidden/);
});
test('batch-08 review durable-jobs: job identity, lease-checked claims and fenced completion',()=>{
 const jobs=new IllustrativeJobs(),id=jobs.submit('alice','request-key','params-hash');assert.equal(jobs.submit('alice','request-key','params-hash'),id);assert.equal(jobs.outbox.length,1);
 assert.throws(()=>jobs.submit('alice','request-key','different'),/conflict/);assert.throws(()=>jobs.read('bob',id),/forbidden/);assert.notEqual(jobs.submit('bob','request-key','params-hash'),id);
 const first=jobs.claim(id,'w1',0);assert.throws(()=>jobs.claim(id,'w2',5),/lease held/);const second=jobs.claim(id,'w2',11);assert.ok(second>first);
 assert.throws(()=>jobs.complete(id,first,'artifact','artifact'),/fence/);assert.throws(()=>jobs.complete(id,second,'artifact','corrupt'),/hash/);assert.equal(jobs.read('alice',id).status,'running');
 assert.equal(jobs.complete(id,second,'artifact','artifact').status,'complete');assert.throws(()=>jobs.claim(id,'w3',100),/already complete/);
 assert.equal(jobs.submit('alice','request-key','params-hash'),id);assert.equal(jobs.read('alice',id).artifactHash,'artifact');
});
