import test from 'node:test';import assert from 'node:assert/strict';
import {viewport,CreditWindow,blockPlan,BlockCache,readRange,TtlMap,HeapTtlCache,WheelTtlCache,frame,recover,ackEligible,GroupCommit} from './batch-06-state.mjs';
test('viewport ranges are clamped and independent of full result size',()=>{assert.deepEqual(viewport(100000,0,100,20,2),{start:0,end:7});assert.deepEqual(viewport(100000,1000000,100,20,2),{start:49998,end:50007});assert.deepEqual(viewport(100000,1999980,100,20,2),{start:99997,end:100000});assert.throws(()=>viewport(1,0,10,0,1),/invalid/);});
test('range planner intersects unaligned blocks and partial EOF',()=>{assert.deepEqual(blockPlan(10,3,8,4),[{index:0,blockStart:0,fetchLength:4,offsetInBlock:3,length:1},{index:1,blockStart:4,fetchLength:4,offsetInBlock:0,length:4},{index:2,blockStart:8,fetchLength:2,offsetInBlock:0,length:2}]);assert.deepEqual(blockPlan(10,10,5,4),[]);assert.deepEqual(blockPlan(10,3,0,4),[]);assert.throws(()=>blockPlan(10,-1,2,4),/invalid/);});
test('single flight reserves bytes shares failures pins buffers and retries by revision',async()=>{const c=new BlockCache(4);let calls=0,release;const gate=new Promise(r=>release=r),fetch=async()=>{calls++;await gate;return Uint8Array.of(1,2,3,4);};const a=c.block('v1',0,4,fetch),b=c.block('v1',0,4,fetch);assert.equal(a,b);assert.equal(c.used,4);assert.equal(c.evict('v1',0),false);await assert.rejects(c.block('v2',0,4,fetch),/backpressure/);release();assert.deepEqual(await a,await b);assert.equal(calls,1);const unpin=c.pin('v1',0);assert.equal(c.evict('v1',0),false);unpin();assert.equal(c.evict('v1',0),true);assert.equal(c.used,0);
 let failures=0;const broken=()=>{failures++;throw Error('remote failed');};const x=c.block('v1',1,4,broken),y=c.block('v1',1,4,broken);assert.equal(x,y);await assert.rejects(x,/remote/);await assert.rejects(y,/remote/);assert.equal(failures,1);assert.equal(c.used,0);assert.equal(c.slots.size,0);await c.block('v2',1,4,async()=>Uint8Array.of(9));assert.equal(c.used,1);
});
test('TTL exact deadline and generation checks preserve fresh replacement',()=>{const c=new TtlMap();assert.equal(c.get('missing',0),null);assert.equal(c.expire('missing',{generation:0},0),false);const old=c.put('x','A',10,0);assert.equal(c.get('x',9),'A');assert.equal(c.get('x',10),null);const fresh=c.put('x','B',20,9);assert.equal(c.expire('x',old,10),false);assert.equal(c.get('x',10),'B');assert.equal(c.expire('x',fresh,29),true);assert.equal(c.get('x',29),null);c.put('x','C',0,30);assert.equal(c.get('x',30),null);assert.throws(()=>c.put('x','bad',-1,30),/ttl/);});
test('WAL framed suffix preserves tombstones rejects gaps and separates sync watermark',()=>{const snapshot={cut:2,entries:[['x','old']],commandIds:['c2']};const a=frame({lsn:3,commandId:'c3',operation:'delete',key:'x'}),b=frame({lsn:4,commandId:'c4',operation:'put',key:'y',value:'new'}),tail=frame({lsn:5,commandId:'c5',operation:'put',key:'z',value:'tail'}).subarray(0,9);const result=recover(snapshot,Buffer.concat([a,b,tail]));assert.equal(result.last,4);assert.deepEqual([...result.state],[['y','new']]);const corrupt=Buffer.from(a);corrupt[8]^=1;assert.throws(()=>recover(snapshot,Buffer.concat([corrupt,b])),/checksum/);const corruptPayload=Buffer.from(a);corruptPayload[40]^=1;assert.throws(()=>recover(snapshot,Buffer.concat([corruptPayload,b])),/checksum/);assert.throws(()=>recover(snapshot,b),/gap/);assert.equal(ackEligible(4,4),true);assert.equal(ackEligible(7,4),false);});

test('read lease pins before publication and closes the completion eviction gap',async()=>{
 const cache=new BlockCache(4);let releaseFetch;const gate=new Promise(r=>releaseFetch=r);
 const fetch=async()=>{await gate;return Uint8Array.of(1,2,3,4);};
 const one=cache.acquire('v',0,4,fetch),two=cache.acquire('v',0,4,fetch);
 let evicted;cache.block('v',0,4,fetch).then(()=>{evicted=cache.evict('v',0);});
 releaseFetch();await one.promise;await two.promise;assert.equal(evicted,false);assert.equal(cache.used,4);
 one.release();one.release();assert.equal(cache.evict('v',0),false);two.release();assert.equal(cache.evict('v',0),true);assert.equal(cache.used,0);
 const failed=cache.acquire('v',1,4,async()=>{throw Error('failed');});await assert.rejects(failed.promise,/failed/);failed.release();assert.equal(cache.used,0);assert.equal(cache.slots.size,0);
});
test('a reader that cancels before publication releases its pin',async()=>{
 const cache=new BlockCache(4);let finish;const gate=new Promise(r=>finish=r);
 const quitter=cache.acquire('v',0,4,async()=>{await gate;return Uint8Array.of(1,2,3,4);}),stayer=cache.acquire('v',0,4,async()=>{throw Error('second fetch');});
 assert.equal(typeof quitter.release,'function');quitter.release();quitter.release();
 assert.equal(cache.slots.get(JSON.stringify(['v',0])).pins,1);
 finish();assert.deepEqual(await stayer.promise,Uint8Array.of(1,2,3,4));
 assert.equal(cache.evict('v',0),false);stayer.release();assert.equal(cache.evict('v',0),true);
 assert.deepEqual(await cache.block('v',1,4,async()=>Uint8Array.of(9)),Uint8Array.of(9));
 const lone=cache.acquire('v',2,3,async()=>{await gate;return Uint8Array.of(7,7,7);});lone.release();await lone.promise;
 assert.equal(cache.evict('v',2),true);assert.equal(cache.used,1);
});
test('range reads fetch whole aligned blocks and copy exact slices',async()=>{
 assert.deepEqual(blockPlan(10,5,2,4),[{index:1,blockStart:4,fetchLength:4,offsetInBlock:1,length:2}]);
 const file=Uint8Array.from({length:10},(_,i)=>i*10),calls=[];
 const fetchBlock=async(start,length)=>{calls.push([start,length]);return file.slice(start,start+length);};
 const cache=new BlockCache(64);
 assert.deepEqual([...await readRange(cache,fetchBlock,'v',10,5,2,4)],[50,60]);
 assert.deepEqual([...await readRange(cache,fetchBlock,'v',10,4,6,4)],[40,50,60,70,80,90]);
 assert.deepEqual(calls,[[4,4],[8,2]]);assert.equal(cache.used,6);
});
test('byte waits release the metadata lock and recheck for a winner',async()=>{
 const cache=new BlockCache(4);const held=cache.acquire('v',0,4,async()=>Uint8Array.of(1,2,3,4));await held.promise;
 let calls=0;const fetch=async()=>{calls++;return Uint8Array.of(5,6,7,8);};
 const first=cache.acquireWhenBytesFree('v',1,4,fetch),second=cache.acquireWhenBytesFree('v',1,4,fetch);
 await new Promise(r=>setImmediate(r));
 assert.equal(cache.metadataHeld,false);assert.equal(calls,0);assert.equal(cache.used,4);assert.equal(cache.evict('v',0),false);
 held.release();
 const [a,b]=await Promise.all([first,second]);
 assert.deepEqual(await a.promise,Uint8Array.of(5,6,7,8));assert.equal(await b.promise,await a.promise);
 assert.equal(calls,1);assert.equal(cache.used,4);assert.equal(cache.slots.has(JSON.stringify(['v',0])),false);
 a.release();b.release();assert.equal(cache.evict('v',1),true);assert.equal(cache.used,0);
});
test('credit grants subtract outstanding credit and retained bytes',()=>{
 const w=new CreditWindow(100);assert.equal(w.grant(),100);assert.equal(w.grant(),0);
 w.receive(40);assert.equal(w.grant(),0);assert.throws(()=>w.receive(61),/credit/);
 w.receive(60);w.release(30);assert.equal(w.grant(),30);assert.equal(w.retained+w.outstanding,100);
 assert.equal(w.revoke(),30);assert.equal(w.grant(),30);
});
test('heap sweep pops due records only under the write lock',()=>{
 let now=0;const c=new HeapTtlCache(()=>now);
 c.put('a','A1',5);c.put('b','B',5);c.put('c','C',7);now=1;c.put('a','A2',50);
 assert.throws(()=>c.heapPop(),/write lock/);assert.throws(()=>c.heapPush({key:'x',generation:0,deadline:0}),/write lock/);
 now=10;assert.deepEqual(c.sweep(2),{popped:2,removed:1,backlog:1});
 assert.equal(c.get('a'),'A2');assert.equal(c.map.has('b'),false);
 assert.deepEqual(c.sweep(5),{popped:1,removed:1,backlog:0});assert.equal(c.map.has('c'),false);assert.equal(c.heap.length,1);
 c.put('a','gone',0);assert.equal(c.map.has('a'),false);assert.equal(c.heap.length,1);assert.throws(()=>c.put('a','bad',-1),/ttl/);
});
test('timing wheel validates TTL schedules nothing for ttl zero and skips removed keys',()=>{
 const w=new WheelTtlCache(4,10);
 assert.throws(()=>w.put('x','bad',-1,0),/ttl/);assert.throws(()=>w.put('x','bad',1.5,0),/ttl/);assert.throws(()=>w.put('x','bad',Number.MAX_SAFE_INTEGER,1),/ttl/);assert.equal(w.scheduled,0);
 w.put('x','A',25,0);assert.equal(w.scheduled,1);
 w.put('x','B',0,5);assert.equal(w.get('x',5),null);assert.equal(w.scheduled,1);
 assert.deepEqual(w.tick(3,30,8),{drained:1,removed:0});assert.equal(w.scheduled,0);
 w.put('y','C',5,30);assert.equal(w.get('y',34),'C');assert.equal(w.get('y',35),null);
 w.put('y','D',100,31);assert.deepEqual(w.tick(4,40,8),{drained:1,removed:0});assert.equal(w.get('y',40),'D');
 assert.deepEqual(w.tick(2,40,8),{drained:0,removed:0});assert.equal(w.scheduled,1);
});
test('frame headers carry their own checksum so interior length damage is corruption',()=>{
 const snapshot={cut:2,entries:[],commandIds:[]},f=n=>frame({lsn:n,commandId:'c'+n,operation:'put',key:'k'+n,value:n});
 const damaged=Buffer.from(f(3));damaged.writeUInt32BE(1000,0);
 assert.throws(()=>recover(snapshot,Buffer.concat([damaged,f(4),f(5)])),/header checksum/);
 const tornHeader=Buffer.from(f(5));tornHeader.writeUInt32BE(1000,0);
 assert.equal(recover(snapshot,Buffer.concat([f(3),f(4),tornHeader])).last,4);
 const tornPayload=Buffer.from(f(5));tornPayload[40]^=1;
 assert.equal(recover(snapshot,Buffer.concat([f(3),f(4),tornPayload])).last,4);
 const badMiddle=Buffer.from(f(4));badMiddle[40]^=1;
 assert.throws(()=>recover(snapshot,Buffer.concat([f(3),badMiddle,f(5)])),/checksum mismatch/);
 assert.equal(recover(snapshot,Buffer.concat([f(3),f(4),f(5)])).last,5);
});
test('sync failure fails waiters stops writes and never retries fsync',()=>{
 const log=new GroupCommit();let calls=0;const ok=()=>{calls++;},eio=()=>{calls++;throw Error('EIO');};
 log.submit('a');assert.deepEqual(log.sync(ok),{released:[1],failed:[]});
 log.submit('b');log.submit('c');
 assert.deepEqual(log.sync(eio),{released:[],failed:[2,3]});assert.equal(log.durableThrough,1);assert.equal(ackEligible(2,log.durableThrough),false);
 assert.throws(()=>log.submit('d'),/recover from disk/);assert.throws(()=>log.sync(ok),/recover from disk/);assert.equal(calls,2);
 const disk=Buffer.concat([frame({lsn:1,commandId:'c1',operation:'put',key:'a',value:'1'}),frame({lsn:2,commandId:'c2',operation:'put',key:'b',value:'2'}).subarray(0,20)]);
 const {log:reopened,state}=GroupCommit.reopen({cut:0,entries:[]},disk);
 assert.deepEqual([...state],[['a','1']]);assert.equal(reopened.durableThrough,1);assert.equal(reopened.submit('d'),2);
});
