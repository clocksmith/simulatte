import test from 'node:test';import assert from 'node:assert/strict';
import {authorize,publishManifest,applyApproval,admitSide,snapshotJoin} from './batch-04-state.mjs';
test('workspace epoch and tenant fencing rejects stale proof',()=>{
 const p={tenant:'a',epoch:4,actions:['edit']},c={epoch:5,version:2};
 assert.equal(authorize(p,c,{tenant:'a',action:'edit',expectedVersion:2}),false);
 assert.equal(authorize({...p,epoch:5},c,{tenant:'b',action:'edit',expectedVersion:2}),false);
 assert.equal(authorize({...p,epoch:5},c,{tenant:'a',action:'edit',expectedVersion:2}),true);
});
test('manifest publication waits for committed partition coverage',()=>{
 const receipts=new Map([['a','committed'],['b','quarantined']]);assert.equal(publishManifest(['a','b'],receipts,1,2),1);
 receipts.set('b','committed');assert.equal(publishManifest(['a','b'],receipts,1,2),2);
 assert.throws(()=>publishManifest(['a','a'],receipts,1,2),/duplicate/);
});
test('approval binds identity revision hash and next transition',()=>{
 const state={revision:1,events:new Set()},e={id:'e2',entityId:'x',revision:2,hash:'A'},a={...e};
 assert.equal(applyApproval(state,e,{...a,hash:'B'}).accepted,false);
 const result=applyApproval(state,e,a);assert.equal(result.accepted,true);assert.equal(result.state.revision,2);
 assert.equal(applyApproval(result.state,e,a).accepted,false);
 assert.equal(applyApproval(result.state,{...e,id:'e4',revision:4},{...a,revision:4}).accepted,false);
});
test('paired online and snapshot mechanisms preserve missing mismatch and duplicates',()=>{
 let p=admitSide({},'left',7);assert.equal(p.status,'waiting');p=admitSide(p,'left',7);p=admitSide(p,'right',7);assert.equal(p.status,'matched');
 assert.equal(admitSide(p,'left',8).status,'conflict');
 assert.deepEqual([...snapshotJoin(new Map([['a',7],['b',8]]),new Map([['a',7],['c',9]]))],[['a','matched'],['b','missing-right'],['c','missing-left']]);
 assert.equal(admitSide(admitSide({},'left',7),'right',8).status,'mismatch');
});
