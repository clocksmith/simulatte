'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {validateProblem,applyOperation}=require('../tools/simulatte/study-contract.cjs');
const {library}=require('../tools/simulatte/study-solution-author.cjs');
const authors=require('../tools/simulatte/study-content-priority.cjs');
const {convert,testEvidence}=require('../tools/simulatte/convert-priority-study.cjs');
const {build}=require('../tools/simulatte/build-study-solutions.cjs');
const raw=name=>require('../tools/simulatte/priority-study-source/'+name+'.cjs');
const {prepare}=require('../tools/simulatte/study-priority-repairs.cjs');
for(const [name,author]of Object.entries(authors)){
 test(name+' converts both approaches without losing ordered teaching stages',()=>{
  const p=author(),expected=p.problem.referenceId==='L013'?19:18;
  assert.equal(p.schema,'simulatte.composableStudy.v2');assert.equal(validateProblem(p,library).stages,expected);
  for(const s of p.solutions){
   let graph=structuredClone(s.initialGraph);const identities=new Set();
   for(const stage of s.stages){
    for(const op of stage.operations){if(op.op==='expand')identities.add(op.nodeId);graph=applyOperation(graph,op);}
    assert.deepEqual(graph,stage.graph);
    for(const id of identities)assert.ok(graph.nodes.some(n=>n.id===id),'expanded boundary identity survives: '+id);
    assert.ok(stage.question&&stage.explanation&&stage.notes.length&&stage.invariants.length);
    assert.ok(stage.followupIds.every(id=>p.problem.requirements.some(r=>r.id===id)));
   }
  }
 });
}
test('published problems share the v2 format and two or more approaches',()=>{
 const {files,receipts}=build();assert.ok(receipts.length>=14);assert.ok(receipts.every(r=>r.solutions>=2));assert.ok(receipts.every(r=>r.stages>=r.solutions*8));
 for(const row of receipts){const p=JSON.parse(files.get(row.path));assert.equal(p.schema,'simulatte.composableStudy.v2');assert.deepEqual(JSON.parse(JSON.stringify(p)),p);}
});
test('v2 rebinding preserves the boundary and old binding definitions',()=>{
 const p=authors.chat(),s=p.solutions.find(s=>s.id==='inbox');let graph=s.initialGraph,found=false;
 for(const stage of s.stages)for(const op of stage.operations){if(op.op==='rebind'){
  const previous=structuredClone(graph.nodes.find(n=>n.id===op.nodeId)),next=applyOperation(graph,op).nodes.find(n=>n.id===op.nodeId);
  assert.deepEqual({...next,subsystemId:previous.subsystemId},previous);
  assert.ok(p.subsystems.some(s=>s.id===previous.subsystemId));assert.ok(p.subsystems.some(s=>s.id===next.subsystemId));found=true;
 }graph=applyOperation(graph,op);}
 assert.ok(found);
 const v1=structuredClone(p);v1.schema='simulatte.composableStudy.v1';assert.throws(()=>validateProblem(v1,library),/requires schema v2/);
 const broken=structuredClone(p),binding=broken.subsystems.find(s=>s.ports.length);binding.ports[0].target.nodeId='not-present';assert.throws(()=>validateProblem(broken,library),/incompatible/);
});
test('v1 data without the v2 operations remains supported',()=>{
 const {notebook}=require('../tools/simulatte/study-content-client-state.cjs');const p=notebook();p.schema='simulatte.composableStudy.v1';assert.equal(validateProblem(p,library).stages,16);
 const stage=p.solutions[0].stages[1];stage.operations.push({op:'rebind',nodeId:'system',subsystemId:stage.graph.nodes.find(n=>n.id==='system').subsystemId,reason:'Requires explicit v2 support'});assert.throws(()=>validateProblem(p,library),/rebind requires schema v2/);
});
test('component library identity and base versions cannot silently change',()=>{
 const p=authors.chat(),bad=structuredClone(library);bad.version=2;assert.throws(()=>validateProblem(p,bad),/unsupported component library/);
 const changed=structuredClone(library);changed.components[0].kind='invented';assert.throws(()=>validateProblem(p,changed),/unsupported base definition/);
});
test('a reused source API name becomes a distinct child while its boundary survives',()=>{
 const p=authors.timeline(),s=p.solutions.find(s=>s.id==='pull'),stage=s.stages.find(s=>s.id==='pull-mixer');
 const parent=stage.graph.nodes.find(n=>n.id==='api');assert.ok(parent.subsystemId);
 const child=stage.graph.nodes.find(n=>n.id.startsWith('api-implementation-'));assert.equal(child.parentId,parent.id);assert.notEqual(child.id,parent.id);
});
test('client state merges stay inside the client and retain source ownership',()=>{
 const p=authors.chat(),s=p.solutions.find(s=>s.id==='inbox'),stage=s.stages.find(s=>s.id==='inbox-sync-engine'),merged=stage.graph.nodes.find(n=>n.id==='engine');
 assert.equal(merged.parentId,'client');assert.deepEqual(merged.lineageIds,['outbox','syncloop']);
 const def=p.components.find(d=>d.id===merged.definitionId);assert.ok(def.stateOwnership.includes('pending sends'));assert.ok(def.stateOwnership.includes('sync token per device'));
});
test('unmapped labels and un-authored questions fail instead of inventing contracts',()=>{
 const source=structuredClone(raw('L004-chat'));source.approaches[0].stages[0].ops[1].connect.label='unknown wire semantics';assert.throws(()=>convert(source),/No typed contract/);
 const changed=structuredClone(raw('L004-chat'));changed.approaches[0].stages[0].id='invented-stage';assert.throws(()=>convert(changed),/No authored question/);
});
test('an unrelated inserted relationship does not renumber existing edge identities',()=>{
 const input=structuredClone(raw('L004-chat')),before=convert(input);
 input.approaches[0].stages[0].ops.push({insert:{id:'extraRegistry',def:'connection-registry@1',at:[5,0]}},{connect:{from:'client',to:'extraRegistry',label:'user → gateway'}});
 const after=convert(input);
 for(const [i,s]of before.solutions[0].stages.entries())for(const edge of s.graph.edges)assert.ok(after.solutions[0].stages[i].graph.edges.some(e=>e.id===edge.id),'existing relationship remains stable');
});
test('every declared reference test resolves by its exact name to a tracked source path',()=>{
 let count=0;for(const author of Object.values(authors))for(const s of author().solutions)for(const c of s.acceptanceCases)if(c.evidence){
  const evidence=c.evidence;const file=path.resolve(__dirname,'..',evidence.testFile);assert.ok(file.startsWith(path.resolve(__dirname,'../tools/simulatte/study-reference')+path.sep));assert.ok(fs.readFileSync(file,'utf8').includes("test('"+evidence.testName+"'"));count++;
 }
 assert.ok(count>=56);assert.throws(()=>testEvidence('chat.not-a-real-test'),/Missing reference test/);
});
test('corrections retain unqualified guarantees as authored cases rather than test evidence',()=>{
 const p=authors.comments(),pipeline=p.solutions[0].stages.find(s=>s.id.endsWith('-pipeline'));const cases=p.solutions[0].acceptanceCases.filter(c=>pipeline.checkIds.includes(c.id));
 assert.ok(cases.some(c=>!c.evidence&&c.then.includes('fenced partition')));assert.ok(cases.some(c=>c.evidence?.testName.startsWith('comments.score-versions:')));
 const cursor=authors.pagination().solutions.find(s=>s.id==='sessions').acceptanceCases;assert.ok(cursor.some(c=>!c.evidence&&c.then.includes('another principal')));
});
test('repair authoring preserves raw intake while adding safety-critical boundaries',()=>{
 const input=raw('L013-flash-sale'),before=structuredClone(input),p=prepare(input);assert.deepEqual(input,before);
 const bucket=p.approaches[0].stages.find(s=>s.id==='buckets');assert.match(bucket.code,/same transaction|transaction\(/);
 const actors=p.approaches.find(a=>a.id==='actor');assert.ok(actors.stages.find(s=>s.id==='payments').ops.some(op=>op.insert?.id==='paymentRecovery'));
 const chat=prepare(raw('L004-chat'));const scale=chat.approaches[0].stages.find(s=>s.id==='scale');assert.equal(scale.ops.find(op=>op.expand?.id==='log').expand.entry,'logRouter');
});
