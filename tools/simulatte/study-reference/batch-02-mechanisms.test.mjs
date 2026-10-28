import test from 'node:test';import assert from 'node:assert/strict';
import {citationGate,completeDependency,reconcileEffect,repairBounded,isFresh,consumeRepair,upgrade,admitGeneration,reconcileGeneration} from './batch-02-mechanisms.mjs';
const deepFreeze=value=>{if(value&&typeof value==='object'){for(const v of Object.values(value))deepFreeze(v);Object.freeze(value);}return value;};
test('L018 bounded mechanism',()=>{
 const current={tenantId:'t1',aclEpoch:2,revision:6,allowedIds:new Set(['a','stale','revoked','foreign'])};
 const spans=[{id:'a',tenantId:'t1',aclEpoch:2,revision:6},{id:'stale',tenantId:'t1',aclEpoch:2,revision:5},{id:'revoked',tenantId:'t1',aclEpoch:1,revision:6},{id:'foreign',tenantId:'t2',aclEpoch:2,revision:6},{id:'hidden',tenantId:'t1',aclEpoch:2,revision:6}];
 assert.equal(citationGate({citations:['a']},spans,current),true);
 assert.equal(citationGate({citations:[]},spans,current),false);
 // Each rejected span fails exactly one filter: revision, ACL epoch, tenant, allowed ID, or absence.
 for(const id of ['stale','revoked','foreign','hidden','missing'])assert.equal(citationGate({citations:['a',id]},spans,current),false,id);
});
test('L021 bounded mechanism',()=>{
 const state={tasks:{research:{epoch:2},constraints:{epoch:1}},completed:new Map(),remaining:2};
 assert.deepEqual(completeDependency(state,{predecessorId:'research',epoch:1,outputHash:'h0'}),{status:'stale',remaining:2});
 assert.deepEqual(completeDependency(state,{predecessorId:'research',epoch:2,outputHash:'h1'}),{status:'applied',remaining:1});
 assert.deepEqual(completeDependency(state,{predecessorId:'research',epoch:2,outputHash:'h1'}),{status:'duplicate',remaining:1});
 assert.deepEqual(completeDependency(state,{predecessorId:'research',epoch:2,outputHash:'h2'}),{status:'conflict',remaining:1});
 assert.deepEqual(completeDependency(state,{predecessorId:'constraints',epoch:1,outputHash:'h3'}),{status:'applied',remaining:0});
});
test('L021 workflow reconciliation outcomes',()=>{
 const intent={effectKey:'e1'};
 assert.deepEqual(reconcileEffect(intent,{status:'accepted',receipt:'r9'}),{action:'record',effectKey:'e1',receipt:'r9'});
 assert.deepEqual(reconcileEffect(intent,{status:'rejected',retryable:true}),{action:'retry',effectKey:'e1'});
 assert.deepEqual(reconcileEffect(intent,{status:'rejected',retryable:false}),{action:'fail',effectKey:'e1'});
 for(const lookup of [{status:'unknown'},null,undefined])assert.deepEqual(reconcileEffect(intent,lookup),{action:'hold-uncertain',effectKey:'e1'});
});
test('L027 bounded mechanism',()=>{const result=repairBounded('invalid',2,()=> 'invalid',v=>v==='valid');assert.deepEqual(result,{state:'exhausted',attempts:2});assert.equal(isFresh(5,6),false);assert.equal(isFresh(6,6),true);assert.deepEqual(repairBounded('invalid',2,()=> 'valid',v=>v==='valid'),{state:'valid',attempts:1});});
test('L027 events server-held repair budget',()=>{
 const budgets=new Map([['i',{remaining:2,version:0,jobs:new Set()}]]);
 assert.deepEqual(consumeRepair(budgets,'i',0,'j1'),{state:'queued',remaining:1,version:1});
 assert.deepEqual(consumeRepair(budgets,'i',1,'j1'),{state:'duplicate',remaining:1,version:1});
 assert.deepEqual(consumeRepair(budgets,'i',0,'j2'),{state:'conflict',remaining:1,version:1});
 assert.deepEqual(consumeRepair(budgets,'i',1,'j2'),{state:'queued',remaining:0,version:2});
 assert.deepEqual(consumeRepair(budgets,'i',2,'j3'),{state:'exhausted',remaining:0,version:2});
 assert.deepEqual(consumeRepair(budgets,'other',0,'j4'),{state:'unknown-intent'});
});
test('L031 bounded mechanism',()=>{
 const state=deepFreeze({version:7,defaults:{capacity:4},bindings:{v1:{id:'v1',compatible:true,admission:'admission'},v2:{id:'v2',compatible:true,admission:'n6'},bad:{id:'bad',compatible:false}},instances:{a:{bindingId:'v1',overrides:{capacity:2}},b:{bindingId:'v1',overrides:{}}}});
 const before=structuredClone(state);
 const next=upgrade(state,{instanceId:'a',bindingId:'v2',expectedVersion:7,overrides:{capacity:8}});
 assert.deepEqual(next.instances.a,{bindingId:'v2',overrides:{capacity:8}});
 assert.equal(next.version,8);
 // Sibling, defaults, every binding record and the prior state are untouched.
 assert.equal(next.instances.b,state.instances.b);
 assert.equal({...next.defaults,...next.instances.b.overrides}.capacity,4);
 assert.deepEqual(next.defaults,before.defaults);
 assert.deepEqual(next.bindings,before.bindings);
 assert.deepEqual(state,before);
 assert.throws(()=>upgrade(next,{instanceId:'a',bindingId:'v2',expectedVersion:7,overrides:{capacity:8}}),/stale version/);
 assert.throws(()=>upgrade(state,{instanceId:'a',bindingId:'bad',expectedVersion:7,overrides:{capacity:8}}),/incompatible binding/);
 assert.throws(()=>upgrade(state,{instanceId:'a',bindingId:'v2',expectedVersion:7,overrides:{capacity:0}}),/invalid override/);
 assert.throws(()=>upgrade(state,{instanceId:'z',bindingId:'v2',expectedVersion:7,overrides:{capacity:8}}),/unknown instance/);
});
test('L031 remote idempotent generation and reconciliation',()=>{
 const ledger=new Map();
 assert.deepEqual(admitGeneration(ledger,'k1'),{status:'accepted',attempt:1});
 // A resend after an RPC timeout reuses the journaled key and cannot start a second generation.
 assert.deepEqual(admitGeneration(ledger,'k1'),{status:'duplicate',attempt:1});
 assert.deepEqual(admitGeneration(ledger,'k2'),{status:'accepted',attempt:2});
 assert.equal(ledger.size,2);
 const intent={generationKey:'k1'};
 for(const status of ['accepted','completed'])assert.deepEqual(reconcileGeneration(intent,{status}),{action:'record',generationKey:'k1'});
 assert.deepEqual(reconcileGeneration(intent,{status:'absent'}),{action:'resend',generationKey:'k1'});
 for(const lookup of [{status:'unreachable'},null,undefined])assert.deepEqual(reconcileGeneration(intent,lookup),{action:'hold',generationKey:'k1'});
});
