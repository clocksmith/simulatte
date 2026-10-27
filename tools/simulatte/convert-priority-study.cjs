'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {isDeepStrictEqual:same}=require('node:util');
const {problem}=require('./study-solution-author.cjs');
const {applyOperation}=require('./study-contract.cjs');
const {tables}=require('./study-priority-contracts.cjs');
const {guides}=require('./study-priority-guides.cjs');
const {prepare}=require('./study-priority-repairs.cjs');
const {apis}=require('./study-priority-apis.cjs');
const clone=x=>structuredClone(x),key=e=>e.from+'>'+e.to;
const identity=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,20);
const reference=(id,title,url,supports)=>({id,title,url,scope:'background',supports});
const REFERENCES={
 L004:[reference('sync','Matrix client/server synchronization','https://spec.matrix.org/latest/client-server-api/','Device synchronization, history and explicit reset boundaries.')],
 L003:[reference('cursors','GraphQL pagination','https://graphql.org/learn/pagination/','Opaque cursor contracts and stable connection boundaries.'),reference('pit','Elasticsearch point-in-time pagination','https://www.elastic.co/docs/reference/elasticsearch/rest-apis/paginate-search-results','PIT plus search_after pins a search view rather than re-ranking each page.')],
 L009:[reference('recursive','PostgreSQL recursive queries','https://www.postgresql.org/docs/current/queries-with.html','Tree traversal and bounded query semantics.'),reference('locks','PostgreSQL locking','https://www.postgresql.org/docs/current/explicit-locking.html','Concurrent vote and checkpoint transactions.'),reference('wilson','NIST proportion confidence intervals','https://itl.nist.gov/div898/handbook/prc/section2/prc241.htm','Wilson lower bound as an authored ranking heuristic; not evidence of any company ranking implementation.')],
 L011:[reference('sorted','Redis sorted sets','https://redis.io/docs/latest/develop/data-types/sorted-sets/','Bounded ordered feed IDs and range retrieval.')],
 L013:[reference('locks','PostgreSQL transaction locks','https://www.postgresql.org/docs/current/explicit-locking.html','Atomic inventory changes and conditional transitions.'),reference('payment','Stripe idempotent requests','https://docs.stripe.com/api/idempotent_requests','Stable keys and ambiguity after retries; not exactly-once business execution.')]
};
function testEvidence(testId){
 const prefix=testId.split('.')[0],name=prefix==='flash'?'flashsale':prefix;
 const relative='tools/simulatte/study-reference/'+name+'.test.mjs';
 const source=fs.readFileSync(path.join(__dirname,'../..',relative),'utf8');
 const names=[...source.matchAll(/test\('([^']+)'/g)].map(m=>m[1]);
 const full=names.find(n=>n.startsWith(testId+':'));
 if(!full)throw Error('Missing reference test '+testId);
 return {kind:'reference-test',testFile:relative,testName:full};
}
function convert(input){
 const source=prepare(input),typed=tables[source.lucyd],guide=guides[source.lucyd];
 if(!typed||!guide)throw Error('No authored contracts/guides for '+source.lucyd);
 const p=problem(source.lucyd,source.title,source.prompt+' Out of scope: '+source.requirements.outOfScope.join('; ')+'. Performance numbers are study targets, not measurements.',[
  {id:'functional',text:source.requirements.functional.join('; ')},
  {id:'nonfunctional',text:source.requirements.nonFunctional.join('; ')},
  ...source.followups.map(f=>({id:f.id,text:f.prompt}))
 ],REFERENCES[source.lucyd]);
 p.contracts=clone(typed.contracts);
 const definitions=new Map();
 for(const [rawId,d]of Object.entries(source.components)){
  const [name,versionText]=rawId.split('@'),kind=d.kind==='edge'?'service':d.kind;
  if(!['client','service','store','cache','queue','worker','external','module'].includes(kind))throw Error('Unsupported component kind '+kind);
  const row={id:source.id+'.'+name,version:Number(versionText),extends:{id:'core.'+kind,version:1},label:d.title,responsibility:d.responsibility||('Own '+d.owns.join('; ')+'.'),stateOwnership:clone(d.owns),ports:[]};
  if(row.version!==1)throw Error('Implement a version migration before changing component version');
  definitions.set(rawId,row);p.components.push(row);
 }
 const port=(definitionId,direction,contractId,id=direction+'-'+contractId)=>{
  const d=p.components.find(c=>c.id===definitionId);if(!d)throw Error('Missing definition '+definitionId);
  const old=d.ports.find(q=>q.id===id);if(old&&(old.direction!==direction||old.contractId!==contractId))throw Error('Conflicting port '+id);
  if(!old)d.ports.push({id,direction,contractId});return id;
 };
 for(const approach of source.approaches){
  const solution={id:approach.id,title:approach.title,chooseWhen:approach.why,tradeoffs:clone(approach.tradeoffs),assumptions:[...source.assumptions,...(approach.assumptions||[]),'Reference tests model bounded mechanisms; they do not qualify production concurrency, failure recovery or latency.'],initialGraph:{nodes:[],edges:[]},stages:[],apis:[],algorithms:[],acceptanceCases:[]};p.solutions.push(solution);
  const nodes=new Map(),actual=new Map(),aliases=new Map(),links=new Map(),boundaries=new Map();
  let graph=clone(solution.initialGraph);
  const scopeParent=(n,explicit)=>{
   if(explicit)return explicit;
   if(source.lucyd==='L009'&&approach.id==='read-time'&&n.id==='votes')return aliases.get('svc');
   if(source.components[n.def].kind==='client'&&n.id!=='client'&&boundaries.has(aliases.get('client')))return aliases.get('client');
   return null;
  };
  function add(n,parentId){
   if(nodes.has(n.id))throw Error('Duplicate active source node '+n.id);
   const id=actual.has(n.id)?n.id+'-implementation-'+(solution.stages.length+1):n.id;
   if(actual.has(id))throw Error('Ambiguous reused source identity '+id);
   const d=definitions.get(n.def);if(!d)throw Error('Unknown source definition '+n.def);
   const row={id,definitionId:d.id,version:d.version,label:n.label||d.label,position:{x:n.at[0]*320,y:n.at[1]*180}};
   const parent=scopeParent(n,parentId);if(parent)row.parentId=parent;
   actual.set(id,row);aliases.set(n.id,id);nodes.set(n.id,clone(n));return row;
  }
  function active(id){if(!nodes.has(id))throw Error('Unknown active source node '+id);return actual.get(aliases.get(id));}
  function connect(e){active(e.from);active(e.to);if(links.has(key(e)))throw Error('Duplicate source edge '+key(e));if(!typed.labels.has(e.label))throw Error('No typed contract for '+source.lucyd+' label '+e.label);links.set(key(e),{...clone(e),edgeId:approach.id+'-edge-'+identity([e.from,e.to])});}
  function projected(){
   const mappings=new Map([...boundaries.keys()].map(id=>[id,new Map()]));
   const scopes=n=>{const out=[n.parentId||null];while(n.parentId){n=actual.get(n.parentId);if(!n)throw Error('Orphaned containment');out.push(n.parentId||null);}return out;};
   const edges=[];
   for(const e of links.values()){
    const a=active(e.from),b=active(e.to),contractId=typed.labels.get(e.label);if(!contractId)throw Error('Untyped edge '+e.label);
    const targetScopes=new Set(scopes(b)),common=scopes(a).find(v=>targetScopes.has(v));
    function end(n,direction){let value={nodeId:n.id,portId:port(n.definitionId,direction,contractId)};
     while((n.parentId||null)!==common){const parent=actual.get(n.parentId);if(!parent||!mappings.has(parent.id))throw Error('Missing subsystem boundary');const id=direction+'-'+contractId+'-'+e.edgeId;port(parent.definitionId,direction,contractId,id);mappings.get(parent.id).set(id,{id,direction,contractId,target:clone(value)});value={nodeId:parent.id,portId:id};n=parent;}return value;
    }
    const from=end(a,'out'),to=end(b,'in');if(from.nodeId===to.nodeId)throw Error('Connection collapsed to self '+e.label);
    edges.push({id:e.edgeId,from,to,contractId,mode:e.async?'event-stream':'request-response',label:e.label});
   }
   for(const [id,m]of mappings){const parent=actual.get(id),ports=[...m.values()].sort((a,b)=>a.id.localeCompare(b.id)),old=boundaries.get(id);
    if(!old||!same(old.ports,ports)){
     const sub={id:source.id+'-'+approach.id+'-'+id+'-binding-'+identity([parent.definitionId,ports]),version:1,definitionId:parent.definitionId,ports};if(!p.subsystems.some(s=>s.id===sub.id))p.subsystems.push(sub);boundaries.set(id,sub);parent.subsystemId=sub.id;
    }
   }
   return {nodes:[...actual.values()].map(clone),edges};
  }
  function reconcile(operations){
   const target=projected();let temp=clone(graph);
   for(const op of operations)temp=applyOperation(temp,op);
   // Binding revisions are explicit. Earlier stage definitions remain immutable.
   for(const n of target.nodes){const prior=temp.nodes.find(q=>q.id===n.id);if(prior?.subsystemId!==n.subsystemId){if(!prior?.subsystemId||!n.subsystemId)throw Error('Unrecorded subsystem expansion');const op={op:'rebind',nodeId:n.id,subsystemId:n.subsystemId,reason:'Reconcile exposed ports with this explicit child refinement and its current connections.'};operations.push(op);temp=applyOperation(temp,op);}}
   for(const edge of [...temp.edges])if(!target.edges.some(e=>e.id===edge.id)){const op={op:'disconnect',edgeId:edge.id};operations.push(op);temp=applyOperation(temp,op);}
   for(const edge of target.edges){const prior=temp.edges.find(e=>e.id===edge.id);if(!prior){const op={op:'connect',edge:clone(edge)};operations.push(op);temp=applyOperation(temp,op);}else if(!same(prior,edge)){const op={op:'reconnect',edgeId:edge.id,edge:clone(edge),reason:'Preserve the logical relationship while making the authored contract or boundary routing explicit.'};operations.push(op);temp=applyOperation(temp,op);}}
   const ordered=g=>({nodes:[...g.nodes].sort((a,b)=>a.id.localeCompare(b.id)),edges:[...g.edges].sort((a,b)=>a.id.localeCompare(b.id))});
   if(!same(ordered(temp),ordered(target)))throw Error('Converted graph differs from replay for '+source.lucyd+'/'+approach.id);
   graph=clone(temp);
  }
  for(const stage of approach.stages){
   const detail=guide[stage.id];if(!detail)throw Error('No authored question/experiment for '+source.lucyd+'/'+stage.id);
   const operations=[];
   for(const instruction of stage.ops){
    const [kind,raw]=Object.entries(instruction)[0],args=Array.isArray(raw)?raw:[raw];
    for(const arg of args){const changes=[];
     if(kind==='insert'){const n=add(arg);changes.push({op:'insert',node:clone(n)});}
     else if(kind==='connect')connect(arg);
     else if(kind==='disconnect'){if(!links.delete(key(arg)))throw Error('Absent source disconnect '+key(arg));}
     else if(kind==='reconnect'){const e=links.get(key(arg));if(!e)throw Error('Absent source reconnect '+key(arg));links.delete(key(arg));const next={...e,...arg,from:arg.newFrom||e.from,to:arg.newTo||e.to};delete next.newFrom;delete next.newTo;active(next.from);active(next.to);links.set(key(next),next);}
     else if(kind==='replace'){
      const old=active(arg.id),target=definitions.get(arg.with.def);if(!target)throw Error('Unknown replacement');
      for(const q of p.components.find(d=>d.id===old.definitionId).ports)if(!target.ports.some(p=>p.id===q.id))target.ports.push(clone(q));
      old.definitionId=target.id;old.label=arg.with.label||target.label;nodes.get(arg.id).def=arg.with.def;
      changes.push({op:'replace',nodeId:old.id,definitionId:target.id,migration:stage.forcedBy,label:old.label});
     }else if(kind==='expand'){
      const parent=active(arg.id),prior=[...links.values()];nodes.delete(arg.id);boundaries.set(parent.id,null);
      const children=arg.into.map(n=>add(n,parent.id));
      links.clear();for(const e of prior){const next={...e,from:e.from===arg.id?(arg.exit||arg.entry):e.from,to:e.to===arg.id?arg.entry:e.to};if(next.from!==next.to)links.set(key(next),next);}
      for(const e of arg.connect||[])connect(e);
      // Projection creates the initial immutable interface for this boundary.
      projected();changes.push({op:'expand',nodeId:parent.id,subsystemId:actual.get(parent.id).subsystemId,nodes:children.map(clone),edges:[]});
     }else if(kind==='merge'){
      const originals=arg.ids.map(active),parents=new Set(originals.map(n=>n.parentId||null));if(parents.size!==1)throw Error('Cross-scope merge must be authored explicitly: '+arg.ids.join(','));if(originals.some(n=>n.subsystemId))throw Error('Cannot flatten an expanded boundary');
      const targetDef=definitions.get(arg.into.def);for(const n of originals)for(const q of p.components.find(d=>d.id===n.definitionId).ports)if(!targetDef.ports.some(p=>p.id===q.id))targetDef.ports.push(clone(q));
      for(const n of originals)for(const owned of p.components.find(d=>d.id===n.definitionId).stateOwnership)if(!targetDef.stateOwnership.includes(owned))targetDef.stateOwnership.push(owned);
      const originalActualIds=originals.map(n=>n.id),legacyIds=new Set(arg.ids),moved=[...links.values()];
      for(const id of arg.ids){actual.delete(aliases.get(id));nodes.delete(id);}const merged=add(arg.into,[...parents][0]);merged.lineageIds=originalActualIds;
      links.clear();for(const e of moved){const next={...e,from:legacyIds.has(e.from)?arg.into.id:e.from,to:legacyIds.has(e.to)?arg.into.id:e.to};if(next.from!==next.to&&!links.has(key(next)))links.set(key(next),next);}
      const opNode=clone(merged);delete opNode.lineageIds;changes.push({op:'merge',nodeIds:originalActualIds,node:opNode,reason:stage.forcedBy});
     }else throw Error('Unsupported source operation '+kind);
     reconcile(changes);operations.push(...changes);
    }
   }
   const checkIds=[];
   for(const [i,check]of stage.checks.entries()){
    const id=approach.id+'-'+stage.id+'-check-'+(i+1),row={id,given:detail.given,when:detail.when,then:check.claim,relatedRequirementIds:['functional',...(stage.answers||[])]};
    solution.acceptanceCases.push(row);checkIds.push(id);
    if(check.test){
     const evidence=testEvidence(check.test),referenceId=id+'-reference';
     solution.acceptanceCases.push({id:referenceId,given:'The bounded JavaScript fixture in '+evidence.testFile+'. It does not exercise distributed processes, durable storage, cryptographic enforcement or production load.',when:'Execute the named reference test: '+evidence.testName,then:evidence.testName.slice(evidence.testName.indexOf(':')+1).trim(),relatedRequirementIds:clone(row.relatedRequirementIds),evidence});checkIds.push(referenceId);
    }
   }
   const code=[];if(!solution.stages.length)code.push({id:'type-shapes',kind:'pseudocode',language:'type-descriptors',text:JSON.stringify(source.types,null,2)});if(stage.code)code.push({id:'stage-code',kind:'pseudocode',language:'design-pseudocode',text:stage.code});
   solution.stages.push({id:approach.id+'-'+stage.id,number:solution.stages.length+1,title:stage.title,question:detail.question,reason:stage.forcedBy,explanation:stage.explain,notes:clone(stage.board),followupIds:clone(stage.answers||[]),code,operations,graph:clone(graph),invariants:stage.checks.map(c=>c.claim),checkIds});
  }
  solution.acceptanceCases.push({id:approach.id+'-implementation-qualification',given:'A real implementation and a declared representative workload; neither is qualified by this conceptual bundle.',when:'Measure and fault-test the implementation against the stated nonfunctional targets.',then:source.requirements.nonFunctional.join('; ')+'. Retain failures and uncertain outcomes explicitly.',relatedRequirementIds:['nonfunctional']});
  const owner=['chatsvc','handler','api'].find(id=>nodes.has(id));if(!owner)throw Error('Missing API owner');
  solution.apis=apis(source.lucyd,approach.id,aliases.get(owner));
 }
 // Shared definitions can gain ports in a later approach. Preserve compatibility
 // through every authored replacement/merge after the whole document is known.
 let changed=true;
 while(changed){changed=false;for(const s of p.solutions){let g=clone(s.initialGraph);for(const stage of s.stages)for(const op of stage.operations){
  if(op.op==='replace'||op.op==='merge'){
   const target=p.components.find(d=>d.id===(op.op==='replace'?op.definitionId:op.node.definitionId));
   for(const id of op.op==='replace'?[op.nodeId]:op.nodeIds){const n=g.nodes.find(n=>n.id===id);const old=p.components.find(d=>d.id===n.definitionId);for(const q of old.ports)if(!target.ports.some(v=>v.id===q.id)){target.ports.push(clone(q));changed=true;}}
  }g=applyOperation(g,op);
 }}}
 return p;
}
module.exports={convert,testEvidence};
