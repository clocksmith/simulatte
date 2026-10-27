'use strict';
// Authoring helpers only. These graphs are interview designs, not simulation implementations.
const clone=value=>structuredClone(value);
const SCHEMA='simulatte.composableStudy.v1';
const LIBRARY='simulatte.studyComponents.v1';
const TYPES=['client','service','module','store','log','queue','worker','cache','directory','external'];
const library={schema:LIBRARY,version:1,components:TYPES.map(kind=>({id:'core.'+kind,version:1,kind,description:'Logical '+kind+' responsibility. Deployment and execution require an explicit implementation binding.'}))};
function problem(referenceId,studyLabel,scope,requirements,references){return {schema:SCHEMA,version:1,problem:{referenceId,studyLabel,scope,requirements},execution:{kind:'conceptual-design',implementation:null},provenance:{kind:'authored-practice',note:'Authored interview preparation. Technical references support mechanisms, not the claim that a company asked this question.'},references,contracts:[],components:[],subsystems:[],solutions:[]};}
function contract(p,id,request,response){p.contracts.push({id,version:1,request,response});return id;}
function component(p,id,label,kind,responsibility,stateOwnership=[]){if(p.components.some(c=>c.id===id))throw Error('Duplicate definition '+id);p.components.push({id,version:1,extends:{id:'core.'+kind,version:1},label,responsibility,stateOwnership,ports:[]});return id;}
function port(p,id,direction,contractId){const c=p.components.find(c=>c.id===id);if(!c)throw Error('Unknown definition '+id);const pid=direction+'-'+contractId;if(!c.ports.some(q=>q.id===pid))c.ports.push({id:pid,direction,contractId});return pid;}
function builder(p,id,title,chooseWhen,tradeoffs,assumptions){
 const solution={id,title,chooseWhen,tradeoffs,assumptions,initialGraph:{nodes:[],edges:[]},stages:[],apis:[],algorithms:[],acceptanceCases:[]};p.solutions.push(solution);
 let graph=clone(solution.initialGraph),nextPosition=0;
 const def=id=>p.components.find(c=>c.id===id),find=id=>graph.nodes.find(n=>n.id===id);
 function node(id,definitionId,label){if(find(id))throw Error('Duplicate node '+id);const n={id,definitionId,version:1,label:label||def(definitionId).label,position:{x:(nextPosition%4)*280,y:Math.floor(nextPosition/4)*180}};nextPosition++;return n;}
 function insert(id,definitionId,label){return {op:'insert',node:node(id,definitionId,label)};}
 function connect(id,from,to,contractId,mode='request-response'){
  const a=find(from),b=find(to);if(!a||!b)throw Error('Connect needs existing nodes '+from+'/'+to);
  const scopes=n=>{const rows=[n.parentId||null];while(n.parentId){n=find(n.parentId);rows.push(n.parentId||null);}return rows;};
  const targetScopes=new Set(scopes(b)),common=scopes(a).find(v=>targetScopes.has(v));
  function endpoint(n,direction){let value={nodeId:n.id,portId:port(p,n.definitionId,direction,contractId)};
   while((n.parentId||null)!==common){const parent=find(n.parentId),sub=p.subsystems.find(q=>q.id===parent.subsystemId);if(!sub)throw Error('Missing exposed boundary '+parent.id);
    const pid=direction+'-'+contractId+'-'+n.id;
    if(!def(parent.definitionId).ports.some(q=>q.id===pid))def(parent.definitionId).ports.push({id:pid,direction,contractId});
    if(!sub.ports.some(q=>q.id===pid))sub.ports.push({id:pid,direction,contractId,target:clone(value)});
    value={nodeId:parent.id,portId:pid};n=parent;
   }return value;
  }
  const source=endpoint(a,'out'),target=endpoint(b,'in');if(source.nodeId===target.nodeId)throw Error('Self connection after boundary projection '+id);
  return {op:'connect',edge:{id,from:source,to:target,contractId,mode}};
 }
 function apply(ops){for(const op of ops){if(op.op==='insert')graph.nodes.push(clone(op.node));else if(op.op==='connect')graph.edges.push(clone(op.edge));else if(op.op==='disconnect')graph.edges=graph.edges.filter(e=>e.id!==op.edgeId);else if(op.op==='replace'){find(op.nodeId).definitionId=op.definitionId;}else if(op.op==='expand'){const parent=find(op.nodeId);parent.subsystemId=op.subsystemId;for(const child of op.nodes)graph.nodes.push({...clone(child),parentId:op.nodeId});graph.edges.push(...clone(op.edges));}else if(op.op==='merge'){const ids=new Set(op.nodeIds);graph.edges=graph.edges.filter(e=>!(ids.has(e.from.nodeId)&&ids.has(e.to.nodeId))).map(e=>({...e,from:ids.has(e.from.nodeId)?{...e.from,nodeId:op.node.id}:e.from,to:ids.has(e.to.nodeId)?{...e.to,nodeId:op.node.id}:e.to}));graph.nodes=graph.nodes.filter(n=>!ids.has(n.id));graph.nodes.push({...clone(op.node),lineageIds:clone(op.nodeIds)});}}}
 function stage(title,question,reason,build,invariants,checkIds){const operations=[];
  const api={
   add(id,definitionId,label){const op=insert(id,definitionId,label);operations.push(op);apply([op]);},
   link(id,from,to,contractId,mode){const op=connect(id,from,to,contractId,mode);operations.push(op);apply([op]);},
   unlink(edgeId){const op={op:'disconnect',edgeId};operations.push(op);apply([op]);},
   replace(nodeId,definitionId,migration){const prior=find(nodeId),old=def(prior.definitionId),target=def(definitionId);for(const q of old.ports)if(!target.ports.some(r=>r.id===q.id))target.ports.push(clone(q));const op={op:'replace',nodeId,definitionId,migration};operations.push(op);apply([op]);},
   expand(nodeId,subsystemId,children,links,bindings){const parent=find(nodeId),start=clone(graph);const childNodes=children.map(([id,type,label])=>node(id,type,label));graph.nodes.push(...childNodes);const edges=links.map(([id,a,b,c,mode])=>connect(id,a,b,c,mode).edge);graph=start;const ports=bindings.map(([direction,cid,targetId])=>({id:port(p,parent.definitionId,direction,cid),direction,contractId:cid,target:{nodeId:targetId,portId:port(p,childNodes.find(n=>n.id===targetId).definitionId,direction,cid)}}));p.subsystems.push({id:subsystemId,version:1,definitionId:parent.definitionId,ports});const op={op:'expand',nodeId,subsystemId,nodes:childNodes,edges};operations.push(op);apply([op]);},
   merge(nodeIds,id,definitionId,reason){const parents=new Set(nodeIds.map(n=>find(n).parentId||null));if(parents.size!==1)throw Error('Merge needs one containment scope');if(nodeIds.some(n=>find(n).subsystemId))throw Error('Merge of expanded subsystems needs an explicit boundary migration');const target=def(definitionId);for(const n of nodeIds){for(const q of def(find(n).definitionId).ports)if(!target.ports.some(r=>r.id===q.id))target.ports.push(clone(q));}const merged=node(id,definitionId);const parentId=[...parents][0];if(parentId)merged.parentId=parentId;const op={op:'merge',nodeIds,node:merged,reason};operations.push(op);apply([op]);}
  };build(api);solution.stages.push({id:id+'-s'+(solution.stages.length+1),number:solution.stages.length+1,title,question,reason,operations,graph:clone(graph),invariants,checkIds});
 }
 function api(method,path,request,response,errors,ownerNodeId){solution.apis.push({method,path,request,response,errors,ownerNodeId});}
 function algorithm(id,ownerNodeId,code,guarantees){solution.algorithms.push({id,ownerNodeId,language:'typescript-pseudocode',code,guarantees});}
 function check(id,given,when,then,relatedRequirementIds){solution.acceptanceCases.push({id,given,when,then,relatedRequirementIds});}
 return {stage,api,algorithm,check,solution};
}
function sorted(value){return Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,sorted(value[k])])):value;}
module.exports={SCHEMA,library,problem,contract,component,builder,sorted};
