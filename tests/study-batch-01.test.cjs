 'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const authors=require('../tools/simulatte/study-content-batch-01.cjs');
const {library}=require('../tools/simulatte/study-solution-author.cjs');
const {validateProblem}=require('../tools/simulatte/study-contract.cjs');
const consumer=require('../public/simulatte/system-diagram/study/composable-study.js');
const {audit}=require('../tools/simulatte/audit-study-spatial.cjs');
const docs=Object.values(authors).map(fn=>fn());
test('batch 01 directly validates exact replay and browser consumer',()=>{
 assert.equal(docs.length,4);assert.equal(Object.keys(authors).length,4);
 for(const d of docs){const r=validateProblem(d,library);assert.equal(r.solutions,2);assert.equal(r.stages,16);const parsed=consumer.parse(JSON.stringify(d));assert.equal(parsed.solutions.length,2);
 for(const sol of d.solutions){assert.equal(sol.stages.length,8);assert.ok(sol.apis.length>=2);assert.ok(sol.algorithms.length>=2);assert.ok(sol.stages.every(s=>s.operations.length&&s.invariants.length&&s.checkIds.length));
 for(const c of sol.acceptanceCases.filter(c=>c.evidence)){const file=path.resolve(__dirname,'..',c.evidence.testFile);assert.ok(fs.existsSync(file));assert.ok(fs.readFileSync(file,'utf8').includes(c.evidence.testName));}}
 }
});
test('batch 01 every stage and collapsed subsystem passes shared spatial checker',async()=>{const report=await audit(docs);assert.equal(report.ok,true,JSON.stringify(report.rows.filter(r=>!r.ok)));});
// Added assertions: each approach owns its command/read APIs, cases, stage checks and invariants, and every repaired
// mechanism is checked against the authored graph or the reference module so that removing it fails a test.
const byId=Object.fromEntries(docs.map(d=>[d.problem.referenceId,d])),solutionOf=(id,s)=>byId[id].solutions.find(x=>x.id===s),finalGraph=sol=>sol.stages.at(-1).graph;
function resolvePath(doc,graph,endpoint){const subs=new Map(doc.subsystems.map(s=>[s.id,s])),nodes=new Map(graph.nodes.map(n=>[n.id,n])),path=[endpoint.nodeId];let at=endpoint;for(;;){const n=nodes.get(at.nodeId),q=n?.subsystemId&&subs.get(n.subsystemId).ports.find(p=>p.id===at.portId);if(!q)return path;at=q.target;path.push(at.nodeId);}}
const edgesBetween=(doc,graph,from,to)=>graph.edges.filter(e=>resolvePath(doc,graph,e.from).includes(from)&&resolvePath(doc,graph,e.to).includes(to));
test('batch 01 cases, invariants and APIs belong to their approach and stage',()=>{
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
test('batch 01 authored algorithms quote the reference mechanisms',async()=>{
 const ref=await import('../tools/simulatte/study-reference/batch-01-mechanisms.mjs'),norm=s=>s.replace(/\s+/g,' ').trim();
 const quoted={L012:{pull:{'bounded-rule':['visible']},push:{'bounded-rule':['visible']}},L015:{leases:{'bounded-rule':['heartbeat'],'expiry-sweep':['expireLeases']},events:{'bounded-rule':['foldSession'],'expiry-timer':['expireByTimer']}},L017:{session:{'bounded-rule':['appendToken']},pull:{'bounded-rule':['appendToken']}},L020:{fanout:{'bounded-rule':['ranked']},readmerge:{'bounded-rule':['ranked']}}};
 for(const d of docs)for(const sol of d.solutions)for(const [id,names]of Object.entries(quoted[d.problem.referenceId][sol.id])){const code=norm(sol.algorithms.find(a=>a.id===id).code);for(const name of names)assert.ok(code.includes(norm(ref[name].toString())),d.problem.referenceId+' '+sol.id+' '+id+' does not quote '+name);}
});
test('batch 01 repaired graph paths',()=>{
 const pull=finalGraph(solutionOf('L012','pull'));
 for(const from of ['n3','n4','n5'])assert.equal(edgesBetween(byId.L012,pull,from,'n6').length,1,'L012 '+from+' bypasses the expiry guard');
 const leases=solutionOf('L015','leases'),leaseGraph=finalGraph(leases);
 assert.ok(leases.stages[2].graph.nodes.some(n=>n.id==='timer'));
 assert.equal(edgesBetween(byId.L015,leases.stages[2].graph,'timer','state').length,1);
 assert.equal(edgesBetween(byId.L015,leaseGraph,'timer','n3').length,1);assert.equal(edgesBetween(byId.L015,leaseGraph,'n3','n4').length,1);
 const events=finalGraph(solutionOf('L015','events'));
 assert.equal(edgesBetween(byId.L015,events,'n3','n2').length,0,'L015 events timer folds directly');
 assert.equal(edgesBetween(byId.L015,events,'n3','state').length,1);assert.equal(edgesBetween(byId.L015,events,'n2','n3').length,1);
 const contracts=new Map(byId.L017.contracts.map(c=>[c.id,c]));
 for(const id of ['l017.session.c3','l017.session.c4','l017.pull.c3','l017.pull.c4'])assert.ok('attempt' in contracts.get(id).request,id);
 for(const s of ['session','pull'])assert.equal(edgesBetween(byId.L017,finalGraph(solutionOf('L017',s)),'n6','n4').length,1,'L017 '+s+' cancellation does not reach the token store');
 assert.equal(edgesBetween(byId.L020,finalGraph(solutionOf('L020','fanout')),'n6','visibility').length,1);
});
