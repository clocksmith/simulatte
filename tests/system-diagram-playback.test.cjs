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
