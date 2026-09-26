const test=require('node:test'),assert=require('node:assert/strict');
const model=require('../public/shared/plugins/gpu-supercluster/index.js');
const workload=require('../public/shared/plugins/gpu-supercluster/workload.js');
const controllerApi=require('../public/simulatte/app/tier-run-controller.js');
const result=model.simulate();
const advance=(state,time)=>{while(state.timeMs<time)workload.step(state);return workload.snapshot(state);};
test('event integration converges without discarded substep work or shifted interventions',()=>{
 const fixture={topology:{racks:[{id:'a'},{id:'b'}]},config:{stragglerThrottlePercent:0},
  collectives:{computeTimeMs:2,tensorTransferMs:0,tensorCommunicationPlan:{durationMs:0,operation:'allreduce',rounds:[]},communicationPlan:{durationMs:1,operation:'allreduce',rounds:[]}}};
 const values=[1,.25,.1].map(dt=>{const state=workload.create(fixture);while(state.timeMs<12-1e-8)workload.step(state,dt);return workload.snapshot(state);});
 for(const s of values){assert.equal(s.iteration,4);assert.ok(Math.abs(s.totalWaitMs-.48)<1e-8);}
 const coarse=workload.create(fixture,[{atMs:1.5,rackId:'a',slowdown:95},{atMs:5,rackId:'a',slowdown:0}]);
 const fine=workload.create(fixture,coarse.actions);workload.step(coarse,12);for(let i=0;i<48;i++)workload.step(fine,.25);
 assert.equal(coarse.iteration,fine.iteration);assert.ok(Math.abs(coarse.totalWaitMs-fine.totalWaitMs)<1e-8);
 assert.throws(()=>workload.step(fine,NaN),/timestep/);
});
test('a live straggler blocks the collective, accumulates waits, and removal releases dependent racks',()=>{
 const base=workload.create(result),slow=workload.create(result);
 workload.intervene(slow,'R1-1',95);
 advance(base,8);advance(slow,8);
 assert.equal(base.communicating,true);assert.equal(slow.communicating,false);
 assert.ok(slow.racks.slice(1).every(r=>r.task==='waiting'&&r.waitingFor.includes('R1-1')));
 const waits=slow.totalWaitMs;assert.ok(waits>0);
 advance(slow,60);workload.intervene(slow,'R1-1',0);advance(slow,64);assert.equal(slow.communicating,true);
 advance(base,400);advance(slow,400);assert.equal(base.iteration,0);assert.equal(slow.iteration,0);assert.ok(slow.communication<base.communication);assert.ok(slow.totalWaitMs>base.totalWaitMs);
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

test('configured straggler node resolves to the same canonical rack shown by the scenario',()=>{
 const state=workload.create(model.simulate({stragglerNodeId:'R2-4-N1',stragglerThrottlePercent:50}));
 assert.deepEqual(state.racks.filter(r=>r.slowdown>0).map(r=>r.id),['R2-4']);
});


test('playback exposes physical transfers during both tensor and data communication', () => {
  const state = workload.create(result);
  const computeEnd = result.collectives.computeTimeMs;
  const tensorEnd = computeEnd + result.collectives.tensorTransferMs;
  workload.step(state, computeEnd + result.collectives.tensorTransferMs / 2);
  const tensor = workload.snapshot(state);
  assert.equal(tensor.communicationPhase, 'tensor');
  assert.ok(tensor.activeLinkIds.length > 0);
  assert.ok(tensor.activeLinkIds.every(id => id.startsWith('nvlink:')));
  workload.step(state, tensorEnd - state.timeMs + 0.01);
  const data = workload.snapshot(state);
  assert.equal(data.communicationPhase, 'data');
  assert.ok(data.activeLinkIds.length > 0);
  assert.ok(data.transfers.every(t => t.progress >= 0 && t.progress < 1));
});


test('tensor transfers across nodes become native contribution actors on the executed links', () => {
  const result = model.simulate({ totalGpus: 8, racks: 4, nodesPerRack: 1, gpusPerNode: 2,
    parallelism: { tensorParallel: 8, pipelineParallel: 1, dataParallel: 1 } });
  const state = workload.create(result);
  const railRound = result.collectives.tensorCommunicationPlan.rounds[0];
  const railStage = railRound.stages.find(stage => stage.links.some(link => link.id.startsWith('infiniband-ring:')));
  workload.step(state, result.collectives.computeTimeMs + railStage.startMs + railStage.durationMs / 2);
  const snapshot = workload.snapshot(state);
  assert.equal(snapshot.communicationPhase, 'tensor');
  const v4 = require('../public/shared/plugins/gpu-supercluster/v4-contribution.js');
  const contribution = v4.createContribution({ result, step: 1, workload: snapshot });
  const actors = contribution.presentation.layers.filter(layer => layer.id.startsWith('transfer:'));
  const rails = snapshot.transfers.filter(link => link.id.startsWith('infiniband-ring:'));
  assert.ok(rails.length > 0);
  assert.deepEqual(actors.map(layer => layer.id), rails.map(link => `transfer:${link.id}:${link.from}`));
  assert.ok(actors.every(layer => layer.quantity.value > 0 && layer.quantity.value < 1));
});
