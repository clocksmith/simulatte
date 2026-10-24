import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

// Plans supply independent goldens and UI inputs, never a diagram to inject into the application.
export async function authorFamilyJourneys(api) {
  const {root,row,viewport,evaluate,until,doc,snapshot,point,tapAt,click,button,set,drag,shot,key,selectNode,selectEdge,port}=api;
  const plans=JSON.parse(await fs.readFile(root+'tests/fixtures/system-diagram-blank-journeys.json','utf8'));
  const rich=JSON.parse(await fs.readFile(root+'tests/fixtures/system-diagram-rich-journeys.json','utf8'));
  for(const family of rich.families){const index=plans.families.findIndex(p=>p.id===family.id);assert.ok(index>=0);plans.families[index]=family;}
  assert.equal(plans.schema,'simulatte.blankJourneyPlans.v1');
  assert.equal(plans.families.length,6,'The independent plans must cover all six representative families');
  row.authoredFamilies=[];
  async function open(selector) {if(!await evaluate(`document.querySelector(${JSON.stringify(selector)}).open`))await click(selector+'>summary');}
  async function close(selector) {if(await evaluate(`document.querySelector(${JSON.stringify(selector)}).open`))await click(selector+'>summary');}
  async function pause() {if(await evaluate('document.body.dataset.running===\'true\''))await button('Pause');}
  async function run() {
    const label=await evaluate(`document.querySelector('#playback button').textContent`);
    assert.ok(['Run','Restart','Accept & run'].includes(label));await button(label);await pause();
    const v=await snapshot();assert.ok(v,'Run must create an accepted executable state');assert.equal(v.error,null,await evaluate('document.getElementById("editor-status").textContent'));
  }
  async function finish(horizon) {let guard=0;while((await snapshot()).t<horizon-1e-9){assert.ok(++guard<=Math.ceil(horizon)+2);await button('Step 1 s');const v=await snapshot();assert.equal(v.error,null);}assert.equal((await snapshot()).t,horizon);}
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
  async function causal(family,variant) {
    const view=await snapshot();if(!view.requests.length)return;
    const previous=family.baselineInspection?.request?.id;
    const request=variant==='repair'&&previous?view.requests.find(r=>r.id===previous):view.requests.find(r=>r.status==='failed')||view.requests.find(r=>r.backgroundPending>0)||view.requests[0];
    assert.ok(request);
    const selector=await evaluate(`(()=>{const id=${JSON.stringify(request.id)},b=[...document.querySelectorAll('#requests button')].find(b=>b.textContent.startsWith(id+' ·'));if(!b)throw Error('Causal request is not rendered: '+id);b.dataset.auditRequest='selected';return '[data-audit-request="selected"]';})()`);
    await click(selector);await evaluate(`document.querySelector('[data-audit-request="selected"]')?.removeAttribute('data-audit-request')`);
    const history=await evaluate(`document.getElementById('history').textContent`),inspector=await evaluate(`document.getElementById('inspector').textContent`);
    assert.ok(history.length>10,'Every authored family exposes causal request history');assert.ok(inspector.includes(request.status),'Inspector status comes from the selected request record');
    assert.ok(Object.values(family.nodeIds).some(id=>id!==request.sourceId&&history.includes(id)),'Causal history names an actual downstream authored node');
    if(request.status==='failed')assert.match(history,/failed|rejected|quarantin|timeout|invalid|drop|outbox|error/i,'Inspect the failure, not an unrelated successful request');
    if(request.backgroundPending>0)assert.ok(request.blockers?.some(b=>inspector.includes(b.kind)),'Retained background blocker is visible in the inspector');
    family[variant+'Inspection']={request,inspector,history};
  }
  for(const plan of plans.families){
    const family={id:plan.id,label:plan.label,derivation:plan.derivation,checks:{},nodeIds:{},edgeIds:{},authoringActions:[],pass:false};row.authoredFamilies.push(family);
    try{
      await pause();await close('#fault-panel');await close('#document-panel');await set('preset','blank',{operation:true});
      assert.equal((await doc()).nodes.length,0);assert.equal((await doc()).edges.length,0);family.checks.blankStart=true;
      await evaluate(`document.getElementById('diagram').focus()`);await key('Escape','Escape',27);
      await set('diagram-name',plan.label);await set('workload-seed',plan.seed);await set('workload-horizon',plan.horizonSec);await button('Apply diagram');
      const columns=plan.nodes.length<=3?plan.nodes.length:plan.nodes.length<=6?2:3,rows=Math.ceil(plan.nodes.length/columns);
      if(plan.nodes.length>6){for(let i=0;i<4;i++)await button('−');}
      const xs=columns===1?[.5]:columns===2?[.24,.76]:[.16,.5,.84];
      for(let index=0;index<plan.nodes.length;index++){
        const item=plan.nodes[index],selector=`.palette-item[data-class-id="${item.classId}"]`;
        await set('palette-search','');await until(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
        await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start',inline:'center'});scrollTo(0,document.querySelector('.palette-panel').getBoundingClientRect().top+scrollY-10)`);
        const before=(await doc()).nodes.length;
        const ratioX=xs[index%columns],ratioY=rows===1?.45:.12+Math.floor(index/columns)*(.76/(rows-1));
        await drag(await point(selector,{scroll:false}),await point('#diagram',{ratioX,ratioY,scroll:false}));
        const next=await doc();assert.equal(next.nodes.length,before+1,`${plan.id}: palette drag adds ${item.classId}`);
        const node=next.nodes.at(-1);assert.equal(node.classId,item.classId);family.nodeIds[item.id]=node.id;family.authoringActions.push({kind:'palette-drag',classId:item.classId,id:node.id,input:viewport.width<700?'touch':'mouse'});
        await nodeParams(node.id,item.params||{});
      }
      family.checks.nativePaletteAuthoring=true;
      await button('Fit');
      for(const item of plan.edges){
        const from=family.nodeIds[item.from],to=family.nodeIds[item.to],before=(await doc()).edges.length;
        assert.ok(from&&to,'Fixture endpoints resolve to nodes that were actually added');
        await point('#diagram');await drag(await port(from,item.fromPort),await port(to,item.toPort));
        const next=await doc();assert.equal(next.edges.length,before+1,`${plan.id}: native port gesture creates ${item.id}`);
        const edge=next.edges.at(-1);assert.deepEqual(edge.from,{nodeId:from,portId:item.fromPort});assert.deepEqual(edge.to,{nodeId:to,portId:item.toPort});family.edgeIds[item.id]=edge.id;
        family.authoringActions.push({kind:'port-drag',id:edge.id,from:edge.from,to:edge.to,input:viewport.width<700?'touch':'mouse'});
        if(Object.keys(item.params||{}).length)await edgeParams(edge.id,item.params);
      }
      family.checks.nativeTypedPortTopology=true;
      if(plan.faults.length){
        await open('#fault-panel');
        for(const fault of plan.faults){
          const targetId=(fault.target.kind==='edge'?family.edgeIds:family.nodeIds)[fault.target.id];assert.ok(targetId);
          await set('fault-target',fault.target.kind+'|'+targetId);await set('fault-type',fault.type);await set('fault-at',fault.atSec);await set('fault-until',fault.untilSec===null?'':fault.untilSec);
          for(const[key,value]of Object.entries(fault.params||{}))await set('fault-param-'+key,value);
          const before=(await doc()).faults.length;await button('Schedule fault');assert.equal((await doc()).faults.length,before+1);
        }
        await close('#fault-panel');
      }
      family.checks.authoredFailureInputs=true;family.authoredBaseline=await doc();
      assert.equal(family.authoredBaseline.nodes.length,plan.nodes.length);assert.equal(family.authoredBaseline.edges.length,plan.edges.length);
      await button('Capture baseline');assert.deepEqual(await evaluate('SimulatteSystemDiagramEditor.baseline()'),family.authoredBaseline);
      await run();await button('Reset');const observation=plan.checkpointAtSec??.01,current=(await snapshot()).t;assert.ok(current<=observation,`${plan.id}: pause before authored checkpoint observation`);await set('advance-duration',observation-current);await button('Advance');
      await button('Checkpoint');family.interrupted=await snapshot();assert.ok(family.interrupted.t<plan.horizonSec,'Checkpoint is before the bounded terminal horizon');
      await finish(plan.horizonSec);family.baseline=await snapshot();expected(family.baseline,plan.expected.baseline,family,plan.id+'.baseline');family.checks.independentBaselineOutcome=true;
      await causal(family,'baseline');await button('Replay');assert.match(await evaluate('document.getElementById("editor-status").textContent'),/Exact replay matched/);family.checks.baselineReplay=true;
      await button('Restore');assert.deepEqual(await snapshot(),family.interrupted);family.checks.interruptedCheckpointRestore=true;
      await button('Save');const saved=await doc();await selectNode(family.nodeIds[plan.nodes.at(-1).id]);await button('Duplicate');assert.equal((await doc()).nodes.length,saved.nodes.length+1);await button('Load');assert.deepEqual(await doc(),saved);
      await open('#document-panel');await button('Restore loaded replay');assert.deepEqual(await snapshot(),family.interrupted);await close('#document-panel');family.checks.saveLoadAcceptedCheckpoint=true;
      const accepted=await evaluate('SimulatteSystemDiagramEditor.accepted()');
      for(const[id,values]of Object.entries(plan.repair.nodes||{}))await nodeParams(family.nodeIds[id],values);
      for(const[id,values]of Object.entries(plan.repair.edges||{}))await edgeParams(family.edgeIds[id],values);
      family.authoredRepair=await doc();assert.deepEqual(await evaluate('SimulatteSystemDiagramEditor.accepted()'),accepted);family.checks.pendingRepairPreservesAcceptedRun=true;
      await button('Compare repair');const comparison=await evaluate('SimulatteSystemDiagramEditor.comparison()');assert.ok(comparison,await evaluate('document.getElementById("editor-status").textContent'));
      assert.deepEqual(comparison.baseline.arrivals,comparison.repair.arrivals);assert.deepEqual(comparison.faults,family.authoredBaseline.faults);assert.equal(comparison.seed,plan.seed);
      expected(comparison.baseline,plan.expected.baseline,family,plan.id+'.comparison.baseline');expected(comparison.repair,plan.expected.repair,family,plan.id+'.comparison.repair');assert.deepEqual(await snapshot(),family.interrupted);
      family.comparison=comparison;family.checks.sameWorkloadAndFaultComparison=true;family.checks.independentRepairPrediction=true;
      await run();await finish(plan.horizonSec);family.repair=await snapshot();expected(family.repair,plan.expected.repair,family,plan.id+'.actualRepair');family.checks.actualRepairExecuted=true;
      for(const fault of plan.faults)if(fault.untilSec!==null&&fault.untilSec<=plan.horizonSec){const id=(fault.target.kind==='edge'?family.edgeIds:family.nodeIds)[fault.target.id],state=fault.target.kind==='edge'?family.repair.edges[id]:family.repair.nodes[id];assert.ok(!state.faults.includes(fault.type),`${plan.id}: scheduled recovery cleared ${fault.type}`);}
      family.checks.boundedRecovery=true;await causal(family,'repair');await button('Replay');assert.match(await evaluate('document.getElementById("editor-status").textContent'),/Exact replay matched/);family.checks.repairReplay=true;
      if(plan.malformedProbe){
        for(const[id,values]of Object.entries(plan.malformedProbe.nodes||{}))await nodeParams(family.nodeIds[id],values);
        await run();await finish(plan.horizonSec);family.malformedProbe=await snapshot();expected(family.malformedProbe,plan.malformedProbe.expected,family,plan.id+'.malformedProbe');await causal(family,'malformed');await button('Replay');assert.match(await evaluate('document.getElementById("editor-status").textContent'),/Exact replay matched/);family.checks.malformedPayloadBudget=true;
      }
      if(plan.staleProbe){
        for(const[id,values]of Object.entries(plan.malformedProbe?.nodes||{})){
          const actualId=family.nodeIds[id],original=family.authoredRepair.nodes.find(n=>n.id===actualId);await selectNode(actualId);await button('Instance overrides');
          for(const key of Object.keys(values)){const value=Object.hasOwn(original.params,key)?original.params[key]:await evaluate(`document.getElementById(${JSON.stringify('property-'+key)}).tagName==='SELECT'?'__inherit':''`);await set('property-'+key,value);}await button('Apply overrides');
        }
        for(const[id,values]of Object.entries(plan.repair.nodes||{}))await nodeParams(family.nodeIds[id],values);
        for(const[id,values]of Object.entries(plan.staleProbe.nodes||{}))await nodeParams(family.nodeIds[id],values);
        await run();await finish(plan.horizonSec);family.staleProbe=await snapshot();expected(family.staleProbe,plan.staleProbe.expected,family,plan.id+'.staleProbe');await causal(family,'stale');await button('Replay');assert.match(await evaluate('document.getElementById("editor-status").textContent'),/Exact replay matched/);family.checks.staleIndexVisibility=true;
      }
      assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);await point('#diagram');await shot(plan.id+'-authored');await point('#comparison-panel');await shot(plan.id+'-comparison');family.pass=true;
      console.log(`${viewport.width}: ${plan.id} authored from blank; independent baseline/repair outcomes, recovery and replay passed`);
    }catch(error){family.error=error.stack;throw error;}
  }
  assert.ok(row.authoredFamilies.every(f=>f.pass));row.checks.sixFamiliesAuthoredFromBlank=true;row.checks.independentPairedFamilyOutcomes=true;
}
