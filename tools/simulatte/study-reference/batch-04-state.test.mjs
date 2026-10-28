import test from 'node:test';import assert from 'node:assert/strict';
import {transactionalCommand,capabilityCommand,commitFetch,reassignLease,publishGeneration,admitEvent,applyApproval,createReducer,reduceRecord,createPair,admitSide,expirePair,snapshotJoin} from './batch-04-state.mjs';

test('L023 transactional policy denies cross-workspace and explicit deny and replays committed commands before the version check',()=>{
 const db={version:2,policyVersion:1,commands:new Map(),events:[],grants:[
  {principal:'alice',workspaceId:'W1',projectId:'*',actions:['edit'],effect:'allow'},
  {principal:'alice',workspaceId:'W1',projectId:'P2',actions:['edit'],effect:'deny'},
  {principal:'bob',workspaceId:'W2',projectId:'*',actions:['edit'],effect:'allow'}]};
 const cmd=(id,projectId,expectedVersion,requestHash='h-'+id)=>({workspaceId:'W1',projectId,action:'edit',expectedVersion,commandId:id,requestHash});
 assert.deepEqual(transactionalCommand(db,'bob',cmd('c0','P1',2)),{status:'denied',code:403});
 assert.deepEqual(transactionalCommand(db,'alice',cmd('c0','P2',2)),{status:'denied',code:403});
 assert.deepEqual(transactionalCommand(db,'alice',cmd('c1','P1',2)),{status:'committed',objectVersion:3,policyVersion:1});
 assert.deepEqual(transactionalCommand(db,'alice',cmd('c1','P1',2)),{status:'replayed',objectVersion:3,policyVersion:1});
 assert.deepEqual(transactionalCommand(db,'alice',cmd('c2','P1',2)),{status:'stale',code:409,objectVersion:3});
 assert.deepEqual(transactionalCommand(db,'alice',cmd('c1','P1',2,'other')),{status:'rejected',code:422});
 db.grants=db.grants.filter(g=>!(g.principal==='alice'&&g.effect==='allow'));db.policyVersion=2;
 assert.deepEqual(transactionalCommand(db,'alice',cmd('c3','P1',3)),{status:'denied',code:403});
 assert.equal(db.version,3);assert.deepEqual(db.events,[{eventId:'c1',objectVersion:3}]);
});

test('L023 capability checks audience scope and epoch online and replays committed commands first',()=>{
 const db={version:2,audience:'docs-api',keys:new Set(['k2']),epochs:new Map([['W1',4]]),commands:new Map(),events:[]};
 const token={keyId:'k2',signatureValid:true,audience:'docs-api',principal:'alice',workspaceId:'W1',projectId:'P1',actions:['edit'],epoch:4,expiresAt:100};
 const cmd=(id,expectedVersion,over={})=>({audience:'docs-api',workspaceId:'W1',projectId:'P1',action:'edit',expectedVersion,commandId:id,requestHash:'h-'+id,...over});
 assert.equal(capabilityCommand(db,{...token,audience:'billing-api'},cmd('c0',2),10).reason,'audience');
 assert.equal(capabilityCommand(db,token,cmd('c0',2,{audience:'billing-api'}),10).reason,'audience');
 assert.equal(capabilityCommand(db,token,cmd('c0',2),100).reason,'expired');
 assert.equal(capabilityCommand(db,{...token,keyId:'k1'},cmd('c0',2),10).reason,'signature');
 assert.equal(capabilityCommand(db,{...token,signatureValid:false},cmd('c0',2),10).reason,'signature');
 assert.deepEqual(capabilityCommand(db,token,cmd('c0',2,{workspaceId:'W2'}),10),{status:'denied',code:403,reason:'scope'});
 assert.deepEqual(capabilityCommand(db,token,cmd('c1',2),10),{status:'committed',objectVersion:3,epoch:4});
 db.epochs.set('W1',5);
 assert.deepEqual(capabilityCommand(db,token,cmd('c2',3),10),{status:'denied',code:403,reason:'epoch'});
 assert.deepEqual(capabilityCommand(db,token,cmd('c1',2),10),{status:'replayed',objectVersion:3,epoch:4});
 assert.equal(db.version,3);assert.deepEqual(db.events,[{eventId:'c1',objectVersion:3}]);
});

test('L024 frontier output commit is lease-fenced and deduplicated by source revision and parser',()=>{
 const store={leases:new Map([['S',{epoch:1}]]),outputs:new Map(),done:new Set(),quarantine:[]};
 const result={revision:'r1',parserVersion:2,receiptHash:'h1',records:['rec1','rec2'],rejected:['bad1']};
 assert.deepEqual(commitFetch(store,{sourceId:'S',leaseEpoch:1,runId:'run-1'},result),{state:'committed'});
 assert.equal(reassignLease(store,'S'),2);
 assert.deepEqual(commitFetch(store,{sourceId:'S',leaseEpoch:2,runId:'run-1'},{...result,receiptHash:'h1-retry'}),{state:'duplicate',provenance:{receiptHash:'h1',leaseEpoch:1,runId:'run-1'}});
 assert.deepEqual(commitFetch(store,{sourceId:'S',leaseEpoch:1,runId:'run-2'},{revision:'r2',parserVersion:2,receiptHash:'h2',records:['rec3'],rejected:[]}),{state:'stale-lease'});
 assert.deepEqual([...store.outputs.keys()],['S@r1#2']);assert.deepEqual(store.outputs.get('S@r1#2').records,['rec1','rec2']);
 assert.deepEqual(store.quarantine,[{sourceId:'S',revision:'r1',record:'bad1'}]);
 assert.deepEqual([...store.done],['run-1/S']);
});

test('L024 manifest publication compares and swaps the prior generation and refuses older runs',()=>{
 const pointer={active:1},receipts=new Map([['a','committed'],['b','quarantined']]);
 const run=generation=>({generation,expected:['a','b']});
 assert.deepEqual(publishGeneration(pointer,1,run(3),receipts),{published:false,reason:'incomplete',active:1});
 receipts.set('b','committed');
 assert.deepEqual(publishGeneration(pointer,1,run(3),receipts),{published:true,active:3});
 assert.deepEqual(publishGeneration(pointer,1,run(2),receipts),{published:false,reason:'stale-expected',active:3});
 assert.deepEqual(publishGeneration(pointer,1,run(4),receipts),{published:false,reason:'stale-expected',active:3});
 assert.deepEqual(publishGeneration(pointer,3,run(2),receipts),{published:false,reason:'not-newer',active:3});
 assert.deepEqual(publishGeneration(pointer,3,run(4),receipts),{published:true,active:4});
 assert.throws(()=>publishGeneration(pointer,4,{generation:5,expected:['a','a']},receipts),/duplicate/);
});

test('L028 staged admission returns duplicate and approval binds identity revision and hash',()=>{
 const ledger=new Map();
 assert.deepEqual(admitEvent(ledger,'e2','A'),{status:'awaiting-approval'});
 assert.deepEqual(admitEvent(ledger,'e2','A'),{status:'duplicate',prior:'awaiting-approval'});
 assert.deepEqual(admitEvent(ledger,'e2','B'),{status:'quarantined',reason:'event-id-conflict'});
 assert.equal(ledger.get('e2').hash,'A');
 const state={revision:1,events:new Set()},e={id:'e2',entityId:'x',revision:2,hash:'A'},a={...e};
 assert.equal(applyApproval(state,e,{...a,hash:'B'}).accepted,false);
 assert.equal(applyApproval(state,e,{...a,entityId:'y'}).accepted,false);
 const result=applyApproval(state,e,a);assert.equal(result.accepted,true);assert.equal(result.state.revision,2);
 assert.equal(applyApproval(result.state,e,a).accepted,false);
 assert.equal(applyApproval(result.state,{...e,id:'e4',revision:4},{...a,revision:4}).accepted,false);
});

test('L028 entity-log reducer keeps pending events and approvals without blocking the partition',()=>{
 const records=[
  {type:'event',id:'x1',entityId:'X',revision:1,hash:'A'},
  {type:'event',id:'y1',entityId:'Y',revision:1,hash:'B'},
  {type:'approval',eventId:'y1',entityId:'Y',revision:1,hash:'B'},
  {type:'approval',eventId:'x2',entityId:'X',revision:2,hash:'C'},
  {type:'approval',eventId:'x1',entityId:'X',revision:1,hash:'Z'},
  {type:'approval',eventId:'x1',entityId:'X',revision:1,hash:'A'},
  {type:'event',id:'x2',entityId:'X',revision:2,hash:'C'},
  {type:'event',id:'x2',entityId:'X',revision:2,hash:'C'}
 ].map((r,i)=>({...r,offset:i+1}));
 const states=[];let s=createReducer();for(const r of records){s=reduceRecord(s,r);states.push(s);}
 assert.deepEqual(Object.keys(states[0].pendingEvents),['x1']);
 assert.equal(states[2].entities.Y.revision,1);assert.equal(states[2].entities.X,undefined);assert.equal(states[2].offset,3);
 assert.equal(states[4].entities.X,undefined);assert.equal(states[4].offset,5);
 assert.deepEqual(states[5].entities.X,{revision:1,applied:['x1']});
 assert.deepEqual(states[6].entities.X,{revision:2,applied:['x1','x2']});
 assert.equal(reduceRecord(states[6],records[5]),states[6]);
 assert.deepEqual(s.entities.X,{revision:2,applied:['x1','x2']});assert.deepEqual(s.pendingEvents,{});assert.deepEqual(s.pendingApprovals,{});assert.equal(s.offset,8);
 assert.throws(()=>reduceRecord(s,{...records[0],offset:10}),/offset gap/);
});

test('L029 keyed pair keeps one terminal result and records conflicts and overdue sides',()=>{
 let p=createPair(100),r;
 ({pair:p,reply:r}=admitSide(p,{side:'left',value:7,eventId:'e1'}));assert.equal(r,'waiting');
 const before=p;({pair:p,reply:r}=admitSide(p,{side:'left',value:7,eventId:'e1'}));assert.equal(r,'waiting');assert.equal(p,before);
 ({pair:p,reply:r}=admitSide(p,{side:'left',value:7,eventId:'e2'}));assert.equal(r,'waiting');
 ({pair:p,reply:r}=admitSide(p,{side:'right',value:7,eventId:'e3'}));assert.equal(r,'matched');assert.deepEqual(p.results,['matched']);
 ({pair:p,reply:r}=admitSide(p,{side:'left',value:8,eventId:'e4'}));assert.equal(r,'conflict');
 assert.equal(p.state,'matched');assert.equal(p.left,7);assert.deepEqual(p.results,['matched']);assert.deepEqual(p.conflicts,[{side:'left',value:8,eventId:'e4'}]);
 ({pair:p,reply:r}=admitSide(p,{side:'left',value:8,eventId:'e4'}));assert.equal(r,'conflict');assert.equal(p.conflicts.length,1);
 let w=admitSide(createPair(100),{side:'left',value:7,eventId:'w1'}).pair;
 ({pair:w,reply:r}=admitSide(w,{side:'left',value:9,eventId:'w2'}));assert.equal(r,'conflict');assert.equal(w.state,'waiting');
 ({pair:w,reply:r}=admitSide(w,{side:'right',value:7,eventId:'w3'}));assert.equal(r,'matched');
 let q=admitSide(createPair(100),{side:'left',value:7,eventId:'q1'}).pair;
 assert.equal(expirePair(q,99).state,'waiting');q=expirePair(q,100);
 assert.equal(q.state,'overdue');assert.equal(q.missingSide,'right');assert.deepEqual(q.results,[]);
 ({pair:q,reply:r}=admitSide(q,{side:'right',value:8,eventId:'q2'}));assert.equal(r,'mismatch');assert.deepEqual(q.results,['mismatch']);assert.equal(q.missingSide,null);
 assert.throws(()=>admitSide(createPair(1),{side:'middle',value:1,eventId:'z'}),/invalid scalar side/);
});

test('L029 batch join classifies exact repeats conflicts mismatches and missing sides per key and revision',()=>{
 const row=(key,revision,value)=>({key,revision,value});
 const left=[row('a',1,7),row('a',1,7),row('a',2,7),row('b',1,8),row('d',1,5),row('d',1,6)];
 const right=[row('a',1,7),row('b',1,9),row('c',1,9),row('d',1,5)];
 assert.deepEqual([...snapshotJoin(left,right)],[['a@1','matched'],['a@2','missing-right'],['b@1','mismatch'],['c@1','missing-left'],['d@1','conflict']]);
 assert.deepEqual([...snapshotJoin([row('e',1,3)],[row('e',1,3),row('e',1,3)])],[['e@1','matched']]);
});
