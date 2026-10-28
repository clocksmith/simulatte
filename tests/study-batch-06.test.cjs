 'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const authors=require('../tools/simulatte/study-content-batch-06.cjs');
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
test('batch 06 all stages and collapsed subsystems pass shared spatial checker',async()=>{
 const report=await audit(Object.values(authors).map(build=>build()));assert.equal(report.ok,true,JSON.stringify(report.rows.filter(r=>!r.ok)));
});

const GENERIC_STEP_RESPONSE={outcome:'accepted|rejected|pending',reason:'explicit domain reason',version:'nonnegative integer'};
for(const [name,build]of Object.entries(authors)){
 test(name+' contracts, stage cases and requirement links are approach-specific',()=>{
  const doc=build(),prefix=doc.problem.referenceId.toLowerCase();
  for(const c of doc.contracts)assert.notDeepEqual(c.response,GENERIC_STEP_RESPONSE,c.id);
  for(const sol of doc.solutions){
   const command=doc.contracts.find(c=>c.id===prefix+'.'+sol.id+'.command');
   assert.deepEqual(JSON.parse(sol.apis[0].request),command.request);assert.deepEqual(JSON.parse(sol.apis[0].response),command.response);
   assert.notEqual(sol.stages[0].invariants[0],doc.problem.requirements[0].text);
   assert.equal(new Set(sol.stages.map(s=>s.invariants.join('|'))).size,sol.stages.length);
   assert.equal(new Set(sol.stages.map(s=>s.checkIds)).size,sol.stages.length);
   const caseIds=sol.acceptanceCases.map(c=>c.id);
   for(const id of caseIds)assert.ok(sol.stages.some(s=>s.checkIds.includes(id)),sol.id+' '+id+' is established by no stage');
   for(const s of sol.stages)assert.ok(s.checkIds.length<caseIds.length,s.id+' lists every case');
   for(const c of sol.acceptanceCases)if(!c.evidence)assert.ok(c.relatedRequirementIds.length<doc.problem.requirements.length,sol.id+' '+c.id+' claims every requirement');
   const coverage=new Set(sol.acceptanceCases.flatMap(c=>c.relatedRequirementIds));for(const r of doc.problem.requirements)assert.ok(coverage.has(r.id),sol.id+' '+r.id);
  }
 });
}
test('batch 06 named contract, stage and requirement defects stay fixed',()=>{
 const contract=(doc,id)=>doc.contracts.find(c=>c.id===id),proofReqs=doc=>doc.solutions.map(s=>s.acceptanceCases.find(c=>c.id==='bounded-mechanism').relatedRequirementIds);
 const l033=authors.buildL033(),l035=authors.buildL035(),l042=authors.buildL042(),l043=authors.buildL043();
 const spool=contract(l033,'l033.stream-spool.command');
 for(const k of ['creditBytes','resumeAfterSeq'])assert.ok(k in spool.request);for(const k of ['chunkSeq','chunkBytes','creditRemaining'])assert.ok(k in spool.response);assert.equal('nextCursor' in spool.response,false);
 for(const sol of l035.solutions){
  assert.deepEqual(sol.stages.filter(s=>s.checkIds.includes('publication-pin')).map(s=>s.number),[8]);
  assert.ok(sol.stages.at(-1).checkIds.some(id=>sol.acceptanceCases.find(c=>c.id===id).evidence?.testName==='a reader that cancels before publication releases its pin'));
  const fetch=contract(l035,'l035.'+sol.id+'.step6');assert.ok('blockStart' in fetch.request&&'fetchLength' in fetch.request);assert.equal('blockOffset' in fetch.request,false);
 }
 assert.ok('cancellation' in contract(l035,'l035.sharded.command').request);
 assert.deepEqual(proofReqs(l033),[['r0'],['r0']]);assert.deepEqual(proofReqs(l035),[['r1','r2'],['r1','r2']]);assert.deepEqual(proofReqs(l042),[['r0','r1','r2'],['r0','r1','r2']]);assert.deepEqual(proofReqs(l043),[['r0','r1'],['r0','r1']]);
 for(const sol of l043.solutions)for(const name of ['sync failure fails waiters stops writes and never retries fsync','frame headers carry their own checksum so interior length damage is corruption'])assert.ok(sol.acceptanceCases.some(c=>c.evidence?.testName===name),sol.id+' '+name);
 assert.ok(l042.solutions.find(s=>s.id==='heap').acceptanceCases.some(c=>c.evidence?.testName==='heap sweep pops due records only under the write lock'));
 assert.ok(l042.solutions.find(s=>s.id==='wheel').acceptanceCases.some(c=>c.evidence?.testName==='timing wheel validates TTL schedules nothing for ttl zero and skips removed keys'));
});
