import test from 'node:test';import assert from 'node:assert/strict';
import {admitJob,eligibleOrigins,acceptFence,recoverPrefix,updateOnce,claimJob,commitIfLeaseEpoch,chooseFallbackRegion,FencedJournal,reserve,UsageLedger} from './batch-05-state.mjs';
test('stable job identity deduplicates local intent and rejects conflicting input',()=>{const j=new Map();assert.equal(admitJob(j,'j','A'),true);assert.equal(admitJob(j,'j','A'),false);assert.throws(()=>admitJob(j,'j','B'),/conflict/);assert.equal(j.size,1);});
test('origin eligibility excludes partial unhealthy and exhausted regions',()=>{assert.deepEqual(eligibleOrigins([{id:'partial',complete:false,healthy:true,capacity:1},{id:'ok',complete:true,healthy:true,capacity:1},{id:'down',complete:true,healthy:false,capacity:2},{id:'full',complete:true,healthy:true,capacity:0}]),['ok']);});
test('fence comparison and bounded committed suffix retain recovery boundary',()=>{assert.equal(acceptFence(5,4),false);assert.equal(acceptFence(5,5),true);assert.equal(recoverPrefix(10,[{index:10,committed:true},{index:11,committed:true},{index:12,committed:true},{index:13,committed:false}]),12);assert.throws(()=>recoverPrefix(10,[{index:12,committed:true}]),/gap/);});
test('resource vectors and interval identities prevent local overspend and double charge',()=>{
 const first=reserve([1000,8,1],[500,4,1]);assert.deepEqual(first,[500,4,0]);assert.equal(reserve(first,[500,4,1]),null);assert.equal(reserve(first,[-1,0,0]),null);
 assert.throws(()=>reserve([1,2],[1]),/dimension/);assert.throws(()=>reserve([1],[1,0]),/dimension/);
 const ledger=new UsageLedger(8);ledger.begin('a',3);assert.equal(ledger.charge('a',3,1,15),15);assert.equal(ledger.charge('a',3,1,15),0);
 ledger.begin('a',4);assert.throws(()=>ledger.charge('a',3,2,7),/fenced/);assert.equal(ledger.charge('a',4,1,7),7);
});

test('request receipts return the original update result on retry',()=>{
 const store={version:7,value:'old',receipts:new Map()};
 assert.deepEqual(updateOnce(store,'r1','h1',7,'new'),{status:'ok',version:8,replayed:false});
 assert.deepEqual(updateOnce(store,'r1','h1',7,'new'),{status:'ok',version:8,replayed:true});
 assert.equal(store.version,8);assert.equal(store.value,'new');
 assert.deepEqual(updateOnce(store,'r2','h2',7,'other'),{status:'conflict',version:8,replayed:false});
 assert.throws(()=>updateOnce(store,'r1','different',7,'new'),/request identity conflict/);
});
test('conditional lease epoch update refuses a stale worker result',()=>{
 const jobs=new Map([['j',{state:'open',leaseEpoch:0,leaseUntil:0}]]);
 const stale=claimJob(jobs,'j',0,10);assert.equal(stale,1);assert.equal(claimJob(jobs,'j',5,10),null);
 const fresh=claimJob(jobs,'j',11,10);assert.equal(fresh,2);
 assert.equal(commitIfLeaseEpoch(jobs,'j',stale,'A'),'stale-lease');
 assert.equal(commitIfLeaseEpoch(jobs,'j',fresh,'B'),'committed');
 assert.equal(commitIfLeaseEpoch(jobs,'j',fresh,'B'),'duplicate');
 assert.equal(commitIfLeaseEpoch(jobs,'j',stale,'A'),'stale-lease');
 assert.equal(jobs.get('j').resultHash,'B');assert.equal(claimJob(jobs,'j',50,10),null);
});
test('CDN fallback fails over from an unhealthy home region to an eligible origin',()=>{
 const regions=[{id:'east',complete:true,healthy:false,capacity:9},{id:'west',complete:false,healthy:true,capacity:9},{id:'south',complete:true,healthy:true,capacity:2},{id:'north',complete:true,healthy:true,capacity:5}];
 assert.equal(chooseFallbackRegion('east',regions),'north');
 assert.equal(chooseFallbackRegion('south',regions),'south');
 assert.equal(chooseFallbackRegion('west',regions),'north');
 assert.equal(chooseFallbackRegion('east',regions.map(r=>({...r,healthy:r.id==='east'?false:r.healthy,capacity:r.id==='east'?r.capacity:0}))),null);
});
test('fenced append checks the fence and request receipt in one step',()=>{
 const j=new FencedJournal();j.install(4);
 assert.deepEqual(j.appendIfFenceAtLeast(4,'r1','h','A'),{status:'appended',lsn:1,fence:4});
 assert.deepEqual(j.appendIfFenceAtLeast(4,'r1','h','A'),{status:'duplicate',lsn:1,fence:4});
 assert.equal(j.entries.length,1);
 j.install(5);assert.deepEqual(j.appendIfFenceAtLeast(4,'r2','h2','B'),{status:'fenced',fence:5});assert.equal(j.entries.length,1);
 assert.deepEqual(j.appendIfFenceAtLeast(5,'r1','h','A'),{status:'duplicate',lsn:1,fence:4});
 assert.throws(()=>j.appendIfFenceAtLeast(5,'r1','other','C'),/request identity conflict/);
 assert.throws(()=>j.install(5),/increase/);assert.equal(j.entries.length,1);
});
test('usage ledger rejects conflicting duplicates and bounds retained identities',()=>{
 const l=new UsageLedger(2);l.begin('a',3);
 assert.equal(l.charge('a',3,1,10),10);assert.equal(l.charge('a',3,1,10),0);
 assert.throws(()=>l.charge('a',3,1,99),/usage identity conflict/);
 assert.throws(()=>l.charge('a',3,3,5),/gap/);
 assert.equal(l.charge('a',3,2,7),7);assert.equal(l.charge('a',3,3,4),4);assert.equal(l.retained,2);
 assert.throws(()=>l.charge('a',3,1,10),/retention window/);assert.throws(()=>l.charge('a',3,2,8),/usage identity conflict/);
 assert.throws(()=>l.charge('a',3,4,-1),/negative/);assert.throws(()=>l.begin('a',3),/fenced/);
 l.begin('b',1);for(let s=1;s<=50;s++)l.charge('b',1,s,1);assert.equal(l.retained,4);
 l.settle('a');l.settle('b');assert.equal(l.retained,0);assert.throws(()=>l.charge('a',3,4,1),/not open/);
});
