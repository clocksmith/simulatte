'use strict';
const {isDeepStrictEqual}=require('node:util');
const copy=value=>structuredClone(value);
const fail=message=>{throw Error('Composable study contract: '+message);};
function record(value,name){if(!value||typeof value!=='object'||Array.isArray(value))fail(name+' must be an object');}
function keys(value,required,optional=[],name='object'){
 record(value,name);
 for(const k of required)if(!(k in value))fail(name+' missing '+k);
 for(const k of Object.keys(value))if(!required.includes(k)&&!optional.includes(k))fail(name+' unknown field '+k);
}
function text(value,name){if(typeof value!=='string'||!value.trim())fail(name+' must be nonempty text');}
function array(value,name){if(!Array.isArray(value))fail(name+' must be an array');}
function texts(value,name){array(value,name);for(const v of value)text(v,name);}
function unique(rows,name){array(rows,name);const map=new Map();for(const row of rows){text(row.id,name+' ID');if(map.has(row.id))fail('duplicate '+name+' ID '+row.id);map.set(row.id,row);}return map;}
function shape(value,name){record(value,name);if(!Object.keys(value).length)fail(name+' cannot be empty');for(const [k,v]of Object.entries(value)){text(k,name+' key');text(v,name+'.'+k);}}
const MODES=['request-response','event-stream','storage','local-call'];
function graphShape(graph){
 keys(graph,['nodes','edges'],[],'graph');
 array(graph.nodes,'graph nodes');array(graph.edges,'graph edges');
 for(const n of graph.nodes){keys(n,['id','definitionId','version','label','position'],['parentId','subsystemId','lineageIds'],'node');for(const k of ['id','definitionId','label'])text(n[k],k);keys(n.position,['x','y']);if(!Number.isFinite(n.position.x)||!Number.isFinite(n.position.y))fail('nonfinite node position');if(n.parentId)text(n.parentId,'parentId');if(n.lineageIds)texts(n.lineageIds,'lineageIds');}
 for(const e of graph.edges){keys(e,['id','from','to','contractId','mode'],['label'],'edge');for(const k of ['id','contractId'])text(e[k],k);if(!MODES.includes(e.mode))fail('unknown edge mode '+e.mode);for(const endpoint of [e.from,e.to]){keys(endpoint,['nodeId','portId']);text(endpoint.nodeId,'endpoint node');text(endpoint.portId,'endpoint port');}}
}
function verifyGraph(graph,definitions,contracts,subsystems){
 graphShape(graph);const nodes=unique(graph.nodes,'node');unique(graph.edges,'edge');
 const port=(id,pid,direction,contractId)=>{const n=nodes.get(id),d=n&&definitions.get(n.definitionId);const q=d&&d.ports.find(p=>p.id===pid);if(!q||q.direction!==direction||q.contractId!==contractId)fail('incompatible '+direction+' endpoint '+id+'/'+pid+' for '+contractId);return n;};
 for(const n of nodes.values()){
  const d=definitions.get(n.definitionId);if(!d||d.version!==n.version)fail('unknown component version '+n.definitionId+'@'+n.version);
  if(n.parentId&&!nodes.has(n.parentId))fail('missing parent '+n.parentId);
  const visited=new Set([n.id]);let cursor=n;
  while(cursor.parentId){if(visited.has(cursor.parentId))fail('containment cycle');visited.add(cursor.parentId);cursor=nodes.get(cursor.parentId);if(!cursor)break;}
  if(n.subsystemId){const sub=subsystems.get(n.subsystemId);if(!sub||sub.definitionId!==n.definitionId)fail('invalid subsystem '+n.subsystemId);
   for(const q of sub.ports){const child=port(q.target.nodeId,q.target.portId,q.direction,q.contractId);if(child.parentId!==n.id)fail('subsystem binding is not a direct child');}
  }
 }
 for(const e of graph.edges){if(!contracts.has(e.contractId))fail('unknown contract '+e.contractId);for(const [endpoint,direction]of [[e.from,'out'],[e.to,'in']]){const n=port(endpoint.nodeId,endpoint.portId,direction,e.contractId);if(n.subsystemId){const sub=subsystems.get(n.subsystemId);if(!sub.ports.some(q=>q.id===endpoint.portId&&q.direction===direction&&q.contractId===e.contractId))fail('unexposed subsystem endpoint '+n.id+'/'+endpoint.portId);}}
  const a=nodes.get(e.from.nodeId),b=nodes.get(e.to.nodeId);
  if(a.parentId!==b.parentId)fail('connection crosses subsystem boundary without exposed ports: '+e.id);
 }
 return nodes;
}
function applyOperation(input,op){
 const graph=copy(input),node=id=>graph.nodes.find(n=>n.id===id),requireNode=id=>{if(!node(id))fail('operation references absent node '+id);return node(id);};
 const insert=n=>{if(node(n.id))fail('insert duplicate '+n.id);graph.nodes.push(copy(n));};
 const connect=e=>{requireNode(e.from.nodeId);requireNode(e.to.nodeId);if(graph.edges.some(q=>q.id===e.id))fail('connect duplicate '+e.id);graph.edges.push(copy(e));};
 if(op.op==='insert'){keys(op,['op','node']);insert(op.node);}
 else if(op.op==='connect'){keys(op,['op','edge']);connect(op.edge);}
 else if(op.op==='disconnect'){keys(op,['op','edgeId']);if(!graph.edges.some(e=>e.id===op.edgeId))fail('disconnect absent edge '+op.edgeId);graph.edges=graph.edges.filter(e=>e.id!==op.edgeId);}
 else if(op.op==='reconnect'){keys(op,['op','edgeId','edge','reason']);text(op.reason,'reconnect reason');if(op.edgeId!==op.edge.id)fail('reconnect must preserve edge identity');if(!graph.edges.some(e=>e.id===op.edgeId))fail('reconnect absent edge');graph.edges=graph.edges.filter(e=>e.id!==op.edgeId);connect(op.edge);}
 else if(op.op==='rebind'){keys(op,['op','nodeId','subsystemId','reason']);text(op.reason,'rebind reason');const n=requireNode(op.nodeId);if(!n.subsystemId)fail('rebind requires an expanded boundary');n.subsystemId=op.subsystemId;}
 else if(op.op==='replace'){keys(op,['op','nodeId','definitionId','migration'],['label']);text(op.migration,'replacement migration');const n=requireNode(op.nodeId);if(n.subsystemId)fail('replace expanded boundary needs a new explicit expansion');n.definitionId=op.definitionId;if(op.label!==undefined){text(op.label,'replacement label');n.label=op.label;}}
 else if(op.op==='expand'){keys(op,['op','nodeId','subsystemId','nodes','edges']);const parent=requireNode(op.nodeId);if(parent.subsystemId)fail('expand already expanded parent');parent.subsystemId=op.subsystemId;for(const child of op.nodes)insert({...child,parentId:op.nodeId});for(const e of op.edges)connect(e);}
 else if(op.op==='merge'){
  keys(op,['op','nodeIds','node','reason']);text(op.reason,'merge reason');texts(op.nodeIds,'merge IDs');if(new Set(op.nodeIds).size!==op.nodeIds.length||op.nodeIds.length<2)fail('merge needs distinct nodes');
  const old=op.nodeIds.map(requireNode),parents=new Set(old.map(n=>n.parentId||null));if(parents.size!==1)fail('merge containment mismatch');if(old.some(n=>n.subsystemId))fail('cannot implicitly flatten a subsystem');if((op.node.parentId||null)!==[...parents][0])fail('merge lost containment');if(node(op.node.id))fail('merge new identity already exists');
  const ids=new Set(op.nodeIds);graph.edges=graph.edges.filter(e=>!(ids.has(e.from.nodeId)&&ids.has(e.to.nodeId))).map(e=>({...e,from:ids.has(e.from.nodeId)?{...e.from,nodeId:op.node.id}:e.from,to:ids.has(e.to.nodeId)?{...e.to,nodeId:op.node.id}:e.to}));graph.nodes=graph.nodes.filter(n=>!ids.has(n.id));insert({...op.node,lineageIds:copy(op.nodeIds)});
 }else fail('unsupported operation '+op.op);
 return graph;
}
function validateProblem(p,library){
 keys(library,['schema','version','components']);if(library.schema!=='simulatte.studyComponents.v1'||library.version!==1)fail('unsupported component library');
 keys(p,['schema','version','problem','execution','provenance','references','contracts','components','subsystems','solutions']);if(!['simulatte.composableStudy.v1','simulatte.composableStudy.v2'].includes(p.schema)||p.version!==1)fail('unsupported schema/content version');
 keys(p.problem,['referenceId','studyLabel','scope','requirements']);if(!/^L\d{3}$/.test(p.problem.referenceId))fail('invalid Lucyd reference');text(p.problem.studyLabel,'studyLabel');text(p.problem.scope,'scope');
 const requirements=unique(p.problem.requirements,'requirement');for(const r of requirements.values()){keys(r,['id','text']);text(r.text,'requirement text');}
 keys(p.execution,['kind','implementation']);if(p.execution.kind!=='conceptual-design'||p.execution.implementation!==null)fail('design artifacts cannot claim execution');keys(p.provenance,['kind','note']);if(p.provenance.kind!=='authored-practice')fail('unsupported practice provenance');text(p.provenance.note,'provenance note');
 const references=unique(p.references,'reference');for(const r of references.values()){keys(r,['id','title','url','scope','supports']);if(r.scope!=='background')fail('technical citation must not imply interview provenance');let url;try{url=new URL(r.url);}catch{fail('invalid citation URL');}if(url.protocol!=='https:'||url.username||url.password)fail('unsafe citation URL');for(const k of ['title','supports'])text(r[k],k);}
 const contracts=unique(p.contracts,'contract');for(const c of contracts.values()){keys(c,['id','version','request','response']);if(c.version!==1)fail('unknown contract version');shape(c.request,'request shape');shape(c.response,'response shape');}
 const base=unique(library.components,'base definition'),defs=unique(p.components,'definition');
 for(const b of base.values()){keys(b,['id','version','kind','description']);if(b.version!==1||!['client','service','module','store','log','queue','worker','cache','directory','external'].includes(b.kind)||b.id!=='core.'+b.kind)fail('unsupported base definition');text(b.description,'base description');}
 for(const d of defs.values()){keys(d,['id','version','extends','label','responsibility','stateOwnership','ports']);if(d.version!==1)fail('unknown definition version');keys(d.extends,['id','version']);if(!base.has(d.extends.id)||base.get(d.extends.id).version!==d.extends.version)fail('unknown base definition');text(d.label,'definition label');text(d.responsibility,'responsibility');texts(d.stateOwnership,'state ownership');unique(d.ports,'port');for(const q of d.ports){keys(q,['id','direction','contractId']);if(!['in','out'].includes(q.direction)||!contracts.has(q.contractId))fail('invalid port contract');}}
 const subs=unique(p.subsystems,'subsystem');for(const sub of subs.values()){keys(sub,['id','version','definitionId','ports']);if(sub.version!==1||!defs.has(sub.definitionId))fail('unknown subsystem definition');unique(sub.ports,'exposed port');for(const q of sub.ports){keys(q,['id','direction','contractId','target']);keys(q.target,['nodeId','portId']);const external=defs.get(sub.definitionId).ports.find(x=>x.id===q.id);if(!external||external.contractId!==q.contractId||external.direction!==q.direction)fail('invalid exposure shape');}}
 unique(p.solutions,'solution');if(p.solutions.length<2)fail('at least two justified approaches required');
 let stages=0;for(const solution of p.solutions){
  keys(solution,['id','title','chooseWhen','tradeoffs','assumptions','initialGraph','stages','apis','algorithms','acceptanceCases']);for(const k of ['title','chooseWhen'])text(solution[k],k);texts(solution.tradeoffs,'tradeoffs');texts(solution.assumptions,'assumptions');if(!solution.tradeoffs.length||!solution.assumptions.length)fail('missing tradeoffs/assumptions');
  const checks=unique(solution.acceptanceCases,'acceptance case');for(const c of checks.values()){keys(c,['id','given','when','then','relatedRequirementIds'],['evidence']);for(const k of ['given','when','then'])text(c[k],k);texts(c.relatedRequirementIds,'requirement refs');for(const id of c.relatedRequirementIds)if(!requirements.has(id))fail('unknown requirement '+id);if(c.evidence){keys(c.evidence,['kind','testFile','testName']);if(c.evidence.kind!=='reference-test')fail('unknown evidence kind');text(c.evidence.testFile,'test file');text(c.evidence.testName,'test name');}}
  const coverage=new Set([...checks.values()].flatMap(c=>c.relatedRequirementIds));for(const id of requirements.keys())if(!coverage.has(id))fail('uncovered requirement '+id);
  let graph=copy(solution.initialGraph);verifyGraph(graph,defs,contracts,subs);unique(solution.stages,'stage');if(solution.stages.length<8)fail('at least eight stages required');
  for(const [i,stage]of solution.stages.entries()){
   keys(stage,['id','number','title','question','reason','operations','graph','invariants','checkIds'],['explanation','notes','code','followupIds']);if(stage.number!==i+1)fail('stage numbering');for(const k of ['title','question','reason'])text(stage[k],k);texts(stage.invariants,'invariants');texts(stage.checkIds,'check IDs');if(!stage.invariants.length||!stage.checkIds.length)fail('stage needs invariant and acceptance case');for(const id of stage.checkIds)if(!checks.has(id))fail('unknown stage acceptance case '+id);
   if(stage.explanation!==undefined)text(stage.explanation,'explanation');if(stage.notes)texts(stage.notes,'notes');if(stage.followupIds)texts(stage.followupIds,'followupIds');if(stage.code){array(stage.code,'stage code');for(const block of stage.code){keys(block,['id','kind','language','text']);if(!['api','pseudocode'].includes(block.kind))fail('unknown code kind');for(const k of ['id','language','text'])text(block[k],k);}}
   array(stage.operations,'operations');if(!stage.operations.length)fail('empty architectural transition');const before=copy(graph);for(const op of stage.operations){
    if(op.op==='rebind'&&p.schema!=='simulatte.composableStudy.v2')fail('rebind requires schema v2');
    if(op.op==='replace'&&op.label!==undefined&&p.schema!=='simulatte.composableStudy.v2')fail('replacement label requires schema v2');
    if(op.op==='replace'||op.op==='merge'){
     const target=defs.get(op.op==='replace'?op.definitionId:op.node.definitionId);
     const oldIds=op.op==='replace'?[op.nodeId]:op.nodeIds;
     if(!target)fail('unknown replacement definition');
     for(const id of oldIds){const old=graph.nodes.find(n=>n.id===id);if(!old)fail('absent replacement input');for(const q of defs.get(old.definitionId).ports)if(!target.ports.some(v=>isDeepStrictEqual(q,v)))fail('replacement or merge drops port '+q.id);}
    }
    graph=applyOperation(graph,op);
   }verifyGraph(graph,defs,contracts,subs);if(isDeepStrictEqual(before,graph))fail('stage does not change architecture');if(!isDeepStrictEqual(graph,stage.graph))fail('stored graph diverges from operation replay at '+stage.id);stages++;
  }
  const finalIds=new Set(graph.nodes.map(n=>n.id));
  for(const api of solution.apis){keys(api,['method','path','request','response','errors','ownerNodeId']);for(const v of Object.values(api))text(v,'API field');if(!finalIds.has(api.ownerNodeId))fail('missing API owner '+api.ownerNodeId);}
  unique(solution.algorithms,'algorithm');for(const a of solution.algorithms){keys(a,['id','ownerNodeId','language','code','guarantees']);for(const k of ['language','code'])text(a[k],k);texts(a.guarantees,'guarantees');if(!finalIds.has(a.ownerNodeId))fail('missing algorithm owner '+a.ownerNodeId);}
 }
 return {referenceId:p.problem.referenceId,solutions:p.solutions.length,stages};
}
module.exports={validateProblem,verifyGraph,applyOperation};
