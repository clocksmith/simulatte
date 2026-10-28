 'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const authors=require('../tools/simulatte/study-content-batch-02.cjs');
const {library}=require('../tools/simulatte/study-solution-author.cjs');
const {validateProblem}=require('../tools/simulatte/study-contract.cjs');
const consumer=require('../public/simulatte/system-diagram/study/composable-study.js');
const {audit}=require('../tools/simulatte/audit-study-spatial.cjs');
const docs=Object.values(authors).map(fn=>fn());
test('batch 02 directly validates exact replay and browser consumer',()=>{
 assert.equal(docs.length,4);assert.equal(Object.keys(authors).length,4);
 for(const d of docs){const r=validateProblem(d,library);assert.equal(r.solutions,2);assert.equal(r.stages,16);const parsed=consumer.parse(JSON.stringify(d));assert.equal(parsed.solutions.length,2);
 for(const sol of d.solutions){assert.equal(sol.stages.length,8);assert.ok(sol.apis.length>=2);assert.ok(sol.algorithms.length>=2);assert.ok(sol.stages.every(s=>s.operations.length&&s.invariants.length&&s.checkIds.length));
 for(const c of sol.acceptanceCases.filter(c=>c.evidence)){const file=path.resolve(__dirname,'..',c.evidence.testFile);assert.ok(fs.existsSync(file));assert.ok(fs.readFileSync(file,'utf8').includes(c.evidence.testName));}}
 }
});
test('batch 02 every stage and collapsed subsystem passes shared spatial checker',async()=>{const report=await audit(docs);assert.equal(report.ok,true,JSON.stringify(report.rows.filter(r=>!r.ok)));});
// Added assertions: each approach owns its command/read APIs, cases, stage checks and invariants, and every repaired
// mechanism is checked against the authored graph or the reference module so that removing it fails a test.
const byId=Object.fromEntries(docs.map(d=>[d.problem.referenceId,d])),solutionOf=(id,s)=>byId[id].solutions.find(x=>x.id===s),finalGraph=sol=>sol.stages.at(-1).graph;
function resolvePath(doc,graph,endpoint){const subs=new Map(doc.subsystems.map(s=>[s.id,s])),nodes=new Map(graph.nodes.map(n=>[n.id,n])),path=[endpoint.nodeId];let at=endpoint;for(;;){const n=nodes.get(at.nodeId),q=n?.subsystemId&&subs.get(n.subsystemId).ports.find(p=>p.id===at.portId);if(!q)return path;at=q.target;path.push(at.nodeId);}}
const edgesBetween=(doc,graph,from,to)=>graph.edges.filter(e=>resolvePath(doc,graph,e.from).includes(from)&&resolvePath(doc,graph,e.to).includes(to));
test('batch 02 cases, invariants and APIs belong to their approach and stage',()=>{
 for(const d of docs){
  const contracts=new Map(d.contracts.map(c=>[c.id,c])),requirementText=new Set(d.problem.requirements.map(r=>r.text)),all=d.problem.requirements.map(r=>r.id);
  for(const sol of d.solutions){
   const where=d.problem.referenceId+' '+sol.id,prefix=d.problem.referenceId.toLowerCase()+'.'+sol.id,caseIds=sol.acceptanceCases.map(c=>c.id);
   assert.equal(sol.apis.find(a=>a.method==='POST').request,JSON.stringify(contracts.get(prefix+'.c0').request),where);
   const reads=sol.apis.filter(a=>a.method==='GET');assert.ok(reads.length>0,where);
   for(const api of reads){assert.notEqual(api.request,JSON.stringify(contracts.get(prefix+'.c1').request),where);assert.doesNotMatch(api.request,/expected|remaining/i,where);}
   for(const stage of sol.stages)assert.ok(stage.checkIds.length<caseIds.length,where+' '+stage.id+' lists every case');
   assert.deepEqual(new Set(sol.stages.flatMap(s=>s.checkIds)),new Set(caseIds),where);
   for(const c of sol.acceptanceCases){assert.ok(c.relatedRequirementIds.length>0,where+' '+c.id);assert.ok(c.relatedRequirementIds.length<all.length,where+' '+c.id+' names every requirement');}
   const invariants=sol.stages.map(s=>s.invariants.join(' '));assert.equal(new Set(invariants).size,sol.stages.length,where);
   sol.stages.forEach((s,i)=>{assert.ok(!invariants[i].includes(s.reason),where+' '+s.id+' repeats its reason');assert.ok(!requirementText.has(invariants[i]),where+' '+s.id+' repeats a requirement');});
  }
  const [x,y]=d.solutions.map(s=>s.acceptanceCases.find(c=>c.id==='mechanism'));assert.notEqual(x.given+x.when,y.given+y.when,d.problem.referenceId+' mechanism case is shared');
 }
});
test('batch 02 authored algorithms quote the reference mechanisms',async()=>{
 const ref=await import('../tools/simulatte/study-reference/batch-02-mechanisms.mjs'),norm=s=>s.replace(/\s+/g,' ').trim();
 const quoted={L018:{online:{'bounded-rule':['citationGate']},materialized:{'bounded-rule':['citationGate']}},L021:{workflow:{'bounded-rule':['completeDependency'],recover:['reconcileEffect']},journal:{'bounded-rule':['completeDependency']}},L027:{orchestrated:{'bounded-rule':['repairBounded','isFresh']},events:{'bounded-rule':['consumeRepair']}},L031:{local:{'bounded-rule':['upgrade']},remote:{'bounded-rule':['upgrade'],'idempotent-admission':['admitGeneration'],recover:['reconcileGeneration']}}};
 for(const d of docs)for(const sol of d.solutions)for(const [id,names]of Object.entries(quoted[d.problem.referenceId][sol.id])){const code=norm(sol.algorithms.find(a=>a.id===id).code);for(const name of names)assert.ok(code.includes(norm(ref[name].toString())),d.problem.referenceId+' '+sol.id+' '+id+' does not quote '+name);}
});
test('batch 02 repaired graph paths and contracts',()=>{
 const materialized=finalGraph(solutionOf('L018','materialized'));
 assert.equal(edgesBetween(byId.L018,materialized,'n6','acl').length,1,'L018 online verification cannot reach current ACL');
 assert.equal(edgesBetween(byId.L018,materialized,'acl','n7').length,1);
 const l021=new Map(byId.L021.contracts.map(c=>[c.id,c]));
 for(const key of ['epoch','outputHash'])assert.ok(key in l021.get('l021.journal.c5').request,key);
 const workflow=finalGraph(solutionOf('L021','workflow'));
 for(const [from,to]of [['n3','n4'],['n4','n5']])assert.equal(edgesBetween(byId.L021,workflow,from,to).length,0,'L021 '+from+' bypasses the ready scheduler');
 for(const to of ['n3','n4','n5','state'])assert.equal(edgesBetween(byId.L021,workflow,'n2',to).length,1,'L021 scheduler does not reach '+to);
 const l027=new Map(byId.L027.contracts.map(c=>[c.id,c]));
 assert.ok(!('remaining' in l027.get('l027.events.c5').request));
 const budget=edgesBetween(byId.L027,finalGraph(solutionOf('L027','events')),'n5','state');
 assert.deepEqual(budget.map(e=>e.contractId),['l027.events.budget']);
});
test('L031 stage 8 rebinds one capacity instance and keeps earlier bindings',()=>{
 const d=byId.L031,subs=new Map(d.subsystems.map(s=>[s.id,s])),contracts=new Map(d.contracts.map(c=>[c.id,c]));
 const admission=sub=>sub.ports.find(q=>q.direction==='in'&&q.contractId.endsWith('.c2')).target.nodeId;
 for(const sol of d.solutions){
  const node=(stage,id)=>stage.graph.nodes.find(n=>n.id===id),s7=sol.stages[6],s8=sol.stages[7];
  const rebinds=s8.operations.filter(op=>op.op==='rebind'&&op.nodeId.startsWith('capacity'));
  assert.deepEqual(rebinds.map(op=>op.nodeId),['capacity']);
  assert.match(rebinds[0].reason,/^Explicit compatible instance upgrade/);
  assert.equal(node(s8,'capacity-b').subsystemId,node(s7,'capacity-b').subsystemId);
  assert.notEqual(node(s8,'capacity').subsystemId,node(s7,'capacity').subsystemId);
  assert.equal(admission(subs.get(node(s8,'capacity').subsystemId)),'n6');
  for(const stage of sol.stages.slice(3,7))assert.equal(admission(subs.get(node(stage,'capacity').subsystemId)),'admission',stage.id);
  for(const stage of sol.stages.slice(3))assert.equal(admission(subs.get(node(stage,'capacity-b').subsystemId)),'admission-b',stage.id);
  const graph=s8.graph,select=graph.edges.find(e=>e.id==='select');
  assert.deepEqual([select.from.nodeId,select.to.nodeId],['operator','n7']);
  assert.ok('expectedVersion' in contracts.get(select.contractId).request);
  assert.equal(edgesBetween(d,graph,'n7','capacity').length,1);
  assert.equal(edgesBetween(d,graph,'caller','n7').length,0);
 }
});
test('batch 02 L031 remote design differs from local',()=>{
 const d=byId.L031,local=solutionOf('L031','local'),remote=solutionOf('L031','remote'),lg=finalGraph(local),rg=finalGraph(remote),contracts=new Map(d.contracts.map(c=>[c.id,c]));
 for(const id of ['capacity','capacity-b']){assert.equal(lg.nodes.find(n=>n.id===id).parentId,'control');assert.equal(rg.nodes.find(n=>n.id===id).parentId,undefined);assert.equal(edgesBetween(d,rg,'n4',id).length,1);}
 assert.equal(edgesBetween(d,rg,'router','n4').length,1);assert.equal(edgesBetween(d,rg,'router','capacity').length,0);
 for(const id of ['l031.remote.c1','l031.remote.c2'])assert.ok('generationKey' in contracts.get(id).request,id);
 const failure=remote.stages.find(s=>s.operations.some(op=>op.op==='insert'&&op.node.id==='reconciler'));
 assert.match(failure.title,/failure/i);
 assert.equal(edgesBetween(d,rg,'reconciler','state').length,1);assert.equal(edgesBetween(d,rg,'reconciler','n4').length,1);
 assert.equal(remote.algorithms.find(a=>a.id==='recover').ownerNodeId,'reconciler');
 assert.ok(!lg.nodes.some(n=>n.id==='reconciler'));
 const adapterB=lg.edges.find(e=>e.id==='adapt-b');assert.equal(resolvePath(d,lg,adapterB.from).at(-1),'worker-b');
});
