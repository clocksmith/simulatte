import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

// Plans supply independent goldens and UI inputs, never a diagram to inject into the application.
export async function authorFamilyJourneys(api) {
  const {root,row,viewport,evaluate,until,doc,snapshot,runState,settle,collapseRail,connect,point,click,button,dialogButton,closeDialog,discardIfAsked,runMenu,restart,step,advanceTo,verifyReplay,runSettings,scheduleFault,captureBaseline,compareRepair,loadSaved,set,drag,shot,selectNode,selectEdge,port}=api;
  const plans=JSON.parse(await fs.readFile(root+'tests/fixtures/system-diagram-blank-journeys.json','utf8'));
  const rich=JSON.parse(await fs.readFile(root+'tests/fixtures/system-diagram-rich-journeys.json','utf8'));
  for(const family of rich.families){const index=plans.families.findIndex(p=>p.id===family.id);assert.ok(index>=0);plans.families[index]=family;}
  assert.equal(plans.schema,'simulatte.blankJourneyPlans.v1');
  assert.equal(plans.families.length,6,'The independent plans must cover all six representative families');
  row.authoredFamilies=[];
  const closeProperties=async()=>{if(!await evaluate(`document.getElementById('properties-drawer').inert`))await click('#properties-toggle');};
  async function run(){await closeProperties();await restart();const v=await snapshot();assert.ok(v,'Restart must create an accepted executable state');assert.equal(v.error,null,await evaluate('document.getElementById("editor-status").textContent'));}
  async function finish(horizon){let guard=0;while((await runState()).time<horizon-1e-9){assert.ok(++guard<=Math.ceil(horizon*2)+2);await step();assert.equal((await snapshot()).error,null);}assert.equal((await snapshot()).t,horizon);}
  function subset(actual,wanted,context){for(const[key,value]of Object.entries(wanted)){if(value&&typeof value==='object'&&!Array.isArray(value)){assert.ok(actual?.[key]&&typeof actual[key]==='object',context+'.'+key);subset(actual[key],value,context+'.'+key);}else assert.equal(actual?.[key],value,`${context}.${key}: independent fixture prediction`);}}
  function expected(actual,wanted,family,context){const{nodes,...metrics}=wanted;subset(actual.global||actual.metrics,metrics,context+'.metrics');for(const[id,values]of Object.entries(nodes||{}))subset(actual.nodes[family.nodeIds[id]],values,context+'.nodes.'+id);}
  async function nodeParams(id,values) {
    await selectNode(id);await button('Instance overrides');
    for(const[key,value]of Object.entries(values))await set('property-'+key,value);
    await button('Apply overrides');
    const actual=(await doc()).nodes.find(n=>n.id===id);
    for(const[key,value]of Object.entries(values))assert.equal(actual.params[key],value,`Property UI must preserve ${key}`);
  }
  async function edgeParams(id,values) {
    await selectEdge(id);for(const[key,value]of Object.entries(values))await set('property-'+key,value);await button('Apply connection');
    const actual=(await doc()).edges.find(e=>e.id===id);for(const[key,value]of Object.entries(values))assert.equal(actual.params[key],value,`Connection property ${key}`);
  }
  // Request records come from the Run menu; the detail names the actual delivery path and status.
  async function causal(family,variant) {
    const view=await snapshot();if(!view.requests.length)return;
    const previous=family.baselineInspection?.request?.id;
    const request=variant==='repair'&&previous?view.requests.find(r=>r.id===previous):view.requests.find(r=>r.status==='failed')||view.requests.find(r=>r.backgroundPending>0)||view.requests[0];
    assert.ok(request);
    await runMenu('requests');const selector=`.simulation-request-row[data-request-id="${request.id}"]`;
    if(!await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)){await closeDialog();return;}
    await click(selector);const detail=await evaluate(`document.querySelector('dialog.simulation-records').innerText`);await closeDialog();
    const labels=Object.values(family.nodeIds).filter(id=>id!==request.sourceId).map(id=>family.labels[id]);
    assert.ok(detail.includes(`Request ${request.id}`),'Detail belongs to the selected request');assert.match(detail,/Delivery attempts/);
    assert.ok(labels.some(label=>detail.includes(label)),'Causal detail names an actual downstream authored component');
    if(request.status==='failed')assert.match(detail,/failed|rejected|quarantin|timeout|invalid|drop|outbox|error/i,'Inspect the failure, not an unrelated successful request');
    family[variant+'Inspection']={request,detail};
  }
  for(const plan of plans.families){
    const family={id:plan.id,label:plan.label,derivation:plan.derivation,checks:{},nodeIds:{},edgeIds:{},labels:{},authoringActions:[],pass:false};row.authoredFamilies.push(family);
    try{
      await closeProperties();
      for(const preset of (await evaluate(`document.getElementById('preset').value`))==='blank'?['web-service','blank']:['blank']){await set('preset',preset);await discardIfAsked();await until(`SimulatteSystemDiagramEditor.document().nodes.length ${preset==='blank'?'===0':'>0'}`);}
      assert.equal((await doc()).nodes.length,0);assert.equal((await doc()).edges.length,0);family.checks.blankStart=true;
      await set('diagram-name',plan.label);await until(`SimulatteSystemDiagramEditor.document().name===${JSON.stringify(plan.label)}`);
      await runSettings({seed:plan.seed,horizonSec:plan.horizonSec});
      const columns=plan.nodes.length<=3?plan.nodes.length:plan.nodes.length<=6?2:3,rows=Math.ceil(plan.nodes.length/columns);
      if(plan.nodes.length>6){for(let i=0;i<4;i++)await button('−');}
      const xs=columns===1?[.5]:columns===2?[.24,.76]:[.16,.5,.84];
      for(let index=0;index<plan.nodes.length;index++){
        const item=plan.nodes[index],selector=`.palette-item[data-class-id="${item.classId}"]`;
        if(viewport.width<700)await collapseRail();else if(await evaluate(`document.body.dataset.paletteExpanded!=='true'`))await click('#palette-toggle');
        await set('palette-search','');await until(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
        await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`);
        const before=(await doc()).nodes.length;
        const ratioX=xs[index%columns],ratioY=rows===1?.45:.12+Math.floor(index/columns)*(.76/(rows-1));
        await drag(await point(selector,{scroll:false}),await point('#diagram',{ratioX,ratioY,scroll:false}));
        const next=await doc();assert.equal(next.nodes.length,before+1,`${plan.id}: palette drag adds ${item.classId}`);
        const node=next.nodes.at(-1);assert.equal(node.classId,item.classId);family.nodeIds[item.id]=node.id;family.labels[node.id]=node.label;family.authoringActions.push({kind:'palette-drag',classId:item.classId,id:node.id,input:viewport.width<700?'touch':'mouse'});
        await nodeParams(node.id,item.params||{});
      }
      family.checks.nativePaletteAuthoring=true;
      await closeProperties();await collapseRail();await button('Fit');await settle();
      for(const item of plan.edges){
        const from=family.nodeIds[item.from],to=family.nodeIds[item.to],before=(await doc()).edges.length;
        assert.ok(from&&to,'Fixture endpoints resolve to nodes that were actually added');
        const input=await connect(from,item.fromPort,to,item.toPort);
        await until(`SimulatteSystemDiagramEditor.document().edges.length===${before+1}`).catch(()=>{});const next=await doc();assert.equal(next.edges.length,before+1,`${plan.id}: native port gesture creates ${item.id}`);
        const edge=next.edges.at(-1);assert.deepEqual(edge.from,{nodeId:from,portId:item.fromPort});assert.deepEqual(edge.to,{nodeId:to,portId:item.toPort});family.edgeIds[item.id]=edge.id;
        family.authoringActions.push({kind:input==='keyboard'?'port-keyboard':'port-drag',id:edge.id,from:edge.from,to:edge.to,input});
        if(Object.keys(item.params||{}).length){await edgeParams(edge.id,item.params);await closeProperties();}
      }
      family.checks.nativeTypedPortTopology=true;
      for(const fault of plan.faults){
        const targetId=(fault.target.kind==='edge'?family.edgeIds:family.nodeIds)[fault.target.id];assert.ok(targetId);
        await scheduleFault({kind:fault.target.kind,id:targetId,type:fault.type,atSec:fault.atSec,untilSec:fault.untilSec,params:fault.params||{}});
      }
      family.checks.authoredFailureInputs=true;family.authoredBaseline=await doc();
      assert.equal(family.authoredBaseline.nodes.length,plan.nodes.length);assert.equal(family.authoredBaseline.edges.length,plan.edges.length);
      const baseline=await captureBaseline();assert.deepEqual(baseline.diagram.faults,family.authoredBaseline.faults);assert.equal(baseline.diagram.seed,plan.seed);
      await run();const observation=plan.checkpointAtSec??.01;await advanceTo(observation);
      await runMenu('checkpoint');await until(`SimulatteSystemDiagramEditor.playback.controller.state().checkpointSec===${observation}`);family.interrupted=await snapshot();assert.ok(family.interrupted.t<plan.horizonSec,'Checkpoint is before the bounded terminal horizon');
      await finish(plan.horizonSec);family.baseline=await snapshot();expected(family.baseline,plan.expected.baseline,family,plan.id+'.baseline');family.checks.independentBaselineOutcome=true;
      await causal(family,'baseline');await verifyReplay();family.checks.baselineReplay=true;
      await runMenu('restore');await until(`SimulatteSystemDiagramEditor.playback.controller.state().time===${observation}`);assert.deepEqual(await snapshot(),family.interrupted);family.checks.interruptedCheckpointRestore=true;
      await button('Save');const saved=await doc();await selectNode(family.nodeIds[plan.nodes.at(-1).id]);await closeProperties();await button('Duplicate');assert.equal((await doc()).nodes.length,saved.nodes.length+1);await loadSaved();
      await until(`SimulatteSystemDiagramEditor.document().nodes.length===${saved.nodes.length}`);assert.deepEqual({...await doc(),view:null},{...saved,view:null});
      await run();await advanceTo(observation);assert.deepEqual(await snapshot(),family.interrupted,'the saved document replays to the identical interrupted state');family.checks.saveLoadReplaysCheckpoint=true;
      for(const[id,values]of Object.entries(plan.repair.nodes||{}))await nodeParams(family.nodeIds[id],values);
      for(const[id,values]of Object.entries(plan.repair.edges||{}))await edgeParams(family.edgeIds[id],values);
      await closeProperties();family.authoredRepair=await doc();
      assert.equal((await runState()).accepted,false);assert.deepEqual(await evaluate('SimulatteSystemDiagramEditor.playback.baseline()'),baseline);family.checks.pendingRepairKeepsBaseline=true;
      const comparison=await compareRepair();
      assert.deepEqual(comparison.baseline.arrivals,comparison.repair.arrivals);assert.deepEqual(comparison.faults,family.authoredBaseline.faults);assert.equal(comparison.seed,plan.seed);
      expected(comparison.baseline,plan.expected.baseline,family,plan.id+'.comparison.baseline');expected(comparison.repair,plan.expected.repair,family,plan.id+'.comparison.repair');
      await shot(plan.id+'-comparison');await closeDialog();
      family.comparison=comparison;family.checks.sameWorkloadAndFaultComparison=true;family.checks.independentRepairPrediction=true;
      await run();await finish(plan.horizonSec);family.repair=await snapshot();expected(family.repair,plan.expected.repair,family,plan.id+'.actualRepair');family.checks.actualRepairExecuted=true;
      for(const fault of plan.faults)if(fault.untilSec!==null&&fault.untilSec<=plan.horizonSec){const id=(fault.target.kind==='edge'?family.edgeIds:family.nodeIds)[fault.target.id],state=fault.target.kind==='edge'?family.repair.edges[id]:family.repair.nodes[id];assert.ok(!state.faults.includes(fault.type),`${plan.id}: scheduled recovery cleared ${fault.type}`);}
      family.checks.boundedRecovery=true;await causal(family,'repair');await verifyReplay();family.checks.repairReplay=true;
      if(plan.malformedProbe){
        for(const[id,values]of Object.entries(plan.malformedProbe.nodes||{}))await nodeParams(family.nodeIds[id],values);
        await run();await finish(plan.horizonSec);family.malformedProbe=await snapshot();expected(family.malformedProbe,plan.malformedProbe.expected,family,plan.id+'.malformedProbe');await causal(family,'malformed');await verifyReplay();family.checks.malformedPayloadBudget=true;
      }
      if(plan.staleProbe){
        for(const[id,values]of Object.entries(plan.malformedProbe?.nodes||{})){
          const actualId=family.nodeIds[id],original=family.authoredRepair.nodes.find(n=>n.id===actualId);await selectNode(actualId);await button('Instance overrides');
          for(const key of Object.keys(values)){const value=Object.hasOwn(original.params,key)?original.params[key]:await evaluate(`document.getElementById(${JSON.stringify('property-'+key)}).tagName==='SELECT'?'__inherit':''`);await set('property-'+key,value);}await button('Apply overrides');
        }
        for(const[id,values]of Object.entries(plan.repair.nodes||{}))await nodeParams(family.nodeIds[id],values);
        for(const[id,values]of Object.entries(plan.staleProbe.nodes||{}))await nodeParams(family.nodeIds[id],values);
        await run();await finish(plan.horizonSec);family.staleProbe=await snapshot();expected(family.staleProbe,plan.staleProbe.expected,family,plan.id+'.staleProbe');await causal(family,'stale');await verifyReplay();family.checks.staleIndexVisibility=true;
      }
      assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);await point('#diagram');await shot(plan.id+'-authored');family.pass=true;
      console.log(`${viewport.width}: ${plan.id} authored from blank; independent baseline/repair outcomes, recovery and replay passed`);
    }catch(error){family.error=error.stack;throw error;}
  }
  assert.ok(row.authoredFamilies.every(f=>f.pass));row.checks.sixFamiliesAuthoredFromBlank=true;row.checks.independentPairedFamilyOutcomes=true;
}
