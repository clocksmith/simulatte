'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../public/simulatte/system-diagram/playback.js');
const config=require('../public/data/system-diagram/config.json');
const D=require('../public/simulatte/system-diagram/diagram.js');
const library=require('../public/simulatte/system-diagram/class-library.js').loadSync(require('path').resolve(__dirname,'../public/data/system-diagram'));
const Runner=require('../public/simulatte/system-diagram/runner.js'),kernels=require('../public/simulatte/system-diagram/kernels-all.js');
test('playback accepts the real graph, advances only while running, and clears before accepting an edit',async()=>{
 let diagram=structuredClone(require('../public/data/system-diagram/examples/amazon-flash-sale.json')),view=null;
 const controller=P.createController({getDiagram:()=>diagram,config,onView:v=>view=v,createRunner:d=>Runner.create({diagram:d,library,config,kernels})});
 try{
  await controller.play();assert.equal(controller.state().running,true);
  controller.tick(.5);assert.ok(view.t>0);const t=view.t;controller.pause();controller.tick(1);assert.equal(view.t,t);
  await controller.step();assert.equal(view.t,t+config.engine.authoritativeCadenceSec);
  await controller.clear();assert.equal(view,null);diagram.seed=43;await controller.play();
  controller.setSpeed(20);for(let i=0;i<30;i++)controller.tick(1);
  assert.equal(controller.state().running,false);assert.equal(view.t,20);assert.ok(view.global.offered>0);
  assert.equal((await controller.verify()).status,'match');assert.throws(()=>controller.setSpeed(999),/Unsupported/);
 }finally{await controller.clear();}
});
test('an old asynchronous acceptance cannot resurrect a cleared or replaced graph',async()=>{
 const diagram=D.emptyDiagram(config);let resolve,disposed=0;const views=[];
 const controller=P.createController({getDiagram:()=>diagram,config,onView:v=>views.push(v),createRunner:()=>new Promise(r=>resolve=r)});
 const pending=controller.play();await controller.clear();
 resolve({dispose:async()=>disposed++});await pending;
 assert.equal(disposed,1);assert.equal(controller.state().running,false);assert.deepEqual(views,[null]);
});

test('a checkpoint restores its own accepted run and is invalidated by restart or edits',async()=>{
 const diagram=structuredClone(require('../public/data/system-diagram/examples/amazon-flash-sale.json'));
 const controller=P.createController({getDiagram:()=>diagram,config,createRunner:d=>Runner.create({diagram:d,library,config,kernels})});
 try{
  await assert.rejects(controller.checkpoint(),/Simulate an architecture first/);
  await controller.step();await controller.step();await controller.step();
  const at=await controller.checkpoint(),saved=JSON.stringify(controller.view());
  assert.equal(at,3*config.engine.authoritativeCadenceSec);assert.equal(controller.state().checkpointSec,at);
  await controller.step();await controller.step();assert.notEqual(JSON.stringify(controller.view()),saved);
  assert.equal(await controller.restore(),at);assert.equal(JSON.stringify(controller.view()),saved,'restore returns the exact checkpointed view');
  assert.equal((await controller.verify()).status,'match');
  await controller.restart();assert.equal(controller.state().checkpointSec,null);
  await assert.rejects(controller.restore(),/Take a checkpoint of the current run first/);
  await controller.checkpoint();await controller.clear();
  await assert.rejects(controller.restore(),/Take a checkpoint/,'clearing for an edit drops the old checkpoint');
 }finally{await controller.clear();}
});

test('failure targets name connections by their endpoints instead of compiled IDs',()=>{
 const diagram=D.validate(structuredClone(require('../public/data/system-diagram/examples/nested-chat.json')),library,config);
 const compiled=D.compile(diagram,library,config),targets=P.faultTargets(compiled),edges=targets.filter(t=>t.kind==='edge');
 assert.equal(edges.length,compiled.edges.length);
 for(const edge of edges){assert.doesNotMatch(edge.label,/sub-[0-9a-f]{8}/);assert.match(edge.label,/ → /);}
 assert.equal(new Set(edges.map(e=>e.label)).size,edges.length,'duplicate endpoint pairs are disambiguated by port');
 assert.ok(edges.some(e=>e.label.startsWith('Chat client → ')));
});

test('advance pauses the accepted run at an exact fractional time within the horizon',async()=>{
 const diagram=structuredClone(require('../public/data/system-diagram/examples/amazon-flash-sale.json'));let view=null;
 const controller=P.createController({getDiagram:()=>diagram,config,onView:v=>view=v,createRunner:d=>Runner.create({diagram:d,library,config,kernels})});
 try{
  assert.equal(await controller.advanceTo(.06),.06);assert.equal(view.t,.06);assert.equal(controller.state().running,false);
  await assert.rejects(controller.advanceTo(.01),/Advance to a time from 0.06/,'time never moves backwards');
  await assert.rejects(controller.advanceTo(diagram.run.horizonSec+1),/Advance to a time/);
  assert.equal(await controller.checkpoint(),.06);
  await controller.step();assert.equal(await controller.restore(),.06);assert.equal((await controller.verify()).status,'match');
 }finally{await controller.clear();}
});
