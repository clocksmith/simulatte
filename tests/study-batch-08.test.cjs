'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const authors=require('../tools/simulatte/study-content-batch-08.cjs');
const {library}=require('../tools/simulatte/study-solution-author.cjs');
const {validateProblem}=require('../tools/simulatte/study-contract.cjs');
const Adapter=require('../public/simulatte/system-diagram/study/composable-study.js');
const {audit}=require('../tools/simulatte/audit-study-spatial.cjs');
test('batch-08 direct contract, replay, consumer and evidence references',()=>{
 assert.equal(Object.keys(authors).length,4);
 for(const build of Object.values(authors)){
  const doc=build(),receipt=validateProblem(doc,library);
  assert.equal(receipt.solutions,2);assert.equal(receipt.stages,16);
  assert.deepEqual(Adapter.parse(JSON.stringify(doc)),doc);
  for(const solution of doc.solutions){
   assert.ok(solution.stages[0].graph.nodes.length>0);
   const ids=new Set(solution.acceptanceCases.map(c=>c.id));
   for(const stage of solution.stages){assert.ok(stage.reason.length>30);for(const id of stage.checkIds)assert.ok(ids.has(id));}
   for(const c of solution.acceptanceCases)if(c.evidence){
    const source=fs.readFileSync(path.resolve(__dirname,'..',c.evidence.testFile),'utf8');
    assert.ok(source.includes("test('"+c.evidence.testName+"'"),c.evidence.testName);
   }
  }
 }
});
test('batch-08 every stage and collapsed subsystem passes shared geometry',async()=>{
 const report=await audit(Object.values(authors).map(build=>build()));
 assert.equal(report.ok,true,JSON.stringify(report.rows.filter(r=>!r.ok)));
 assert.equal(report.stageCount,64);
});
