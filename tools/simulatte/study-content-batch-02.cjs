 'use strict';
const {problem,contract,component,builder}=require('./study-solution-author.cjs');
const {applyOperation}=require('./study-contract.cjs');
function port(p,id,direction,contractId){const d=p.components.find(c=>c.id===id),pid=direction+'-'+contractId;if(!d.ports.some(q=>q.id===pid))d.ports.push({id:pid,direction,contractId});return pid;}
// Each row declares a distinct architectural responsibility and its wire contract.
// Reference models exercise bounded rules only, not distributed services or stated latency targets.
function freezeBindings(p){
 const original=new Map(p.subsystems.map(sub=>[sub.id,sub])),frozen=[];
 for(const solution of p.solutions){let previous=solution.initialGraph;const cache=new Map(),versions=new Map();
  for(const stage of solution.stages){
   const graph=stage.graph,nodes=new Map(graph.nodes.map(n=>[n.id,n])),needed=new Map();
   function need(nodeId,portId){const node=nodes.get(nodeId);if(!node?.subsystemId)return;const ports=needed.get(nodeId)||new Set();if(ports.has(portId))return;ports.add(portId);needed.set(nodeId,ports);const sub=original.get(node.subsystemId),mapping=sub.ports.find(q=>q.id===portId);if(!mapping)throw Error('Missing nested exposure '+nodeId+'/'+portId);need(mapping.target.nodeId,mapping.target.portId);}
   for(const edge of graph.edges)for(const endpoint of [edge.from,edge.to])need(endpoint.nodeId,endpoint.portId);
   const selected=new Map();
   for(const node of graph.nodes.filter(n=>n.subsystemId)){
    const base=original.get(node.subsystemId),used=needed.get(node.id)||new Set(),ports=base.ports.filter(q=>used.has(q.id));
    const key=node.id+JSON.stringify(ports);let id=cache.get(key);
    if(!id){const version=(versions.get(node.id)||0)+1;versions.set(node.id,version);id=p.problem.referenceId.toLowerCase()+'-'+solution.id+'-'+node.id+'-binding-'+version;cache.set(key,id);frozen.push({...structuredClone(base),id,ports:structuredClone(ports)});}
    selected.set(node.id,id);node.subsystemId=id;
   }
   stage.operations=stage.operations.filter(op=>op.op!=='rebind');
   for(const op of stage.operations)if(op.op==='expand')op.subsystemId=selected.get(op.nodeId);
   const rebinding=[];for(const [nodeId,subsystemId]of selected){const old=previous.nodes.find(n=>n.id===nodeId);if(old?.subsystemId&&old.subsystemId!==subsystemId)rebinding.push({op:'rebind',nodeId,subsystemId,reason:'Select a new immutable exposure binding before connecting the added responsibility; prior stage binding remains unchanged.'});}
   stage.operations.unshift(...rebinding);
   let replay=structuredClone(previous);for(const op of stage.operations)replay=applyOperation(replay,op);stage.graph=replay;previous=replay;
  }
 }
 p.subsystems=frozen;return p;
}
function author(spec){
 const p=problem(spec.id,spec.title,spec.scope,spec.requirements.map((text,i)=>({id:'r'+i,text})),spec.refs.map(([title,url,supports],i)=>({id:'ref'+i,title,url,scope:'background',supports})));
 for(const [ai,a]of spec.approaches.entries()){
  const prefix=spec.id.toLowerCase()+'.'+a.id;
  const cid=i=>prefix+'.c'+i, did=i=>prefix+'.d'+i;
  for(const [i,t]of a.steps.entries()){
   contract(p,cid(i),t.request,t.response);
   component(p,did(i),t.label,t.kind,t.reason,[t.state]);
  }
  component(p,prefix+'.caller','Caller','client','Submit the declared operation with authenticated identity and preserve its retry identity.',['request identity']);
  component(p,prefix+'.control','Command control','module',a.steps[0].reason,['validated command and version']);
  if(spec.id==='L022'){component(p,prefix+'.input','Input dataset','store','Retain separately owned immutable input bytes and partition ranges.',['input snapshot bytes']);component(p,prefix+'.shuffle','Hash partitioner','module','Route keyed map blocks by hash(URL) mod three; persist each reducer block in its separately owned shuffle store.',['bounded transfer buffers']);}
  if(spec.id==='L031'){component(p,prefix+'.router','Generation router','module','Adapt the stable chat contract to the pinned capacity contract.',['binding selection']);component(p,prefix+'.worker','Generation worker','worker','Emit generation output under a fenced attempt.',['generation attempt']);}
  const b=builder(p,a.id,a.title,a.choose,a.trade,a.assumptions);
  for(const [i,t]of a.steps.entries()){
   b.stage(t.label,t.question,t.reason,s=>{
    if(i===0){s.add('caller',prefix+'.caller');s.add('boundary',did(0));s.link('request','caller','boundary',cid(0));}
    else if(i===1){s.expand('boundary',prefix+'.authority',[['control',prefix+'.control'],['state',did(1)]],[['commit','control','state',cid(1),'storage']],[['in',cid(0),'control']]);}
    else if(spec.id==='L031'){
     if(i===2)s.expand('control',prefix+'.generation',[['router',prefix+'.router'],['capacity',did(2)]],[['admit','router','capacity',cid(2)]],[['in',cid(0),'router'],['out',cid(1),'router']]);
     if(i===3)s.expand('capacity',prefix+'.capacity-v1',[['admission',did(3)],['worker',prefix+'.worker']],[['run','admission','worker',cid(3)]],[['in',cid(2),'admission']]);
     if(i===4){s.add('n4',did(4));s.link('adapt','worker','n4',cid(4));}
     if(i===5)s.replace('worker',did(5),'Drain or fence in-flight generation attempts; preserve stable generation identity and compatible ports.');
     if(i===6)s.add('n6',did(6));
     if(i===7){s.add('n7',did(7));s.link('select','caller','n7',cid(7));}
    }
    else {s.add('n'+i,did(i),spec.id==='L022'?(i===(a.id==='driver'?2:3)?'Map CPU 1':i===(a.id==='driver'?3:4)?'Shuffle store 1':i===5?'Reduce CPU 1':undefined):undefined);for(const [eid,from,to,type,label,mode]of a.edges[i-2])s.link(eid,from,to,cid(type),mode);}
    if(spec.id==='L022'){
     const edge=(id,from,to,c)=>s.link(id,from,to,cid(c),'storage');
     if(i===2){s.add('input',prefix+'.input');if(a.id==='driver'){for(const suffix of ['b','c']){s.add('n2'+suffix,did(2),'Map CPU '+(suffix==='b'?'2':'3'));s.link('schedule-'+suffix,'control','n2'+suffix,cid(2));}for(const suffix of ['','b','c'])edge('input-'+suffix,'input','n2'+suffix,2);}}
     if(a.id==='driver'){
      if(i===3){for(const suffix of ['b','c'])s.add('n3'+suffix,did(3),'Shuffle store '+(suffix==='b'?'2':'3'));s.add('partitioner',prefix+'.shuffle');for(const suffix of ['','b','c']){edge('shuffle-in-'+suffix,'n2'+suffix,'partitioner',3);edge('shuffle-out-'+suffix,'partitioner','n3'+suffix,3);}}
      if(i===4)for(const suffix of ['b','c'])edge('spill-'+suffix,'n3'+suffix,'n4',4);
      if(i===5)for(const suffix of ['b','c']){s.add('n5'+suffix,did(5),'Reduce CPU '+(suffix==='b'?'2':'3'));edge('reduce-'+suffix,'n3'+suffix,'n5'+suffix,5);edge('merge-'+suffix,'n4','n5'+suffix,4);}
      if(i===6)for(const suffix of ['b','c'])edge('result-'+suffix,'n5'+suffix,'n6',6);

     }else{
      if(i===3){for(const suffix of ['b','c']){s.add('n3'+suffix,did(3),'Map CPU '+(suffix==='b'?'2':'3'));s.link('map-'+suffix,'n2','n3'+suffix,cid(3));}for(const suffix of ['','b','c'])edge('input-'+suffix,'input','n3'+suffix,3);}
      if(i===4){for(const suffix of ['b','c'])s.add('n4'+suffix,did(4),'Shuffle store '+(suffix==='b'?'2':'3'));s.add('partitioner',prefix+'.shuffle');for(const suffix of ['','b','c']){edge('partition-in-'+suffix,'n3'+suffix,'partitioner',4);edge('partition-out-'+suffix,'partitioner','n4'+suffix,4);}}
      if(i===5)for(const suffix of ['b','c']){s.add('n5'+suffix,did(5),'Reduce CPU '+(suffix==='b'?'2':'3'));edge('aggregate-'+suffix,'n4'+suffix,'n5'+suffix,5);}
      if(i===6)for(const suffix of ['b','c'])edge('publish-'+suffix,'n5'+suffix,'n6',6);

     }
    }
   },[t.reason+' State owner: '+t.label+' ('+t.state+').'],['mechanism',...a.cases.map(c=>c[0])]);
   b.solution.stages.at(-1).explanation=t.reason+' The graph is an authored conceptual design; guarantees require the named deployment contracts.';
  }
  b.api('POST','/'+spec.id.toLowerCase()+'/'+a.id,JSON.stringify(a.steps[0].request),JSON.stringify(a.steps[0].response),'401 unauthenticated; 409 stale identity/version; 429 bounded capacity; 503 unavailable authority','control');
  b.api('GET','/'+spec.id.toLowerCase()+'/'+a.id+'/state',JSON.stringify(a.steps[1].request),JSON.stringify(a.steps[1].response),'403 unauthorized scope; 404 absent identity; 410 expired retained history','state');
  b.algorithm('bounded-rule',a.algorithmOwner,a.code||spec.code,['The code states the bounded decision rule; unimplemented helpers remain pseudocode.','External effects, distributed failure and latency require separate execution evidence.']);
  b.algorithm('recover','n7',a.recovery,[a.steps[7].reason]);
  b.check('mechanism',spec.given,spec.when,spec.then,['r0','r1','r2']);
  b.solution.acceptanceCases.at(-1).evidence={kind:'reference-test',testFile:'tools/simulatte/study-reference/batch-'+String(spec.batch).padStart(2,'0')+'-mechanisms.test.mjs',testName:spec.id+' bounded mechanism'};
  for(const [id,given,when,then]of a.cases)b.check(id,given,when,then,['r0','r1','r2']);
  if(spec.id==='L031'){
   const candidate=b.solution.stages[6].operations.find(op=>op.op==='insert').node;candidate.parentId='capacity';
   const incoming=port(p,did(6),'in',cid(2)),outgoing=port(p,did(6),'out',cid(3));
   b.solution.stages[6].operations.push({op:'connect',edge:{id:'candidate-work',from:{nodeId:'n6',portId:outgoing},to:{nodeId:'worker',portId:port(p,did(5),'in',cid(3))},contractId:cid(3),mode:'local-call'}});
   const prior=p.subsystems.find(sub=>sub.id===prefix+'.capacity-v1');
   const next={...structuredClone(prior),id:prefix+'.capacity-v2'};
   next.ports.find(q=>q.direction==='in'&&q.contractId===cid(2)).target={nodeId:'n6',portId:incoming};p.subsystems.push(next);
   b.solution.stages[7].operations.push({op:'rebind',nodeId:'capacity',subsystemId:next.id,reason:'Explicit compatible instance upgrade; retain immutable v1 binding for previous stages.'});
   let graph=structuredClone(b.solution.initialGraph);for(const stage of b.solution.stages){for(const op of stage.operations)graph=applyOperation(graph,op);stage.graph=structuredClone(graph);}
  }
  const fallbackLabel=id=>({input:'read immutable input range',shuffle:'write keyed map block',partition:'write reducer partition block',schedule:'schedule map range',spill:'spill sorted runs',reduce:'read selected map blocks',merge:'merge bounded spill runs',result:'commit reducer output',verify:'verify retained shuffle block',retry:'recompute missing map lineage',map:'run map and local combine',aggregate:'reduce selected block set',publish:'publish reducer result',blocks:'verify retained block checksum'}[id.split('-')[0]]||id.replaceAll('-',' '));
  const labels=new Map(a.edges.flat().map(e=>[e[0],e[4]]));for(const [id,label]of [['admit','request generation capacity'],['run','run admitted generation'],['adapt','adapt output contract'],['candidate-work','dispatch compatible worker'],['select','select explicit instance upgrade']])labels.set(id,label);labels.set('request','submit '+spec.title.toLowerCase());labels.set('commit','commit versioned state');
  for(const stage of b.solution.stages){for(const op of stage.operations){if(op.edge)op.edge.label=labels.get(op.edge.id)||fallbackLabel(op.edge.id);if(op.edges)for(const edge of op.edges)edge.label=labels.get(edge.id);}for(const edge of stage.graph.edges)edge.label=labels.get(edge.id)||fallbackLabel(edge.id);}

 }
 return freezeBindings(p);
}
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
        {"label":"Answer gateway","question":"What can the assistant promise?","reason":"Authenticate tenant and accept a bounded question with an explicit deadline.","state":"query identity and deadline","request":{"tenantId":"uuid","queryId":"uuid","question":"string"},"response":{"state":"accepted|rejected"},"kind":"service"},
        {"label":"Document authority","question":"Which source version is truth?","reason":"Expand gateway; retain immutable source revisions and current ACL epochs.","state":"document revision and ACL","request":{"documentId":"uuid","revision":"integer"},"response":{"contentHash":"sha256","aclEpoch":"integer"},"kind":"store"},
        {"label":"Embedding lane","question":"Can incompatible vectors mix?","reason":"Pin embedding model, dimensions and normalization to the selected index version.","state":"embedding compatibility identity","request":{"question":"string","modelVersion":"string"},"response":{"vector":"float[d]"},"kind":"worker"},
        {"label":"Candidate retrieval","question":"What if dense search misses a term?","reason":"Union lexical and vector candidates with provenance and bounded recall-tested k.","state":"candidate scores and source versions","request":{"vector":"float[d]","terms":"string[]","k":"integer"},"response":{"candidates":"versioned spans[]"},"kind":"module"},
        {"label":"ACL and freshness","question":"Can stale index permissions leak text?","reason":"Filter candidates against current source ACL and revision before model context assembly.","state":"current source eligibility","request":{"candidateIds":"versioned span ids[]","actorId":"uuid"},"response":{"eligible":"span ids[]"},"kind":"module"},
        {"label":"Cross-encoder","question":"Which candidates deserve context?","reason":"Rerank eligible candidates within token/deadline budgets; retain rejected-score evidence.","state":"ranked candidate receipt","request":{"question":"string","candidates":"spans[]"},"response":{"ranked":"scored spans[]"},"kind":"worker"},
        {"label":"Grounded generation","question":"Is valid JSON necessarily correct?","reason":"Generate a typed answer tied to supplied span IDs, then validate shape and citation membership.","state":"answer draft and validation status","request":{"context":"authorized spans[]","schemaVersion":"integer"},"response":{"answer":"typed object","citations":"span ids[]"},"kind":"worker"},
        {"label":"Evidence gate","question":"When should the assistant abstain?","reason":"Check support and stale sources before release; record unsupported claims rather than inventing citations.","state":"support verdict and phase timings","request":{"answer":"typed object","currentRevision":"integer"},"response":{"status":"release|abstain|retry"},"kind":"module"},
      ],
      "edges": [
        [["embed","control","n2",2,"embed query with pinned model","request-response"]],
        [["retrieve","n2","n3",3,"retrieve hybrid candidates","request-response"]],
        [["eligibility","n3","n4",4,"filter source eligibility","request-response"],["authority","n4","state",1,"check current ACL and revision","storage"]],
        [["rerank","n4","n5",5,"rerank authorized candidates","request-response"]],
        [["generate","n5","n6",6,"assemble grounded answer","request-response"]],
        [["gate","n6","n7",7,"validate support before release","request-response"],["source-check","n7","state",1,"recheck cited revisions","storage"]],
      ],
      "recovery": "for (const claim of draft.claims) {\n if (!claim.citations.length || !claim.citations.every(currentAuthorizedSpan)) return abstain(claim);\n if (!supportCheck(claim, claim.citations)) return abstain(claim);\n}\nreturn releaseWithPhaseTimings(draft);\n// Support checking is a specified gate; the bounded reference test checks only citation membership.",
      "cases": [
        ["acl","A retrieved document is revoked before context assembly.","Check its current ACL and revision.","Exclude it from model context and refuse answers requiring its evidence."],
        ["budget","Reranking cannot complete before the request deadline.","Exhaust the phase budget.","Abstain or return an explicitly incomplete result, never claim the under-200ms target was met."],
        ["support","An answer is valid JSON but cites an absent span.","Validate shape and citation membership.","Reject the citation; passing membership still requires a separate semantic support verdict."],
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
        {"label":"Pack request","question":"What is the supported query domain?","reason":"Classify against declared intent IDs and refuse unsupported questions explicitly.","state":"intent classification receipt","request":{"tenantId":"uuid","question":"string"},"response":{"intentId":"string|unsupported"},"kind":"service"},
        {"label":"Pack manifest","question":"Which facts produced an answer?","reason":"Expand request boundary; retain content hashes, source revisions and pack schema version.","state":"pack versions and source hashes","request":{"intentId":"string","packVersion":"integer"},"response":{"sourceRevisions":"map","schemaVersion":"integer"},"kind":"store"},
        {"label":"Ingest snapshot","question":"How are changing sources staged?","reason":"Freeze source revisions and normalize exact citation spans before constructing a new pack.","state":"ingestion snapshot","request":{"sourceIds":"uuid[]","revision":"integer"},"response":{"spans":"versioned text spans[]"},"kind":"worker"},
        {"label":"Offline retrieval","question":"Can a pack omit evidence?","reason":"Evaluate lexical/dense recall against labeled intent questions before promoting candidate sets.","state":"retrieval evaluation receipt","request":{"intentId":"string","corpusSnapshot":"uuid"},"response":{"candidateSpans":"span ids[]"},"kind":"worker"},
        {"label":"Pack compiler","question":"What is generated ahead of time?","reason":"Build schema-validated answer templates with explicit claim-to-span bindings.","state":"compiled answer pack","request":{"candidates":"spans[]","schemaVersion":"integer"},"response":{"packHash":"sha256"},"kind":"worker"},
        {"label":"Atomic publication","question":"Can readers see half a pack?","reason":"Publish one immutable manifest only after pack bytes and dependencies are complete.","state":"active manifest pointer","request":{"expectedPackVersion":"integer","newPackHash":"sha256"},"response":{"publishedVersion":"integer"},"kind":"module"},
        {"label":"Online verification","question":"Does a cache hit preserve access?","reason":"Verify current ACL/revisions and fill only typed allowed slots before returning citations.","state":"online eligibility verdict","request":{"packHash":"sha256","actorId":"uuid"},"response":{"answer":"typed object|abstain"},"kind":"module"},
        {"label":"Invalidation repair","question":"What if a source is revoked?","reason":"Invalidate affected packs, expose freshness and rebuild; do not reuse invalid support while rebuilding.","state":"invalidation cursor","request":{"sourceId":"uuid","newRevision":"integer"},"response":{"invalidated":"pack hashes[]"},"kind":"worker"},
      ],
      "edges": [
        [["ingest","control","n2",2,"freeze source revisions","request-response"]],
        [["retrieve","n2","n3",3,"evaluate pack retrieval","request-response"]],
        [["compile","n3","n4",4,"compile claim and span bindings","request-response"]],
        [["publish","n4","n5",5,"publish immutable pack manifest","request-response"],["activate","n5","state",1,"compare active pack version","storage"]],
        [["query","caller","n6",6,"resolve supported intent","request-response"],["manifest","n6","state",1,"read pinned pack metadata","storage"]],
        [["invalidate","n7","state",7,"invalidate affected pack versions","storage"],["rebuild","n7","n2",2,"rebuild source snapshot","request-response"]],
      ],
      "recovery": "for (const packId of dependencyIndex.packsUsing(sourceId)) {\n invalidate(packId, newRevision);\n enqueueRebuild(packId, newRevision);\n}\n// Online verification compares every cited source revision and current ACL before using cached bytes.",
      "cases": [
        ["acl","A pack was compiled for a tenant whose source ACL changes.","Serve a cached intent.","Current ACL and exact source revision are rechecked; unauthorized cached text is withheld."],
        ["budget","A question is outside the pack intent catalogue.","Classify and attempt lookup.","Return unsupported/abstain rather than making a cached answer fit a different question."],
        ["support","A pack manifest is published before one dependent blob exists.","Validate publication readiness.","Refuse activation until all hashes and schema bindings resolve."],
      ],
      "algorithmOwner": "n6",
    },
  ],
  "code": "const eligible = spans.filter(s => s.aclEpoch === currentAcl && s.revision === currentRevision && allowedIds.has(s.id));\nif (!answer.citations.every(id => eligible.some(s => s.id === id))) return {status:\"abstain\"};\nreturn {status:\"shape-and-membership-accepted\"}; // This is not entailment proof.",
  "given": "An answer names one allowed current span and another stale or cross-tenant span.",
  "when": "Run the bounded citation eligibility gate.",
  "then": "Reject the stale/cross-tenant citation; accepting shape and membership alone makes no claim of semantic entailment.",
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
        {"label":"Task submission","question":"What does accepted mean?","reason":"Validate acyclic dependencies and assign stable task/run IDs before work.","state":"run identity","request":{"runId":"uuid","dag":"typed tasks and dependencies"},"response":{"state":"accepted|invalid"},"kind":"service"},
        {"label":"Decision history","question":"Which decisions survive restart?","reason":"Expand coordinator; journal transitions and output references before scheduling dependents.","state":"workflow history and task states","request":{"runId":"uuid","taskId":"uuid"},"response":{"state":"pending|ready|running|done"},"kind":"log"},
        {"label":"Ready scheduler","question":"Can synthesis race research?","reason":"Release tasks only when all predecessor output receipts are committed.","state":"dependency counters","request":{"taskId":"uuid","predecessorReceipts":"receipt ids[]"},"response":{"ready":"boolean"},"kind":"module"},
        {"label":"Research activities","question":"What is retried after a crash?","reason":"Execute research/tool steps with stable effect keys and bounded attempts.","state":"activity attempt fence","request":{"effectKey":"uuid","attempt":"integer"},"response":{"receipt":"external receipt|unknown"},"kind":"worker"},
        {"label":"Constraint gate","question":"Can generated output ignore limits?","reason":"Require explicit source/constraint inspection receipts before synthesis consumes inputs.","state":"constraint verdict","request":{"sourceRefs":"immutable refs[]","constraints":"typed limits"},"response":{"allowed":"boolean","violations":"string[]"},"kind":"module"},
        {"label":"Review checkpoint","question":"Who authorizes publication?","reason":"Persist review verdict and artifact hash; a revised artifact requires fresh review.","state":"reviewed artifact hash","request":{"artifactHash":"sha256","reviewVersion":"integer"},"response":{"decision":"approve|revise|reject"},"kind":"module"},
        {"label":"Publication intent","question":"How is duplicate publication avoided?","reason":"Commit an outbox identity for the approved hash before issuing a remote write.","state":"publication intent and remote receipt","request":{"effectKey":"uuid","artifactHash":"sha256"},"response":{"state":"pending|published|unknown"},"kind":"store"},
        {"label":"Recovery and status","question":"What if the remote write succeeded?","reason":"Reconcile by effect identity before retry; publish compact task states separately from private computation.","state":"reconciliation cursor and public status","request":{"runId":"uuid","effectKey":"uuid"},"response":{"status":"public task states","remoteReceipt":"string|null"},"kind":"worker"},
      ],
      "edges": [
        [["ready","control","n2",2,"release satisfied DAG tasks","request-response"]],
        [["activity","n2","n3",3,"dispatch stable research effect","request-response"]],
        [["inspect","n3","n4",4,"inspect source constraints","request-response"]],
        [["review","n4","n5",5,"review synthesized artifact","request-response"]],
        [["approve","n5","n6",6,"commit approved publication intent","storage"]],
        [["reconcile","n7","n6",7,"reconcile unknown publication","storage"],["status","n7","state",1,"project public task status","storage"]],
      ],
      "recovery": "const intent = loadPublicationIntent(effectKey);\nconst remote = await lookupRemoteReceipt(effectKey);\nif (remote) recordConfirmed(intent, remote);\nelse if (knownNotAccepted(remote)) retrySameEffectKey(intent);\nelse markUncertain(intent);\n// Status contains task states and receipt references, never private reasoning.",
      "cases": [
        ["dependencies","Research completed but constraint inspection has no committed receipt.","Try to schedule synthesis.","Keep synthesis blocked until both declared prerequisite receipts commit."],
        ["effect","Publication was accepted remotely but the activity response was lost.","Recover the workflow.","Reconcile the same effect identity; no blind new publication identity is created."],
        ["review","An approved artifact is edited before publication.","Compare digest with the recorded approval.","Reject publication until the new digest receives review."],
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
        {"label":"DAG command","question":"How are dependencies validated?","reason":"Accept immutable task IDs and reject cycles or missing prerequisite IDs.","state":"DAG command identity","request":{"runId":"uuid","edges":"task-id pairs[]"},"response":{"accepted":"boolean"},"kind":"service"},
        {"label":"Task rows","question":"What is authoritative task state?","reason":"Expand command boundary; store state, attempt epoch and predecessor receipts transactionally.","state":"task rows and transition receipts","request":{"taskId":"uuid","expectedVersion":"integer"},"response":{"version":"integer"},"kind":"store"},
        {"label":"Lease claims","question":"Can two workers own one task?","reason":"Claim ready task with compare-and-swap and monotonic attempt epoch.","state":"lease epoch and deadline","request":{"taskId":"uuid","now":"timestamp"},"response":{"epoch":"integer|conflict"},"kind":"queue"},
        {"label":"Effect ledger","question":"What if acknowledgement is lost?","reason":"Record stable remote intent and classify known rejection versus uncertain acceptance.","state":"effect keys and outcomes","request":{"effectKey":"uuid","epoch":"integer"},"response":{"state":"applied|rejected|unknown"},"kind":"store"},
        {"label":"Research and constraints","question":"Which inputs reach synthesis?","reason":"Persist immutable research results and explicit constraint verdict before advancing dependencies.","state":"output hashes and constraint receipt","request":{"taskId":"uuid","inputs":"immutable refs[]"},"response":{"outputHash":"sha256"},"kind":"worker"},
        {"label":"Join transition","question":"Can duplicate completion release twice?","reason":"Deduplicate predecessor completion and decrement remaining dependency count once.","state":"completion identity set","request":{"predecessorId":"uuid","dependentId":"uuid"},"response":{"remaining":"integer"},"kind":"module"},
        {"label":"Approval outbox","question":"What exactly is approved?","reason":"Bind review to artifact digest and append publication intent in the same versioned transition.","state":"approval and publication outbox","request":{"artifactHash":"sha256","approvalId":"uuid"},"response":{"effectKey":"uuid"},"kind":"module"},
        {"label":"Reconciliation sweep","question":"How is a lost worker recovered?","reason":"Fence expired owners, reconcile unknown effects, and expose pending status rather than false success.","state":"sweep cursor and status receipt","request":{"now":"timestamp","cursor":"string"},"response":{"recovered":"task ids[]","unknown":"effect keys[]"},"kind":"worker"},
      ],
      "edges": [
        [["claim","control","n2",2,"claim ready task lease","request-response"]],
        [["intent","n2","n3",3,"persist stable effect identity","storage"]],
        [["research","n3","n4",4,"execute research and constraints","request-response"]],
        [["complete","n4","n5",5,"deduplicate dependency completion","request-response"],["task-state","n5","state",1,"commit dependent readiness","storage"]],
        [["approve","n5","n6",6,"commit reviewed publication","request-response"]],
        [["leases","n7","n2",7,"fence expired task owners","request-response"],["unknown","n7","n3",3,"reconcile effect outcome","storage"],["publication","n7","n6",6,"resume approved outbox","request-response"]],
      ],
      "recovery": "for (const task of expiredLeases(now)) {\n const nextEpoch = compareAndAdvanceEpoch(task.id, task.epoch);\n for (const effect of pendingEffects(task.id)) await reconcileBeforeRetry(effect.key);\n requeueIfPrerequisitesStillCommitted(task.id, nextEpoch);\n}\n// Completion handlers compare epochs and cannot overwrite a successor owner.",
      "cases": [
        ["dependencies","Two workers deliver the same predecessor completion.","Apply their dependency-counter transitions.","Deduplicate by predecessor identity and make the dependent ready only once all distinct prerequisites complete."],
        ["effect","A worker lease expires while a tool write is unknown.","Assign a successor worker.","Advance epoch and reconcile stable effect identity before retry; late old completion is fenced."],
        ["review","An outbox refers to a different digest from the approval row.","Dispatch the publication.","Reject the mismatched artifact and preserve the pending intent for review."],
      ],
      "algorithmOwner": "n5",
    },
  ],
  "code": "if (completed.has(predecessorId)) return remaining;\ncompleted.add(predecessorId); remaining--;\nreturn remaining; // A ready transition is committed only at zero with all output receipts present.",
  "given": "A join has two prerequisites and receives duplicate completion for the first.",
  "when": "Apply first, duplicate-first and second completions.",
  "then": "Remaining dependencies are 1,1,0; no dependent is released by the duplicate. Remote exactly-once effects are not established.",
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
        {"label":"Request controller","question":"What is the finite work budget?","reason":"Record request deadline, repair allowance and tool-attempt limit before dispatch.","state":"budget counters","request":{"requestId":"uuid","deadline":"timestamp","maxRepairs":"integer"},"response":{"state":"accepted|rejected"},"kind":"service"},
        {"label":"Recovery ledger","question":"Which attempt is authoritative?","reason":"Expand controller; persist source revisions, plan versions and stable effect identities.","state":"request attempt records","request":{"requestId":"uuid","expectedVersion":"integer"},"response":{"version":"integer"},"kind":"store"},
        {"label":"Origin scheduler","question":"Can one crawler overload a host?","reason":"Grant tokens per normalized origin with bounded concurrency and explicit retry-after.","state":"origin tokens and in-flight count","request":{"origin":"scheme/host/port","now":"timestamp"},"response":{"permit":"boolean","retryAfter":"timestamp"},"kind":"queue"},
        {"label":"Index publication","question":"What if retrieval lags the source?","reason":"Publish index revision atomically and include source revision in each hit.","state":"index manifest and source watermark","request":{"sourceRevision":"integer","indexVersion":"integer"},"response":{"published":"boolean"},"kind":"module"},
        {"label":"Freshness guard","question":"Can a stale hit authorize a write?","reason":"Recheck source revision and ACL before model context or tool preconditions are accepted.","state":"freshness verdict","request":{"hitRevision":"integer","currentRevision":"integer"},"response":{"status":"current|refresh|reject"},"kind":"module"},
        {"label":"Schema repair","question":"How many malformed replies are allowed?","reason":"Validate typed output and decrement repair budget before any repair request.","state":"repair count and validation errors","request":{"reply":"unknown","remaining":"integer"},"response":{"status":"valid|repair|exhausted"},"kind":"module"},
        {"label":"Tool executor","question":"What if a write times out?","reason":"Send stable effect key and expected resource version; mark ambiguous acceptance unknown.","state":"tool attempt and effect receipt","request":{"effectKey":"uuid","expectedVersion":"integer"},"response":{"outcome":"success|rejected|unknown"},"kind":"worker"},
        {"label":"Outcome reconciliation","question":"Can unknown writes be retried blindly?","reason":"Query remote effect identity where supported; otherwise surface uncertainty under explicit duplicate-versus-loss policy.","state":"reconciliation status","request":{"effectKey":"uuid"},"response":{"state":"confirmed|rejected|uncertain"},"kind":"worker"},
      ],
      "edges": [
        [["crawl","control","n2",2,"acquire per-origin permit","request-response"]],
        [["publish","n2","n3",3,"publish source index barrier","request-response"]],
        [["fresh","n3","n4",4,"check retrieved revision","request-response"]],
        [["validate","n4","n5",5,"validate bounded model output","request-response"]],
        [["tool","n5","n6",6,"execute approved typed tool","request-response"]],
        [["reconcile","n7","n6",7,"reconcile stable remote effect","request-response"],["record","n7","state",1,"record terminal outcome","storage"]],
      ],
      "recovery": "const receipt = await tool.lookup(effectKey);\nif (receipt.confirmed) return commitConfirmed(receipt);\nif (receipt.provesNotAccepted && attempts < maxAttempts) return retryWithSameKey();\nreturn recordUncertain();\n// Each repair consumes its shared allowance before dispatch; source freshness is rechecked before a write.",
      "cases": [
        ["repair","All model replies are malformed with two repairs remaining.","Run validation and repair.","Dispatch at most two repairs and then terminate exhausted without calling a tool."],
        ["stale","Retrieval returns source revision 5 while authority is at 6.","Attempt a plan that writes based on revision 5.","Refresh or reject before tool execution; syntactic validity cannot override stale preconditions."],
        ["budget","Two jobs target one origin with capacity one.","Try both permits at the same time.","At most one proceeds; retry-after and remaining request budget are explicit."],
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
        {"label":"Intent inbox","question":"What is retained from the request?","reason":"Persist typed intent, deadline and versioned authorization scope.","state":"intent receipt","request":{"intentId":"uuid","scope":"authorized resource ids[]"},"response":{"accepted":"boolean"},"kind":"service"},
        {"label":"Intent journal","question":"How do workers recover?","reason":"Expand inbox and store versioned plan state plus work/event identities.","state":"intent events and dedupe keys","request":{"intentId":"uuid","eventId":"uuid"},"response":{"offset":"integer"},"kind":"log"},
        {"label":"Crawl permits","question":"How is host fairness enforced?","reason":"Issue per-origin permits and carry crawl cursor/byte limits in each queued job.","state":"origin permit ledger","request":{"origin":"normalized origin","byteLimit":"integer"},"response":{"permitId":"uuid|denied"},"kind":"queue"},
        {"label":"Revision projector","question":"How does a source change become searchable?","reason":"Build a new immutable index view then emit its published revision barrier.","state":"index publication watermark","request":{"sourceRevision":"integer"},"response":{"indexRevision":"integer"},"kind":"worker"},
        {"label":"Plan validator","question":"What happens to stale plans?","reason":"Compare plan source revisions with current barriers and queue refresh instead of tool execution.","state":"plan eligibility receipt","request":{"planId":"uuid","sourceRevision":"integer"},"response":{"status":"eligible|stale"},"kind":"module"},
        {"label":"Repair queue","question":"Can malformed output loop forever?","reason":"Enqueue repair only with a decreasing shared budget and an unexpired deadline.","state":"repair job identities","request":{"intentId":"uuid","remaining":"integer"},"response":{"state":"queued|exhausted"},"kind":"queue"},
        {"label":"Effect outbox","question":"How are writes retried safely?","reason":"Persist one stable effect key per approved tool action and expected resource version.","state":"effect intent and dedupe key","request":{"effectKey":"uuid","precondition":"resource version"},"response":{"outcome":"pending|unknown|confirmed"},"kind":"store"},
        {"label":"Recovery projector","question":"Which status is shown to the user?","reason":"Fold receipts into completed, rejected, exhausted or uncertain; old retries cannot overwrite newer outcomes.","state":"public recovery projection","request":{"intentId":"uuid","eventVersion":"integer"},"response":{"status":"terminal or pending state"},"kind":"worker"},
      ],
      "edges": [
        [["permit","control","n2",2,"enqueue bounded origin work","request-response"]],
        [["index","n2","n3",3,"project source revision","request-response"]],
        [["plan","n3","n4",4,"validate plan revision","request-response"]],
        [["repair","n4","n5",5,"enqueue budgeted repair","request-response"]],
        [["approved","n5","n6",6,"commit approved tool intent","storage"]],
        [["recover","n6","n7",7,"project effect receipts","event-stream"],["journal","n7","state",1,"record recovery status","storage"]],
      ],
      "recovery": "for (const receipt of eventsAfter(checkpoint)) {\n if (receipt.version <= projection.version) continue;\n projection = foldAllowedTransition(projection, receipt);\n commitProjectionAndCheckpoint(projection, receipt.offset);\n}\n// Unknown remote effects remain uncertain; retries retain the original intent scope and deadline.",
      "cases": [
        ["repair","A repair queue redelivers the same repair job.","Claim by intent/version and consume the shared budget.","A duplicate does not create a fresh allowance; exhausted intents become terminal."],
        ["stale","A new source barrier arrives after a plan is queued.","Claim the planned tool action.","Compare source revisions and enqueue refresh instead of executing stale work."],
        ["budget","Origin permits and request deadlines are exhausted.","Redeliver a queued crawl job.","Reject or defer explicitly without exceeding the origin bound or resetting the intent deadline."],
      ],
      "algorithmOwner": "n5",
    },
  ],
  "code": "while (!isValid(reply) && remaining > 0 && now() < deadline) { remaining--; reply = repair(reply); }\nif (!isValid(reply)) return {state:\"exhausted\"};\nif (plan.sourceRevision !== currentRevision) return {state:\"stale\"};\nreturn executeWithStableEffectKey(plan);",
  "given": "A reply stays malformed and the repair allowance is two.",
  "when": "Run the bounded validation/repair loop, then compare an old hit with the current source revision.",
  "then": "Only two repairs run; malformed output ends exhausted and an old hit cannot authorize a tool action.",
});}
function buildL031(){return author({
  "batch": 2,
  "id": "L031",
  "title": "Version-pinned nested chat backend",
  "scope": "Reuse a chat backend containing a version-pinned generation subsystem. Authored practice compares in-process and remote composition, compatibility adapters, explicit upgrades and per-instance overrides; timing values are illustrative.",
  "requirements": ["Preserve boundary identity and typed exposed-port mappings across nested expansion.","Pin immutable component/subsystem definitions and make upgrades explicit.","Validate overrides and compatibility without silently changing sibling instances."],
  "refs": [["JSON Schema validation","https://json-schema.org/draft/2020-12/json-schema-validation","Response shape validation; semantic grounding remains a separate check."],["Semantic versioning","https://semver.org/spec/v2.0.0.html","Versioned public API compatibility; deployment behavior still requires explicit implementation bindings."]],
  "approaches": [
    {
      "id": "local",
      "title": "In-process nested generation capacity",
      "choose": "One process can own the backend and library versions together.",
      "trade": ["Shared heap and event-loop contention couple failures; library upgrades require process rollout."],
      "assumptions": ["Examples are illustrative architecture bindings; no claim about a real company backend."],
      "steps": [
        {"label":"Chat boundary","question":"What does a caller depend on?","reason":"Start with a stable chat contract independent of internal generation topology.","state":"conversation identity","request":{"conversationId":"uuid","prompt":"string"},"response":{"replyId":"uuid","state":"accepted"},"kind":"service"},
        {"label":"Backend revision","question":"What is pinned per instance?","reason":"Expand backend into command control and conversation authority without changing its identity.","state":"conversation versions","request":{"conversationId":"uuid","version":"integer"},"response":{"history":"messages[]"},"kind":"store"},
        {"label":"Generation boundary","question":"Can internals be reused?","reason":"Expand command control into a router and pinned generation-capacity boundary.","state":"generation instance binding","request":{"model":"string","prompt":"string"},"response":{"generationId":"uuid"},"kind":"module"},
        {"label":"Capacity internals","question":"How are permits and work separated?","reason":"Expand generation capacity into admission and worker with typed exposed mapping.","state":"capacity permits and worker state","request":{"generationId":"uuid","maxTokens":"integer"},"response":{"tokens":"string[]"},"kind":"module"},
        {"label":"Output contract","question":"Can the backend hide an incompatible result?","reason":"Add an explicit output adapter; internal token batches become the stable reply contract.","state":"adapter compatibility version","request":{"tokenBatch":"string[]"},"response":{"reply":"string"},"kind":"module"},
        {"label":"Worker upgrade","question":"What changes with a library revision?","reason":"Replace the worker implementation while retaining identity and compatible ports; record migration.","state":"worker version and active-attempt policy","request":{"generationId":"uuid"},"response":{"state":"draining|ready"},"kind":"module"},
        {"label":"Binding candidate","question":"Can an upgrade mutate an old definition?","reason":"Add a distinct admission candidate for the new binding and validate its port compatibility.","state":"candidate permit state","request":{"generationId":"uuid","maxTokens":"integer"},"response":{"accepted":"boolean"},"kind":"module"},
        {"label":"Explicit rebind","question":"When does an instance upgrade?","reason":"Create a new immutable subsystem binding and rebind only this capacity instance; earlier stages remain unchanged.","state":"selected binding identity","request":{"instanceId":"uuid","bindingId":"version-pinned id"},"response":{"version":"integer"},"kind":"module"},
      ],
      "edges": [
        [],
        [],
        [],
        [],
        [],
        [],
      ],
      "recovery": "const previous = instance.subsystemId;\nconst next = immutableBindings.get(requestedBindingId);\nassert(compatiblePorts(previous, next));\nreturn {...instance, subsystemId:next.id};\n// Rebind changes this instance only; definitions and the sibling remain pinned.",
      "cases": [
        ["identity","A learner expands backend and generation capacity.","Inspect exposed ports in expanded and collapsed views.","Caller contracts still map to direct typed children, and both parent identities remain in data."],
        ["upgrade","One instance selects a new compatible binding.","Apply explicit rebind.","Earlier binding definitions remain immutable; only this instance changes."],
        ["override","Two instances share a pinned default.","Override the first instance capacity.","The sibling and base default remain unchanged; unsupported overrides reject."],
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
        {"label":"Remote chat contract","question":"What remains stable to the client?","reason":"Accept the same logical conversation command while internal capacity is remote.","state":"request identity","request":{"conversationId":"uuid","prompt":"string"},"response":{"replyId":"uuid","state":"accepted"},"kind":"service"},
        {"label":"Backend journal","question":"Where is conversation truth?","reason":"Expand backend into orchestration and durable conversation state.","state":"conversation and remote intent","request":{"conversationId":"uuid","version":"integer"},"response":{"history":"messages[]"},"kind":"store"},
        {"label":"RPC capacity boundary","question":"What version does a caller invoke?","reason":"Expand orchestration into a contract adapter and pinned remote generation boundary.","state":"remote binding and retry identity","request":{"generationId":"uuid","model":"string"},"response":{"accepted":"boolean"},"kind":"service"},
        {"label":"Remote internals","question":"Which resource owns admission?","reason":"Expand capacity into remote admission and generation worker, preserving exposed contracts.","state":"remote permits and attempt fences","request":{"generationId":"uuid","maxTokens":"integer"},"response":{"tokenBatch":"string[]"},"kind":"module"},
        {"label":"Response adapter","question":"What if remote wire versions differ?","reason":"Decode the remote revision explicitly and map to stable external reply shape.","state":"wire-version compatibility verdict","request":{"wireVersion":"integer","tokenBatch":"string[]"},"response":{"reply":"string"},"kind":"module"},
        {"label":"Remote worker revision","question":"Can an old attempt survive upgrade?","reason":"Replace only the worker binding, draining or fencing active attempts before activation.","state":"remote attempt epoch","request":{"generationId":"uuid","epoch":"integer"},"response":{"state":"draining|ready"},"kind":"worker"},
        {"label":"Admission revision","question":"How is the next contract prepared?","reason":"Add a separately versioned admission candidate without mutating the active binding.","state":"candidate contract and permits","request":{"generationId":"uuid","maxTokens":"integer"},"response":{"accepted":"boolean"},"kind":"module"},
        {"label":"Instance upgrade","question":"Can siblings change automatically?","reason":"Rebind this instance explicitly; preserve other instances and prior immutable definitions.","state":"instance binding selection","request":{"instanceId":"uuid","bindingId":"version-pinned id"},"response":{"version":"integer"},"kind":"module"},
      ],
      "edges": [
        [],
        [],
        [],
        [],
        [],
        [],
      ],
      "recovery": "const next = registry.resolve(requestedBindingId);\nassert(adapter.supports(next.wireVersion));\nconst upgraded = {...instance, subsystemId:next.id, overrides:validatedOverrides};\n// Preserve stable generation/effect keys across uncertain RPC recovery; no implicit sibling upgrade.",
      "cases": [
        ["identity","The remote generation boundary is collapsed.","Resolve a caller edge through nested exposure maps.","The visible endpoint is the boundary, and expansion retains router/admission/worker identities."],
        ["upgrade","A new remote wire revision is incompatible with the adapter.","Try an upgrade then a compatible binding.","Reject incompatible activation; explicit compatible rebind preserves earlier definitions."],
        ["override","Two remote instances pin revision one.","Upgrade only one with a validated queue limit.","The sibling stays pinned; instance override does not mutate shared capacity defaults."],
      ],
      "algorithmOwner": "n7",
    },
  ],
  "code": "const resolved = registry.get(instance.definitionId + \"@\" + instance.version);\nassert(resolved && portsCompatible(resolved, callerContract));\nconst config = validateOverrides(resolved.defaults, instance.overrides);\n// Explicit upgrade returns a new instance record; registry definitions remain immutable.",
  "given": "Two instances pin the same immutable generation definition and one has a local capacity override.",
  "when": "Upgrade one instance to a compatible new binding and change only its override.",
  "then": "The sibling keeps its old version/default; the registry definition and prior stage bindings remain unchanged.",
});}
module.exports={buildL018,buildL021,buildL027,buildL031};
