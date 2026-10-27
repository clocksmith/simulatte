'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const base=path.resolve(__dirname,'../public/data/system-diagram'),C=require('../public/data/system-diagram/config.json'),L=require('../public/simulatte/system-diagram/class-library.js').loadSync(base),D=require('../public/simulatte/system-diagram/diagram.js'),E=require('../public/simulatte/system-diagram/engine.js'),K=require('../public/simulatte/system-diagram/kernels-all.js');
const data=require('../public/data/system-diagram/problems.json'),deps={library:L,config:C,kernels:K};
const solution=id=>data.problems.find(p=>p.id===id).solutions[0];
const retained=id=>solution(id).stages.filter(st=>Number.isInteger(st.legacyIndex)).sort((a,b)=>a.legacyIndex-b.legacyIndex);
function run(diagram,until=6){const c=D.compile(diagram,L,C),s=E.initialize(c,deps);E.advance(c,s,until,deps);return {c,s,v:E.observe(c,s,deps)};}
test('cross-region acknowledgement policy exposes uncertain writes and finite retries repair retained outbox',()=>{
 const stages=retained('replication').map(s=>s.diagram),local=run(stages[0]),remote=run(stages[1]),repair=run(stages[2]);
 assert.equal(local.v.global.completed,4);assert.equal(remote.v.global.completed,2);assert.equal(remote.v.global.failed,2);
 for(const r of [local,remote]){assert.equal(r.s.kernel.leader.writes,4);assert.equal(r.v.nodes.leader.detail['Exhausted outbox'],2);assert.ok(r.v.global.memoryMiB>0);}
 assert.equal(repair.v.global.completed,4);assert.equal(repair.v.global.failed,0);assert.ok(repair.s.kernel.follower.duplicates>0);assert.ok(repair.s.kernel.follower.applied<=4);assert.deepEqual(repair.s.kernel.follower.versions,repair.s.kernel.leader.versions);assert.equal(repair.v.nodes.leader.detail['Pending replication'],0);
 const during=run(stages[2],.25),checkpoint=structuredClone(during.s);E.advance(during.c,during.s,6,deps);E.advance(during.c,checkpoint,6,deps);assert.deepEqual(during.s,checkpoint);
});
test('tenant-local network outage leaves the other tenant available and converges after repair',()=>{
 const d=solution('database-service').stages.at(-1).diagram,early=run(d,.25),final=run(d);
 assert.equal(early.s.kernel['db-a'].writes,4);assert.equal(early.s.kernel['backup-a'].applied,0);assert.equal(early.s.kernel['backup-b'].applied,4);
 assert.equal(early.v.global.completed,4);assert.equal(early.v.nodes['db-a'].detail['Pending replication'],4);
 assert.equal(final.v.global.completed,8);assert.equal(final.v.global.failed,0);
 for(const tenant of ['a','b']){assert.deepEqual(final.s.kernel['db-'+tenant].versions,final.s.kernel['backup-'+tenant].versions);assert.equal(final.v.nodes['db-'+tenant].detail['Pending replication'],0);}
 const broken=structuredClone(d);broken.faults[0].untilSec=null;const isolated=run(broken);assert.equal(isolated.v.global.completed,4);assert.equal(isolated.v.global.failed,4);assert.equal(isolated.s.kernel['backup-b'].applied,4);
});
