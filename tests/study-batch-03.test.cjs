 'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const authors=require('../tools/simulatte/study-content-batch-03.cjs');
const {library}=require('../tools/simulatte/study-solution-author.cjs');
const {validateProblem}=require('../tools/simulatte/study-contract.cjs');
const consumer=require('../public/simulatte/system-diagram/study/composable-study.js');
const {audit}=require('../tools/simulatte/audit-study-spatial.cjs');
const docs=Object.values(authors).map(fn=>fn());
test('batch 03 directly validates exact replay and browser consumer',()=>{
 assert.equal(docs.length,4);assert.equal(Object.keys(authors).length,4);
 for(const d of docs){const r=validateProblem(d,library);assert.equal(r.solutions,2);assert.equal(r.stages,16);const parsed=consumer.parse(JSON.stringify(d));assert.equal(parsed.solutions.length,2);
 for(const sol of d.solutions){assert.equal(sol.stages.length,8);assert.ok(sol.apis.length>=2);assert.ok(sol.algorithms.length>=2);assert.ok(sol.stages.every(s=>s.operations.length&&s.invariants.length&&s.checkIds.length));
 for(const c of sol.acceptanceCases.filter(c=>c.evidence)){const file=path.resolve(__dirname,'..',c.evidence.testFile);assert.ok(fs.existsSync(file));assert.ok(fs.readFileSync(file,'utf8').includes(c.evidence.testName));}}
 }
});
test('batch 03 every stage and collapsed subsystem passes shared spatial checker',async()=>{const report=await audit(docs);assert.equal(report.ok,true,JSON.stringify(report.rows.filter(r=>!r.ok)));});
test('batch 03 stages, cases and APIs are specific to each approach',()=>{
 const errors=[];
 for(const d of docs){
  const all=d.problem.requirements.map(r=>r.id);
  assert.notEqual(d.solutions[0].algorithms[0].code,d.solutions[1].algorithms[0].code);
  assert.notEqual(d.solutions[0].acceptanceCases.find(c=>c.id==='mechanism').given,d.solutions[1].acceptanceCases.find(c=>c.id==='mechanism').given);
  for(const sol of d.solutions){
   const caseIds=sol.acceptanceCases.map(c=>c.id);
   assert.ok(sol.stages.every(s=>s.checkIds.length<caseIds.length),sol.id+' stage cites every case');
   assert.deepEqual(new Set(sol.stages.flatMap(s=>s.checkIds)),new Set(caseIds));
   assert.ok(sol.acceptanceCases.some(c=>c.relatedRequirementIds.length<all.length),sol.id+' cases all cite every requirement');
   assert.equal(new Set(sol.stages.map(s=>s.invariants.join('|'))).size,sol.stages.length);
   assert.ok(sol.stages.every(s=>s.invariants.every(i=>!i.includes('State owner:'))));
   const read=sol.apis.find(a=>a.method==='GET'),internal=d.contracts.find(c=>c.id===sol.stages[1].graph.edges.find(e=>e.id==='commit').contractId);
   // A read keyed by the same identifiers is fine; reusing the whole stage-2 contract is not.
   assert.notDeepEqual({request:JSON.parse(read.request),response:JSON.parse(read.response)},{request:internal.request,response:internal.response},sol.id+' GET reuses the stage-2 contract');
   errors.push(...sol.apis.map(a=>a.errors));
   for(const c of sol.acceptanceCases.filter(c=>c.evidence))assert.ok(fs.readFileSync(path.resolve(__dirname,'..',c.evidence.testFile),'utf8').includes("test('"+c.evidence.testName+"'"),c.evidence.testName);
  }
 }
 assert.equal(new Set(errors).size,errors.length);
});
