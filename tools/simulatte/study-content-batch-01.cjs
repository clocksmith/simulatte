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
function buildL012(){return author({
  "batch": 1,
  "id": "L012",
  "title": "Ephemeral stories",
  "scope": "Photo/video publishing, audience checks, viewing and a 24-hour visibility lifetime. Authored practice extends the catalogue; physical deletion and backup retention are separate from visibility expiry.",
  "requirements": ["Publish only complete media renditions with owner and immutable expiration.","Enforce current audience membership and monotonic viewed state.","Hide expired stories at read time and reconcile asynchronous purge."],
  "refs": [["S3 conditional writes","https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html","Conditional creation and compare-and-swap object writes; backend-specific preconditions."],["PostgreSQL isolation","https://www.postgresql.org/docs/18/transaction-iso.html","Versioned transactions and retrying serialization conflicts."]],
  "approaches": [
    {
      "id": "pull",
      "title": "Read-time audience join",
      "choose": "Fan-out would be expensive for large or volatile audiences.",
      "trade": ["Reads join audience and story state; tray latency needs bounded pagination."],
      "assumptions": ["Server time defines the half-open visibility interval; CDN tokens cannot outlive it."],
      "steps": [
        {"label":"Stories API","question":"When does a story become visible?","reason":"Start with upload intent; publication requires verified immutable media.","state":"story command identities","request":{"storyId":"uuid","actorId":"authenticated user","expiresAt":"UTC timestamp"},"response":{"state":"pending|published|expired"},"kind":"service"},
        {"label":"Story ledger","question":"Who owns visibility?","reason":"Expand the API into command handling and a versioned metadata authority.","state":"owner, expiry, media digest","request":{"storyId":"uuid","expectedVersion":"integer"},"response":{"version":"integer","visible":"boolean"},"kind":"store"},
        {"label":"Media finalize","question":"Can partial uploads appear?","reason":"Validate size, digest and codec output before publishing a rendition manifest.","state":"upload receipts","request":{"uploadId":"uuid","digest":"sha256"},"response":{"renditions":"immutable object keys[]"},"kind":"worker"},
        {"label":"Audience join","question":"What if friendship is revoked?","reason":"Join current audience epoch on each read before issuing bounded access.","state":"audience epochs","request":{"viewerId":"uuid","storyId":"uuid"},"response":{"allowed":"boolean","epoch":"integer"},"kind":"service"},
        {"label":"Tray cursor","question":"How are trays paged consistently?","reason":"Use a stable story publication cursor and filter expired entries at the server.","state":"publication cursor","request":{"after":"cursor","limit":"1..100"},"response":{"storyIds":"uuid[]","next":"cursor|null"},"kind":"module"},
        {"label":"Viewed register","question":"Can old devices clear viewed state?","reason":"Union viewed identities per user and story; a read retry is idempotent.","state":"viewed story set","request":{"viewerId":"uuid","storyId":"uuid"},"response":{"viewed":"true"},"kind":"store"},
        {"label":"Expiry guard","question":"Does a delayed timer leak a story?","reason":"Check now < expiresAt while authorizing every metadata and media response.","state":"authorization clock policy","request":{"now":"UTC timestamp","expiresAt":"UTC timestamp"},"response":{"visible":"boolean"},"kind":"module"},
        {"label":"Purge sweeper","question":"When are bytes deleted?","reason":"Reconcile expired metadata with media deletion receipts; retain explicit backup policy.","state":"purge cursor and receipts","request":{"cutoff":"UTC timestamp","cursor":"string"},"response":{"deleted":"object keys[]","pending":"object keys[]"},"kind":"worker"},
      ],
      "edges": [
        [["upload","control","n2",2,"finalize upload","request-response"],["publish","n2","state",1,"publish verified media","storage"]],
        [["authorize","control","n3",3,"check current audience","request-response"],["metadata","n3","state",1,"read story version","storage"]],
        [["tray","caller","n4",4,"page story tray","request-response"],["audience","n4","n3",3,"filter current audience","request-response"]],
        [["view","caller","n5",5,"record viewed story","request-response"]],
        [["expiry","n4","n6",6,"check visibility deadline","request-response"]],
        [["expired","n7","state",1,"scan expired metadata","storage"],["delete","n7","n2",7,"delete expired media","request-response"]],
      ],
      "recovery": "for (const story of scanExpired(now, cursor)) {\n hideMetadata(story.id, story.version);\n for (const key of story.renditionKeys) recordDeletionReceipt(await objectStore.delete(key));\n advanceCursorOnlyAfterRecordingPendingKeys(story.id);\n}\n// Read-time expiry remains authoritative while deletion or backups lag.",
      "cases": [
        ["expiry","A story expires at 100 but deletion is delayed.","Read at 100 through tray and media authorization.","Reject visibility; report pending byte deletion separately."],
        ["acl","A friend loses access after a tray cursor is issued.","Dereference the old pointer.","Recheck current audience and deny the revoked viewer."],
        ["views","Two devices record the same story view in reverse order.","Merge their viewed sets.","Viewed remains true and no retry clears it."],
      ],
      "algorithmOwner": "n6",
    },
    {
      "id": "push",
      "title": "Audience inbox materialization",
      "choose": "Most readers are active and audience fan-out is bounded.",
      "trade": ["Publication writes scale with recipients; stale inbox rows require read-time reauthorization."],
      "assumptions": ["Inbox rows are derived pointers, never independent grants of media access."],
      "steps": [
        {"label":"Publish gateway","question":"What is accepted before fan-out?","reason":"Accept a stable story identity and retain pending upload status.","state":"publication receipts","request":{"storyId":"uuid","actorId":"uuid"},"response":{"accepted":"boolean"},"kind":"service"},
        {"label":"Publish outbox","question":"How is fan-out tied to publication?","reason":"Expand the gateway; commit immutable story metadata and outbox intent together.","state":"story metadata and outbox","request":{"storyId":"uuid","digest":"sha256"},"response":{"version":"integer","outboxId":"uuid"},"kind":"store"},
        {"label":"Transcode queue","question":"How do retries avoid duplicate media?","reason":"Write deterministic rendition keys and verify completion before releasing publication.","state":"rendition attempts","request":{"storyId":"uuid","codecVersion":"integer"},"response":{"manifest":"verified rendition keys[]"},"kind":"worker"},
        {"label":"Fan-out log","question":"Can a worker crash halfway?","reason":"Retain recipient pages and deduplicate inbox insertion by viewer/story.","state":"recipient page checkpoints","request":{"storyId":"uuid","audienceEpoch":"integer"},"response":{"pageCursor":"string|null"},"kind":"log"},
        {"label":"Viewer inbox","question":"What is cached per reader?","reason":"Store ranked pointers with expiry and source version, not media ownership.","state":"unique viewer/story pointers","request":{"viewerId":"uuid","storyId":"uuid","expiresAt":"timestamp"},"response":{"inserted":"boolean"},"kind":"store"},
        {"label":"Read authorization","question":"Can an old pointer bypass revocation?","reason":"Recheck current audience and expiry when dereferencing inbox pointers.","state":"current authorization epoch","request":{"viewerId":"uuid","storyId":"uuid"},"response":{"allowed":"boolean"},"kind":"service"},
        {"label":"View merge","question":"How do devices converge?","reason":"Merge viewed identities independently from feed order; duplicates do not reset progress.","state":"viewed identities","request":{"viewerId":"uuid","storyId":"uuid"},"response":{"viewed":"true"},"kind":"store"},
        {"label":"Expiry reconciliation","question":"Does TTL deletion define visibility?","reason":"Read-time expiry is authoritative; sweep derived inbox pointers and objects asynchronously.","state":"sweep checkpoints","request":{"now":"timestamp","cursor":"string"},"response":{"removed":"integer","pending":"integer"},"kind":"worker"},
      ],
      "edges": [
        [["rendition","control","n2",2,"process upload","request-response"],["publish","n2","state",1,"commit rendition manifest","storage"]],
        [["outbox","state","n3",3,"deliver committed publication","event-stream"]],
        [["fanout","n3","n4",4,"upsert viewer pointer","storage"]],
        [["read","caller","n5",5,"read story pointer","request-response"],["pointer","n5","n4",4,"read inbox candidate","storage"],["authority","n5","state",1,"check owner and expiry","storage"]],
        [["view","caller","n6",6,"merge viewed identity","request-response"]],
        [["sweep","n7","n4",7,"remove expired pointers","storage"],["purge","n7","n2",7,"purge expired objects","request-response"]],
      ],
      "recovery": "for (const row of inbox.scanExpiryAtMost(now)) {\n inbox.removeIfVersion(row.viewerId, row.storyId, row.sourceVersion);\n markPurgePending(row.storyId);\n}\n// Late fan-out checks original expiresAt before reinserting; a pointer is never an authorization grant.",
      "cases": [
        ["expiry","Fan-out is delayed past the original expiry.","Retry inbox insertion and read an old cached pointer.","Drop the expired insert and deny the read even before sweep completion."],
        ["acl","A recipient is removed after fan-out.","Read the materialized pointer.","Current authorization denies access; inbox presence cannot override it."],
        ["views","Two devices submit duplicate view identities.","Merge view events.","Persist one viewed identity without modifying feed ordering."],
      ],
      "algorithmOwner": "n5",
    },
  ],
  "code": "const visible = actorAllowed && now < story.expiresAt;\nif (!visible) return {status:403};\nreturn {status:200, storyId:story.id};",
  "given": "A published story expires at time 100 and its viewer remains allowed.",
  "when": "Authorize at times 99 and 100, then revoke the viewer.",
  "then": "Only the time-99 allowed read succeeds; expiry does not claim immediate byte erasure.",
});}
function buildL015(){return author({
  "batch": 1,
  "id": "L015",
  "title": "Presence and session leases",
  "scope": "Track per-device heartbeats, aggregate user availability and distribute authorized transitions. Presence is a bounded-staleness observation, never proof that a person is available.",
  "requirements": ["Fence delayed heartbeats and distinguish device sessions.","Aggregate active leases and define offline after lease expiration.","Provide snapshot-plus-delta synchronization with explicit gaps."],
  "refs": [["etcd concurrency API","https://etcd.io/docs/v3.6/dev-guide/api_concurrency_reference_v3/","Lease-backed ownership and transaction revisions, not perfect failure detection."],["Server-sent events","https://html.spec.whatwg.org/multipage/server-sent-events.html","Event identifiers and reconnection; application replay retention is separately required."]],
  "approaches": [
    {
      "id": "leases",
      "title": "Partitioned lease authority",
      "choose": "Per-user serialization and low-latency reads matter.",
      "trade": ["Lease partitions need failover fencing; clock and timeout choices create stale or false-offline observations."],
      "assumptions": ["Authority time controls expiry; mobile suspension can look disconnected."],
      "steps": [
        {"label":"Presence ingress","question":"What identifies a heartbeat?","reason":"Start with authenticated user, device, session generation and sequence.","state":"session generation","request":{"userId":"uuid","deviceId":"uuid","epoch":"integer","seq":"integer"},"response":{"accepted":"boolean"},"kind":"service"},
        {"label":"Session authority","question":"Can old traffic resurrect a session?","reason":"Expand ingress and retain the greatest generation/sequence per device.","state":"session lease records","request":{"epoch":"integer","seq":"integer","deadline":"timestamp"},"response":{"version":"integer"},"kind":"store"},
        {"label":"Heartbeat lease","question":"What if a client vanishes?","reason":"Refresh a bounded deadline only for a current session; old generations are rejected.","state":"expiry deadlines","request":{"sessionId":"uuid","now":"timestamp"},"response":{"deadline":"timestamp"},"kind":"module"},
        {"label":"User reduction","question":"Does one closed tab imply offline?","reason":"Aggregate all unexpired devices and explicit availability settings.","state":"aggregate version","request":{"userId":"uuid","now":"timestamp"},"response":{"online":"boolean","version":"integer"},"kind":"module"},
        {"label":"Transition outbox","question":"How are status changes published?","reason":"Commit aggregate changes and ordered transition intent under one user owner.","state":"transition outbox","request":{"userId":"uuid","version":"integer"},"response":{"eventId":"uuid"},"kind":"log"},
        {"label":"Subscription filter","question":"Who may observe presence?","reason":"Authorize channel/contact subscriptions and cap their cardinality.","state":"subscription ACL epoch","request":{"observerId":"uuid","targetIds":"uuid[]"},"response":{"allowedIds":"uuid[]"},"kind":"service"},
        {"label":"Snapshot cursor","question":"Can login miss a transition?","reason":"Capture a revisioned snapshot then replay transitions strictly after its cursor.","state":"snapshot revision","request":{"targetIds":"uuid[]","after":"cursor|null"},"response":{"states":"presence[]","cursor":"string"},"kind":"module"},
        {"label":"Gap recovery","question":"What if retained deltas expired?","reason":"Signal resnapshot rather than inventing continuity; expire leases after owner failover.","state":"retention floor","request":{"after":"cursor"},"response":{"status":"delta|resnapshot"},"kind":"worker"},
      ],
      "edges": [
        [["beat","control","n2",2,"refresh session lease","request-response"],["lease-state","n2","state",1,"compare session generation","storage"]],
        [["reduce","n2","n3",3,"reduce active devices","request-response"]],
        [["transition","n3","n4",4,"append changed status","event-stream"]],
        [["subscribe","caller","n5",5,"authorize presence subscription","request-response"]],
        [["snapshot","n5","n6",6,"load snapshot and cursor","request-response"],["aggregate","n6","n3",3,"read current presence","request-response"],["delta","n4","n6",4,"replay after revision","event-stream"]],
        [["resume","n6","n7",7,"check delta retention floor","request-response"],["expire","n7","n2",2,"expire stale owner leases","request-response"]],
      ],
      "recovery": "if (cursor < retainedFloor) return {status:\"resnapshot\"};\nconst snapshot = readAtRevision(revision);\nreturn {snapshot, deltas: eventsAfter(revision)};\n// Timer expiry compares the last heartbeat sequence before closing a session.",
      "cases": [
        ["expiry","Two devices are active and only one misses its lease deadline.","Expire that device after rechecking heartbeat version.","The other device keeps the user online; late stale beats cannot resurrect the expired generation."],
        ["gap","A login cursor predates retained transition history.","Resume subscription.","Return resnapshot explicitly and synchronize snapshot plus greater revisions."],
        ["acl","An observer loses channel membership.","Deliver a queued transition.","Recheck the subscription authorization epoch and stop delivery."],
      ],
      "algorithmOwner": "n2",
    },
    {
      "id": "events",
      "title": "Session event log and materialized views",
      "choose": "Auditable session transitions and replay are more valuable than immediate writes.",
      "trade": ["Asynchronous projections add visible lag and require retained events plus tombstones."],
      "assumptions": ["Event append order is partition-local; viewers receive versioned state rather than a global order."],
      "steps": [
        {"label":"Session append","question":"What is a session event?","reason":"Record authenticated open, heartbeat and close events with stable identity.","state":"event identity","request":{"sessionId":"uuid","epoch":"integer","seq":"integer","kind":"open|beat|close"},"response":{"offset":"integer"},"kind":"service"},
        {"label":"Presence journal","question":"What survives projection loss?","reason":"Expand ingress into an append handler and retained session journal.","state":"session events","request":{"eventId":"uuid","sessionId":"uuid"},"response":{"offset":"integer"},"kind":"log"},
        {"label":"Session fold","question":"How are duplicates ordered?","reason":"Fold each session by generation then sequence; close tombstones fence old beats.","state":"per-session folded state","request":{"epoch":"integer","seq":"integer","closed":"boolean"},"response":{"accepted":"boolean"},"kind":"module"},
        {"label":"Expiry events","question":"Who synthesizes disconnect?","reason":"Schedule expiry against last accepted heartbeat and recheck its version before closing.","state":"timer versions","request":{"sessionId":"uuid","expectedSeq":"integer"},"response":{"expired":"boolean"},"kind":"worker"},
        {"label":"User projection","question":"How is multi-device state derived?","reason":"Reduce active sessions into a monotonic user projection with source offsets.","state":"user view and watermark","request":{"userId":"uuid","offset":"integer"},"response":{"online":"boolean","watermark":"integer"},"kind":"store"},
        {"label":"ACL projection","question":"Can removed contacts retain access?","reason":"Resolve current observer permission independently from stale presence projection.","state":"ACL epochs","request":{"observerId":"uuid","targetId":"uuid"},"response":{"allowed":"boolean"},"kind":"service"},
        {"label":"Snapshot barrier","question":"How does initial login synchronize?","reason":"Return materialized state at a source watermark then stream greater versions.","state":"snapshot watermark","request":{"targets":"uuid[]"},"response":{"states":"presence[]","watermark":"integer"},"kind":"module"},
        {"label":"Rebuild worker","question":"What if the view is lost?","reason":"Replay retained journal into a new view and swap at a verified barrier.","state":"rebuild cursor","request":{"fromOffset":"integer"},"response":{"readyAt":"integer|null"},"kind":"worker"},
      ],
      "edges": [
        [["fold","state","n2",2,"fold session events","event-stream"]],
        [["timer","n3","n2",3,"expire expected heartbeat","request-response"]],
        [["project","n2","n4",4,"project user state","storage"]],
        [["authorize","caller","n5",5,"authorize observer","request-response"]],
        [["sync","n5","n6",6,"start snapshot sync","request-response"],["view","n6","n4",4,"read watermark snapshot","storage"]],
        [["replay","state","n7",7,"replay retained journal","event-stream"],["swap","n7","n4",4,"publish rebuilt view","storage"]],
      ],
      "recovery": "const shadow = emptyProjection();\nfor (const event of journal.from(checkpoint)) foldIfNewerSessionVersion(shadow, event);\nif (shadow.watermark >= publicationBarrier) atomicallySwapProjection(shadow);\n// A journal retention gap blocks rebuild until a new authoritative snapshot exists.",
      "cases": [
        ["expiry","A heartbeat arrives after its expiry timer was scheduled.","Process the timer with the old expected sequence.","The timer cannot close the refreshed session; a close tombstone fences older beats."],
        ["gap","A new client snapshots view watermark 20 while event 21 arrives.","Stream events after watermark 20.","Event 21 is delivered once by identity; retention gaps require resnapshot."],
        ["acl","A projected online state is cached after observer revocation.","Subscribe using the cached target.","Current ACL filtering denies the subscription independently of presence lag."],
      ],
      "algorithmOwner": "n2",
    },
  ],
  "code": "if (beat.epoch < current.epoch || (beat.epoch === current.epoch && beat.seq <= current.seq)) return current;\nreturn {...beat, deadline: now + ttl};",
  "given": "Device epoch 3 sequence 8 has an active lease and a second device is connected.",
  "when": "Deliver epoch 2 sequence 99, duplicate sequence 8, then close only the first device.",
  "then": "Old/duplicate heartbeats do not extend its lease; the second active device keeps the user online.",
});}
function buildL017(){return author({
  "batch": 1,
  "id": "L017",
  "title": "Token streaming chat",
  "scope": "Authored emphasis is generated reply tokens, replay and cancellation, distinct from L004 human messaging. One million connections is a sizing target requiring measurement; no local model establishes that capacity.",
  "requirements": ["Persist prompt and generation identity before dispatch.","Stream ordered tokens with bounded replay and explicit resume gaps.","Fence cancellation and bound model admission and client buffers."],
  "refs": [["Server-sent events","https://html.spec.whatwg.org/multipage/server-sent-events.html","Event identifiers and reconnection; application replay retention is separately required."],["PostgreSQL isolation","https://www.postgresql.org/docs/18/transaction-iso.html","Versioned transactions and retrying serialization conflicts."]],
  "approaches": [
    {
      "id": "session",
      "title": "Connection gateway with durable token journal",
      "choose": "Fast incremental delivery and resumable token history are required.",
      "trade": ["Journaled tokens cost storage and I/O; gateways retain only bounded buffers."],
      "assumptions": ["Tokens are indexed within one generation; partial output can be visible before final validation."],
      "steps": [
        {"label":"Prompt API","question":"When is a reply accepted?","reason":"Authenticate conversation membership and assign a stable generation ID.","state":"command receipts","request":{"conversationId":"uuid","commandId":"uuid","prompt":"string"},"response":{"generationId":"uuid","state":"queued"},"kind":"service"},
        {"label":"Conversation ledger","question":"What survives a gateway restart?","reason":"Expand API; persist prompt, model selection and cancellation epoch.","state":"prompt and generation records","request":{"generationId":"uuid","expectedVersion":"integer"},"response":{"version":"integer"},"kind":"store"},
        {"label":"Model admission","question":"Can slow models exhaust capacity?","reason":"Route by model identity and reserve bounded queue/GPU slots with deadlines.","state":"capacity reservations","request":{"modelId":"string","deadline":"timestamp"},"response":{"leaseId":"uuid|rejected"},"kind":"queue"},
        {"label":"Inference worker","question":"Who owns token numbering?","reason":"One fenced generation attempt emits monotonically numbered chunks.","state":"attempt fence and token index","request":{"generationId":"uuid","fence":"integer"},"response":{"index":"integer","text":"string"},"kind":"worker"},
        {"label":"Token journal","question":"Can a reconnect recover output?","reason":"Persist indexed chunks before acknowledging resumable delivery.","state":"generation/token sequence","request":{"generationId":"uuid","index":"integer","text":"string"},"response":{"durableThrough":"integer"},"kind":"log"},
        {"label":"Stream gateway","question":"What if the browser is slow?","reason":"Deliver only after durable cursor; bound queue bytes and close with resume instruction.","state":"connection delivery cursor","request":{"after":"integer","maxBytes":"integer"},"response":{"chunks":"token[]","next":"integer"},"kind":"service"},
        {"label":"Cancel fence","question":"Does cancellation race a late token?","reason":"Advance generation epoch and reject late attempt writes; cancellation cannot erase already observed text.","state":"cancellation epoch","request":{"generationId":"uuid","expectedEpoch":"integer"},"response":{"cancelled":"boolean"},"kind":"module"},
        {"label":"Resume reconciler","question":"What if history has expired?","reason":"Return an explicit gap and final snapshot or regenerate under a new identity.","state":"retention floor","request":{"generationId":"uuid","after":"integer"},"response":{"status":"resume|gap|complete"},"kind":"worker"},
      ],
      "edges": [
        [["reserve","control","n2",2,"reserve model capacity","request-response"]],
        [["infer","n2","n3",3,"start fenced inference","request-response"]],
        [["append","n3","n4",4,"append indexed token","event-stream"]],
        [["tail","n4","n5",5,"tail durable tokens","event-stream"],["connect","caller","n5",5,"resume after cursor","request-response"]],
        [["cancel","caller","n6",6,"cancel generation","request-response"],["fence","n6","n3",6,"fence late token writes","request-response"]],
        [["recover","n7","n4",7,"check retained token floor","storage"],["status","n7","state",1,"read final generation state","storage"]],
      ],
      "recovery": "if (after < journal.retentionFloor(generationId)) return {status:\"gap\", final:loadFinalSnapshot(generationId)};\nreturn journal.tokensAfter(generationId, after).filter(t => t.epoch === acceptedEpoch);\n// Client deduplicates token indexes; a new generation receives a new identity.",
      "cases": [
        ["cancel","Inference is running when cancel advances epoch.","Append a late chunk using the old epoch.","Reject the chunk; text already observed remains part of the audit trail."],
        ["gap","A reconnect cursor is older than retained chunks.","Resume the stream.","Return gap plus a permitted final snapshot, never silently concatenate a different attempt."],
        ["pressure","One connection stops consuming tokens.","Its bounded delivery buffer fills.","Close that connection with a resume cursor without growing unbounded server memory."],
      ],
      "algorithmOwner": "n4",
    },
    {
      "id": "pull",
      "title": "Durable generation workflow with cursor polling",
      "choose": "Connections are intermittent and durable workflow orchestration already exists.",
      "trade": ["Polling increases first-token delay; workflow histories need compaction and version management."],
      "assumptions": ["The workflow records activity decisions, not private reasoning; remote inference may still be duplicated after uncertain failure."],
      "steps": [
        {"label":"Generation workflow","question":"What constitutes one reply?","reason":"Start a durable command keyed by conversation and command identity.","state":"workflow identity","request":{"conversationId":"uuid","commandId":"uuid"},"response":{"generationId":"uuid"},"kind":"service"},
        {"label":"Workflow history","question":"Which decisions replay?","reason":"Expand workflow with journaled model activity decisions and cancellation versions.","state":"workflow history","request":{"generationId":"uuid","event":"string"},"response":{"sequence":"integer"},"kind":"log"},
        {"label":"Activity queue","question":"How is inference bounded?","reason":"Dispatch retryable inference activities with stable attempt/fence identities.","state":"activity leases","request":{"generationId":"uuid","fence":"integer"},"response":{"lease":"uuid|rejected"},"kind":"queue"},
        {"label":"Chunk producer","question":"Can restarted activities corrupt output?","reason":"Persist tokens through a fenced append API; a new attempt cannot append to the prior prefix.","state":"token prefix identity","request":{"generationId":"uuid","attempt":"integer","index":"integer"},"response":{"accepted":"boolean"},"kind":"worker"},
        {"label":"Output pages","question":"What do readers fetch?","reason":"Materialize immutable chunk pages and completion status under generation/version.","state":"immutable chunk pages","request":{"generationId":"uuid","after":"integer"},"response":{"page":"token[]","next":"integer"},"kind":"store"},
        {"label":"Cursor reader","question":"How do clients avoid duplicate text?","reason":"Poll after the last accepted index and discard duplicate indexes locally.","state":"reader cursor","request":{"generationId":"uuid","after":"integer"},"response":{"tokens":"token[]","state":"running|done|cancelled"},"kind":"module"},
        {"label":"Cancellation signal","question":"How is pending work stopped?","reason":"Persist cancellation before cancelling queued activities and fence late output commits.","state":"cancellation epoch","request":{"generationId":"uuid"},"response":{"state":"cancelled"},"kind":"module"},
        {"label":"History compactor","question":"Can pages disappear silently?","reason":"Compact finalized workflow state while preserving retention floor and explicit gap responses.","state":"retention floor and final digest","request":{"generationId":"uuid","after":"integer"},"response":{"status":"page|gap"},"kind":"worker"},
      ],
      "edges": [
        [["schedule","control","n2",2,"schedule inference activity","request-response"]],
        [["run","n2","n3",3,"run fenced activity","request-response"]],
        [["materialize","n3","n4",4,"write immutable output page","storage"]],
        [["poll","caller","n5",5,"poll after token cursor","request-response"],["pages","n5","n4",4,"read immutable page","storage"]],
        [["signal","caller","n6",6,"signal cancellation","request-response"],["fence","n6","n3",6,"stop superseded activity","request-response"]],
        [["compact","n7","state",1,"compact finalized history","storage"],["retain","n7","n4",7,"record output retention floor","storage"]],
      ],
      "recovery": "if (!workflow.isFinal(generationId)) return;\nconst snapshot = finalizeDigestAndStatus(generationId);\ncommitSnapshotBeforeTrimmingHistory(snapshot);\nrecordRetentionFloorBeforeDeletingPages(generationId);\n// Polling below the floor returns gap, not an empty successful page.",
      "cases": [
        ["cancel","Cancel is persisted while a remote activity is finishing.","Attempt a page commit with the old cancellation epoch.","Fence the commit and retain the canceled terminal state."],
        ["gap","The requested page cursor predates the compaction floor.","Poll after the stale index.","Return gap and final status explicitly; duplicate indexes do not append twice."],
        ["pressure","More inference activities arrive than capacity allows.","Claim slots beyond the configured bound.","Queue within a fixed bound or reject with retry guidance before remote inference."],
      ],
      "algorithmOwner": "n3",
    },
  ],
  "code": "if (chunk.epoch !== state.epoch || state.cancelled) return false;\nif (chunk.index !== state.tokens.length) return false;\nstate.tokens.push(chunk.text); return true;",
  "given": "A generation contains chunks 0 and 1 at epoch 4.",
  "when": "Replay chunk 1, cancel by advancing epoch, then deliver chunk 2 from epoch 4.",
  "then": "The duplicate index and stale token are rejected; resume after index 0 returns only existing chunk 1.",
});}
function buildL020(){return author({
  "batch": 1,
  "id": "L020",
  "title": "Ranked social feed freshness",
  "scope": "Extend L011 with versioned ranking, stable pagination and freshness watermarks. Published latency targets require deployment measurements; queue throughput alone does not establish fast feed reads.",
  "requirements": ["Keep post and relationship authority separate from derived timelines.","Rank with a pinned model/features snapshot and deterministic tie-breaker.","Reconcile partial fan-out and expose freshness while enforcing revocation."],
  "refs": [["PostgreSQL isolation","https://www.postgresql.org/docs/18/transaction-iso.html","Versioned transactions and retrying serialization conflicts."],["Kafka delivery","https://kafka.apache.org/documentation/#semantics","Replay, transactional production and consumer processing boundaries."]],
  "approaches": [
    {
      "id": "fanout",
      "title": "Write-time candidates with read-time ranking",
      "choose": "Most readers consume many feeds and write amplification is acceptable.",
      "trade": ["Large fan-out needs bounded pages and high-degree author exceptions; ranking is refreshed separately."],
      "assumptions": ["A timeline entry is a candidate pointer, never an independent access grant."],
      "steps": [
        {"label":"Post command","question":"When can a reader see a post?","reason":"Authenticate owner and persist a stable publication identity.","state":"post command receipts","request":{"postId":"uuid","authorId":"uuid","commandId":"uuid"},"response":{"version":"integer"},"kind":"service"},
        {"label":"Post outbox","question":"Can committed posts miss fan-out?","reason":"Expand posting authority; commit post version and fan-out intent atomically.","state":"posts and outbox","request":{"postId":"uuid","version":"integer"},"response":{"eventId":"uuid"},"kind":"store"},
        {"label":"Graph snapshot","question":"Which followers receive the post?","reason":"Pin a relationship snapshot for enumeration while checking current access on reads.","state":"graph snapshot revision","request":{"authorId":"uuid","revision":"integer"},"response":{"followers":"uuid[]","next":"cursor|null"},"kind":"directory"},
        {"label":"Candidate fan-out","question":"How do crashed workers resume?","reason":"Deduplicate viewer/post insertion and commit page checkpoints after writes.","state":"recipient page checkpoints","request":{"eventId":"uuid","page":"integer"},"response":{"committedPage":"integer"},"kind":"worker"},
        {"label":"Timeline candidates","question":"What is stored per reader?","reason":"Store bounded pointers and source watermark; high-degree sources remain pull candidates.","state":"candidate identities and watermark","request":{"viewerId":"uuid","postId":"uuid"},"response":{"inserted":"boolean"},"kind":"store"},
        {"label":"Feature snapshot","question":"Can scores change while paging?","reason":"Pin feature and ranker versions for one feed session.","state":"feature snapshot and ranker version","request":{"viewerId":"uuid","snapshotId":"uuid"},"response":{"features":"versioned values"},"kind":"cache"},
        {"label":"Stable ranker","question":"What breaks score ties?","reason":"Order by score then publication sequence then post ID; encode snapshot in cursor.","state":"feed session cursor","request":{"snapshotId":"uuid","after":"rank tuple|null"},"response":{"posts":"uuid[]","next":"cursor|null"},"kind":"module"},
        {"label":"Freshness repair","question":"What if candidate fan-out is delayed?","reason":"Compare watermark against publication progress and merge bounded recent pull results.","state":"repair watermark","request":{"viewerId":"uuid","watermark":"integer"},"response":{"freshThrough":"integer","degraded":"boolean"},"kind":"worker"},
      ],
      "edges": [
        [["enumerate","control","n2",2,"pin follower graph revision","request-response"]],
        [["publication","state","n3",3,"consume publication outbox","event-stream"],["followers","n3","n2",2,"page pinned followers","request-response"]],
        [["candidate","n3","n4",4,"upsert viewer candidate","storage"]],
        [["features","control","n5",5,"pin ranking features","request-response"]],
        [["feed","caller","n6",6,"read ranked feed","request-response"],["candidates","n6","n4",4,"load candidate pointers","storage"],["rank-features","n6","n5",5,"read pinned features","request-response"]],
        [["lag","n7","n4",4,"compare candidate watermark","storage"],["source","n7","state",1,"pull recent source posts","storage"],["repair","n7","n6",7,"merge freshness fallback","request-response"]],
      ],
      "recovery": "const current = currentVisibilityAndGraphEpoch(viewer);\nconst candidates = dedupe([...materializedPointers(viewer), ...recentPostsAfter(watermark)]);\nreturn stableRank(candidates.filter(p=>authorizedNow(current,p)), pinnedRanker, pinnedFeatures);\n// Cursor carries snapshot ID and complete score/sequence/ID tie tuple.",
      "cases": [
        ["pages","Equal-score posts straddle a page boundary and new posts arrive.","Continue with the same snapshot and full tie tuple.","Return each eligible snapshot post once; new publications enter a new session."],
        ["acl","An unfollow or deletion happens after candidate materialization.","Read the cached candidate.","Current visibility removes it before ranking and output."],
        ["lag","Fan-out stops after only part of the recipient pages.","Resume workers and request a feed with a lagging watermark.","Deduplicate replayed inserts and disclose freshness while bounded pull fallback repairs recent omissions."],
      ],
      "algorithmOwner": "n6",
    },
    {
      "id": "readmerge",
      "title": "Read-time multi-source merge and ranking",
      "choose": "Writes dominate or authors have enormous audiences.",
      "trade": ["Read amplification and graph traversal are higher; source cursors and snapshot retention limit paging sessions."],
      "assumptions": ["Each session freezes candidate horizon and ranking policy; new posts appear in a new session."],
      "steps": [
        {"label":"Feed query","question":"What defines the feed session?","reason":"Authenticate viewer and freeze a publication upper bound.","state":"session identity","request":{"viewerId":"uuid","limit":"1..100"},"response":{"sessionId":"uuid"},"kind":"service"},
        {"label":"Session authority","question":"Can the next page change history?","reason":"Expand query boundary and persist horizon, graph revision and ranker version.","state":"session snapshot","request":{"sessionId":"uuid"},"response":{"horizon":"integer","rankerVersion":"integer"},"kind":"store"},
        {"label":"Follow traversal","question":"How is the source set bounded?","reason":"Enumerate followed authors from a stable graph snapshot with pagination.","state":"author cursors","request":{"viewerId":"uuid","graphRevision":"integer"},"response":{"authors":"uuid[]"},"kind":"directory"},
        {"label":"Post iterators","question":"How are candidates fetched fairly?","reason":"Open bounded per-source publication cursors up to the fixed horizon.","state":"source cursors","request":{"authors":"uuid[]","upper":"integer"},"response":{"candidates":"post pointers[]"},"kind":"module"},
        {"label":"Candidate heap","question":"Can one source monopolize the feed?","reason":"Merge source heads with a candidate budget and explicit diversity cap.","state":"merge heap and source budget","request":{"candidates":"post pointers[]","budget":"integer"},"response":{"selected":"post pointers[]"},"kind":"module"},
        {"label":"Rank features","question":"What evidence determines order?","reason":"Read features at a pinned version, separating missing features from zero values.","state":"feature version","request":{"postIds":"uuid[]","version":"integer"},"response":{"features":"feature rows[]"},"kind":"cache"},
        {"label":"Ranking cursor","question":"How is stable paging achieved?","reason":"Rank deterministically and keep the snapshot plus tie tuple in continuation state.","state":"rank tuple cursor","request":{"sessionId":"uuid","after":"rank tuple|null"},"response":{"posts":"uuid[]","next":"cursor|null"},"kind":"module"},
        {"label":"Access and lag","question":"Can deleted posts remain cached?","reason":"Recheck deletion/revocation and report source lag without filling pages with stale grants.","state":"access epoch and lag receipts","request":{"viewerId":"uuid","postIds":"uuid[]"},"response":{"visible":"uuid[]","freshThrough":"integer"},"kind":"service"},
      ],
      "edges": [
        [["sources","control","n2",2,"enumerate pinned follow graph","request-response"]],
        [["iterate","n2","n3",3,"open bounded author iterators","request-response"]],
        [["merge","n3","n4",4,"merge candidate heads","request-response"]],
        [["feature","n4","n5",5,"load versioned features","request-response"]],
        [["rank","n5","n6",6,"rank and page snapshot","request-response"],["read","caller","n6",6,"continue rank cursor","request-response"]],
        [["visibility","n6","n7",7,"filter current visibility","request-response"],["versions","n7","state",1,"read session horizon","storage"]],
      ],
      "recovery": "const currentACL = loadCurrentACL(viewer);\nconst page = rankSnapshot.resume(cursor.snapshotId, cursor.tieTuple);\nreturn {posts:page.filter(p=>!p.deleted && currentACL.allows(p)), freshThrough:minimumSourceWatermark()};\n// Permission filtering can shorten a page; it never reuses a stale grant to fill it.",
      "cases": [
        ["pages","A source adds a new high-score post after the first page.","Resume the same horizon and ranker snapshot.","The new post waits for a new session and prior posts retain deterministic tie order."],
        ["acl","A candidate becomes private while a source iterator is cached.","Emit the next page.","Current ACL filtering removes the candidate before response."],
        ["lag","One source iterator is unavailable or budget-exhausted.","Finish the bounded merge.","Expose incomplete freshness and the source budget receipt rather than claiming a complete instant feed."],
      ],
      "algorithmOwner": "n6",
    },
  ],
  "code": "return rows.filter(r=>r.allowed && !r.deleted).sort((a,b)=>b.score-a.score || b.seq-a.seq || a.id.localeCompare(b.id));",
  "given": "Three posts include equal scores, distinct publication sequences and one revoked candidate.",
  "when": "Rank twice with the same feature snapshot and reverse the input order.",
  "then": "Both results have the same tie order and omit the revoked candidate; this proves only the bounded ranking rule.",
});}
module.exports={buildL012,buildL015,buildL017,buildL020};
