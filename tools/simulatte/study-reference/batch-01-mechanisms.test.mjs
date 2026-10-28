import test from 'node:test';import assert from 'node:assert/strict';
import {visible,heartbeat,expireLeases,foldSession,expireByTimer,rebuild,appendToken,ranked} from './batch-01-mechanisms.mjs';
test('L012 bounded mechanism',()=>{const story={expiresAt:100};assert.equal(visible(story,true,99),true);assert.equal(visible(story,true,100),false);assert.equal(visible(story,false,99),false);});
test('L015 leases heartbeat fence',()=>{
 const current={epoch:3,seq:8,deadline:100};
 assert.equal(heartbeat(current,{epoch:2,seq:99},90,20),current);
 assert.equal(heartbeat(current,{epoch:3,seq:8},90,20),current);
 assert.deepEqual(heartbeat(current,{epoch:3,seq:9},90,20),{epoch:3,seq:9,deadline:110});
 // A delayed same-epoch beat at or after the deadline must not revive the expired lease.
 assert.equal(heartbeat(current,{epoch:3,seq:9},100,20),current);
 assert.equal(heartbeat(current,{epoch:3,seq:9},150,20),current);
 // Only a new session epoch opens a lease after expiry.
 assert.deepEqual(heartbeat(current,{epoch:4,seq:1},150,20),{epoch:4,seq:1,deadline:170});
});
test('L015 leases expiry sweep',()=>{
 const user={userId:'u',online:true,version:7,devices:{phone:{epoch:3,seq:8,deadline:80},laptop:{epoch:1,seq:2,deadline:110}}};
 const at90=expireLeases(user,90);
 assert.deepEqual(Object.keys(at90.user.devices),['laptop']);assert.equal(at90.user.online,true);assert.deepEqual(at90.events,[]);
 const at110=expireLeases(at90.user,110);
 assert.equal(at110.user.online,false);assert.deepEqual(at110.events,[{userId:'u',online:false,version:8}]);
 assert.deepEqual(expireLeases(at110.user,120).events,[]);
 assert.equal(heartbeat(user.devices.phone,{epoch:3,seq:9},90,20),user.devices.phone);
});
test('L015 events journaled expiry',()=>{
 const journal=[{kind:'open',epoch:3,seq:1},{kind:'beat',epoch:3,seq:2}];
 const live=rebuild(journal);
 assert.equal(expireByTimer(journal,live,{epoch:3,expectedSeq:1}),false);
 assert.equal(journal.length,2);
 assert.equal(expireByTimer(journal,live,{epoch:3,expectedSeq:2}),true);
 assert.deepEqual(journal.at(-1),{kind:'close',epoch:3,expectedSeq:2});
 journal.push({kind:'beat',epoch:3,seq:3});
 const incremental=journal.slice(2).reduce(foldSession,live);
 assert.deepEqual(incremental,{epoch:3,seq:2,closed:true});
 assert.deepEqual(rebuild(journal),incremental);
 const raced=[{kind:'open',epoch:3,seq:1},{kind:'beat',epoch:3,seq:2},{kind:'beat',epoch:3,seq:3},{kind:'close',epoch:3,expectedSeq:2}];
 assert.deepEqual(rebuild(raced),{epoch:3,seq:3,closed:false});
 assert.deepEqual(foldSession(incremental,{kind:'beat',epoch:4,seq:1}),{epoch:4,seq:1,closed:false});
});
test('L017 bounded mechanism',()=>{
 const state={attempt:4,cancelled:false,tokens:{4:['a','b']}};
 assert.equal(appendToken(state,{attempt:4,index:1,text:'b'}),false);
 // Attempt advance only: the old attempt is fenced and the new attempt cannot extend its prefix.
 state.attempt=5;
 assert.equal(appendToken(state,{attempt:4,index:2,text:'c'}),false);
 assert.equal(appendToken(state,{attempt:5,index:2,text:'c'}),false);
 assert.equal(appendToken(state,{attempt:5,index:0,text:'x'}),true);
 assert.deepEqual(state.tokens,{4:['a','b'],5:['x']});
 // Cancel only: same attempt, every append is rejected.
 const cancelled={attempt:4,cancelled:true,tokens:{4:['a','b']}};
 assert.equal(appendToken(cancelled,{attempt:4,index:2,text:'c'}),false);
 assert.deepEqual(cancelled.tokens,{4:['a','b']});
});
test('L020 bounded mechanism',()=>{
 const rows=[{id:'b',score:3,seq:2},{id:'a',score:3,seq:1},{id:'x',score:5,seq:3,allowed:true},{id:'d',score:4,seq:4,deleted:true}];
 const visibleNow=new Set(['a','b','d']);
 assert.deepEqual(ranked(rows,visibleNow).map(r=>r.id),['b','a']);
 assert.deepEqual(ranked([...rows].reverse(),visibleNow),ranked(rows,visibleNow));
});
