 'use strict';
const crypto=require('node:crypto');
const {problem,contract,component,builder,sorted}=require('./study-solution-author.cjs');
const {applyOperation}=require('./study-contract.cjs');
// Each row declares a distinct architectural responsibility and its wire contract.
// Reference models exercise bounded rules only, not distributed services or stated latency targets.
// Binding IDs published before the semantic repair, with a fingerprint of their exact definition. Saved study
// workspaces key on these IDs, so an ID is reused only for a deep-equal definition; any other mapping takes the next
// number above every published one for that node, and retired IDs are never reissued.
const PUBLISHED_BINDINGS={'l018-online-boundary-binding-1':'75e33cc265b15ab0','l018-online-boundary-binding-2':'7d6060743196a828','l018-online-boundary-binding-3':'a8629b0be1943f3e','l018-materialized-boundary-binding-1':'a634722142629f67','l018-materialized-boundary-binding-2':'81ca838cfa82f6f4','l018-materialized-boundary-binding-3':'248d71c12b06c9cd','l018-materialized-boundary-binding-4':'f8a28ef2d2e98c69','l021-workflow-boundary-binding-1':'ce19f607235cacdb','l021-workflow-boundary-binding-2':'94648bda1452e295','l021-workflow-boundary-binding-3':'40dd36964a3698b0','l021-journal-boundary-binding-1':'7d00634eed9a128d','l021-journal-boundary-binding-2':'49ec534452d23ad0','l021-journal-boundary-binding-3':'ae86676f50f19d2a','l027-orchestrated-boundary-binding-1':'f1a6d1ea8a8deb63','l027-orchestrated-boundary-binding-2':'0c878046b068eabc','l027-orchestrated-boundary-binding-3':'2afe558d71b3be7f','l027-events-boundary-binding-1':'ca93b4eae7df84d8','l027-events-boundary-binding-2':'381541ed295df939','l027-events-boundary-binding-3':'5e1759156a314751','l031-local-boundary-binding-1':'e65c7b664b1c554c','l031-local-control-binding-1':'780aca1edfcc6848','l031-local-capacity-binding-1':'a795fa90bc5f86ff','l031-local-boundary-binding-2':'96b01a19b4367245','l031-local-control-binding-2':'fce506c129c2c868','l031-local-capacity-binding-2':'543007cb15b0a725','l031-local-capacity-binding-3':'4ced9badf7a24d46','l031-remote-boundary-binding-1':'03425c97291dfc51','l031-remote-control-binding-1':'5552f877a99e8760','l031-remote-capacity-binding-1':'d5a7aa195b0e1dad','l031-remote-boundary-binding-2':'c36d0d83b9b3ced3','l031-remote-control-binding-2':'6ea714a6b521d3b2','l031-remote-capacity-binding-2':'0ff40f8d1c09a186','l031-remote-capacity-binding-3':'3849d8f9ac878d24'};
const bindingFingerprint=({id,...definition})=>crypto.createHash('sha256').update(JSON.stringify(sorted(definition))).digest('hex').slice(0,16);
const IMPLICIT_REBIND='Select a new immutable exposure binding before connecting the added responsibility; prior stage binding remains unchanged.';
function freezeBindings(p){
 const original=new Map(p.subsystems.map(sub=>[sub.id,sub])),frozen=[],issued=new Set(Object.keys(PUBLISHED_BINDINGS));
 for(const solution of p.solutions){let previous=solution.initialGraph;const cache=new Map();
  for(const stage of solution.stages){
   const graph=stage.graph,nodes=new Map(graph.nodes.map(n=>[n.id,n])),needed=new Map();
   function need(nodeId,portId){const node=nodes.get(nodeId);if(!node?.subsystemId)return;const ports=needed.get(nodeId)||new Set();if(ports.has(portId))return;ports.add(portId);needed.set(nodeId,ports);const sub=original.get(node.subsystemId),mapping=sub.ports.find(q=>q.id===portId);if(!mapping)throw Error('Missing nested exposure '+nodeId+'/'+portId);need(mapping.target.nodeId,mapping.target.portId);}
   for(const edge of graph.edges)for(const endpoint of [edge.from,edge.to])need(endpoint.nodeId,endpoint.portId);
   const selected=new Map();
   for(const node of graph.nodes.filter(n=>n.subsystemId)){
    const base=original.get(node.subsystemId),used=needed.get(node.id)||new Set(),ports=base.ports.filter(q=>used.has(q.id));
    const key=node.id+JSON.stringify(ports);let id=cache.get(key);
    if(!id){
     const definition={...structuredClone(base),ports:structuredClone(ports)},stem=p.problem.referenceId.toLowerCase()+'-'+solution.id+'-'+node.id+'-binding-',fingerprint=bindingFingerprint(definition);
     const numbers=[...issued].filter(k=>k.startsWith(stem)&&/^\d+$/.test(k.slice(stem.length))).map(k=>Number(k.slice(stem.length)));
     id=numbers.map(n=>stem+n).find(k=>PUBLISHED_BINDINGS[k]===fingerprint&&!frozen.some(sub=>sub.id===k))||stem+(Math.max(0,...numbers)+1);
     issued.add(id);cache.set(key,id);frozen.push({...definition,id});
    }
    selected.set(node.id,id);node.subsystemId=id;
   }
   // An authored rebind keeps its own reason; only implicit exposure rebinds get the generic reason.
   const explicit=new Map(stage.operations.filter(op=>op.op==='rebind').map(op=>[op.nodeId,op.reason]));
   stage.operations=stage.operations.filter(op=>op.op!=='rebind');
   for(const op of stage.operations)if(op.op==='expand')op.subsystemId=selected.get(op.nodeId);
   const rebinding=[];for(const [nodeId,subsystemId]of selected){const old=previous.nodes.find(n=>n.id===nodeId);if(old?.subsystemId&&old.subsystemId!==subsystemId)rebinding.push({op:'rebind',nodeId,subsystemId,reason:explicit.get(nodeId)||IMPLICIT_REBIND});}
   for(const nodeId of explicit.keys())if(!rebinding.some(op=>op.nodeId===nodeId))throw Error('Explicit rebind selects no new binding for '+nodeId+' at '+stage.id);
   stage.operations.unshift(...rebinding);
   let replay=structuredClone(previous);for(const op of stage.operations)replay=applyOperation(replay,op);stage.graph=replay;previous=replay;
  }
 }
 p.subsystems=frozen;return p;
}
const COMMAND_ERRORS='401 unauthenticated; 409 stale identity/version; 429 bounded capacity; 503 unavailable authority';
const READ_ERRORS='403 unauthorized scope; 404 absent identity; 410 expired retained history';
// Approach fields: steps[] (one stage each, with its own invariant `inv`), edges[] for stages 3-8, optional nodes/contracts/components,
// its own command and read APIs, its own bounded-rule code, and its own acceptance cases:
// [id, given, when, then, requirement IDs it covers, stage numbers that establish it, evidence test name].
function author(spec){
 const p=problem(spec.id,spec.title,spec.scope,spec.requirements.map((text,i)=>({id:'r'+i,text})),spec.refs.map(([title,url,supports],i)=>({id:'ref'+i,title,url,scope:'background',supports})));
 const mechanismFile='tools/simulatte/study-reference/batch-'+String(spec.batch).padStart(2,'0')+'-mechanisms.test.mjs';
 for(const a of spec.approaches){
  const prefix=spec.id.toLowerCase()+'.'+a.id;
  const cid=i=>prefix+'.c'+i,did=i=>prefix+'.d'+i,ref=key=>typeof key==='number'?cid(key):prefix+'.'+key;
  for(const [i,t]of a.steps.entries()){
   contract(p,cid(i),t.request,t.response);
   component(p,did(i),t.label,t.kind,t.reason,[t.state]);
  }
  component(p,prefix+'.caller','Caller','client','Submit the declared operation with authenticated identity and preserve its retry identity.',['request identity']);
  component(p,prefix+'.control','Command control','module',a.steps[0].reason,['validated command and version']);
  for(const [key,request,response]of a.contracts||[])contract(p,ref(key),request,response);
  for(const [key,label,kind,responsibility,state]of a.components||[])component(p,ref(key),label,kind,responsibility,[state]);
  const m=a.mechanism,cases=[['mechanism',m.given,m.when,m.then,m.requirements,m.stages,m.test],...a.cases];
  const establishedAt=n=>{const ids=cases.filter(c=>c[5].includes(n)).map(c=>c[0]);if(!ids.length)throw Error(spec.id+' '+a.id+' stage '+n+' establishes no acceptance case');return ids;};
  const b=builder(p,a.id,a.title,a.choose,a.trade,a.assumptions),ctx={p,b,prefix,cid,did,ref};
  for(const [i,t]of a.steps.entries()){
   b.stage(t.title||t.label,t.question,t.reason,s=>{
    if(i===0){s.add('caller',prefix+'.caller');s.add('boundary',did(0));s.link('request','caller','boundary',cid(0));}
    else if(i===1){s.expand('boundary',prefix+'.authority',[['control',prefix+'.control'],['state',did(1)]],[['commit','control','state',cid(1),'storage']],[['in',cid(0),'control']]);}
    else if(a.build)a.build(i,s,ctx);
    else{s.add('n'+i,did(i));for(const [id,key,label]of a.nodes?.[i+1]||[])s.add(id,ref(key),label);for(const [eid,from,to,type,,mode]of a.edges[i-2])s.link(eid,from,to,ref(type),mode);}
   },[t.inv],establishedAt(i+1));
   b.solution.stages.at(-1).explanation=t.reason+' The graph is an authored conceptual design; guarantees require the named deployment contracts.';
  }
  if(a.finish)a.finish(ctx);
  const base='/'+spec.id.toLowerCase()+'/'+a.id;
  b.api('POST',base,JSON.stringify(a.steps[0].request),JSON.stringify(a.steps[0].response),COMMAND_ERRORS,'control');
  b.api('GET',base+a.read.path,JSON.stringify(a.read.request),JSON.stringify(a.read.response),READ_ERRORS,a.read.owner);
  for(const [method,path,request,response,errors,owner]of a.apis||[])b.api(method,base+path,JSON.stringify(request),JSON.stringify(response),errors,owner);
  b.algorithm('bounded-rule',a.algorithmOwner,a.code,['The code states the bounded decision rule; unimplemented helpers remain pseudocode.','External effects, distributed failure and latency require separate execution evidence.']);
  b.algorithm('recover',a.recoverOwner||'n7',a.recovery,a.recoverGuarantees||[a.steps[7].reason]);
  for(const [id,owner,code,guarantees]of a.algorithms||[])b.algorithm(id,owner,code,guarantees);
  for(const [id,given,when,then,requirements,,test]of cases){b.check(id,given,when,then,requirements);if(test)b.solution.acceptanceCases.at(-1).evidence=Array.isArray(test)?{kind:'reference-test',testFile:test[0],testName:test[1]}:{kind:'reference-test',testFile:mechanismFile,testName:test};}
  const labels=new Map([...(a.edges||[]).flat().map(e=>[e[0],e[4]]),...(a.labels||[])]);labels.set('request','submit '+spec.title.toLowerCase());labels.set('commit','commit versioned state');
  const label=id=>labels.get(id)||id.replaceAll('-',' ');
  for(const stage of b.solution.stages){for(const op of stage.operations){if(op.edge)op.edge.label=label(op.edge.id);if(op.edges)for(const edge of op.edges)edge.label=label(edge.id);}for(const edge of stage.graph.edges)edge.label=label(edge.id);}
 }
 return freezeBindings(p);
}
function port(p,id,direction,contractId){const d=p.components.find(c=>c.id===id),pid=direction+'-'+contractId;if(!d.ports.some(q=>q.id===pid))d.ports.push({id:pid,direction,contractId});return pid;}
// L031 draws two instances of one pinned capacity definition. Local nests them in the backend process;
// remote reaches them by RPC through the adapter, with a journaled generationKey and an outcome reconciler.
function l031Build(remote){return (i,s,{prefix,cid,did,ref})=>{
 if(i===2){
  if(remote){
   s.expand('control',prefix+'.generation',[['router',prefix+'.router']],[],[['in',cid(0),'router'],['out',cid(1),'router']]);
   s.add('capacity',did(2),'Remote capacity A');s.add('capacity-b',did(2),'Remote capacity B');
   s.link('admit','router','capacity',cid(2));s.link('admit-b','router','capacity-b',cid(2));
  }else s.expand('control',prefix+'.generation',[['router',prefix+'.router'],['capacity',did(2),'Capacity instance A'],['capacity-b',did(2),'Capacity instance B']],[['admit','router','capacity',cid(2)],['admit-b','router','capacity-b',cid(2)]],[['in',cid(0),'router'],['out',cid(1),'router']]);
 }
 if(i===3){
  s.expand('capacity',prefix+'.capacity-v1',[['admission',did(3)],['worker',prefix+'.worker']],[['run','admission','worker',cid(3)]],[['in',cid(2),'admission']]);
  s.expand('capacity-b',prefix+'.capacity-b-v1',[['admission-b',did(3),'Admission B'],['worker-b',prefix+'.worker','Worker B']],[['run-b','admission-b','worker-b',cid(3)]],[['in',cid(2),'admission-b']]);
 }
 if(i===4){
  s.add('n4',did(4));
  if(remote){s.unlink('admit');s.unlink('admit-b');s.link('rpc','router','n4',cid(4));s.link('wire','n4','capacity',cid(2));s.link('wire-b','n4','capacity-b',cid(2));}
  else{s.link('adapt','worker','n4',cid(4));s.link('adapt-b','worker-b','n4',cid(4));}
 }
 if(i===5){
  s.replace('worker',did(5),'Drain or fence in-flight generation attempts; preserve stable generation identity and compatible ports.');
  if(remote){s.add('reconciler',ref('reconciler'));s.link('unknown','reconciler','state',ref('intents'),'storage');s.link('lookup','reconciler','n4',cid(4));}
 }
 if(i===6)s.add('n6',did(6));
 if(i===7){s.add('operator',ref('operator'));s.add('n7',did(7));s.link('select','operator','n7',cid(7));s.link('activate','n7','capacity',ref('activate'));}
};}
// The builder cannot insert into an expanded instance, so the candidate's containment, its internal links and the
// explicit upgrade binding are added here and every stage graph is replayed. Earlier bindings are never edited.
function l031Finish(remote){return ({p,b,prefix,cid,did,ref})=>{
 const stages=b.solution.stages;
 stages[6].operations.find(op=>op.op==='insert'&&op.node.id==='n6').node.parentId='capacity';
 const local=(id,from,to,contractId)=>({op:'connect',edge:{id,from:{nodeId:from[0],portId:port(p,from[1],'out',contractId)},to:{nodeId:to[0],portId:port(p,to[1],'in',contractId)},contractId,mode:'local-call'}});
 stages[6].operations.push(local('candidate-work',['n6',did(6)],['worker',did(5)],cid(3)));
 if(remote)stages[6].operations.push(local('ledger',['n6',did(6)],['admission',did(3)],ref('ledger')));
 else{
  // The builder names a boundary exposure after the child it crosses ('control'), so both instances' adapter edges
  // would share one boundary port that resolves to instance A. Instance B gets its own boundary exposure.
  const portId='out-'+cid(4)+'-control-capacity-b',authority=p.subsystems.find(sub=>sub.id===prefix+'.authority');
  p.components.find(c=>c.id===did(0)).ports.push({id:portId,direction:'out',contractId:cid(4)});
  authority.ports.push({id:portId,direction:'out',contractId:cid(4),target:{nodeId:'control',portId:'out-'+cid(4)+'-capacity-b'}});
  stages[4].operations.find(op=>op.op==='connect'&&op.edge.id==='adapt-b').edge.from.portId=portId;
 }
 const prior=p.subsystems.find(sub=>sub.id===prefix+'.capacity-v1'),next={...structuredClone(prior),id:prefix+'.capacity-v2'};
 next.ports.find(q=>q.direction==='in'&&q.contractId===cid(2)).target={nodeId:'n6',portId:port(p,did(6),'in',cid(2))};
 next.ports.push({id:port(p,did(2),'in',ref('activate')),direction:'in',contractId:ref('activate'),target:{nodeId:'n6',portId:port(p,did(6),'in',ref('activate'))}});
 p.subsystems.push(next);
 stages[7].operations.push({op:'rebind',nodeId:'capacity',subsystemId:next.id,reason:'Explicit compatible instance upgrade requested by the operator at the expected registry version: rebind only capacity instance A to a new immutable binding; instance B and the binding used by earlier stages stay unchanged.'});
 let graph=structuredClone(b.solution.initialGraph);for(const stage of stages){for(const op of stage.operations)graph=applyOperation(graph,op);stage.graph=structuredClone(graph);}
};}
function buildL018(){return author({
  "batch": 2,
  "id": "L018",
  "title": "Grounded enterprise retrieval",
  "scope": "Versioned ACL-aware retrieval, reranking and schema-checked answers. The prompt under-200ms target is a budget to measure per phase, not a promise for arbitrary corpus/model/hardware. Measure retrieval latency, time-to-first-token and full response completion separately; under 200ms is an unverified retrieval/initial-response objective, never an established completion bound.",
  "requirements": ["Retrieve only authorized, current document versions and cite exact spans.","Separate syntactic response validation from evidence/entailment checks.","Bound retrieval/rerank/generation work and surface stale or missing evidence."],
  "refs": [["JSON Schema validation","https://json-schema.org/draft/2020-12/json-schema-validation","Response shape validation; semantic grounding remains a separate check."],["Elasticsearch hybrid search","https://www.elastic.co/docs/solutions/search/hybrid-search","Combining lexical and vector retrieval; ranking choices need recall evaluation."]],
  "approaches": [
    {
      "id": "online",
      "title": "Online retrieve-rerank-generate orchestration",
      "choose": "Fresh per-query context and flexible questions dominate.",
      "trade": ["Cross-encoder and model work add latency; top-k reductions require measured recall support."],
      "assumptions": ["Source versions and ACL epochs are authoritative; model output is untrusted."],
      "steps": [
        {"label":"Answer gateway","question":"What can the assistant promise?","reason":"Authenticate tenant and accept a bounded question with an explicit deadline.","state":"query identity and deadline","request":{"tenantId":"uuid","queryId":"uuid","question":"string"},"response":{"state":"accepted|rejected"},"kind":"service","inv":"A query is accepted only with an authenticated tenant and an explicit deadline, and every later phase runs under that tenantId."},
        {"label":"Document authority","question":"Which source version is truth?","reason":"Expand gateway; retain immutable source revisions and current ACL epochs.","state":"document revision and ACL","request":{"documentId":"uuid","revision":"integer"},"response":{"contentHash":"sha256","aclEpoch":"integer"},"kind":"store","inv":"Document revisions are immutable, and the authority's current tenant and ACL epoch override whatever an index recorded."},
        {"label":"Embedding lane","question":"Can incompatible vectors mix?","reason":"Pin embedding model, dimensions and normalization to the selected index version.","state":"embedding compatibility identity","request":{"question":"string","modelVersion":"string"},"response":{"vector":"float[d]"},"kind":"worker","inv":"Query vectors come from the embedding model, dimension and normalization pinned to the index version being searched."},
        {"label":"Candidate retrieval","question":"What if dense search misses a term?","reason":"Union lexical and vector candidates with provenance and bounded recall-tested k.","state":"candidate scores and source versions","request":{"vector":"float[d]","terms":"string[]","k":"integer"},"response":{"candidates":"versioned spans[]"},"kind":"module","inv":"Every candidate carries its tenantId, documentId, revision and retrieval provenance, and k is fixed per index version."},
        {"label":"ACL and freshness","question":"Can stale index permissions leak text?","reason":"Filter candidates against current tenant, source ACL and revision before model context assembly.","state":"current source eligibility","request":{"candidateIds":"versioned span ids[]","tenantId":"uuid","actorId":"uuid"},"response":{"eligible":"span ids[]"},"kind":"module","inv":"Only spans whose tenant, current revision and current ACL epoch match the authority enter model context."},
        {"label":"Cross-encoder","question":"Which candidates deserve context?","reason":"Rerank eligible candidates within token/deadline budgets; retain rejected-score evidence.","state":"ranked candidate receipt","request":{"question":"string","candidates":"spans[]"},"response":{"ranked":"scored spans[]"},"kind":"worker","inv":"Reranking scores only eligible spans and stops at the phase deadline, recording which candidates were left unscored."},
        {"label":"Grounded generation","question":"Is valid JSON necessarily correct?","reason":"Generate a typed answer tied to supplied span IDs, then validate shape and citation membership.","state":"answer draft and validation status","request":{"context":"authorized spans[]","schemaVersion":"integer"},"response":{"answer":"typed object","citations":"span ids[]"},"kind":"worker","inv":"The generator may cite only span IDs it was given, and its output is checked against the schema before any evidence check."},
        {"label":"Evidence gate","question":"When should the assistant abstain?","reason":"Check support and stale sources before release; record unsupported claims rather than inventing citations.","state":"support verdict and phase timings","request":{"answer":"typed object","tenantId":"uuid","currentRevision":"integer","aclEpoch":"integer"},"response":{"status":"release|abstain|retry"},"kind":"module","inv":"An answer is released only with at least one citation, every citation eligible for the tenant now, and a separate support verdict; otherwise it abstains."},
      ],
      "edges": [
        [["embed","control","n2",2,"embed query with pinned model","request-response"]],
        [["retrieve","n2","n3",3,"retrieve hybrid candidates","request-response"]],
        [["eligibility","n3","n4",4,"filter source eligibility","request-response"],["authority","n4","state",1,"check current ACL and revision","storage"]],
        [["rerank","n4","n5",5,"rerank authorized candidates","request-response"]],
        [["generate","n5","n6",6,"assemble grounded answer","request-response"]],
        [["gate","n6","n7",7,"validate support before release","request-response"],["source-check","n7","state",1,"recheck cited revisions","storage"]],
      ],
      "read": {"path":"/queries/{queryId}","request":{"tenantId":"uuid","queryId":"uuid"},"response":{"status":"pending|release|abstain|retry","citations":"span ids[]","phaseTimingsMs":"map"},"owner":"n7"},
      "code": `// Evidence gate (n7): current = {tenantId, aclEpoch, revision, allowedIds} read from the document authority at gate time.
// false means abstain; true only accepts shape and citation membership, and a separate support check decides entailment.
function citationGate(answer,spans,current){
 const eligible=spans.filter(s=>s.tenantId===current.tenantId&&s.aclEpoch===current.aclEpoch&&s.revision===current.revision&&current.allowedIds.has(s.id));
 return answer.citations.length>0&&answer.citations.every(id=>eligible.some(s=>s.id===id));
}`,
      "recovery": "for (const claim of draft.claims) {\n if (!claim.citations.length || !claim.citations.every(currentAuthorizedSpan)) return abstain(claim);\n if (!supportCheck(claim, claim.citations)) return abstain(claim);\n}\nreturn releaseWithPhaseTimings(draft);\n// Support checking is a specified gate; the bounded reference test checks only citation membership.",
      "mechanism": {"given":"The gate checks citations against tenant t1, ACL epoch 2 and revision 6.","when":"Gate answers that cite a current span, nothing, a stale-revision span, a span at an old ACL epoch that is still allowed by ID, a tenant-t2 span, and a span not allowed by ID.","then":"Only the answer citing the current t1 span passes; zero citations, stale revision, stale ACL epoch, cross-tenant and disallowed citations are rejected. Passing shows membership, not entailment.","requirements":["r0","r1"],"stages":[5,8],"test":"L018 bounded mechanism"},
      "cases": [
        ["acl","A retrieved document is revoked before context assembly.","Check its current ACL and revision.","Exclude it from model context and refuse answers requiring its evidence.",["r0"],[2,5]],
        ["budget","Reranking cannot complete before the request deadline.","Exhaust the phase budget.","Abstain or return an explicitly incomplete result, never claim the under-200ms target was met.",["r2"],[1,6]],
        ["support","An answer is valid JSON but cites an absent span.","Validate shape and citation membership.","Reject the citation; passing membership still requires a separate semantic support verdict.",["r1"],[7,8]],
        ["pinning","The index was rebuilt with a new embedding model version.","A query arrives embedded with the old model.","Retrieval refuses the incompatible vector and reports the missing dense evidence instead of mixing dimensions; lexical candidates keep their provenance.",["r2"],[3,4]],
      ],
      "algorithmOwner": "n7",
    },
    {
      "id": "materialized",
      "title": "Versioned answer packs with online verification",
      "choose": "Queries repeat over a controlled domain and reviewed packs can cover common intents.",
      "trade": ["Precomputation uses storage and can lag source updates; arbitrary questions need abstention or a separate path."],
      "assumptions": ["Packs carry source hashes and ACL scope; cache hits do not bypass current authorization."],
      "steps": [
        {"label":"Pack request","question":"What is the supported query domain?","reason":"Classify against declared intent IDs and refuse unsupported questions explicitly.","state":"intent classification receipt","request":{"tenantId":"uuid","question":"string"},"response":{"intentId":"string|unsupported"},"kind":"service","inv":"A question maps to a declared intentId or to unsupported, and an unsupported question is never answered from a pack."},
        {"label":"Pack manifest","question":"Which facts produced an answer?","reason":"Expand request boundary; retain content hashes, source revisions and pack schema version.","state":"pack versions and source hashes","request":{"intentId":"string","packVersion":"integer"},"response":{"sourceRevisions":"map","schemaVersion":"integer"},"kind":"store","inv":"A manifest version pins the content hash and revision of every source it uses plus its schema version, and is immutable once written."},
        {"label":"Ingest snapshot","question":"How are changing sources staged?","reason":"Freeze source revisions and normalize exact citation spans before constructing a new pack.","state":"ingestion snapshot","request":{"sourceIds":"uuid[]","revision":"integer"},"response":{"spans":"versioned text spans[]"},"kind":"worker","inv":"A pack is built from one frozen snapshot of source revisions with exact span offsets."},
        {"label":"Offline retrieval","question":"Can a pack omit evidence?","reason":"Evaluate lexical/dense recall against labeled intent questions before promoting candidate sets.","state":"retrieval evaluation receipt","request":{"intentId":"string","corpusSnapshot":"uuid"},"response":{"candidateSpans":"span ids[]"},"kind":"worker","inv":"A candidate set is promoted only with a recall evaluation receipt against labeled questions for that intent."},
        {"label":"Pack compiler","question":"What is generated ahead of time?","reason":"Build schema-validated answer templates with explicit claim-to-span bindings.","state":"compiled answer pack","request":{"candidates":"spans[]","schemaVersion":"integer"},"response":{"packHash":"sha256"},"kind":"worker","inv":"Every claim in a compiled pack binds to span IDs from the frozen snapshot, and schema validity alone never satisfies that binding."},
        {"label":"Atomic publication","question":"Can readers see half a pack?","reason":"Publish one immutable manifest only after pack bytes and dependencies are complete.","state":"active manifest pointer","request":{"expectedPackVersion":"integer","newPackHash":"sha256"},"response":{"publishedVersion":"integer"},"kind":"module","inv":"The active manifest pointer moves by compare-and-swap on expectedPackVersion, and only after all pack bytes and dependencies exist."},
        {"label":"Online verification","question":"Does a cache hit preserve access?","reason":"Ask the source ACL authority for the actor's current tenant ACL epoch and source revisions, and fill only typed allowed slots before returning citations.","state":"online eligibility verdict","request":{"packHash":"sha256","tenantId":"uuid","actorId":"uuid"},"response":{"answer":"typed object|abstain"},"kind":"module","inv":"A cache hit is served only after the ACL authority confirms the actor's current tenant, ACL epoch and every cited source revision; otherwise the answer abstains."},
        {"label":"Invalidation repair","question":"What if a source is revoked?","reason":"Invalidate affected packs, expose freshness and rebuild; do not reuse invalid support while rebuilding.","state":"invalidation cursor","request":{"sourceId":"uuid","newRevision":"integer"},"response":{"invalidated":"pack hashes[]"},"kind":"worker","inv":"A revocation from the ACL authority invalidates every dependent pack before rebuild starts, and an invalidated pack is never served while its replacement builds."},
      ],
      "components": [["acl","Source ACL authority","directory","Hold current per-tenant ACL epochs and source revisions, answer read-time eligibility for cited sources, and publish revocations.","current ACL epochs and source revisions"]],
      "contracts": [["eligibility",{"tenantId":"uuid","actorId":"uuid","sourceIds":"uuid[]"},{"aclEpoch":"integer","revisions":"map","allowedSourceIds":"uuid[]"}]],
      "nodes": {"7":[["acl","acl"]]},
      "edges": [
        [["ingest","control","n2",2,"freeze source revisions","request-response"]],
        [["retrieve","n2","n3",3,"evaluate pack retrieval","request-response"]],
        [["compile","n3","n4",4,"compile claim and span bindings","request-response"]],
        [["publish","n4","n5",5,"publish immutable pack manifest","request-response"],["activate","n5","state",1,"compare active pack version","storage"]],
        [["query","caller","n6",6,"resolve supported intent","request-response"],["manifest","n6","state",1,"read pinned pack metadata","storage"],["acl-check","n6","acl","eligibility","recheck current ACL and revisions","request-response"]],
        [["invalidate","n7","state",7,"invalidate affected pack versions","storage"],["rebuild","n7","n2",2,"rebuild source snapshot","request-response"],["revocations","acl","n7",7,"stream source revocations","event-stream"]],
      ],
      "read": {"path":"/packs/{intentId}","request":{"tenantId":"uuid","intentId":"string"},"response":{"activePackVersion":"integer","sourceRevisions":"map","freshness":"current|invalidated|rebuilding"},"owner":"n6"},
      "code": `// Online verification (n6): current = {tenantId, aclEpoch, revision, allowedIds} comes from the source ACL authority, not from the pack.
// false means abstain; cached pack bytes never stand in for current authorization.
function citationGate(answer,spans,current){
 const eligible=spans.filter(s=>s.tenantId===current.tenantId&&s.aclEpoch===current.aclEpoch&&s.revision===current.revision&&current.allowedIds.has(s.id));
 return answer.citations.length>0&&answer.citations.every(id=>eligible.some(s=>s.id===id));
}`,
      "recovery": "for (const packId of dependencyIndex.packsUsing(sourceId)) {\n invalidate(packId, newRevision);\n enqueueRebuild(packId, newRevision);\n}\n// Online verification compares every cited source revision and current ACL before using cached bytes.",
      "mechanism": {"given":"A cached pack answer cites spans compiled for tenant t1 at ACL epoch 2 and revision 6, and the ACL authority reports those as current.","when":"Verify answers citing the current span, nothing, a stale-revision span, a span at an old ACL epoch still allowed by ID, a tenant-t2 span, and a span not allowed by ID.","then":"Only the answer citing the current t1 span is served; every other answer abstains.","requirements":["r0","r1"],"stages":[7],"test":"L018 bounded mechanism"},
      "cases": [
        ["acl","A pack was compiled for a tenant whose source ACL changes.","Serve a cached intent.","The ACL authority's current ACL epoch and source revision are rechecked; unauthorized cached text is withheld and the revocation invalidates the pack.",["r0"],[7,8]],
        ["budget","A question is outside the pack intent catalogue.","Classify and attempt lookup.","Return unsupported/abstain rather than making a cached answer fit a different question.",["r2"],[1]],
        ["support","A compiled answer template is schema-valid but one claim binds to a span absent from the snapshot.","Compile the pack and request activation.","The claim-to-span check fails even though the schema passes, so the pack is not activated.",["r1"],[5,6]],
        ["publish","A pack manifest is submitted before one dependent blob exists.","Validate publication readiness.","Refuse activation until all hashes resolve; readers keep the previous active version and see its freshness.",["r2"],[6]],
        ["snapshot","A source changes while a pack build is running.","Compile the pack.","The pack uses only the frozen snapshot revisions recorded in its manifest, and the change triggers a new build.",["r0"],[2,3,4]],
      ],
      "algorithmOwner": "n6",
    },
  ],
});}
function buildL021(){return author({
  "batch": 2,
  "id": "L021",
  "title": "Task trajectories and recovery",
  "scope": "A task DAG covers planning, research, constraint inspection, synthesis, review and publication. Public status exposes work states and receipts, never private reasoning. Remote effect reconciliation is distinct from journal delivery.",
  "requirements": ["Run tasks only after their declared predecessors commit outputs.","Use stable effect identities and fence superseded attempts.","Expose public status and recover uncertain effects without duplicate publication."],
  "refs": [["PostgreSQL isolation","https://www.postgresql.org/docs/18/transaction-iso.html","Versioned transactions and retrying serialization conflicts."],["Temporal workflow execution","https://docs.temporal.io/workflow-execution","Durable workflow histories and retryable activities; activity effects need idempotency."]],
  "approaches": [
    {
      "id": "workflow",
      "title": "One durable workflow per task DAG",
      "choose": "Long-lived task recovery and durable timers are primary.",
      "trade": ["Workflow histories/versioning add operations; activities still need remote idempotency."],
      "assumptions": ["Only public task state/output receipts are journaled; reasoning is not a status payload."],
      "steps": [
        {"label":"Task submission","question":"What does accepted mean?","reason":"Validate acyclic dependencies and assign stable task/run IDs before work.","state":"run identity","request":{"runId":"uuid","dag":"typed tasks and dependencies"},"response":{"state":"accepted|invalid"},"kind":"service","inv":"A run is accepted only if its task graph is acyclic and every dependency names a declared task; task and run IDs never change afterwards."},
        {"label":"Decision history","question":"Which decisions survive restart?","reason":"Expand coordinator; journal transitions and output references before scheduling dependents.","state":"workflow history and task states","request":{"runId":"uuid","taskId":"uuid"},"response":{"state":"pending|ready|running|done"},"kind":"log","inv":"Every transition and output reference is journaled before a dependent task is scheduled, so replay reproduces the same decisions."},
        {"label":"Ready scheduler","question":"Can synthesis race research?","reason":"Release a task only when every predecessor has a committed receipt from its current attempt; activities report receipts back here, never to the next task.","state":"dependency counters","request":{"taskId":"uuid","predecessorReceipts":"(taskId, epoch, outputHash)[]"},"response":{"ready":"boolean"},"kind":"module","inv":"Only the scheduler releases tasks, and it releases one only after every predecessor has a journaled receipt from that predecessor's current attempt."},
        {"label":"Research activities","question":"What is retried after a crash?","reason":"Execute research/tool steps with stable effect keys and bounded attempts; return the output receipt to the scheduler.","state":"activity attempt fence","request":{"effectKey":"uuid","attempt":"integer"},"response":{"receipt":"external receipt|unknown","epoch":"integer","outputHash":"sha256"},"kind":"worker","inv":"A research activity runs under a stable effect key and a bounded attempt count, and returns its receipt to the scheduler rather than calling the next task."},
        {"label":"Constraint gate","question":"Can generated output ignore limits?","reason":"Run source/constraint inspection as its own scheduled task; synthesis requires its committed receipt.","state":"constraint verdict","request":{"sourceRefs":"immutable refs[]","constraints":"typed limits"},"response":{"allowed":"boolean","violations":"string[]"},"kind":"module","inv":"Constraint inspection is dispatched by the scheduler, and its verdict is a committed receipt that synthesis cannot start without."},
        {"label":"Review checkpoint","question":"Who authorizes publication?","reason":"Review the synthesized artifact the scheduler released; persist verdict and artifact hash, and require fresh review for any revision.","state":"reviewed artifact hash","request":{"artifactHash":"sha256","reviewVersion":"integer"},"response":{"decision":"approve|revise|reject"},"kind":"module","inv":"Review approves exactly one artifact hash; any change to the artifact needs a new review verdict."},
        {"label":"Publication intent","question":"How is duplicate publication avoided?","reason":"Commit an outbox identity for the approved hash before issuing a remote write.","state":"publication intent and remote receipt","request":{"effectKey":"uuid","artifactHash":"sha256"},"response":{"state":"pending|published|unknown"},"kind":"store","inv":"A publication intent with a stable effectKey is committed for the approved hash before any remote write."},
        {"label":"Recovery and status","question":"What if the remote write succeeded?","reason":"Reconcile by effect identity before retry; publish compact task states separately from private computation.","state":"reconciliation cursor and public status","request":{"runId":"uuid","effectKey":"uuid"},"response":{"status":"public task states","remoteReceipt":"string|null"},"kind":"worker","inv":"Recovery looks up the outcome by effectKey: accepted is recorded, a retryable rejection is retried with the same key, and unknown is held as uncertain; status exposes states and receipt references only."},
      ],
      "edges": [
        [["ready","control","n2",2,"release satisfied DAG tasks","request-response"],["decisions","n2","state",1,"read receipts and journal releases","storage"]],
        [["activity","n2","n3",3,"dispatch stable research effect","request-response"]],
        [["inspect","n2","n4",4,"dispatch constraint inspection","request-response"]],
        [["review","n2","n5",5,"release synthesis for review","request-response"]],
        [["approve","n5","n6",6,"commit approved publication intent","storage"]],
        [["reconcile","n7","n6",7,"reconcile unknown publication","storage"],["status","n7","state",1,"project public task status","storage"]],
      ],
      "read": {"path":"/runs/{runId}/status","request":{"runId":"uuid"},"response":{"tasks":"public task states[]","receipts":"receipt references[]"},"owner":"n7"},
      "code": `// Ready scheduler (n2): each activity receipt is applied in one history transaction before any dependent is released.
function completeDependency(state,completion){
 const task=state.tasks[completion.predecessorId];
 if(!task||completion.epoch!==task.epoch)return {status:'stale',remaining:state.remaining};
 const prior=state.completed.get(completion.predecessorId);
 if(prior!==undefined)return {status:prior===completion.outputHash?'duplicate':'conflict',remaining:state.remaining};
 state.completed.set(completion.predecessorId,completion.outputHash);
 state.remaining--;
 return {status:'applied',remaining:state.remaining};
}`,
      "recovery": `// Recovery and status (n7): the lookup distinguishes accepted, rejected and unknown; only a proven rejection may retry.
function reconcileEffect(intent,lookup){
 if(lookup?.status==='accepted')return {action:'record',effectKey:intent.effectKey,receipt:lookup.receipt};
 if(lookup?.status==='rejected')return lookup.retryable?{action:'retry',effectKey:intent.effectKey}:{action:'fail',effectKey:intent.effectKey};
 return {action:'hold-uncertain',effectKey:intent.effectKey};
}
const step = reconcileEffect(loadPublicationIntent(effectKey), await lookupRemoteReceipt(effectKey));
// record -> recordConfirmed; retry -> resend with the same effectKey; fail -> terminal rejected; hold-uncertain -> no resend.
// Status contains task states and receipt references, never private reasoning.`,
      "mechanism": {"given":"A synthesis task depends on research (current attempt epoch 2) and constraints (epoch 1).","when":"Apply an epoch-1 research receipt, the epoch-2 receipt twice, an epoch-2 receipt with a different output hash, then the constraints receipt.","then":"The superseded attempt is stale, the repeat is a duplicate, the different hash is a conflict, and remaining goes 2, 1, 1, 1, 0, so synthesis is released only after both current receipts.","requirements":["r0","r1"],"stages":[3],"test":"L021 bounded mechanism"},
      "cases": [
        ["dependencies","Research completed but constraint inspection has no committed receipt.","Try to schedule synthesis.","Keep synthesis blocked until both declared prerequisite receipts commit.",["r0"],[3,5]],
        ["effect","A publication's remote response was lost.","Recover with the remote lookup reporting accepted, a retryable rejection, a permanent rejection, unknown, or no answer.","Accepted is recorded, the retryable rejection is resent with the same effectKey, the permanent rejection fails, and unknown or no answer is held uncertain without a resend.",["r1","r2"],[7,8],"L021 workflow reconciliation outcomes"],
        ["review","An approved artifact is edited before publication.","Compare digest with the recorded approval.","Reject publication until the new digest receives review.",["r0"],[6]],
        ["research","A research activity crashes after its tool call.","The activity is retried.","The retry reuses the effect key within the attempt bound, and its receipt reaches the scheduler before any dependent runs.",["r1"],[4]],
        ["accept","A run submits a DAG with a cycle, then a valid DAG twice.","Submit both and replay history after a coordinator restart.","The cyclic DAG is rejected; the valid run keeps one runId and replay reproduces the same decisions.",["r0"],[1,2]],
      ],
      "algorithmOwner": "n2",
    },
    {
      "id": "journal",
      "title": "Transactional DAG state and worker leases",
      "choose": "A small task state machine fits a database and explicit workers.",
      "trade": ["Leases, scheduling and recovery must be implemented; dependency counters need transactional deduplication."],
      "assumptions": ["The database serializes task transitions; it does not make remote tools transactional."],
      "steps": [
        {"label":"DAG command","question":"How are dependencies validated?","reason":"Accept immutable task IDs and reject cycles or missing prerequisite IDs.","state":"DAG command identity","request":{"runId":"uuid","edges":"task-id pairs[]"},"response":{"accepted":"boolean"},"kind":"service","inv":"A DAG command is rejected if it has a cycle or references an undeclared task, and accepted task IDs are immutable."},
        {"label":"Task rows","question":"What is authoritative task state?","reason":"Expand command boundary; store state, attempt epoch and predecessor receipts transactionally.","state":"task rows and transition receipts","request":{"taskId":"uuid","expectedVersion":"integer"},"response":{"version":"integer"},"kind":"store","inv":"Task state, attempt epoch and predecessor receipts change only in versioned transactions on the task row."},
        {"label":"Lease claims","question":"Can two workers own one task?","reason":"Claim ready task with compare-and-swap and monotonic attempt epoch.","state":"lease epoch and deadline","request":{"taskId":"uuid","now":"timestamp"},"response":{"epoch":"integer|conflict"},"kind":"queue","inv":"A claim succeeds only by compare-and-swap that advances the attempt epoch, so at most one unexpired lease exists per task."},
        {"label":"Effect ledger","question":"What if acknowledgement is lost?","reason":"Record stable remote intent and classify known rejection versus uncertain acceptance.","state":"effect keys and outcomes","request":{"effectKey":"uuid","epoch":"integer"},"response":{"state":"applied|rejected|unknown"},"kind":"store","inv":"Each remote effect has one stable effectKey recorded before the call, and its outcome is applied, rejected or unknown, never guessed."},
        {"label":"Research and constraints","question":"Which inputs reach synthesis?","reason":"Persist immutable research results and explicit constraint verdict before advancing dependencies.","state":"output hashes and constraint receipt","request":{"taskId":"uuid","inputs":"immutable refs[]"},"response":{"outputHash":"sha256"},"kind":"worker","inv":"Research outputs are immutable hashes, and the constraint verdict is committed before any completion is reported."},
        {"label":"Join transition","question":"Can duplicate completion release twice?","reason":"In one transaction, compare the completion's epoch with the predecessor's current epoch, deduplicate by predecessor and output hash, and decrement the remaining count once.","state":"completion identity, epoch and output hash","request":{"predecessorId":"uuid","dependentId":"uuid","epoch":"integer","outputHash":"sha256"},"response":{"remaining":"integer","status":"applied|duplicate|stale|conflict"},"kind":"module","inv":"In the same transaction as the decrement, a completion must carry the predecessor's current epoch; a repeat with the same output hash is a no-op and a different hash is a conflict."},
        {"label":"Approval outbox","question":"What exactly is approved?","reason":"Bind review to artifact digest and append publication intent in the same versioned transition.","state":"approval and publication outbox","request":{"artifactHash":"sha256","approvalId":"uuid"},"response":{"effectKey":"uuid"},"kind":"module","inv":"Approval binds to one artifact digest and appends the publication intent in the same versioned transition."},
        {"label":"Reconciliation sweep","question":"How is a lost worker recovered?","reason":"Fence expired owners, reconcile unknown effects, and expose pending status rather than false success.","state":"sweep cursor and status receipt","request":{"now":"timestamp","cursor":"string"},"response":{"recovered":"task ids[]","unknown":"effect keys[]"},"kind":"worker","inv":"The sweep fences an expired owner by advancing its epoch before reconciling its unknown effects, so late completions from the old epoch are rejected."},
      ],
      "edges": [
        [["claim","control","n2",2,"claim ready task lease","request-response"]],
        [["intent","n2","n3",3,"persist stable effect identity","storage"]],
        [["research","n3","n4",4,"execute research and constraints","request-response"]],
        [["complete","n4","n5",5,"deduplicate dependency completion","request-response"],["task-state","n5","state",1,"commit dependent readiness","storage"]],
        [["approve","n5","n6",6,"commit reviewed publication","request-response"]],
        [["leases","n7","n2",7,"fence expired task owners","request-response"],["unknown","n7","n3",3,"reconcile effect outcome","storage"],["publication","n7","n6",6,"resume approved outbox","request-response"]],
      ],
      "read": {"path":"/runs/{runId}/tasks","request":{"runId":"uuid"},"response":{"tasks":"task states with epoch and receipts[]","unknownEffects":"effect keys[]"},"owner":"state"},
      "code": `// Join transition (n5): runs inside the task-row transaction that decrements the dependent's counter.
function completeDependency(state,completion){
 const task=state.tasks[completion.predecessorId];
 if(!task||completion.epoch!==task.epoch)return {status:'stale',remaining:state.remaining};
 const prior=state.completed.get(completion.predecessorId);
 if(prior!==undefined)return {status:prior===completion.outputHash?'duplicate':'conflict',remaining:state.remaining};
 state.completed.set(completion.predecessorId,completion.outputHash);
 state.remaining--;
 return {status:'applied',remaining:state.remaining};
}`,
      "recovery": "for (const task of expiredLeases(now)) {\n const nextEpoch = compareAndAdvanceEpoch(task.id, task.epoch);\n for (const effect of pendingEffects(task.id)) await reconcileBeforeRetry(effect.key);\n requeueIfPrerequisitesStillCommitted(task.id, nextEpoch);\n}\n// Completion handlers compare epochs and cannot overwrite a successor owner.",
      "mechanism": {"given":"A join has two prerequisites; research is on attempt epoch 2 and constraints on epoch 1.","when":"Deliver an epoch-1 research completion, the epoch-2 completion with hash h1 twice, an epoch-2 completion with hash h2, then the constraints completion.","then":"The stale epoch is rejected, the repeat is a duplicate, the different hash is a conflict, and remaining goes 2, 1, 1, 1, 0. Remote exactly-once effects are not established.","requirements":["r0","r1"],"stages":[6],"test":"L021 bounded mechanism"},
      "cases": [
        ["dependencies","Two workers deliver the same predecessor completion.","Apply their dependency-counter transitions.","Deduplicate by predecessor and output hash and make the dependent ready only once all distinct prerequisites complete.",["r0"],[5,6]],
        ["effect","A worker lease expires while a tool write is unknown.","Assign a successor worker.","Advance epoch and reconcile stable effect identity before retry; late old completion is fenced.",["r1","r2"],[3,4,8]],
        ["review","An outbox refers to a different digest from the approval row.","Dispatch the publication.","Reject the mismatched artifact and preserve the pending intent for review.",["r0"],[7]],
        ["accept","A DAG command references an undeclared prerequisite, then a valid DAG is submitted.","Validate and commit the task rows.","The invalid DAG is rejected; the valid DAG's task rows commit with immutable IDs and initial epochs.",["r0"],[1,2]],
      ],
      "algorithmOwner": "n5",
    },
  ],
});}
function buildL027(){return author({
  "batch": 2,
  "id": "L027",
  "title": "Retrieval freshness and tool repair",
  "scope": "Synthetic requests encounter changing documents, malformed model output and fallible tools. Authored architecture adds finite repair, per-origin budgets and recorded recovery; it makes no live scraping or model reasoning claim.",
  "requirements": ["Tie retrieval to source/index revisions and reject stale action preconditions.","Bound schema repair and tool retries with explicit terminal states.","Respect per-origin fetch budgets and reconcile uncertain tool writes."],
  "refs": [["JSON Schema validation","https://json-schema.org/draft/2020-12/json-schema-validation","Response shape validation; semantic grounding remains a separate check."],["HTTP semantics","https://www.rfc-editor.org/rfc/rfc9110.html","Idempotency and conditional request semantics; arbitrary POST retries may duplicate effects."]],
  "approaches": [
    {
      "id": "orchestrated",
      "title": "Central budgeted repair state machine",
      "choose": "Each user request needs a single bounded latency and retry budget.",
      "trade": ["Central state can bottleneck; repair and tool calls consume separate budgets and may still end unsupported."],
      "assumptions": ["A syntactically repaired plan still needs authorization and current preconditions."],
      "steps": [
        {"label":"Request controller","question":"What is the finite work budget?","reason":"Record request deadline, repair allowance and tool-attempt limit before dispatch.","state":"budget counters","request":{"requestId":"uuid","deadline":"timestamp","maxRepairs":"integer"},"response":{"state":"accepted|rejected"},"kind":"service","inv":"The request's deadline, repair allowance and tool-attempt limit are fixed at acceptance and only ever decrease."},
        {"label":"Recovery ledger","question":"Which attempt is authoritative?","reason":"Expand controller; persist source revisions, plan versions and stable effect identities.","state":"request attempt records","request":{"requestId":"uuid","expectedVersion":"integer"},"response":{"version":"integer"},"kind":"store","inv":"Each attempt record pins the source revision, plan version and effectKey it used; a newer version supersedes an older one without editing it."},
        {"label":"Origin scheduler","question":"Can one crawler overload a host?","reason":"Grant tokens per normalized origin with bounded concurrency and explicit retry-after.","state":"origin tokens and in-flight count","request":{"origin":"scheme/host/port","now":"timestamp"},"response":{"permit":"boolean","retryAfter":"timestamp"},"kind":"queue","inv":"At most the configured number of fetches per normalized origin are in flight, and a denied permit returns retryAfter."},
        {"label":"Index publication","question":"What if retrieval lags the source?","reason":"Publish index revision atomically and include source revision in each hit.","state":"index manifest and source watermark","request":{"sourceRevision":"integer","indexVersion":"integer"},"response":{"published":"boolean"},"kind":"module","inv":"An index revision is published atomically, and every hit carries the source revision it was built from."},
        {"label":"Freshness guard","question":"Can a stale hit authorize a write?","reason":"Recheck source revision and ACL before model context or tool preconditions are accepted.","state":"freshness verdict","request":{"hitRevision":"integer","currentRevision":"integer"},"response":{"status":"current|refresh|reject"},"kind":"module","inv":"A hit whose source revision differs from the current revision cannot become model context or a tool precondition."},
        {"label":"Schema repair","question":"How many malformed replies are allowed?","reason":"Validate typed output and decrement repair budget before any repair request.","state":"repair count and validation errors","request":{"reply":"unknown","remaining":"integer"},"response":{"status":"valid|repair|exhausted"},"kind":"module","inv":"Each repair request decrements the controller's allowance before it is sent, and at zero the request terminates as exhausted."},
        {"label":"Tool executor","question":"What if a write times out?","reason":"Send stable effect key and expected resource version; mark ambiguous acceptance unknown.","state":"tool attempt and effect receipt","request":{"effectKey":"uuid","expectedVersion":"integer"},"response":{"outcome":"success|rejected|unknown"},"kind":"worker","inv":"Every tool write carries a stable effectKey and expectedVersion, and a timeout is recorded as unknown, never as failure or success."},
        {"label":"Outcome reconciliation","question":"Can unknown writes be retried blindly?","reason":"Query remote effect identity where supported; otherwise surface uncertainty under explicit duplicate-versus-loss policy.","state":"reconciliation status","request":{"effectKey":"uuid"},"response":{"state":"confirmed|rejected|uncertain"},"kind":"worker","inv":"Unknown writes are looked up by effectKey; only a proven non-acceptance is retried, with the same key, and exhausted retries end rejected rather than uncertain."},
      ],
      "edges": [
        [["crawl","control","n2",2,"acquire per-origin permit","request-response"]],
        [["publish","n2","n3",3,"publish source index barrier","request-response"]],
        [["fresh","n3","n4",4,"check retrieved revision","request-response"]],
        [["validate","n4","n5",5,"validate bounded model output","request-response"]],
        [["tool","n5","n6",6,"execute approved typed tool","request-response"]],
        [["reconcile","n7","n6",7,"reconcile stable remote effect","request-response"],["record","n7","state",1,"record terminal outcome","storage"]],
      ],
      "read": {"path":"/requests/{requestId}","request":{"requestId":"uuid"},"response":{"state":"running|valid|exhausted|stale|confirmed|rejected|uncertain","repairsRemaining":"integer","toolAttemptsRemaining":"integer"},"owner":"state"},
      "code": `// Schema repair (n5): the controller passes its own remaining allowance; the request deadline is checked by the controller.
function repairBounded(reply,remaining,repair,valid){let attempts=0;while(!valid(reply)&&remaining>0){remaining--;attempts++;reply=repair(reply);}return {state:valid(reply)?'valid':'exhausted',attempts};}
// Freshness guard (n4) runs before any plan that survived repair may reach the tool executor.
const isFresh=(hitRevision,currentRevision)=>hitRevision===currentRevision;`,
      "recovery": "const receipt = await tool.lookup(effectKey);\nif (receipt.confirmed) return commitConfirmed(receipt);\nif (receipt.provesNotAccepted) return attempts < maxAttempts ? retryWithSameKey() : recordTerminal(\"rejected\");\nreturn recordUncertain();\n// Each repair consumes its shared allowance before dispatch; source freshness is rechecked before a write.",
      "mechanism": {"given":"A reply stays malformed and the repair allowance is two.","when":"Run the bounded validation/repair loop, then compare an old hit with the current source revision.","then":"Only two repairs run and the reply ends exhausted; a reply fixed by the first repair ends valid after one; a revision-5 hit is not fresh against revision 6.","requirements":["r0","r1"],"stages":[5,6],"test":"L027 bounded mechanism"},
      "cases": [
        ["repair","All model replies are malformed with two repairs remaining.","Run validation and repair.","Dispatch at most two repairs and then terminate exhausted without calling a tool.",["r1"],[6]],
        ["stale","Retrieval returns source revision 5 while authority is at 6.","Attempt a plan that writes based on revision 5.","Refresh or reject before tool execution; syntactic validity cannot override stale preconditions.",["r0"],[4,5]],
        ["budget","Two jobs target one origin with capacity one.","Try both permits at the same time.","At most one proceeds; retry-after and remaining request budget are explicit.",["r2"],[1,3]],
        ["uncertain","A tool write times out after the remote applied it.","Reconcile by effectKey.","The lookup confirms the write and it is recorded without a resend; a lookup that cannot prove non-acceptance leaves the outcome uncertain.",["r2"],[2,7,8]],
      ],
      "algorithmOwner": "n5",
    },
    {
      "id": "events",
      "title": "Revision events and repair work queues",
      "choose": "Ingestion and tool recovery are asynchronous and many consumers share them.",
      "trade": ["Queues and deduplication add state; separate work budgets must still obey the original request deadline."],
      "assumptions": ["Queue delivery is replayable; replay itself is not a new authorization or a new remote effect."],
      "steps": [
        {"label":"Intent inbox","question":"What is retained from the request?","reason":"Persist typed intent, deadline and versioned authorization scope.","state":"intent receipt","request":{"intentId":"uuid","scope":"authorized resource ids[]"},"response":{"accepted":"boolean"},"kind":"service","inv":"An intent is persisted with its deadline and authorization scope before any work is queued, and replays reuse that scope."},
        {"label":"Intent journal","question":"How do workers recover?","reason":"Expand inbox and store versioned plan state, work/event identities and each intent's repair budget.","state":"intent events, dedupe keys and repair budgets","request":{"intentId":"uuid","eventId":"uuid"},"response":{"offset":"integer"},"kind":"log","inv":"The journal holds versioned plan state, dedupe keys and the repair budget for each intent, and every worker action is an event with a stable eventId."},
        {"label":"Crawl permits","question":"How is host fairness enforced?","reason":"Issue per-origin permits and carry crawl cursor/byte limits in each queued job.","state":"origin permit ledger","request":{"origin":"normalized origin","byteLimit":"integer"},"response":{"permitId":"uuid|denied"},"kind":"queue","inv":"A crawl job runs only with an unexpired per-origin permit, and carries its byte limit and cursor."},
        {"label":"Revision projector","question":"How does a source change become searchable?","reason":"Build a new immutable index view then emit its published revision barrier.","state":"index publication watermark","request":{"sourceRevision":"integer"},"response":{"indexRevision":"integer"},"kind":"worker","inv":"A source change becomes searchable only once its immutable index view is complete and its revision barrier is emitted."},
        {"label":"Plan validator","question":"What happens to stale plans?","reason":"Compare plan source revisions with current barriers and queue refresh instead of tool execution.","state":"plan eligibility receipt","request":{"planId":"uuid","sourceRevision":"integer"},"response":{"status":"eligible|stale"},"kind":"module","inv":"A plan whose source revisions are older than the current barrier is marked stale and refreshed, never executed."},
        {"label":"Repair queue","question":"Can malformed output loop forever?","reason":"Consume the server-held repair budget for the intent by compare-and-swap on its version, once per repair job ID; requests never carry the budget.","state":"repair job identities","request":{"intentId":"uuid","intentVersion":"integer","repairJobId":"uuid"},"response":{"state":"queued|duplicate|conflict|exhausted","remaining":"integer"},"kind":"queue","inv":"The repair budget lives on the server per intentId; a repair job consumes it only by compare-and-swap on the budget version, at most once per job ID."},
        {"label":"Effect outbox","question":"How are writes retried safely?","reason":"Persist one stable effect key per approved tool action and expected resource version.","state":"effect intent and dedupe key","request":{"effectKey":"uuid","precondition":"resource version"},"response":{"outcome":"pending|unknown|confirmed"},"kind":"store","inv":"Each approved tool action has one effectKey and expected resource version persisted before dispatch."},
        {"label":"Recovery projector","question":"Which status is shown to the user?","reason":"Fold receipts into completed, rejected, exhausted or uncertain; old retries cannot overwrite newer outcomes.","state":"public recovery projection","request":{"intentId":"uuid","eventVersion":"integer"},"response":{"status":"terminal or pending state"},"kind":"worker","inv":"The recovery projection applies a receipt only if its version is newer, and unknown effects stay uncertain."},
      ],
      "contracts": [["budget",{"intentId":"uuid","expectedVersion":"integer","repairJobId":"uuid"},{"remaining":"integer","version":"integer|conflict"}]],
      "edges": [
        [["permit","control","n2",2,"enqueue bounded origin work","request-response"]],
        [["index","n2","n3",3,"project source revision","request-response"]],
        [["plan","n3","n4",4,"validate plan revision","request-response"]],
        [["repair","n4","n5",5,"enqueue budgeted repair","request-response"],["budget","n5","state","budget","consume intent repair budget by version","storage"]],
        [["approved","n5","n6",6,"commit approved tool intent","storage"]],
        [["recover","n6","n7",7,"project effect receipts","event-stream"],["journal","n7","state",1,"record recovery status","storage"]],
      ],
      "read": {"path":"/intents/{intentId}","request":{"intentId":"uuid"},"response":{"status":"pending|completed|rejected|exhausted|uncertain","repairsRemaining":"integer","version":"integer"},"owner":"n7"},
      "code": `// Repair queue (n5): the budget is read from and written to the intent journal; a request cannot supply or reset it.
function consumeRepair(budgets,intentId,expectedVersion,jobId){
 const budget=budgets.get(intentId);
 if(!budget)return {state:'unknown-intent'};
 if(budget.jobs.has(jobId))return {state:'duplicate',remaining:budget.remaining,version:budget.version};
 if(budget.remaining===0)return {state:'exhausted',remaining:0,version:budget.version};
 if(budget.version!==expectedVersion)return {state:'conflict',remaining:budget.remaining,version:budget.version};
 const next={remaining:budget.remaining-1,version:budget.version+1,jobs:new Set([...budget.jobs,jobId])};
 budgets.set(intentId,next);
 return {state:'queued',remaining:next.remaining,version:next.version};
}`,
      "recovery": "for (const receipt of eventsAfter(checkpoint)) {\n if (receipt.version <= projection.version) continue;\n projection = foldAllowedTransition(projection, receipt);\n commitProjectionAndCheckpoint(projection, receipt.offset);\n}\n// Unknown remote effects remain uncertain; retries retain the original intent scope and deadline.",
      "mechanism": {"given":"Intent i holds a server-side repair budget of 2 at version 0.","when":"Consume job j1 at version 0, redeliver j1, claim j2 at stale version 0, claim j2 at version 1, then claim j3.","then":"j1 consumes once, the redelivery is a duplicate, the stale claim conflicts, j2 consumes the last repair and j3 is exhausted; no request field can raise the budget.","requirements":["r1"],"stages":[6],"test":"L027 events server-held repair budget"},
      "cases": [
        ["repair","A repair queue redelivers the same repair job.","Claim by intent version and consume the server-held budget.","A duplicate does not create a fresh allowance or consume twice; exhausted intents become terminal.",["r1"],[2,6],"L027 events server-held repair budget"],
        ["stale","A new source barrier arrives after a plan is queued.","Claim the planned tool action.","Compare source revisions and enqueue refresh instead of executing stale work.",["r0"],[4,5]],
        ["budget","Origin permits and request deadlines are exhausted.","Redeliver a queued crawl job.","Reject or defer explicitly without exceeding the origin bound or resetting the intent deadline.",["r2"],[1,3]],
        ["uncertain","A redelivered effect receipt is older than the recovery projection.","Fold receipts into the projection.","The older receipt is skipped, and unknown remote effects stay uncertain rather than being retried under a new key.",["r2"],[7,8]],
      ],
      "algorithmOwner": "n5",
    },
  ],
});}
function buildL031(){
 const select={"instanceId":"uuid","bindingId":"version-pinned id","expectedVersion":"integer","overrides":"validated capacity map"},selected={"version":"integer","bindingId":"version-pinned id"};
 const activate=["activate",{"instanceId":"uuid","bindingId":"version-pinned id","version":"integer"},{"activeBindingId":"version-pinned id"}];
 const operator=["operator","Operator","client","Request explicit instance upgrades against an expected registry version; chat callers cannot select bindings.","upgrade request identity"];
 const upgradeApi=["POST","/instances/{instanceId}/upgrade",select,selected,"404 unknown instance; 409 stale expectedVersion; 422 incompatible binding or invalid override","n7"];
 const upgradeCode=`// Explicit rebind (n7): an operator upgrade is a compare-and-swap on the registry version that returns a new state.
// It changes only the named instance; defaults, binding records and sibling instances are never edited.
function upgrade(state,request){
 if(request.expectedVersion!==state.version)throw Error('stale version');
 const binding=state.bindings[request.bindingId];
 if(!binding?.compatible)throw Error('incompatible binding');
 const instance=state.instances[request.instanceId];
 if(!instance)throw Error('unknown instance');
 const capacity=request.overrides.capacity;
 if(!Number.isInteger(capacity)||capacity<1)throw Error('invalid override');
 return {...state,version:state.version+1,instances:{...state.instances,[request.instanceId]:{bindingId:binding.id,overrides:{...instance.overrides,...request.overrides}}}};
}`;
 const mechanism=place=>({"given":"Capacity instances A and B pin binding v1 "+place+"; the default capacity is 4, A overrides it to 2, and the registry is at version 7.","when":"Upgrade A to compatible binding v2 with capacity 8 at expectedVersion 7, retry the same request, then try an incompatible binding, capacity 0 and an unknown instance.","then":"Only A moves to v2 with capacity 8 and the registry reaches version 8; B keeps v1 and effective capacity 4; defaults, binding records and the prior state are unchanged; the stale retry, incompatible binding, invalid override and unknown instance are rejected.","requirements":["r1","r2"],"stages":[8],"test":"L031 bounded mechanism"});
 const history=["history","Stage 7 shows capacity instances A and B on their v1 bindings.","Stage 8 applies the operator's explicit upgrade.","Only instance A is rebound, with the explicit-upgrade reason, to a binding that routes admission to the candidate; instance B keeps its binding and the stage-7 binding still routes admission to the original child.",["r1","r2"],[7,8],["tests/study-batch-02.test.cjs","L031 stage 8 rebinds one capacity instance and keeps earlier bindings"]];
 return author({
  "batch": 2,
  "id": "L031",
  "title": "Version-pinned nested chat backend",
  "scope": "Reuse a chat backend containing a version-pinned generation subsystem. Authored practice compares in-process and remote composition, compatibility adapters, explicit upgrades and per-instance overrides; timing values are illustrative.",
  "requirements": ["Preserve boundary identity and typed exposed-port mappings across nested expansion.","Pin immutable component/subsystem definitions and make upgrades explicit.","Validate overrides and compatibility without silently changing sibling instances.","Keep each generation's identity stable across retries, worker revisions and remote calls."],
  "refs": [["JSON Schema validation","https://json-schema.org/draft/2020-12/json-schema-validation","Response shape validation; semantic grounding remains a separate check."],["Semantic versioning","https://semver.org/spec/v2.0.0.html","Versioned public API compatibility; deployment behavior still requires explicit implementation bindings."]],
  "approaches": [
    {
      "id": "local",
      "title": "In-process nested generation capacity",
      "choose": "One process can own the backend and library versions together.",
      "trade": ["Shared heap and event-loop contention couple failures; library upgrades require process rollout."],
      "assumptions": ["Examples are illustrative architecture bindings; no claim about a real company backend."],
      "steps": [
        {"label":"Chat boundary","question":"What does a caller depend on?","reason":"Start with a stable chat contract independent of internal generation topology.","state":"conversation identity","request":{"conversationId":"uuid","prompt":"string"},"response":{"replyId":"uuid","state":"accepted"},"kind":"service","inv":"Callers depend only on the chat contract at the boundary, and that contract does not change when internals are expanded."},
        {"label":"Backend revision","question":"What is pinned per instance?","reason":"Expand backend into command control and conversation authority without changing its identity.","state":"conversation versions","request":{"conversationId":"uuid","version":"integer"},"response":{"history":"messages[]"},"kind":"store","inv":"Expanding the backend keeps the boundary node's identity, and its exposed chat port maps to exactly one direct child."},
        {"label":"Generation boundary","question":"Can internals be reused?","reason":"Expand command control into a router and two capacity instances that pin the same generation-capacity definition.","state":"generation instance binding","request":{"model":"string","prompt":"string"},"response":{"generationId":"uuid"},"kind":"module","inv":"Two capacity instances share one pinned capacity definition, yet each is its own node with its own binding."},
        {"label":"Capacity internals","question":"How are permits and work separated?","reason":"Expand each capacity instance into its own admission and worker with typed exposed mappings.","state":"capacity permits and worker state","request":{"generationId":"uuid","maxTokens":"integer"},"response":{"tokens":"string[]"},"kind":"module","inv":"Each instance exposes its admission input through its own immutable binding to its own direct child."},
        {"label":"Output contract","question":"Can the backend hide an incompatible result?","reason":"Add an explicit output adapter; token batches from both instances become the stable reply contract.","state":"adapter compatibility version","request":{"tokenBatch":"string[]"},"response":{"reply":"string"},"kind":"module","inv":"The adapter maps token batches from both instances to the stable reply contract, so no internal shape reaches the caller."},
        {"label":"Worker upgrade","question":"What changes with a library revision?","reason":"Replace instance A's worker implementation while retaining identity and compatible ports; record migration.","state":"worker version and active-attempt policy","request":{"generationId":"uuid"},"response":{"state":"draining|ready"},"kind":"module","inv":"Replacing instance A's worker keeps its node identity, its in-flight generation IDs and every port its binding exposes; instance B's worker is untouched."},
        {"label":"Binding candidate","question":"Can an upgrade mutate an old definition?","reason":"Add a distinct admission candidate for the new binding and validate its port compatibility.","state":"candidate permit state","request":{"generationId":"uuid","maxTokens":"integer"},"response":{"accepted":"boolean"},"kind":"module","inv":"The candidate admission is added inside instance A without changing any binding; the active binding still routes admission to the original child."},
        {"label":"Explicit rebind","question":"When does an instance upgrade?","reason":"An operator selects a compatible binding at an expected registry version; create a new immutable binding and rebind only instance A, leaving instance B and earlier stages unchanged.","state":"selected binding identity","request":select,"response":selected,"kind":"module","inv":"An operator upgrade names instanceId, bindingId and expectedVersion; only instance A is rebound to a new immutable binding, and instance B and every earlier binding stay unchanged."},
      ],
      "components": [["router","Generation router","module","Adapt the stable chat contract to the pinned capacity contract and choose the capacity instance.","binding selection"],["worker","Generation worker","worker","Emit generation output under a fenced attempt.","generation attempt"],operator],
      "contracts": [activate],
      "build": l031Build(false),
      "finish": l031Finish(false),
      "labels": [["admit","request capacity instance A"],["admit-b","request capacity instance B"],["run","run admitted generation"],["run-b","run instance B generation"],["adapt","adapt output contract"],["adapt-b","adapt instance B output"],["candidate-work","dispatch compatible worker"],["select","request explicit instance upgrade"],["activate","activate binding on instance A"]],
      "read": {"path":"/instances/{instanceId}","request":{"instanceId":"uuid"},"response":{"bindingId":"version-pinned id","overrides":"validated capacity map","version":"integer"},"owner":"n7"},
      "apis": [upgradeApi],
      "code": upgradeCode,
      "recovery": "const previous = instance.subsystemId;\nconst next = immutableBindings.get(requestedBindingId);\nassert(compatiblePorts(previous, next));\nreturn {...instance, subsystemId:next.id};\n// Rebind changes this instance only; definitions and the sibling remain pinned.",
      "mechanism": mechanism("inside one backend process"),
      "cases": [
        history,
        ["identity","A learner expands backend and generation capacity.","Inspect exposed ports in expanded and collapsed views.","Caller contracts still map to direct typed children, and both parent identities remain in data.",["r0"],[1,2,3,4,5]],
        ["worker","Instance A's worker library is revised while generation attempts are in flight.","Replace the worker.","Attempts drain or are fenced and keep their generation IDs; the node keeps its identity and ports, and instance B's worker is unchanged.",["r1","r3"],[6]],
        ["upgrade","One instance selects a new compatible binding.","Apply explicit rebind.","Earlier binding definitions remain immutable; only this instance changes.",["r1"],[7,8]],
        ["override","Two instances share a pinned default.","Override the first instance capacity.","The sibling and base default remain unchanged; unsupported overrides reject.",["r2"],[3,8]],
      ],
      "algorithmOwner": "n7",
    },
    {
      "id": "remote",
      "title": "Remote generation subsystem behind typed adapter",
      "choose": "Generation capacity scales or fails independently from conversation storage.",
      "trade": ["RPC failures add uncertain outcomes; version skew and rollout compatibility require explicit adapters."],
      "assumptions": ["Remote examples are illustrative; a typed contract alone proves no service latency or availability."],
      "steps": [
        {"label":"Remote chat contract","question":"What remains stable to the client?","reason":"Accept the same logical conversation command while internal capacity is remote.","state":"request identity","request":{"conversationId":"uuid","prompt":"string"},"response":{"replyId":"uuid","state":"accepted"},"kind":"service","inv":"The client contract is the same logical chat command as in-process, so remote placement of capacity is invisible to callers."},
        {"label":"Backend journal","question":"Where is conversation truth?","reason":"Expand backend into orchestration and a durable journal that records each generation intent under an idempotent generationKey before any RPC.","state":"conversation and remote intent by generationKey","request":{"conversationId":"uuid","expectedVersion":"integer","generationKey":"uuid","intent":"pending|recorded|unknown"},"response":{"version":"integer"},"kind":"store","inv":"A generationKey is minted and journaled with the conversation version before any RPC is sent, and every retry reuses it."},
        {"label":"RPC capacity boundary","question":"What version does a caller invoke?","reason":"Expand orchestration into a contract router; generation capacity runs as two remote service instances reached only by RPC carrying the journaled generationKey.","state":"remote binding and retry identity","request":{"op":"generate|lookup","generationKey":"uuid journaled before send","wireVersion":"integer","model":"string","maxTokens":"integer"},"response":{"status":"accepted|duplicate|completed|absent","tokenBatch":"string[]"},"kind":"service","inv":"Capacity runs outside the backend process, and every RPC to either instance carries the journaled generationKey and the pinned wire version."},
        {"label":"Remote internals","question":"Which resource owns admission?","reason":"Expand each remote instance into admission and worker; admission deduplicates by generationKey before starting an attempt.","state":"remote permits, generationKey ledger and attempt fences","request":{"generationKey":"uuid","epoch":"integer","maxTokens":"integer"},"response":{"tokenBatch":"string[]"},"kind":"module","inv":"Each remote admission records accepted generationKeys, and a repeated key returns the original attempt instead of starting a second generation."},
        {"label":"Response adapter","question":"What if remote wire versions differ?","reason":"Route every RPC through a typed adapter that encodes the pinned wire version and decodes remote revisions into the stable reply shape.","state":"wire-version compatibility verdict","request":{"op":"generate|lookup","generationKey":"uuid","model":"string","maxTokens":"integer"},"response":{"status":"accepted|duplicate|completed|absent|unreachable","reply":"string|null"},"kind":"module","inv":"All generation and lookup RPCs pass through the adapter, which rejects a reply whose wire version it cannot decode."},
        {"label":"Remote worker revision","title":"RPC failure reconciler","question":"What if an RPC times out after the remote accepted it?","reason":"Treat a timeout as an unknown outcome: fence superseded worker attempts by epoch, and let a reconciler look up the generationKey before anything is resent.","state":"remote attempt epoch","request":{"generationKey":"uuid","epoch":"integer"},"response":{"state":"draining|ready"},"kind":"worker","inv":"A timed-out RPC leaves its intent unknown; the reconciler records accepted or completed outcomes, resends the same key only on proven absence and otherwise holds, while superseded worker attempts are fenced by epoch."},
        {"label":"Admission revision","question":"How is the next contract prepared?","reason":"Add a separately versioned admission candidate that reads the active generationKey ledger, without mutating the active binding.","state":"candidate contract and permits","request":{"generationKey":"uuid","maxTokens":"integer"},"response":{"accepted":"boolean"},"kind":"module","inv":"The candidate admission consults the active generationKey ledger, so a key accepted under v1 is never regenerated under v2; no binding changes yet."},
        {"label":"Instance upgrade","question":"Can siblings change automatically?","reason":"An operator rebinds remote instance A explicitly at an expected registry version; instance B and prior immutable definitions are preserved.","state":"instance binding selection","request":select,"response":selected,"kind":"module","inv":"An operator upgrade names instanceId, bindingId and expectedVersion; only remote instance A is rebound to a new immutable binding, and instance B and every earlier binding stay unchanged."},
      ],
      "components": [["router","Generation router","module","Turn the stable chat command into an RPC that carries the journaled generationKey, and commit the decoded reply.","binding selection"],["worker","Generation worker","worker","Emit generation output under a fenced attempt.","generation attempt"],operator,["reconciler","RPC outcome reconciler","worker","Resolve unknown RPC outcomes by generationKey: record accepted or completed, resend the same key only on proven absence, otherwise hold.","unknown intent cursor"]],
      "contracts": [activate,["ledger",{"generationKey":"uuid"},{"outcome":"accepted|completed|absent"}],["intents",{"generationKey":"uuid","observed":"accepted|completed|absent|unreachable"},{"intent":"recorded|resend|unknown","version":"integer"}]],
      "build": l031Build(true),
      "finish": l031Finish(true),
      "labels": [["admit","RPC generate on instance A"],["admit-b","RPC generate on instance B"],["run","run admitted generation"],["run-b","run instance B generation"],["rpc","send RPC through adapter"],["wire","pinned wire RPC to instance A"],["wire-b","pinned wire RPC to instance B"],["unknown","record reconciled outcome"],["lookup","look up generationKey"],["candidate-work","dispatch compatible worker"],["ledger","read generationKey ledger"],["select","request explicit instance upgrade"],["activate","activate binding on instance A"]],
      "read": {"path":"/generations/{generationKey}","request":{"generationKey":"uuid"},"response":{"intent":"pending|recorded|unknown","reply":"string|null"},"owner":"state"},
      "apis": [upgradeApi],
      "code": upgradeCode,
      "algorithms": [["idempotent-admission","admission",`// Remote admission: the journaled generationKey is the idempotency key for every RPC resend.
function admitGeneration(ledger,generationKey){
 const prior=ledger.get(generationKey);
 if(prior)return {status:'duplicate',attempt:prior.attempt};
 const attempt=ledger.size+1;
 ledger.set(generationKey,{attempt});
 return {status:'accepted',attempt};
}`,["A resend after an RPC timeout returns the original attempt instead of starting a second generation."]]],
      "recoverOwner": "reconciler",
      "recoverGuarantees": ["An unknown outcome is never resent under a new key; only a proven absence resends, with the same generationKey."],
      "recovery": `// RPC outcome reconciler: resolve each unknown intent by its journaled generationKey before anything is resent.
function reconcileGeneration(intent,lookup){
 if(lookup?.status==='accepted'||lookup?.status==='completed')return {action:'record',generationKey:intent.generationKey};
 if(lookup?.status==='absent')return {action:'resend',generationKey:intent.generationKey};
 return {action:'hold',generationKey:intent.generationKey};
}
// record -> journal the outcome; resend -> adapter generate with the same key (admission deduplicates); hold -> stay unknown.`,
      "mechanism": mechanism("as remote services"),
      "cases": [
        history,
        ["failure","The backend journals generationKey k1, and the RPC times out after remote admission accepted it.","Resend k1, admit a new key k2, then reconcile k1 with lookups reporting accepted, completed, absent, unreachable and no answer.","The resend is a duplicate of attempt 1 and k2 gets attempt 2; accepted and completed are recorded, absent resends the same key, and unreachable or missing answers hold the intent unknown without minting a new key.",["r3"],[2,4,5,6],"L031 remote idempotent generation and reconciliation"],
        ["identity","The remote generation boundary is collapsed.","Resolve a caller edge through nested exposure maps.","The visible endpoint is the boundary, and expansion retains router/admission/worker identities.",["r0"],[1,2,3,4]],
        ["upgrade","A new remote wire revision is incompatible with the adapter.","Try an upgrade then a compatible binding.","Reject incompatible activation; explicit compatible rebind preserves earlier definitions.",["r1","r2"],[5,7,8]],
        ["override","Two remote instances pin revision one.","Upgrade only one with a validated queue limit.","The sibling stays pinned; instance override does not mutate shared capacity defaults.",["r2"],[3,8]],
      ],
      "algorithmOwner": "n7",
    },
  ],
 });
}
module.exports={buildL018,buildL021,buildL027,buildL031};
