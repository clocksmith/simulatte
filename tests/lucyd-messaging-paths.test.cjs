'use strict';
// Owner: public/simulatte/system-diagram/CATSCAN.md. Tests synthetic messaging contracts only.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const base=path.resolve(__dirname,'../public/data/system-diagram'),P=require('../public/data/system-diagram/problems.json');
const D=require('../public/simulatte/system-diagram/diagram.js'),E=require('../public/simulatte/system-diagram/engine.js');
const K=require('../public/simulatte/system-diagram/kernels-all.js'),L=require('../public/simulatte/system-diagram/class-library.js').loadSync(base),config=require('../public/data/system-diagram/config.json');
const deps={library:L,config,kernels:K};
function stages(id){return P.problems.find(p=>p.id===id).solutions[0].stages;}
function run(diagram,script){const compiled=D.compile(diagram,L,config),state=E.initialize(compiled,deps);if(script)state.kernel.users.script=structuredClone(script);E.advance(compiled,state,diagram.run.horizonSec,deps);assert.equal(E.observe(compiled,state,deps).error,null);return state;}
test('chat stages distinguish committed effects, lost acknowledgements, retries and cursor recovery',()=>{
 const s=stages('chat'),states=s.map(st=>run(st.diagram));
 for(let i=0;i<s.length;i++){const a=states[i];assert.deepEqual(a,run(s[i].diagram));assert.deepEqual(a.kernel.mailbox.messages.map(m=>[m.id,m.sequence]),[['m1',1],['m2',2],['m3',3]]);assert.ok(a.kernel.mailbox.denied>0);assert.equal(a.kernel.users.outcomes.find(o=>o.index===7).ok,false);}
 assert.equal(states[0].kernel.users.outcomes.find(o=>o.index===0).ok,false);assert.equal(states[1].kernel.users.outcomes.find(o=>o.index===0).ok,true);assert.ok(states[1].kernel.mailbox.duplicates>states[0].kernel.mailbox.duplicates);
 const final=states[2].kernel.users.outcomes;assert.equal(final.find(o=>o.index===5).ok,false);assert.deepEqual(final.find(o=>o.index===6).value.messages.map(m=>m.sequence),[2,3]);assert.equal(final.find(o=>o.index===6).value.cursor,3);
});
test('chat rejects conflicting stable identities and cannot manufacture history without its connection',()=>{
 const d=structuredClone(stages('chat')[1].diagram);d.faults=[];
 const s=run(d,[[0,{action:'send',id:'same',actor:'alice',recipient:'bob',text:'original'}],[1,{action:'send',id:'same',actor:'alice',recipient:'bob',text:'changed'}]]);
 assert.equal(s.kernel.mailbox.messages.length,1);assert.equal(s.kernel.mailbox.messages[0].text,'original');assert.equal(s.kernel.users.outcomes.at(-1).ok,false);
 d.edges=[];const disconnected=run(d);assert.equal(disconnected.kernel.mailbox.messages.length,0);assert.equal(disconnected.kernel.users.completed,0);
});
test('saved search matches new listing tokens, groups by recipient/day and retains missing delivery',()=>{
 const s=stages('saved-search'),states=s.map(st=>run(st.diagram));
 for(let i=0;i<s.length;i++){assert.deepEqual(states[i],run(s[i].diagram));const k=states[i].kernel.matcher;assert.equal(Object.keys(k.listings).length,4);assert.equal(Object.keys(k.matches).length,4);assert.equal(Object.values(k.matches).some(m=>m.listingId==='b2'),false);assert.equal(Object.keys(k.digests).length,3);assert.equal(k.duplicates,1);}
 assert.equal(Object.values(states[0].kernel.matcher.digests).some(d=>d.delivered),false);assert.equal(states[0].kernel.users.failed,4);
 for(const state of states.slice(1)){assert.equal(Object.keys(state.kernel.email.emails).length,3);assert.ok(Object.values(state.kernel.matcher.digests).every(d=>d.delivered));const rows=Object.values(state.kernel.email.emails);assert.deepEqual(rows.find(r=>r.actor==='alice'&&r.day===1).listingIds,['b1','b3']);assert.deepEqual(rows.find(r=>r.actor==='bob'&&r.day===1).listingIds,['b1']);assert.deepEqual(rows.find(r=>r.actor==='bob'&&r.day===2).listingIds,['b4']);}
 assert.equal(states[1].kernel.email.duplicates,0);assert.ok(states[2].kernel.email.duplicates>0);
});
test('multiple saved terms for one subscriber cannot duplicate a listing in the digest',()=>{
 const d=structuredClone(stages('saved-search')[1].diagram);const state=run(d,[[0,{action:'save',id:'term1',actor:'alice',term:'distributed'}],[.1,{action:'save',id:'term2',actor:'alice',term:'database'}],[1,{action:'list',id:'book',title:'Distributed Database'}],[2,{action:'digest',day:1}],[3,{action:'digest',day:1}]]);assert.equal(Object.keys(state.kernel.matcher.matches).length,1);assert.equal(Object.keys(state.kernel.email.emails).length,1);assert.deepEqual(Object.values(state.kernel.email.emails)[0].listingIds,['book']);
});
test('a generic successful service response cannot acknowledge an email effect',()=>{
 const d=structuredClone(stages('saved-search')[1].diagram);d.nodes.find(n=>n.id==='email').classId='worker';const state=run(d);assert.ok(Object.values(state.kernel.matcher.digests).every(d=>!d.delivered));assert.equal(state.kernel.users.failed,4);
});
