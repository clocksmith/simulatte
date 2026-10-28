import test from 'node:test';
import assert from 'node:assert/strict';
import {QueueTransitions,RingCounter,DequeCounter,FanoutSlots,CoalescedFill,IllustrativeJobs} from './batch-08-mechanisms.mjs';
test('batch-08 queue: blocked predicates wakeups close and cancellation',()=>{
 const q=new QueueTransitions(1);assert.equal(q.request('p1','put','a').state,'done');assert.equal(q.request('p2','put','b').state,'waiting');
 q.wake();assert.equal(q.outcomes.has('p2'),false);assert.deepEqual(q.items,['a']);assert.equal(q.request('c1','take').item,'a');assert.equal(q.outcomes.get('p2').state,'done');assert.deepEqual(q.items,['b']);
 assert.equal(q.request('p3','put','c').state,'waiting');assert.equal(q.cancel('p3'),true);q.close();assert.equal(q.request('p4','put','d').state,'closed');assert.equal(q.request('c2','take').item,'b');assert.equal(q.request('c3','take').state,'closed-empty');assert.equal(q.outcomes.get('p3').state,'canceled');
 const empty=new QueueTransitions(2);empty.request('take','take');empty.wake();assert.equal(empty.outcomes.has('take'),false);empty.close();assert.equal(empty.outcomes.get('take').state,'closed-empty');
 // Enumerate operation orders: reference predicates retain FIFO data and capacity.
 for(let cap=1;cap<=3;cap++){const m=new QueueTransitions(cap);for(let i=0;i<20;i++){m.request('p'+i,'put',i);if(i%2===0)m.request('c'+i,'take');m.wake();assert.ok(m.items.length<=cap);}m.close();while(m.items.length)m.request('drain'+m.items.length,'take');assert.equal(m.waiters.length,0);}
});
test('batch-08 counter: rollover boundary rollback and exact admission',()=>{
 for(const Counter of [RingCounter,DequeCounter]){const c=new Counter();c.hit(0);c.hit(0);c.hit(299);assert.equal(c.count(299),3);c.hit(300);assert.equal(c.count(300),2);assert.equal(c.count(599),1);assert.equal(c.count(600),0);assert.equal(c.count(500),0);assert.equal(c.rollbacks,1);
  const limit=new Counter();assert.equal(limit.hit(10,2),true);assert.equal(limit.hit(10,2),true);assert.equal(limit.hit(10,2),false);assert.equal(limit.count(10),2);assert.equal(limit.hit(310,2),true);}
 const ring=new RingCounter(),deque=new DequeCounter();let seed=91,t=0,events=[];for(let i=0;i<3000;i++){seed=(Math.imul(seed,1103515245)+12345)>>>0;t+=seed%4;if(seed%3){assert.equal(ring.hit(t,17),deque.hit(t,17));if(events.filter(x=>x>t-300).length<17)events.push(t);}events=events.filter(x=>x>t-300);assert.equal(ring.count(t),events.length);assert.equal(deque.count(t),events.length);}
});
test('batch-08 streaming: bounded slots and coalesced fill',async()=>{
 const slots=new FanoutSlots(1),slow=slots.open('slow'),fast=slots.open('fast');assert.equal(slots.send('slow',1),true);assert.equal(slots.send('slow',2),false);assert.equal(slots.send('fast',1),true);assert.equal(slots.ack('fast',fast,1),true);assert.equal(slots.send('fast',2),true);assert.deepEqual(slots.close('slow'),[1]);const next=slots.open('slow');slots.send('slow',2);assert.equal(slots.ack('slow',slow,2),false);assert.equal(slots.ack('slow',next,2),true);assert.equal(slots.ack('slow',next,2),false);
 let fills=0,finish;const cache=new CoalescedFill(1,2),controller=new AbortController();const loader=()=>{fills++;return new Promise(r=>{finish=r;});};
 const a=cache.get('hash',loader,controller.signal),b=cache.get('hash',loader);await Promise.resolve();controller.abort();await assert.rejects(a,/canceled/);finish('immutable bytes');assert.equal(await b,'immutable bytes');assert.equal(fills,1);assert.equal(cache.inflight.size,0);assert.equal(await cache.get('hash',()=>{throw Error('must not load');}),'immutable bytes');
 await assert.rejects(cache.get('fail',()=>{throw Error('origin failed');}),/origin failed/);assert.equal(cache.inflight.has('fail'),false);assert.equal(await cache.get('fail',()=>Promise.resolve('retry bytes')),'retry bytes');
});
test('batch-08 review: illustrative job identity and uncertain completion',()=>{
 const jobs=new IllustrativeJobs(),id=jobs.submit('alice','request-key','params-hash');assert.equal(jobs.submit('alice','request-key','params-hash'),id);assert.equal(jobs.outbox.length,1);assert.throws(()=>jobs.submit('alice','request-key','different'),/conflict/);assert.throws(()=>jobs.read('bob',id),/forbidden/);
 const old=jobs.claim(id),current=jobs.claim(id);assert.throws(()=>jobs.complete(id,old,'artifact','artifact'),/fence/);assert.throws(()=>jobs.complete(id,current,'artifact','corrupt'),/hash/);assert.equal(jobs.read('alice',id).status,'running');const done=jobs.complete(id,current,'artifact','artifact');assert.equal(done.status,'complete');assert.equal(jobs.submit('alice','request-key','params-hash'),id);assert.equal(jobs.read('alice',id).artifactHash,'artifact');
});
