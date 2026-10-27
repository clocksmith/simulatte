'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {validateProblem,applyOperation}=require('../tools/simulatte/study-contract.cjs');
const {library}=require('../tools/simulatte/study-solution-author.cjs');
const {notebook,search}=require('../tools/simulatte/study-content-client-state.cjs');
const {loadBalancer,replication}=require('../tools/simulatte/study-content-routing.cjs');
const {database}=require('../tools/simulatte/study-content-platform.cjs');
const {video,crawler}=require('../tools/simulatte/study-content-delivery.cjs');
const clone=x=>structuredClone(x);
for(const author of [notebook,search,loadBalancer,replication,database,video,crawler]){
 test(author.name+' has two complete typed progressions with exact graphs',()=>{
  const p=author();assert.deepEqual(validateProblem(p,library),{referenceId:p.problem.referenceId,solutions:2,stages:16});
  for(const solution of p.solutions){assert.equal(solution.stages[0].graph.nodes.length,2);assert.ok(solution.stages.some(s=>s.operations.some(o=>o.op==='expand')));assert.ok(solution.stages.some(s=>s.operations.some(o=>o.op==='merge')));}
 });
}
test('the generator does not mutate one author invocation through another',()=>{const first=notebook();const copyFirst=clone(first);notebook();search();assert.deepEqual(first,copyFirst);});
test('reject a missing dependency and a cross-typed endpoint',()=>{
 const p=search();p.contracts=p.contracts.filter(c=>c.id!=='search.query');assert.throws(()=>validateProblem(p,library),/invalid port contract/);
 const q=search();q.components.find(c=>c.id==='search.ui').ports.find(p=>p.direction==='out').contractId='search.saved';assert.throws(()=>validateProblem(q,library),/incompatible/);
});
test('reject a stored graph edited outside the operation sequence',()=>{const p=notebook();p.solutions[0].stages[0].graph.nodes[0].position.x++;assert.throws(()=>validateProblem(p,library),/diverges/);});
test('reject a disappearing subsystem parent or an exposed port aimed at a stranger',()=>{
 const p=notebook(),s=p.solutions[0].stages[1];s.operations[0].nodes[0].id='system';assert.throws(()=>validateProblem(p,library),/duplicate/);
 const q=notebook();q.subsystems[0].ports[0].target.nodeId='client';assert.throws(()=>validateProblem(q,library),/incompatible|direct child/);
});
test('reject missing acceptance cases, lost requirements and optimistic execution claims',()=>{
 const p=video();p.solutions[0].stages[0].checkIds=['invented'];assert.throws(()=>validateProblem(p,library),/unknown stage acceptance/);
 const q=database();q.problem.requirements.push({id:'unproven',text:'Another obligation'});assert.throws(()=>validateProblem(q,library),/uncovered requirement/);
 const r=crawler();r.execution.kind='production-ready';assert.throws(()=>validateProblem(r,library),/cannot claim execution/);
});
test('reject no-op padding and stale disconnect operations',()=>{
 const p=notebook();p.solutions[0].stages[2].operations=[];assert.throws(()=>validateProblem(p,library),/empty architectural/);
 assert.throws(()=>applyOperation({nodes:[],edges:[]},{op:'disconnect',edgeId:'missing'}),/absent edge/);
});
test('reconnect preserves an edge identity and rejects absent edges',()=>{
 const g=search().solutions[0].stages[0].graph,edge=clone(g.edges[0]);edge.label='same contract, clarified label';
 const next=applyOperation(g,{op:'reconnect',edgeId:edge.id,edge,reason:'Clarify the visible request path'});
 assert.equal(next.edges.length,1);assert.equal(next.edges[0].label,edge.label);assert.equal(g.edges[0].label,undefined);
 assert.throws(()=>applyOperation(g,{op:'reconnect',edgeId:edge.id,edge:{...edge,id:'renamed'},reason:'bad'}),/preserve edge identity/);
});
test('reject a merge that drops containment, source identities or compatible ports',()=>{
 const p=search(),solution=p.solutions[0],merge=solution.stages.at(-1).operations.find(o=>o.op==='merge');
 const target=p.components.find(c=>c.id===merge.node.definitionId);target.ports=[];
 assert.throws(()=>validateProblem(p,library),/drops port/);
 const g={nodes:[{id:'a',parentId:'container'},{id:'b',parentId:'container'}],edges:[]};
 assert.throws(()=>applyOperation(g,{op:'merge',nodeIds:['a','b'],node:{id:'new'},reason:'merge'}),/lost containment/);
});
test('strict metadata accepts stage explanations and pseudocode but rejects unknown root fields',()=>{
 const p=notebook();Object.assign(p.solutions[0].stages[0],{explanation:'Define the authoritative state before refining.',notes:['Discuss ownership.'],followupIds:['followup-1'],code:[{id:'contract',kind:'api',language:'http',text:'GET /notebooks/{id}'}]});
 assert.equal(validateProblem(p,library).stages,16);p.editorSettings={};assert.throws(()=>validateProblem(p,library),/unknown field editorSettings/);
});
test('background sources cannot imply verified company question provenance',()=>{
 const p=notebook();p.references[0].scope='company-published';assert.throws(()=>validateProblem(p,library),/must not imply interview provenance/);
 const q=notebook();q.references[0].url='https://name:secret@example.com/';assert.throws(()=>validateProblem(q,library),/unsafe citation/);
});
