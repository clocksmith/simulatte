const test=require('node:test'),assert=require('node:assert/strict');
const model=require('../public/shared/plugins/gpu-supercluster/index.js');
const workload=require('../public/shared/plugins/gpu-supercluster/workload.js');
const controllerApi=require('../public/simulatte/app/tier-run-controller.js');
const result=model.simulate();
const advance=(state,time)=>{while(state.timeMs<time)workload.step(state);return workload.snapshot(state);};
test('a live straggler blocks the collective, accumulates waits, and removal releases dependent racks',()=>{
 const base=workload.create(result),slow=workload.create(result);
 workload.intervene(slow,'R1-1',95);
 advance(base,8);advance(slow,8);
 assert.equal(base.communicating,true);assert.equal(slow.communicating,false);
 assert.ok(slow.racks.slice(1).every(r=>r.task==='waiting'&&r.waitingFor.includes('R1-1')));
 const waits=slow.totalWaitMs;assert.ok(waits>0);
 advance(slow,60);workload.intervene(slow,'R1-1',0);advance(slow,64);assert.equal(slow.communicating,true);
 advance(base,400);advance(slow,400);assert.ok(slow.iteration<base.iteration);assert.ok(slow.totalWaitMs>base.totalWaitMs);
 const replay=workload.create(result,slow.actions);assert.deepEqual(advance(replay,400),workload.snapshot(slow));
 assert.throws(()=>workload.intervene(slow,'R1-1',95),/finished/);
});
test('live actions survive controller seek, replay, settlement, and persisted reload',async()=>{
 const scenario={id:'gpt4-3d-parallelism',seed:'test-live-actions'},store=new Map();
 const storage={getItem:key=>store.get(key),setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)};
 let instance;
 const resetRuntime=async()=>{instance=await model.activate({scenario});};await resetRuntime();
 const runtime={activePluginIds:['gpu-supercluster'],dispatchAction:(_id,action,context)=>instance.handleAction(action,context),
 platformV4:()=>({contributions:[{...instance.contributeV4(),controls:{comparisons:[]}}]}),settle:()=>instance.settle()};
 const options={getRuntime:()=>runtime,ownerPluginId:'gpu-supercluster',scenario,profileId:'test',comparisonRequired:false,resetRuntime,storage,
 render(){},buildReceipt:args=>({schema:'test-receipt',profileId:'test',scenario,...args}),setTimer:()=>1,clearTimer(){}};
 const controller=controllerApi.createController(options);await controller.start();controller.pause();
 for(let i=0;i<2;i++)await controller.step();
 await controller.intervene('scenario.intervene',{rackId:'R1-1',slowdown:95});
 for(let i=0;i<10;i++)await controller.step();
 const active=instance.contributeV4();await controller.seek(12);assert.deepEqual(instance.contributeV4(),active);
 await controller.intervene('scenario.intervene',{rackId:'R1-1',slowdown:0});
 await controller.seek(400);await controller.resume();const receipt=controller.receipt();assert.equal(receipt.simulationActions.length,2);
 await controller.replay();controller.pause();await controller.seek(400);await controller.resume();
 assert.deepEqual(controller.receipt().actionResult.scenario.workload,receipt.actionResult.scenario.workload);
 controller.dispose();await resetRuntime();const restored=controllerApi.createController(options);assert.equal(await restored.restore(),true);
 assert.deepEqual(restored.receipt().actionResult.scenario.workload,receipt.actionResult.scenario.workload);restored.dispose();
});
