 'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const authors=require('../tools/simulatte/study-content-batch-05.cjs');
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
test('batch 05 all stages and collapsed subsystems pass shared spatial checker',async()=>{
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
test('batch 05 named contract and requirement defects stay fixed',()=>{
 const contract=(doc,id)=>doc.contracts.find(c=>c.id===id),proofReqs=doc=>doc.solutions.map(s=>s.acceptanceCases.find(c=>c.id==='bounded-mechanism').relatedRequirementIds);
 const l016=authors.buildL016(),l019=authors.buildL019(),l026=authors.buildL026(),l046=authors.buildL046();
 assert.ok('commandToken' in contract(l016,'l016.cqrs.command').response);
 assert.ok('replayed' in contract(l016,'l016.cache-aside.command').response);
 const fenced=contract(l026,'l026.fenced-primary.command');
 for(const k of ['term','commitIndex'])assert.equal(k in fenced.response,false);assert.doesNotMatch(fenced.response.status,/not-leader/);
 for(const k of ['fence','lsn'])assert.ok(k in fenced.response);assert.ok('requestId' in fenced.request);
 assert.deepEqual(proofReqs(l016),[['r1'],['r1']]);assert.deepEqual(proofReqs(l019),[['r1'],['r1']]);assert.deepEqual(proofReqs(l026),[['r1','r2'],['r1','r2']]);assert.deepEqual(proofReqs(l046),[['r0','r2'],['r0','r2']]);
 const peer=l019.solutions.find(s=>s.id==='peer-assisted');
 assert.ok(peer.acceptanceCases.some(c=>c.relatedRequirementIds.includes('r1')&&c.evidence?.testName==='CDN fallback fails over from an unhealthy home region to an eligible origin'));
 const cqrsRead=l016.solutions.find(s=>s.id==='cqrs').apis.find(a=>a.path==='L016/cqrs/read');assert.ok(cqrsRead);assert.ok('commandToken' in JSON.parse(cqrsRead.request));assert.equal('expectedVersion' in JSON.parse(cqrsRead.request),false);
 for(const sol of l046.solutions)assert.ok(sol.acceptanceCases.some(c=>c.evidence?.testName==='usage ledger rejects conflicting duplicates and bounds retained identities'));
});
