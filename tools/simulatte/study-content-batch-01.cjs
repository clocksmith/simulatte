 'use strict';
const crypto=require('node:crypto');
const {problem,contract,component,builder,sorted}=require('./study-solution-author.cjs');
const {applyOperation}=require('./study-contract.cjs');
// Each row declares a distinct architectural responsibility and its wire contract.
// Reference models exercise bounded rules only, not distributed services or stated latency targets.
// Binding IDs published before the semantic repair, with a fingerprint of their exact definition. Saved study
// workspaces key on these IDs, so an ID is reused only for a deep-equal definition; any other mapping takes the next
// number above every published one for that node, and retired IDs are never reissued.
const PUBLISHED_BINDINGS={'l012-pull-boundary-binding-1':'168d29c08e1ec5cc','l012-pull-boundary-binding-2':'4e4f9e2696a7b8e3','l012-pull-boundary-binding-3':'a949f2c138846649','l012-push-boundary-binding-1':'d4197aa316844f77','l012-push-boundary-binding-2':'ce41a16704f5ad7e','l012-push-boundary-binding-3':'14da768ba5f470e8','l015-leases-boundary-binding-1':'fbc2e6b505aeb98d','l015-leases-boundary-binding-2':'b4db66f5fcbe2a8b','l015-events-boundary-binding-1':'3fdb288c9d188d0f','l015-events-boundary-binding-2':'1c77abc32c55caab','l015-events-boundary-binding-3':'42e255142ad0788c','l017-session-boundary-binding-1':'239d3d9a6cf048bf','l017-session-boundary-binding-2':'dfecb96d01c28d2c','l017-session-boundary-binding-3':'75559283f97b43de','l017-pull-boundary-binding-1':'bec564cc4da16f3d','l017-pull-boundary-binding-2':'28c44316f6837441','l017-pull-boundary-binding-3':'cfd5bd45ac74d17d','l020-fanout-boundary-binding-1':'446dba038353193d','l020-fanout-boundary-binding-2':'63a76578a037a589','l020-fanout-boundary-binding-3':'4e12d6071a4c5034','l020-fanout-boundary-binding-4':'996ce43bd3804432','l020-fanout-boundary-binding-5':'2add593f31981ecd','l020-readmerge-boundary-binding-1':'073abfe4bd85cbe7','l020-readmerge-boundary-binding-2':'c82fcf3cf0dd50c0','l020-readmerge-boundary-binding-3':'6e7dcb47dc2da305'};
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
        {"label":"Stories API","question":"When does a story become visible?","reason":"Start with upload intent; publication requires verified immutable media.","state":"story command identities","request":{"storyId":"uuid","actorId":"authenticated user","expiresAt":"UTC timestamp"},"response":{"state":"pending|published|expired"},"kind":"service","inv":"storyId is the idempotency key: a retried command with the same storyId and actorId returns the existing story state and never creates a second story."},
        {"label":"Story ledger","question":"Who owns visibility?","reason":"Expand the API into command handling and a versioned metadata authority.","state":"owner, expiry, media digest","request":{"storyId":"uuid","expectedVersion":"integer"},"response":{"version":"integer","visible":"boolean"},"kind":"store","inv":"Story metadata changes only by compare-and-swap on expectedVersion; owner and expiresAt are immutable after the first commit."},
        {"label":"Media finalize","question":"Can partial uploads appear?","reason":"Validate size, digest and codec output before publishing a rendition manifest.","state":"upload receipts","request":{"uploadId":"uuid","digest":"sha256"},"response":{"renditions":"immutable object keys[]"},"kind":"worker","inv":"A story is published only after every rendition digest is verified; until then it stays pending and invisible."},
        {"label":"Audience join","question":"What if friendship is revoked?","reason":"Join current audience epoch on each read before issuing bounded access.","state":"audience epochs","request":{"viewerId":"uuid","storyId":"uuid"},"response":{"allowed":"boolean","epoch":"integer"},"kind":"service","inv":"Every read joins the viewer against the current audience epoch; an access decision made under an older epoch is never reused."},
        {"label":"Tray cursor","question":"How are trays paged consistently?","reason":"Use a stable story publication cursor and filter expired entries at the server.","state":"publication cursor","request":{"after":"cursor","limit":"1..100"},"response":{"storyIds":"uuid[]","next":"cursor|null"},"kind":"module","inv":"The tray orders stories by publication sequence then storyId, so a page boundary neither repeats nor skips a story; tray entries are pointers, not grants."},
        {"label":"Viewed register","question":"Can old devices clear viewed state?","reason":"Union viewed identities per user and story; a read retry is idempotent.","state":"viewed story set","request":{"viewerId":"uuid","storyId":"uuid"},"response":{"viewed":"true"},"kind":"store","inv":"Viewed state for a (viewer, story) pair only moves from false to true; duplicate or reordered view records cannot clear it."},
        {"label":"Expiry guard","question":"Does a delayed timer leak a story?","reason":"Check now < expiresAt on every tray, metadata, media and view response; the guard sits behind both the tray cursor and audience authorization.","state":"authorization clock policy","request":{"now":"UTC timestamp","expiresAt":"UTC timestamp"},"response":{"visible":"boolean"},"kind":"module","inv":"Tray, metadata, media and view responses all pass the expiry guard; a story with now >= expiresAt is never returned, whatever the purge state."},
        {"label":"Purge sweeper","question":"When are bytes deleted?","reason":"Reconcile expired metadata with media deletion receipts; retain explicit backup policy.","state":"purge cursor and receipts","request":{"cutoff":"UTC timestamp","cursor":"string"},"response":{"deleted":"object keys[]","pending":"object keys[]"},"kind":"worker","inv":"The purge cursor advances only after each deletion receipt or pending key is recorded; deletion lag never changes visibility."},
      ],
      "edges": [
        [["upload","control","n2",2,"finalize upload","request-response"],["publish","n2","state",1,"publish verified media","storage"]],
        [["authorize","control","n3",3,"check current audience","request-response"],["metadata","n3","state",1,"read story version","storage"]],
        [["tray","caller","n4",4,"page story tray","request-response"],["audience","n4","n3",3,"filter current audience","request-response"]],
        [["view","caller","n5",5,"record viewed story","request-response"]],
        [["expiry","n4","n6",6,"check visibility deadline","request-response"],["expiry-authorize","n3","n6",6,"check deadline before metadata and media","request-response"],["expiry-view","n5","n6",6,"check deadline before recording a view","request-response"]],
        [["expired","n7","state",1,"scan expired metadata","storage"],["delete","n7","n2",7,"delete expired media","request-response"]],
      ],
      "read": {"path":"/stories/{storyId}","request":{"viewerId":"authenticated user","storyId":"uuid"},"response":{"state":"pending|published|expired","renditions":"short-lived media URLs[]","viewed":"boolean"},"owner":"n3"},
      "code": `// Expiry guard (n6). Tray (n4), metadata and media authorization (n3) and view recording (n5) all call it.
// allowed comes from the current audience epoch, never from a cached tray entry.
const visible=(story,allowed,now)=>allowed&&now<story.expiresAt;`,
      "recovery": "for (const story of scanExpired(now, cursor)) {\n hideMetadata(story.id, story.version);\n for (const key of story.renditionKeys) recordDeletionReceipt(await objectStore.delete(key));\n advanceCursorOnlyAfterRecordingPendingKeys(story.id);\n}\n// Read-time expiry remains authoritative while deletion or backups lag.",
      "mechanism": {"given":"A published story expires at time 100 and its viewer is in the current audience.","when":"The expiry guard authorizes a read at 99 and at 100, then at 99 after the viewer is revoked.","then":"Only the time-99 read by the allowed viewer succeeds.","requirements":["r1","r2"],"stages":[4,7],"test":"L012 bounded mechanism"},
      "cases": [
        ["publish","An upload has two renditions and only one digest is verified.","The client publishes the story, then retries the same command.","The story stays pending and invisible, and the retry returns the same pending story rather than a second one.",["r0"],[1,2,3]],
        ["expiry","A story expires at 100 but deletion is delayed.","Read at 100 through the tray, metadata, media and view paths.","Every path is rejected by the expiry guard; pending byte deletion is reported separately.",["r2"],[7,8]],
        ["acl","A friend loses access after a tray cursor is issued.","Dereference the old pointer.","Recheck current audience and deny the revoked viewer.",["r1"],[4,5]],
        ["views","Two devices record the same story view in reverse order.","Merge their viewed sets.","Viewed remains true and no retry clears it.",["r1"],[6]],
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
        {"label":"Publish gateway","question":"What is accepted before fan-out?","reason":"Accept a stable story identity and retain pending upload status.","state":"publication receipts","request":{"storyId":"uuid","actorId":"uuid"},"response":{"accepted":"boolean"},"kind":"service","inv":"Publication is keyed by storyId; the gateway acknowledges acceptance only, never visibility."},
        {"label":"Publish outbox","question":"How is fan-out tied to publication?","reason":"Expand the gateway; commit immutable story metadata and outbox intent together.","state":"story metadata and outbox","request":{"storyId":"uuid","digest":"sha256"},"response":{"version":"integer","outboxId":"uuid"},"kind":"store","inv":"Story metadata and its outbox intent commit in one transaction, so a committed story has exactly one fan-out intent."},
        {"label":"Transcode queue","question":"How do retries avoid duplicate media?","reason":"Write deterministic rendition keys and verify completion before releasing publication.","state":"rendition attempts","request":{"storyId":"uuid","codecVersion":"integer"},"response":{"manifest":"verified rendition keys[]"},"kind":"worker","inv":"Rendition keys derive from storyId and codecVersion; a retried transcode rewrites the same keys and publication waits for a verified manifest."},
        {"label":"Fan-out log","question":"Can a worker crash halfway?","reason":"Retain recipient pages and deduplicate inbox insertion by viewer/story.","state":"recipient page checkpoints","request":{"storyId":"uuid","audienceEpoch":"integer"},"response":{"pageCursor":"string|null"},"kind":"log","inv":"Fan-out advances a recipient page checkpoint only after that page's inbox upserts commit, and skips inserts whose story has already expired."},
        {"label":"Viewer inbox","question":"What is cached per reader?","reason":"Store ranked pointers with expiry and source version, not media ownership.","state":"unique viewer/story pointers","request":{"viewerId":"uuid","storyId":"uuid","expiresAt":"timestamp"},"response":{"inserted":"boolean"},"kind":"store","inv":"An inbox holds at most one row per (viewer, story), carrying expiresAt and source version; a row is a pointer, not a grant."},
        {"label":"Read authorization","question":"Can an old pointer bypass revocation?","reason":"Recheck current audience and expiry when dereferencing inbox pointers.","state":"current authorization epoch","request":{"viewerId":"uuid","storyId":"uuid"},"response":{"allowed":"boolean"},"kind":"service","inv":"Dereferencing a pointer rechecks current audience and expiresAt against the story authority; inbox presence alone never authorizes."},
        {"label":"View merge","question":"How do devices converge?","reason":"Merge viewed identities independently from feed order; duplicates do not reset progress.","state":"viewed identities","request":{"viewerId":"uuid","storyId":"uuid"},"response":{"viewed":"true"},"kind":"store","inv":"Viewed identities are a grow-only set per viewer, independent of inbox order."},
        {"label":"Expiry reconciliation","question":"Does TTL deletion define visibility?","reason":"Read-time expiry is authoritative; sweep derived inbox pointers and objects asynchronously.","state":"sweep checkpoints","request":{"now":"timestamp","cursor":"string"},"response":{"removed":"integer","pending":"integer"},"kind":"worker","inv":"A sweep removes an inbox row only if its source version still matches; read-time expiry stays authoritative while sweeps lag."},
      ],
      "edges": [
        [["rendition","control","n2",2,"process upload","request-response"],["publish","n2","state",1,"commit rendition manifest","storage"]],
        [["outbox","state","n3",3,"deliver committed publication","event-stream"]],
        [["fanout","n3","n4",4,"upsert viewer pointer","storage"]],
        [["read","caller","n5",5,"read story pointer","request-response"],["pointer","n5","n4",4,"read inbox candidate","storage"],["authority","n5","state",1,"check owner and expiry","storage"]],
        [["view","caller","n6",6,"merge viewed identity","request-response"]],
        [["sweep","n7","n4",7,"remove expired pointers","storage"],["purge","n7","n2",7,"purge expired objects","request-response"]],
      ],
      "read": {"path":"/inbox","request":{"viewerId":"authenticated user","after":"cursor|null","limit":"1..100"},"response":{"stories":"authorized unexpired story ids[]","next":"cursor|null"},"owner":"n5"},
      "code": `// Read authorization (n5) dereferences an inbox pointer; allowed is the current audience decision from story authority.
const visible=(story,allowed,now)=>allowed&&now<story.expiresAt;`,
      "recovery": "for (const row of inbox.scanExpiryAtMost(now)) {\n inbox.removeIfVersion(row.viewerId, row.storyId, row.sourceVersion);\n markPurgePending(row.storyId);\n}\n// Late fan-out checks original expiresAt before reinserting; a pointer is never an authorization grant.",
      "mechanism": {"given":"A viewer's inbox pointer refers to a story that expires at time 100.","when":"Read authorization dereferences it at 99 and at 100, then at 99 after the viewer leaves the audience.","then":"Only the time-99 dereference by the allowed viewer returns the story.","requirements":["r1","r2"],"stages":[6],"test":"L012 bounded mechanism"},
      "cases": [
        ["publish","A transcode retry runs after a crash that left one rendition written.","Commit publication.","Publication waits for a verified manifest at deterministic keys, and the outbox holds one fan-out intent for the story.",["r0"],[1,2,3]],
        ["expiry","Fan-out is delayed past the original expiry.","Retry inbox insertion and read an old cached pointer.","Drop the expired insert and deny the read even before sweep completion.",["r2"],[4,5,6,8]],
        ["acl","A recipient is removed after fan-out.","Read the materialized pointer.","Current authorization denies access; inbox presence cannot override it.",["r1"],[5,6]],
        ["views","Two devices submit duplicate view identities.","Merge view events.","Persist one viewed identity without modifying feed ordering.",["r1"],[7]],
      ],
      "algorithmOwner": "n5",
    },
  ],
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
        {"label":"Presence ingress","question":"What identifies a heartbeat?","reason":"Start with authenticated user, device, session generation and sequence.","state":"session generation","request":{"userId":"uuid","deviceId":"uuid","epoch":"integer","seq":"integer"},"response":{"accepted":"boolean"},"kind":"service","inv":"A heartbeat is identified by (userId, deviceId, epoch, seq); each device session is tracked separately, never merged into one user lease."},
        {"label":"Session authority","question":"Can old traffic resurrect a session?","reason":"Expand ingress and retain the greatest generation/sequence per device.","state":"session lease records","request":{"epoch":"integer","seq":"integer","deadline":"timestamp"},"response":{"version":"integer"},"kind":"store","inv":"The authority stores the greatest (epoch, seq) per device and changes it only by compare-and-swap on that pair."},
        {"label":"Heartbeat lease","question":"What if a client vanishes?","reason":"Refresh a bounded deadline only for a current, unexpired session: a same-epoch beat at or after the deadline is rejected, and an expiry timer closes lapsed leases.","state":"expiry deadlines","request":{"deviceId":"uuid","epoch":"integer","seq":"integer","now":"timestamp"},"response":{"deadline":"timestamp|rejected"},"kind":"module","inv":"A same-epoch beat at or after its deadline is rejected, so only a new epoch reopens a lapsed lease; the timer expires a lease only if its (epoch, seq) is unchanged."},
        {"label":"User reduction","question":"Does one closed tab imply offline?","reason":"Aggregate all unexpired devices and explicit availability settings on every heartbeat and every timer expiry.","state":"aggregate version","request":{"userId":"uuid","now":"timestamp"},"response":{"online":"boolean","version":"integer"},"kind":"module","inv":"A user is online exactly while at least one device lease has now < deadline, and both heartbeats and expiry timers trigger the reduction."},
        {"label":"Transition outbox","question":"How are status changes published?","reason":"Commit aggregate changes and ordered transition intent under one user owner.","state":"transition outbox","request":{"userId":"uuid","version":"integer"},"response":{"eventId":"uuid"},"kind":"log","inv":"Each aggregate change, including a timer-driven offline, commits one transition event with the new aggregate version; an unchanged aggregate emits nothing."},
        {"label":"Subscription filter","question":"Who may observe presence?","reason":"Authorize channel/contact subscriptions and cap their cardinality.","state":"subscription ACL epoch","request":{"observerId":"uuid","targetIds":"uuid[]"},"response":{"allowedIds":"uuid[]"},"kind":"service","inv":"A subscription delivers only targets the observer is currently allowed to see, capped at a fixed cardinality."},
        {"label":"Snapshot cursor","question":"Can login miss a transition?","reason":"Capture a revisioned snapshot then replay transitions strictly after its cursor.","state":"snapshot revision","request":{"targetIds":"uuid[]","after":"cursor|null"},"response":{"states":"presence[]","cursor":"string"},"kind":"module","inv":"A snapshot carries the revision it was read at, and replay delivers only transitions with a greater revision."},
        {"label":"Gap recovery","question":"What if retained deltas expired?","reason":"Signal resnapshot rather than inventing continuity; expire leases after owner failover.","state":"retention floor","request":{"after":"cursor"},"response":{"status":"delta|resnapshot"},"kind":"worker","inv":"A cursor below the retained floor receives an explicit resnapshot status; after owner failover, leases expire by deadline rather than resuming."},
      ],
      "components": [["timer","Lease expiry timer","worker","Fire at each lease deadline, expire the lease only if its (epoch, seq) is unchanged, and drive the user reduction so an offline transition reaches the outbox.","deadline queue"]],
      "contracts": [["expire",{"deviceId":"uuid","expectedEpoch":"integer","expectedSeq":"integer","now":"timestamp"},{"expired":"boolean","version":"integer"}]],
      "nodes": {"3":[["timer","timer"]]},
      "edges": [
        [["beat","control","n2",2,"refresh session lease","request-response"],["lease-state","n2","state",1,"compare session generation","storage"],["lapse","timer","state","expire","expire lapsed lease if unchanged","storage"]],
        [["reduce","n2","n3",3,"reduce active devices","request-response"],["lapse-reduce","timer","n3",3,"reduce after lease expiry","request-response"]],
        [["transition","n3","n4",4,"append changed status","event-stream"]],
        [["subscribe","caller","n5",5,"authorize presence subscription","request-response"]],
        [["snapshot","n5","n6",6,"load snapshot and cursor","request-response"],["aggregate","n6","n3",3,"read current presence","request-response"],["delta","n4","n6",4,"replay after revision","event-stream"]],
        [["resume","n6","n7",7,"check delta retention floor","request-response"],["expire","n7","n2",2,"expire stale owner leases","request-response"]],
      ],
      "read": {"path":"/presence","request":{"observerId":"authenticated user","targetIds":"uuid[]"},"response":{"states":"presence[]","cursor":"revision"},"owner":"n6"},
      "code": `// Heartbeat lease (n2): reject old epochs, duplicate sequences and same-epoch beats that arrive after the deadline.
function heartbeat(current,beat,now,ttl){
 if(beat.epoch<current.epoch)return current;
 if(beat.epoch===current.epoch&&(beat.seq<=current.seq||now>=current.deadline))return current;
 return {epoch:beat.epoch,seq:beat.seq,deadline:now+ttl};
}`,
      "algorithms": [["expiry-sweep","timer",`// Lease expiry timer: drop lapsed device leases, re-reduce the user and emit one transition only when the aggregate changes.
function expireLeases(user,now){
 const devices=Object.fromEntries(Object.entries(user.devices).filter(([,lease])=>now<lease.deadline));
 const online=Object.keys(devices).length>0;
 if(online===user.online)return {user:{...user,devices},events:[]};
 const version=user.version+1;
 return {user:{...user,devices,online,version},events:[{userId:user.userId,online,version}]};
}`,["A user goes offline through the outbox when the last live lease lapses, even if no further heartbeat arrives.","Repeated sweeps of an unchanged aggregate emit no duplicate transition."]]],
      "recovery": "if (cursor < retainedFloor) return {status:\"resnapshot\"};\nconst snapshot = readAtRevision(revision);\nreturn {snapshot, deltas: eventsAfter(revision)};\n// Timer expiry compares the last heartbeat sequence before closing a session.",
      "mechanism": {"given":"Device lease epoch 3 sequence 8 expires at time 100.","when":"Deliver epoch 2 seq 99, duplicate seq 8, seq 9 at time 90, seq 9 at times 100 and 150, and epoch 4 at time 150.","then":"Old and duplicate beats change nothing; seq 9 at 90 extends the deadline to 110; same-epoch beats at or after 100 cannot revive the lease; only epoch 4 opens a new lease, ending at 170.","requirements":["r0"],"stages":[2,3],"test":"L015 leases heartbeat fence"},
      "cases": [
        ["expiry","Two device leases end at 80 and 110 and no further heartbeats arrive.","The expiry timer sweeps at 90, 110 and 120.","The user stays online at 90, one offline transition with the next aggregate version is emitted at 110, and the sweep at 120 emits nothing.",["r1"],[3,4,5],"L015 leases expiry sweep"],
        ["gap","A login cursor predates retained transition history.","Resume subscription.","Return resnapshot explicitly and synchronize snapshot plus greater revisions.",["r2"],[7,8]],
        ["acl","An observer loses channel membership.","Deliver a queued transition.","Recheck the subscription authorization epoch and stop delivery.",["r2"],[6]],
        ["sessions","A phone session is at epoch 3 and a laptop session at epoch 1 for the same user.","The phone reconnects at epoch 4 while a delayed epoch-3 phone beat arrives.","The delayed beat is rejected for the phone only; the laptop lease is unaffected.",["r0"],[1,2]],
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
        {"label":"Session append","question":"What is a session event?","reason":"Record authenticated open, heartbeat and close events with stable identity.","state":"event identity","request":{"sessionId":"uuid","epoch":"integer","seq":"integer","kind":"open|beat|close"},"response":{"offset":"integer"},"kind":"service","inv":"Each session event has a stable eventId and (sessionId, epoch, seq); appending the same eventId twice yields one offset."},
        {"label":"Presence journal","question":"What survives projection loss?","reason":"Expand ingress into an append handler and retained session journal.","state":"session events","request":{"eventId":"uuid","sessionId":"uuid"},"response":{"offset":"integer"},"kind":"log","inv":"The journal is the only source of session truth; every projection, including expiry closes, can be rebuilt from retained events."},
        {"label":"Session fold","question":"How are duplicates ordered?","reason":"Fold each session by generation then sequence; close tombstones fence old beats.","state":"per-session folded state","request":{"epoch":"integer","seq":"integer","closed":"boolean"},"response":{"accepted":"boolean"},"kind":"module","inv":"The fold accepts a beat only if its (epoch, seq) exceeds the folded pair, and a close tombstone rejects later beats of the same epoch."},
        {"label":"Expiry events","question":"Who synthesizes disconnect?","reason":"Schedule expiry against the last accepted heartbeat; when it fires, append a close event carrying expectedSeq to the journal instead of editing the fold.","state":"timer versions","request":{"sessionId":"uuid","epoch":"integer","expectedSeq":"integer","deadline":"timestamp"},"response":{"scheduled":"boolean"},"kind":"worker","inv":"An expiry timer never edits a projection; it appends a close event with expectedSeq, and the fold applies it only if that seq is still the last accepted beat."},
        {"label":"User projection","question":"How is multi-device state derived?","reason":"Reduce active sessions into a monotonic user projection with source offsets.","state":"user view and watermark","request":{"userId":"uuid","offset":"integer"},"response":{"online":"boolean","watermark":"integer"},"kind":"store","inv":"The user projection is online while any folded session is open, and records the journal offset it reflects as its watermark."},
        {"label":"ACL projection","question":"Can removed contacts retain access?","reason":"Resolve current observer permission independently from stale presence projection.","state":"ACL epochs","request":{"observerId":"uuid","targetId":"uuid"},"response":{"allowed":"boolean"},"kind":"service","inv":"Observer permission comes from the current ACL projection, never from the cached presence projection."},
        {"label":"Snapshot barrier","question":"How does initial login synchronize?","reason":"Return materialized state at a source watermark then stream greater versions.","state":"snapshot watermark","request":{"targets":"uuid[]"},"response":{"states":"presence[]","watermark":"integer"},"kind":"module","inv":"A snapshot returns every state at one watermark, and the stream that follows starts strictly after it."},
        {"label":"Rebuild worker","question":"What if the view is lost?","reason":"Replay retained journal into a new view and swap at a verified barrier.","state":"rebuild cursor","request":{"fromOffset":"integer"},"response":{"readyAt":"integer|null"},"kind":"worker","inv":"A rebuilt view replaces the live one only after its watermark reaches the publication barrier; folding the same journal always yields the same state."},
      ],
      "contracts": [["close",{"eventId":"derived from sessionId, epoch and expectedSeq","sessionId":"uuid","epoch":"integer","expectedSeq":"integer","kind":"close"},{"offset":"integer"}]],
      "edges": [
        [["fold","state","n2",2,"fold session events","event-stream"]],
        [["schedule","n2","n3",3,"schedule expiry for accepted beat","request-response"],["timer-close","n3","state","close","append conditional close event","storage"]],
        [["project","n2","n4",4,"project user state","storage"]],
        [["authorize","caller","n5",5,"authorize observer","request-response"]],
        [["sync","n5","n6",6,"start snapshot sync","request-response"],["view","n6","n4",4,"read watermark snapshot","storage"]],
        [["replay","state","n7",7,"replay retained journal","event-stream"],["swap","n7","n4",4,"publish rebuilt view","storage"]],
      ],
      "read": {"path":"/presence","request":{"observerId":"authenticated user","targets":"uuid[]"},"response":{"states":"presence[]","watermark":"integer"},"owner":"n6"},
      "code": `// Session fold (n2): the same rule runs live and during rebuild, so both reach the same state.
function foldSession(session,event){
 if(event.kind==='close')return !session.closed&&event.epoch===session.epoch&&event.expectedSeq===session.seq?{...session,closed:true}:session;
 if(event.epoch<session.epoch||(event.epoch===session.epoch&&(session.closed||event.seq<=session.seq)))return session;
 return {epoch:event.epoch,seq:event.seq,closed:false};
}`,
      "algorithms": [["expiry-timer","n3",`// Expiry events (n3): append a conditional close to the journal; never fold directly.
function expireByTimer(journal,session,timer){
 if(session.closed||session.epoch!==timer.epoch||session.seq!==timer.expectedSeq)return false;
 journal.push({kind:'close',epoch:timer.epoch,expectedSeq:timer.expectedSeq});
 return true;
}`,["Every expiry close is a journal event, so a rebuild from the journal reproduces the live projection.","A close whose expectedSeq is no longer the last accepted beat is ignored by the fold."]]],
      "recovery": "const shadow = emptyProjection();\nfor (const event of journal.from(checkpoint)) foldIfNewerSessionVersion(shadow, event);\nif (shadow.watermark >= publicationBarrier) atomicallySwapProjection(shadow);\n// A journal retention gap blocks rebuild until a new authoritative snapshot exists.",
      "mechanism": {"given":"A session has accepted beats 1 and 2 at epoch 3.","when":"A stale timer for seq 1 fires, the timer for seq 2 fires, a delayed beat 3 arrives, and the view is rebuilt from the journal.","then":"The stale timer appends nothing, the close is a journal event, the late beat is fenced, and the rebuilt view equals the live view.","requirements":["r0","r1"],"stages":[3,4,8],"test":"L015 events journaled expiry"},
      "cases": [
        ["expiry","A heartbeat is journaled after its expiry timer decided to close the session.","Fold the journal containing the beat followed by the close for the older sequence.","The close is ignored because its expectedSeq is stale, so the session stays open; a close that does apply fences later beats of that epoch.",["r0","r1"],[4],"L015 events journaled expiry"],
        ["gap","A new client snapshots view watermark 20 while event 21 arrives.","Stream events after watermark 20.","Event 21 is delivered once by identity; retention gaps require resnapshot.",["r2"],[7]],
        ["acl","A projected online state is cached after observer revocation.","Subscribe using the cached target.","Current ACL filtering denies the subscription independently of presence lag.",["r2"],[6]],
        ["multi","A user has two open sessions and one of them closes.","Fold both sessions into the user projection.","The user stays online, and the projection watermark is the close event's offset.",["r0","r1"],[1,2,5]],
      ],
      "algorithmOwner": "n2",
    },
  ],
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
      "assumptions": ["Tokens are indexed within one generation attempt; partial output can be visible before final validation."],
      "steps": [
        {"label":"Prompt API","question":"When is a reply accepted?","reason":"Authenticate conversation membership and assign a stable generation ID.","state":"command receipts","request":{"conversationId":"uuid","commandId":"uuid","prompt":"string"},"response":{"generationId":"uuid","state":"queued"},"kind":"service","inv":"commandId deduplicates prompt submission, so a retry returns the same generationId."},
        {"label":"Conversation ledger","question":"What survives a gateway restart?","reason":"Expand API; persist prompt, model selection and current attempt before dispatch.","state":"prompt and generation records","request":{"generationId":"uuid","expectedVersion":"integer"},"response":{"version":"integer"},"kind":"store","inv":"The prompt, model selection and current attempt are committed before any dispatch, and dispatch reads them from the ledger."},
        {"label":"Model admission","question":"Can slow models exhaust capacity?","reason":"Route by model identity and reserve bounded queue/GPU slots with deadlines.","state":"capacity reservations","request":{"modelId":"string","deadline":"timestamp"},"response":{"leaseId":"uuid|rejected"},"kind":"queue","inv":"Admission holds at most the configured number of reservations per model, and each reservation expires at its deadline."},
        {"label":"Inference worker","question":"Who owns token numbering?","reason":"One fenced generation attempt emits chunks numbered from 0 within that attempt.","state":"attempt fence and token index","request":{"generationId":"uuid","attempt":"integer"},"response":{"attempt":"integer","index":"integer","text":"string"},"kind":"worker","inv":"Each inference attempt runs under its own attempt number and numbers its chunks from 0 within that attempt."},
        {"label":"Token journal","question":"Can a reconnect recover output?","reason":"Persist chunks keyed by attempt before acknowledging resumable delivery; a new attempt starts its own list.","state":"generation/attempt/token sequence","request":{"generationId":"uuid","attempt":"integer","index":"integer","text":"string"},"response":{"durableThrough":"integer"},"kind":"log","inv":"Tokens are keyed by (generationId, attempt, index); an append is accepted only from the current attempt at exactly the next index of that attempt's own list."},
        {"label":"Stream gateway","question":"What if the browser is slow?","reason":"Deliver only after durable cursor; bound queue bytes and close with resume instruction.","state":"connection delivery cursor","request":{"after":"integer","maxBytes":"integer"},"response":{"chunks":"token[]","next":"integer"},"kind":"service","inv":"The gateway sends only durable chunks and holds at most maxBytes per connection; overflow closes the connection with a resume cursor."},
        {"label":"Cancel fence","question":"Does cancellation race a late token?","reason":"Record cancellation at the journal so late writes from any attempt are rejected; cancellation cannot erase already observed text.","state":"cancellation flag and attempt","request":{"generationId":"uuid","expectedAttempt":"integer"},"response":{"cancelled":"boolean"},"kind":"module","inv":"Cancellation is recorded at the journal by compare-and-swap on expectedAttempt; afterwards no append from any attempt is accepted, and delivered text stays."},
        {"label":"Resume reconciler","question":"What if history has expired?","reason":"Return an explicit gap and final snapshot or regenerate under a new identity.","state":"retention floor","request":{"generationId":"uuid","after":"integer"},"response":{"status":"resume|gap|complete"},"kind":"worker","inv":"A resume below the retention floor returns an explicit gap with the final snapshot; it never splices chunks from different attempts."},
      ],
      "edges": [
        [["reserve","control","n2",2,"reserve model capacity","request-response"]],
        [["infer","n2","n3",3,"start fenced inference","request-response"]],
        [["append","n3","n4",4,"append indexed token","event-stream"]],
        [["tail","n4","n5",5,"tail durable tokens","event-stream"],["connect","caller","n5",5,"resume after cursor","request-response"]],
        [["cancel","caller","n6",6,"cancel generation","request-response"],["fence","n6","n3",6,"stop the running attempt","request-response"],["fence-journal","n6","n4",6,"reject late token writes","request-response"]],
        [["recover","n7","n4",7,"check retained token floor","storage"],["status","n7","state",1,"read final generation state","storage"]],
      ],
      "read": {"path":"/generations/{generationId}","request":{"generationId":"uuid","after":"token index"},"response":{"chunks":"token[]","next":"integer","status":"resume|gap|complete"},"owner":"n5"},
      "code": `// Token journal (n4): tokens are keyed by attempt; a retry or cancel can never extend an earlier attempt's prefix.
function appendToken(state,chunk){
 if(state.cancelled||chunk.attempt!==state.attempt)return false;
 const tokens=state.tokens[chunk.attempt]??=[];
 if(chunk.index!==tokens.length)return false;
 tokens.push(chunk.text);
 return true;
}`,
      "recovery": "if (after < journal.retentionFloor(generationId)) return {status:\"gap\", final:loadFinalSnapshot(generationId)};\nreturn journal.tokensAfter(generationId, acceptedAttempt, after);\n// Client deduplicates token indexes; a new generation receives a new identity.",
      "mechanism": {"given":"Attempt 4 has journaled chunks 0 and 1.","when":"Replay chunk 1; advance to attempt 5 without cancelling and append index 2 from attempt 4, index 2 from attempt 5 and index 0 from attempt 5; separately, cancel at attempt 4 and append index 2.","then":"The duplicate, the old-attempt chunk and the attempt-5 chunk that would extend attempt 4's prefix are rejected; attempt 5 starts its own list at index 0; after cancel nothing is appended.","requirements":["r1","r2"],"stages":[4,5,7],"test":"L017 bounded mechanism"},
      "cases": [
        ["cancel","Inference is running when cancellation is recorded at the journal.","Append a late chunk from the running attempt.","Reject the chunk; text already observed remains part of the audit trail.",["r2"],[7]],
        ["gap","A reconnect cursor is older than retained chunks.","Resume the stream.","Return gap plus a permitted final snapshot, never silently concatenate a different attempt.",["r1"],[8]],
        ["pressure","One connection stops consuming tokens.","Its bounded delivery buffer fills.","Close that connection with a resume cursor without growing unbounded server memory.",["r2"],[6]],
        ["admission","More generations arrive than reserved model slots allow.","Request reservations past the configured bound.","Excess requests are rejected with retry guidance before any worker starts.",["r2"],[3]],
        ["identity","A client retries a prompt after a gateway restart.","Submit with the same commandId.","The ledger returns the same generationId and committed prompt; no second dispatch starts.",["r0"],[1,2]],
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
        {"label":"Generation workflow","question":"What constitutes one reply?","reason":"Start a durable command keyed by conversation and command identity.","state":"workflow identity","request":{"conversationId":"uuid","commandId":"uuid"},"response":{"generationId":"uuid"},"kind":"service","inv":"A generation workflow is keyed by (conversationId, commandId); starting it twice returns the same generationId."},
        {"label":"Workflow history","question":"Which decisions replay?","reason":"Expand workflow with journaled model activity decisions and cancellation versions.","state":"workflow history","request":{"generationId":"uuid","event":"string"},"response":{"sequence":"integer"},"kind":"log","inv":"Workflow history is append-only; replaying it reproduces the same activity decisions and cancellation version."},
        {"label":"Activity queue","question":"How is inference bounded?","reason":"Dispatch retryable inference activities with stable attempt identities.","state":"activity leases","request":{"generationId":"uuid","attempt":"integer"},"response":{"lease":"uuid|rejected"},"kind":"queue","inv":"Each dispatched activity carries a new attempt number, and the queue leases at most the configured number of activities."},
        {"label":"Chunk producer","question":"Can restarted activities corrupt output?","reason":"Persist tokens through a fenced append API; a new attempt cannot append to the prior prefix.","state":"token prefix identity","request":{"generationId":"uuid","attempt":"integer","index":"integer"},"response":{"accepted":"boolean"},"kind":"worker","inv":"A producer appends only under its own attempt number, numbering from 0; it never continues another attempt's indexes."},
        {"label":"Output pages","question":"What do readers fetch?","reason":"Materialize immutable chunk pages keyed by generation and attempt, plus completion status.","state":"immutable chunk pages","request":{"generationId":"uuid","attempt":"integer","after":"integer"},"response":{"page":"token[]","next":"integer"},"kind":"store","inv":"A chunk is committed only from the current attempt at exactly the next index of that attempt's own list, and committed pages are immutable."},
        {"label":"Cursor reader","question":"How do clients avoid duplicate text?","reason":"Poll after the last accepted index and discard duplicate indexes locally.","state":"reader cursor","request":{"generationId":"uuid","after":"integer"},"response":{"tokens":"token[]","state":"running|done|cancelled"},"kind":"module","inv":"A reader polls after its last accepted index and drops indexes it has already applied."},
        {"label":"Cancellation signal","question":"How is pending work stopped?","reason":"Persist cancellation before cancelling queued activities, and fence late page commits from every attempt.","state":"cancellation epoch","request":{"generationId":"uuid","expectedAttempt":"integer"},"response":{"state":"cancelled"},"kind":"module","inv":"Cancellation is persisted before queued activities are cancelled; after it, no page commit from any attempt is accepted."},
        {"label":"History compactor","question":"Can pages disappear silently?","reason":"Compact finalized workflow state while preserving retention floor and explicit gap responses.","state":"retention floor and final digest","request":{"generationId":"uuid","after":"integer"},"response":{"status":"page|gap"},"kind":"worker","inv":"The retention floor and final digest are committed before pages below the floor are deleted; a poll below the floor returns gap."},
      ],
      "edges": [
        [["schedule","control","n2",2,"schedule inference activity","request-response"]],
        [["run","n2","n3",3,"run fenced activity","request-response"]],
        [["materialize","n3","n4",4,"write immutable output page","storage"]],
        [["poll","caller","n5",5,"poll after token cursor","request-response"],["pages","n5","n4",4,"read immutable page","storage"]],
        [["signal","caller","n6",6,"signal cancellation","request-response"],["fence","n6","n3",6,"stop superseded activity","request-response"],["fence-pages","n6","n4",6,"reject late page commits","request-response"]],
        [["compact","n7","state",1,"compact finalized history","storage"],["retain","n7","n4",7,"record output retention floor","storage"]],
      ],
      "read": {"path":"/generations/{generationId}/tokens","request":{"generationId":"uuid","after":"token index"},"response":{"tokens":"token[]","state":"running|done|cancelled|gap","next":"integer"},"owner":"n5"},
      "code": `// Output pages (n4): page commits are keyed by attempt; a restarted activity starts a new list at index 0.
function appendToken(state,chunk){
 if(state.cancelled||chunk.attempt!==state.attempt)return false;
 const tokens=state.tokens[chunk.attempt]??=[];
 if(chunk.index!==tokens.length)return false;
 tokens.push(chunk.text);
 return true;
}`,
      "recovery": "if (!workflow.isFinal(generationId)) return;\nconst snapshot = finalizeDigestAndStatus(generationId);\ncommitSnapshotBeforeTrimmingHistory(snapshot);\nrecordRetentionFloorBeforeDeletingPages(generationId);\n// Polling below the floor returns gap, not an empty successful page.",
      "mechanism": {"given":"Attempt 4 has committed chunks 0 and 1.","when":"Replay chunk 1; start attempt 5 without cancelling and commit index 2 from attempt 4, index 2 from attempt 5 and index 0 from attempt 5; separately, cancel during attempt 4 and commit index 2.","then":"The duplicate, the superseded-attempt chunk and the attempt-5 chunk that would extend attempt 4's prefix are rejected; attempt 5 starts its own list; after cancel nothing is committed.","requirements":["r1","r2"],"stages":[4,5,7],"test":"L017 bounded mechanism"},
      "cases": [
        ["cancel","Cancel is persisted while a remote activity is finishing.","Attempt a page commit after the cancellation.","Fence the commit and retain the canceled terminal state.",["r2"],[7]],
        ["gap","The requested page cursor predates the compaction floor.","Poll after the stale index.","Return gap and final status explicitly; duplicate indexes do not append twice.",["r1"],[6,8]],
        ["pressure","More inference activities arrive than capacity allows.","Claim slots beyond the configured bound.","Queue within a fixed bound or reject with retry guidance before remote inference.",["r2"],[3]],
        ["identity","The client retries starting a reply after a timeout.","Start the workflow with the same commandId.","The same generationId and history are returned; no second activity is scheduled.",["r0"],[1,2]],
      ],
      "algorithmOwner": "n4",
    },
  ],
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
        {"label":"Post command","question":"When can a reader see a post?","reason":"Authenticate owner and persist a stable publication identity.","state":"post command receipts","request":{"postId":"uuid","authorId":"uuid","commandId":"uuid"},"response":{"version":"integer"},"kind":"service","inv":"A post command is keyed by commandId; a retry returns the same postId and version."},
        {"label":"Post outbox","question":"Can committed posts miss fan-out?","reason":"Expand posting authority; commit post version and fan-out intent atomically.","state":"posts and outbox","request":{"postId":"uuid","version":"integer"},"response":{"eventId":"uuid"},"kind":"store","inv":"The post version and its fan-out outbox event commit in one transaction; timelines derive from the outbox and never write posts."},
        {"label":"Graph snapshot","question":"Which followers receive the post?","reason":"Pin a relationship snapshot for enumeration while checking current access on reads.","state":"graph snapshot revision","request":{"authorId":"uuid","revision":"integer"},"response":{"followers":"uuid[]","next":"cursor|null"},"kind":"directory","inv":"Follower enumeration for one event reads a single pinned graph revision, so paging the follower list neither skips nor repeats a follower."},
        {"label":"Candidate fan-out","question":"How do crashed workers resume?","reason":"Deduplicate viewer/post insertion and commit page checkpoints after writes.","state":"recipient page checkpoints","request":{"eventId":"uuid","page":"integer"},"response":{"committedPage":"integer"},"kind":"worker","inv":"Fan-out commits a recipient page checkpoint only after that page's candidate upserts; a redelivered event reruns idempotent upserts."},
        {"label":"Timeline candidates","question":"What is stored per reader?","reason":"Store bounded pointers and source watermark; high-degree sources remain pull candidates.","state":"candidate identities and watermark","request":{"viewerId":"uuid","postId":"uuid"},"response":{"inserted":"boolean"},"kind":"store","inv":"A timeline holds at most one candidate per (viewer, postId) and records the source watermark it reflects; candidates are not access grants."},
        {"label":"Feature snapshot","question":"Can scores change while paging?","reason":"Pin feature and ranker versions for one feed session.","state":"feature snapshot and ranker version","request":{"viewerId":"uuid","snapshotId":"uuid"},"response":{"features":"versioned values"},"kind":"cache","inv":"A feed session pins one feature snapshot and ranker version, so scores never change within the session."},
        {"label":"Stable ranker","question":"What breaks score ties?","reason":"Recheck current follow and visibility, then order by score, publication sequence and post ID; encode snapshot in cursor.","state":"feed session cursor","request":{"snapshotId":"uuid","after":"rank tuple|null"},"response":{"posts":"uuid[]","next":"cursor|null"},"kind":"module","inv":"Candidates are filtered by the visibility authority at read time, then ordered by score desc, seq desc, postId asc; the cursor carries the snapshot and full tie tuple."},
        {"label":"Freshness repair","question":"What if candidate fan-out is delayed?","reason":"Compare watermark against publication progress and merge bounded recent pull results.","state":"repair watermark","request":{"viewerId":"uuid","watermark":"integer"},"response":{"freshThrough":"integer","degraded":"boolean"},"kind":"worker","inv":"When the candidate watermark lags publication progress, the response reports freshThrough and degraded instead of claiming completeness."},
      ],
      "components": [["visibility","Visibility authority","directory","Answer current follow, block, privacy and deletion state for a viewer and candidate posts at read time.","current relationship and post visibility epochs"]],
      "contracts": [["visible",{"viewerId":"uuid","postIds":"uuid[]"},{"visible":"uuid[]","epoch":"integer"}]],
      "nodes": {"7":[["visibility","visibility"]]},
      "edges": [
        [["enumerate","control","n2",2,"pin follower graph revision","request-response"]],
        [["publication","state","n3",3,"consume publication outbox","event-stream"],["followers","n3","n2",2,"page pinned followers","request-response"]],
        [["candidate","n3","n4",4,"upsert viewer candidate","storage"]],
        [["features","control","n5",5,"pin ranking features","request-response"]],
        [["feed","caller","n6",6,"read ranked feed","request-response"],["candidates","n6","n4",4,"load candidate pointers","storage"],["rank-features","n6","n5",5,"read pinned features","request-response"],["current-visibility","n6","visibility","visible","recheck current follow and visibility","request-response"]],
        [["lag","n7","n4",4,"compare candidate watermark","storage"],["source","n7","state",1,"pull recent source posts","storage"],["repair","n7","n6",7,"merge freshness fallback","request-response"]],
      ],
      "read": {"path":"/feed","request":{"viewerId":"authenticated user","cursor":"snapshot id and rank tuple|null","limit":"1..100"},"response":{"posts":"uuid[]","next":"cursor|null","freshThrough":"integer","degraded":"boolean"},"owner":"n6"},
      "code": `// Stable ranker (n6): visibleNow is the set the visibility authority returns for this viewer and page, never a stored candidate flag.
const ranked=(rows,visibleNow)=>rows.filter(r=>visibleNow.has(r.id)&&!r.deleted).sort((a,b)=>b.score-a.score||b.seq-a.seq||a.id.localeCompare(b.id));`,
      "recovery": "const current = currentVisibilityAndGraphEpoch(viewer);\nconst candidates = dedupe([...materializedPointers(viewer), ...recentPostsAfter(watermark)]);\nreturn stableRank(candidates.filter(p=>authorizedNow(current,p)), pinnedRanker, pinnedFeatures);\n// Cursor carries snapshot ID and complete score/sequence/ID tie tuple.",
      "mechanism": {"given":"Candidates include two equal-score posts, a higher-score candidate whose stored row still says allowed but which the visibility authority no longer returns, and a deleted post.","when":"Rank twice with the same feature snapshot and current visibility set, reversing the input order.","then":"Both results are the same two posts in the same tie order; the stale-allowed and deleted candidates are omitted. This proves only the bounded ranking rule.","requirements":["r1","r2"],"stages":[7],"test":"L020 bounded mechanism"},
      "cases": [
        ["pages","Equal-score posts straddle a page boundary and new posts arrive.","Continue with the same snapshot and full tie tuple.","Return each eligible snapshot post once; new publications enter a new session.",["r1"],[6,7]],
        ["acl","An unfollow or deletion happens after candidate materialization.","Read the cached candidate.","The ranker's current visibility check removes it before ranking and output.",["r2"],[7]],
        ["lag","Fan-out stops after only part of the recipient pages.","Resume workers and request a feed with a lagging watermark.","Deduplicate replayed inserts and disclose freshness while bounded pull fallback repairs recent omissions.",["r2"],[4,8]],
        ["authority","A post commits while the fan-out worker is down.","Rebuild a viewer timeline from the outbox.","Posts and the graph remain authoritative; the timeline is regenerated from outbox events and the pinned graph revision without editing either.",["r0"],[1,2,3,5]],
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
        {"label":"Feed query","question":"What defines the feed session?","reason":"Authenticate viewer and freeze a publication upper bound.","state":"session identity","request":{"viewerId":"uuid","limit":"1..100"},"response":{"sessionId":"uuid"},"kind":"service","inv":"A feed session freezes its publication upper bound at creation; later posts belong to a new session."},
        {"label":"Session authority","question":"Can the next page change history?","reason":"Expand query boundary and persist horizon, graph revision and ranker version.","state":"session snapshot","request":{"sessionId":"uuid"},"response":{"horizon":"integer","rankerVersion":"integer"},"kind":"store","inv":"Session horizon, graph revision and ranker version are stored once and read, never recomputed, for every page."},
        {"label":"Follow traversal","question":"How is the source set bounded?","reason":"Enumerate followed authors from a stable graph snapshot with pagination.","state":"author cursors","request":{"viewerId":"uuid","graphRevision":"integer"},"response":{"authors":"uuid[]"},"kind":"directory","inv":"Followed authors are enumerated from the session's graph revision with a resumable author cursor."},
        {"label":"Post iterators","question":"How are candidates fetched fairly?","reason":"Open bounded per-source publication cursors up to the fixed horizon.","state":"source cursors","request":{"authors":"uuid[]","upper":"integer"},"response":{"candidates":"post pointers[]"},"kind":"module","inv":"Each source iterator returns only posts at or below the session horizon."},
        {"label":"Candidate heap","question":"Can one source monopolize the feed?","reason":"Merge source heads with a candidate budget and explicit diversity cap.","state":"merge heap and source budget","request":{"candidates":"post pointers[]","budget":"integer"},"response":{"selected":"post pointers[]"},"kind":"module","inv":"The merge takes at most the candidate budget overall and at most the diversity cap per author."},
        {"label":"Rank features","question":"What evidence determines order?","reason":"Read features at a pinned version, separating missing features from zero values.","state":"feature version","request":{"postIds":"uuid[]","version":"integer"},"response":{"features":"feature rows[]"},"kind":"cache","inv":"Features are read at the pinned version, and a missing feature is reported as missing rather than treated as zero."},
        {"label":"Ranking cursor","question":"How is stable paging achieved?","reason":"Rank deterministically and keep the snapshot plus tie tuple in continuation state.","state":"rank tuple cursor","request":{"sessionId":"uuid","after":"rank tuple|null"},"response":{"posts":"uuid[]","next":"cursor|null"},"kind":"module","inv":"Ranking is deterministic over score desc, seq desc, postId asc, and the cursor stores the snapshot and full tie tuple."},
        {"label":"Access and lag","question":"Can deleted posts remain cached?","reason":"Recheck deletion/revocation and report source lag without filling pages with stale grants.","state":"access epoch and lag receipts","request":{"viewerId":"uuid","postIds":"uuid[]"},"response":{"visible":"uuid[]","freshThrough":"integer"},"kind":"service","inv":"Every page is filtered against current deletion and ACL state; filtered posts shorten the page and are never replaced by stale grants."},
      ],
      "edges": [
        [["sources","control","n2",2,"enumerate pinned follow graph","request-response"]],
        [["iterate","n2","n3",3,"open bounded author iterators","request-response"]],
        [["merge","n3","n4",4,"merge candidate heads","request-response"]],
        [["feature","n4","n5",5,"load versioned features","request-response"]],
        [["rank","n5","n6",6,"rank and page snapshot","request-response"],["read","caller","n6",6,"continue rank cursor","request-response"]],
        [["visibility","n6","n7",7,"filter current visibility","request-response"],["versions","n7","state",1,"read session horizon","storage"]],
      ],
      "read": {"path":"/feed/{sessionId}","request":{"sessionId":"uuid","after":"rank tuple|null"},"response":{"posts":"uuid[]","next":"cursor|null","freshThrough":"integer","sourceBudget":"budget receipt"},"owner":"n6"},
      "code": `// Ranking cursor (n6): visibleNow is the current set returned by access and lag (n7) for this page.
const ranked=(rows,visibleNow)=>rows.filter(r=>visibleNow.has(r.id)&&!r.deleted).sort((a,b)=>b.score-a.score||b.seq-a.seq||a.id.localeCompare(b.id));`,
      "recovery": "const currentACL = loadCurrentACL(viewer);\nconst page = rankSnapshot.resume(cursor.snapshotId, cursor.tieTuple);\nreturn {posts:page.filter(p=>!p.deleted && currentACL.allows(p)), freshThrough:minimumSourceWatermark()};\n// Permission filtering can shorten a page; it never reuses a stale grant to fill it.",
      "mechanism": {"given":"Merged candidates include two equal-score posts, a higher-score post that access and lag no longer returns as visible, and a deleted post.","when":"Rank twice with the same feature snapshot and current visibility set, reversing the input order.","then":"Both results are the same two posts in the same tie order; the invisible and deleted posts are omitted. This proves only the bounded ranking rule.","requirements":["r1","r2"],"stages":[7,8],"test":"L020 bounded mechanism"},
      "cases": [
        ["pages","A source adds a new high-score post after the first page.","Resume the same horizon and ranker snapshot.","The new post waits for a new session and prior posts retain deterministic tie order.",["r1"],[1,2,6,7]],
        ["acl","A candidate becomes private while a source iterator is cached.","Emit the next page.","Current ACL filtering removes the candidate before response.",["r2"],[8]],
        ["lag","One source iterator is unavailable or budget-exhausted.","Finish the bounded merge.","Expose incomplete freshness and the source budget receipt rather than claiming a complete instant feed.",["r2"],[4,5,8]],
        ["authority","The viewer follows a new author in the middle of a session.","Request the next page.","Traversal keeps the session's graph revision, so the new author appears only in a new session; merge state never edits follow or post authority.",["r0"],[2,3]],
      ],
      "algorithmOwner": "n6",
    },
  ],
});}
module.exports={buildL012,buildL015,buildL017,buildL020};
