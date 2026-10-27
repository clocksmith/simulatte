'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'../public/data/system-diagram'),publicRoot=path.resolve(base,'../..');
const D=require('../public/simulatte/system-diagram/diagram.js'),E=require('../public/simulatte/system-diagram/engine.js');
const K=require('../public/simulatte/system-diagram/kernels-all.js'),L=require('../public/simulatte/system-diagram/class-library.js').loadSync(base);
const config=require('../public/data/system-diagram/config.json'),solutions=require('../public/data/system-diagram/interview-solutions.json').solutions;
const registry=require('../public/data/system-diagram/interview-problems.json'),S=require('../public/simulatte/system-diagram/interview-stepper.js');
const Runner=require('../public/simulatte/system-diagram/runner.js');
const deps={library:L,config,kernels:K};
function run(diagram,until=diagram.run.horizonSec){const compiled=D.compile(diagram,L,config),state=E.initialize(compiled,deps);E.advance(compiled,state,until,deps);return {compiled,state,view:E.observe(compiled,state,deps)};}
const example=id=>structuredClone(require('../public/data/system-diagram/examples/'+id+'.json'));
function stateFor(result,kernel){const n=result.compiled.nodes.find(n=>n.kernel===kernel);assert.ok(n, kernel);return result.state.kernel[n.id];}

test('public compatibility exports preserve classified provenance, conceptual stages and independently executable stages',()=>{
 S.validateProblems(registry);S.validateSolutions({schema:'simulatte.interviewSolutions.v1',solutions},registry,config);
 assert.equal(Object.keys(solutions).length,15);
 for(const [id,solution] of Object.entries(solutions)){
  const problem=registry.problems.find(p=>p.solutionId===id);assert.ok(['authored-practice','candidate-reported','company-published'].includes(problem.sourceKind));assert.equal(problem.solutionId,id);
  assert.equal(solution.steps.length,8);
  for(const step of solution.steps){
   const diagram=JSON.parse(fs.readFileSync(path.join(publicRoot,step.diagramPath),'utf8'));
   if(step.kind==='design'){assert.equal(diagram.schema,D.DESIGN_SCHEMA);assert.ok(diagram.intent.outcome);assert.ok(diagram.nodes.length>0);continue;}
   const a=run(diagram),b=run(diagram);assert.equal(a.view.error,null,`${id}: ${step.name}`);
   assert.ok(a.view.global.offered>0,`${id}: actual source requests required`);
   assert.ok(a.view.global.completed>0,`${id}: actual successful work required`);
   assert.deepEqual(a.state,b.state,`${id}: deterministic execution`);
   assert.ok(a.view.attempts.length>0,`${id}: real calls required`);
  }
 }
});
test('comments retain their parent tree and repeated votes never inflate a score',()=>{
 const r=run(example('reddit-comments')),k=stateFor(r,'commentStore');assert.equal(Object.keys(k.comments).length,8);
 assert.equal(k.comments['"item-3"'].parent,'item-1');
 for(const comment of Object.values(k.comments))assert.equal(comment.score,1);
 assert.equal(Object.keys(k.votes).length,8);assert.ok(k.duplicates>=8);
 const readers=stateFor(r,'operationSource');assert.ok(readers.completed>0);
});
test('stories check audiences, expire visible state and reject all late reads',()=>{
 const d=example('meta-stories'),r=run(d),k=stateFor(r,'storyStore');assert.equal(k.expired.length,3);assert.equal(Object.keys(k.stories).length,0);assert.ok(k.denied>0);
 assert.equal(r.state.kernel['late-viewers'].failed,3);assert.ok(r.state.kernel.viewers.completed>0);
 const early=run(d,3);assert.ok(Object.keys(stateFor(early,'storyStore').stories).length>0);
});
test('stock conservation holds at every time; duplicate payments cannot oversell and expired holds recover',()=>{
 const d=example('amazon-flash-sale'),c=D.compile(d,L,config),s=E.initialize(c,deps),id=c.nodes.find(n=>n.kernel==='inventoryReservations').id;
 for(let t=0;t<=20;t+=.25){E.advance(c,s,t,deps);const k=s.kernel[id],held=Object.values(k.reservations).filter(r=>r.status==='reserved').length;assert.equal(k.available+k.sold+held,4);assert.ok(k.available>=0);assert.ok(k.sold<=4);}
 const k=s.kernel[id];assert.equal(k.sold,2);assert.equal(k.available,2);assert.ok(k.expired>=2);assert.ok(s.kernel['new-shoppers'].completed>0);
});
test('presence renewals survive obsolete timeouts and only subscribed watchers receive changes',()=>{
 const d=example('microsoft-presence'),early=run(d,5.2),k=stateFor(early,'presenceBroker');assert.ok(Object.values(k.users).every(r=>r.status==='active'));
 const final=stateFor(run(d),'presenceBroker');assert.ok(Object.values(final.users).every(r=>r.status==='offline'));assert.equal(final.expired,2);assert.equal(final.notifications,8);assert.equal(Object.keys(final.subscriptions).length,4);
});
test('network degradation causes actual rendition changes and all video cohorts finish',()=>{
 const r=run(example('netflix-streaming'));assert.ok(r.state.kernel['viewers-east'].bitrateSwitches>0);assert.equal(r.state.kernel['viewers-east'].completedViewers,8);assert.equal(r.view.global.failed,0);
 const cache=r.state.kernel['cdn-east'].cache;assert.ok(Object.values(cache).some(row=>row.segmentKiB===16));
 assert.ok(Object.keys(cache).every(key=>key.includes(':16')||key.includes(':64')));
});
test('an accepted final solution verifies against coordinator replay',async()=>{
 const runner=await Runner.create({diagram:example('amazon-flash-sale'),...deps});
 try{runner.advanceTo(20);assert.equal((await runner.verify()).status,'match');}finally{await runner.dispose();}
});
test('unknown solution paths or missing references cannot be admitted',()=>{
 const bad=structuredClone({schema:'simulatte.interviewSolutions.v1',solutions});bad.solutions['reddit-comments'].steps[0].diagramPath='https://example.com/not-a-local-stage';assert.throws(()=>S.validateSolutions(bad,registry,config),/Invalid solution/);
 const missing=structuredClone(registry);missing.problems[0].solutionId='missing';assert.throws(()=>S.validateSolutions({schema:'simulatte.interviewSolutions.v1',solutions},missing,config),/Missing solution/);
});

test('removing the execution path prevents successful comments instead of manufacturing a solution result',()=>{
 const d=example('reddit-comments');d.edges=d.edges.filter(e=>e.id!=='post'&&e.id!=='vote'&&e.id!=='read');
 const r=run(d);assert.equal(Object.keys(stateFor(r,'commentStore').comments).length,0);assert.equal(r.view.global.completed,0);assert.ok(r.view.global.failed>0);
});

test('adaptive playback refuses a missing rendition instead of silently treating a flag as implemented',()=>{
 const d=example('netflix-streaming');d.nodes.find(n=>n.id==='viewers').params.lowSegmentKiB=0;
 assert.throws(()=>run(d),/adaptive bitrate requires a manifest and a smaller positive rendition/);
});
