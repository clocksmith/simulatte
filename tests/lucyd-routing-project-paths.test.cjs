'use strict';
// Owner: public/simulatte/system-diagram/CATSCAN.md; numerical evidence only.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const base=path.resolve(__dirname,'../public/data/system-diagram'),data=require('../public/data/system-diagram/problems.json');
const D=require('../public/simulatte/system-diagram/diagram.js'),E=require('../public/simulatte/system-diagram/engine.js');
const deps={library:require('../public/simulatte/system-diagram/class-library.js').loadSync(base),config:require('../public/data/system-diagram/config.json'),kernels:require('../public/simulatte/system-diagram/kernels-all.js')};
const stages=id=>data.problems.find(p=>p.id===id).solutions[0].stages.filter(st=>Number.isInteger(st.legacyIndex)).sort((a,b)=>a.legacyIndex-b.legacyIndex);
function run(d){const c=D.compile(d,deps.library,deps.config),s=E.initialize(c,deps);E.advance(c,s,c.horizonSec,deps);return {s,v:E.observe(c,s,deps)};}
test('round robin exposes errors; alternate retries recover and request-driven probes close after recovery',()=>{
 const [a,b,c]=stages('load-balancer').map(st=>run(st.diagram));
 assert.equal(a.v.global.offered,80);assert.equal(a.v.global.failed,16);
 assert.equal(a.s.kernel.router.backends['route-a'].sent,40);assert.equal(a.s.kernel.router.backends['route-b'].sent,40);
 assert.equal(b.v.global.failed,0);assert.equal(b.v.global.completed,80);assert.ok(b.s.kernel.router.ejections>0);assert.ok(b.s.kernel.router.retries>0);
 assert.equal(c.v.global.completed,80);assert.ok(c.s.kernel['breaker-a'].opens>0);assert.ok(c.s.kernel['breaker-a'].shortCircuited>0);assert.equal(c.s.kernel['breaker-a'].state,'closed');assert.equal(c.s.kernel['breaker-a'].probesOk,1);
 const disconnected=structuredClone(stages('load-balancer')[2].diagram);disconnected.edges=disconnected.edges.filter(e=>e.from.nodeId!=='router');assert.equal(run(disconnected).v.global.completed,0);
});
test('report queue acknowledges admission separately from result effects and suppresses ambiguous-commit duplicates',()=>{
 const [a,b,c]=stages('project-review').map(st=>run(st.diagram));
 assert.ok(a.v.global.failed>0);assert.equal(a.s.kernel.results.effects,36);assert.ok(a.v.global.completed<36);
 assert.equal(b.v.global.completed,36);assert.equal(b.s.kernel.queue.stats.acked,36);assert.equal(b.s.kernel.results.effects,36);
 assert.equal(c.v.global.completed,36);assert.equal(c.s.kernel.results.effects,36);assert.ok(c.s.kernel.results.suppressed>0);assert.equal(c.v.global.duplicateEffects,0);assert.ok(c.s.kernel.queue.stats.redeliveries>0);assert.equal(c.s.kernel.queue.size,0);assert.equal(c.s.kernel.deadletters.count,0);
 const broken=structuredClone(stages('project-review')[2].diagram);broken.edges=broken.edges.filter(e=>e.id!=='commit');assert.equal(run(broken).s.kernel.results.effects,0);
});
test('all newly authored stages verify against coordinator playback and midpoint checkpoint continuation',async()=>{
 const Runner=require('../public/simulatte/system-diagram/runner.js');
 const added=new Set(['database-service','project-review','pagination','chat','replication','saved-search','load-balancer','subscriptions']);
 for(const p of data.problems.filter(p=>added.has(p.id)))for(const solution of p.solutions)for(const stage of solution.stages.filter(st=>st.kind!=='design')){
  const runner=await Runner.create({diagram:stage.diagram,...deps});
  try{runner.advanceTo(stage.diagram.run.horizonSec);const proof=await runner.verify();assert.equal(proof.status,'match',p.id+'/'+stage.id);}finally{await runner.dispose();}
  const compiled=D.compile(stage.diagram,deps.library,deps.config),a=E.initialize(compiled,deps);E.advance(compiled,a,compiled.horizonSec/2,deps);const b=JSON.parse(JSON.stringify(a));E.advance(compiled,a,compiled.horizonSec,deps);E.advance(compiled,b,compiled.horizonSec,deps);assert.deepEqual(a,b,p.id+'/'+stage.id+' checkpoint continuation');
 }
});
