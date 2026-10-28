 'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const authors=require('../tools/simulatte/study-content-batch-04.cjs');
const {validateProblem,applyOperation}=require('../tools/simulatte/study-contract.cjs');
const {library}=require('../tools/simulatte/study-solution-author.cjs');
const adapter=require('../public/simulatte/system-diagram/study/composable-study.js');
const {audit}=require('../tools/simulatte/audit-study-spatial.cjs');
for(const [name,build]of Object.entries(authors)){
 test(name+' exact replay, browser parsing and meaningful ownership',()=>{
  const doc=build();assert.deepEqual(validateProblem(doc,library),{referenceId:doc.problem.referenceId,solutions:2,stages:16});
  assert.deepEqual(adapter.parse(JSON.stringify(doc)),doc);
  assert.notDeepEqual(doc.solutions[0].stages.at(-1).graph,doc.solutions[1].stages.at(-1).graph);
  const topology=sol=>sol.stages.at(-1).graph.edges.map(e=>[e.from.nodeId,e.to.nodeId,e.mode]);assert.notDeepEqual(topology(doc.solutions[0]),topology(doc.solutions[1]));
  for(const sol of doc.solutions){let graph=sol.initialGraph;for(const stage of sol.stages){for(const op of stage.operations)graph=applyOperation(graph,op);assert.deepEqual(graph,stage.graph);assert.ok(stage.question.length>15);}
   for(const c of sol.acceptanceCases)if(c.evidence){assert.ok(fs.existsSync(path.resolve(__dirname,'..',c.evidence.testFile)));assert.ok(fs.readFileSync(path.resolve(__dirname,'..',c.evidence.testFile),'utf8').includes(c.evidence.testName));}
  }
  const broken=structuredClone(doc);broken.solutions[0].stages[2].graph.nodes[0].position.x++;assert.throws(()=>validateProblem(broken,library),/diverges/);
 });
}
test('batch 04 all stages and collapsed subsystems pass shared spatial checker',async()=>{
 const report=await audit(Object.values(authors).map(build=>build()));assert.equal(report.ok,true,JSON.stringify(report.rows.filter(r=>!r.ok)));
});
test('batch 04 contracts, stages, cases and errors are specific to each approach',()=>{
 const questions=[],errors=[];
 for(const d of Object.values(authors).map(build=>build())){
  const all=d.problem.requirements.map(r=>r.id),command=sol=>d.contracts.find(c=>c.id===d.problem.referenceId.toLowerCase()+'.'+sol.id+'.command');
  assert.notDeepEqual(command(d.solutions[0]).request,command(d.solutions[1]).request);
  const evidence=d.solutions.map(sol=>sol.acceptanceCases.find(c=>c.evidence).evidence.testName);assert.notEqual(evidence[0],evidence[1]);
  for(const sol of d.solutions){
   assert.deepEqual(JSON.parse(sol.apis[0].request),command(sol).request);assert.deepEqual(JSON.parse(sol.apis[0].response),command(sol).response);
   const caseIds=sol.acceptanceCases.map(c=>c.id);
   assert.ok(sol.stages.every(s=>s.checkIds.length<caseIds.length),sol.id+' stage cites every case');
   assert.deepEqual(new Set(sol.stages.flatMap(s=>s.checkIds)),new Set(caseIds));
   assert.ok(sol.acceptanceCases.some(c=>c.relatedRequirementIds.length<all.length),sol.id+' cases all cite every requirement');
   assert.equal(new Set(sol.stages.map(s=>s.invariants.join('|'))).size,sol.stages.length);
   questions.push(sol.stages[0].question,sol.stages[1].question);errors.push(...sol.apis.map(a=>a.errors));
   for(const c of sol.acceptanceCases.filter(c=>c.evidence))assert.ok(fs.readFileSync(path.resolve(__dirname,'..',c.evidence.testFile),'utf8').includes("test('"+c.evidence.testName+"'"),c.evidence.testName);
  }
 }
 assert.equal(new Set(questions).size,questions.length);
 assert.equal(new Set(errors).size,errors.length);
});
