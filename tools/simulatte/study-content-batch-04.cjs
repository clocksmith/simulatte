 'use strict';
const {problem,contract,component,builder}=require('./study-solution-author.cjs');
function author(spec){
 const p=problem(spec.id,spec.label,spec.scope,spec.requirements.map((text,i)=>({id:'r'+i,text})),spec.refs.map(([title,url,supports],i)=>({id:'ref'+i,title,url,supports,scope:'background'})));
 for(const a of spec.approaches){
  const prefix=spec.id.toLowerCase()+'.'+a.id, cid=prefix+'.command';
  contract(p,cid,spec.request,spec.response);
  const define=(id,label,kind,responsibility,state)=>component(p,prefix+'.'+id,label,kind,responsibility,[state]);
  define('caller','Caller','client','Submit the declared operation with stable identity and observe explicit completion.','caller request and retry identity');
  define('system',a.title,'module','Preserve this stable boundary while refining its ownership and contracts.','logical operation state');
  define('engine',a.engine[0],'module',a.engine[1],a.engine[2]);
  define('state',a.store[0],'store',a.store[1],a.store[2]);
  const b=builder(p,a.id,a.title,a.choose,a.tradeoffs,['All added stages are authored practice extending the canonical prompt.','Graphs specify conceptual mechanisms; reference models do not prove cloud execution, latency, physical durability or distributed safety.']);
  const checkIds=a.checks.map((_,i)=>'case'+i);
  b.stage('Define the operation boundary','What does successful completion promise?',spec.requirements[0],s=>{s.add('caller',prefix+'.caller');s.add('system',prefix+'.system');s.link('request','caller','system',cid);},[spec.requirements[0]],checkIds);
  b.stage('Expose authority and state','Which component owns the decision and its persistent or shared state?',a.engine[1]+' '+a.store[1],s=>s.expand('system',prefix+'.binding',[['engine',prefix+'.engine'],['state',prefix+'.state']],[['owned-state','engine','state',cid,'storage']],[['in',cid,'engine']]),[a.engine[2]+' belongs to '+a.engine[0]+'; '+a.store[2]+' belongs to '+a.store[0]+'.'],checkIds);
  a.rows.forEach((r,i)=>{
   const id='n'+(i+3),contractId=prefix+'.step'+(i+3);
   contract(p,contractId,r.fields,{outcome:'accepted|rejected|pending',reason:'explicit domain reason',version:'nonnegative integer'});
   define(id,r.label,r.kind,r.reason,Object.keys(r.fields).join(', '));
   b.stage(r.label,r.question,r.reason,s=>{s.add(id,prefix+'.'+id);s.link('step'+(i+3),r.source==='new'?id:r.source,r.target==='new'?id:r.target,contractId,r.kind==='store'?'storage':(r.kind==='worker'?'event-stream':'local-call'));},[r.invariant],checkIds);
  });
  b.api('CALL',spec.id+'/'+a.id,JSON.stringify(spec.request),JSON.stringify(spec.response),'Reject invalid input, stale versions and operations outside the declared boundary.','engine');
  b.algorithm('transition','engine',a.code,[...a.rows.map(r=>r.invariant)]);
  a.checks.forEach(([id,given,when,then],i)=>b.check('case'+i,given,when,then,spec.requirements.map((_,j)=>'r'+j)));
 }
 // Freeze each stage's exposure set. Later projections receive a new immutable binding and explicit rebind.
 const original=new Map(p.subsystems.map(s=>[s.id,structuredClone(s)]));p.subsystems=[];
 for(const solution of p.solutions){let prior=null;
  for(const stage of solution.stages){const parent=stage.graph.nodes.find(n=>n.id==='system');if(!parent.subsystemId)continue;
   const full=original.get(parent.subsystemId),used=new Set(stage.graph.edges.flatMap(e=>[e.from,e.to]).filter(e=>e.nodeId==='system').map(e=>e.portId));
   const ports=full.ports.filter(q=>used.has(q.id)),key=JSON.stringify(ports);
   if(!prior||prior.key!==key){const sub={...structuredClone(full),id:full.id+'-s'+stage.number,ports:structuredClone(ports)};p.subsystems.push(sub);
    const expansion=stage.operations.find(o=>o.op==='expand');if(expansion)expansion.subsystemId=sub.id;
    else stage.operations.unshift({op:'rebind',nodeId:'system',subsystemId:sub.id,reason:'Expose this new typed path without mutating earlier binding definitions.'});
    prior={id:sub.id,key};
   }parent.subsystemId=prior.id;
  }
 }
 for(const sol of p.solutions){const a=spec.approaches.find(a=>a.id===sol.id),labels={'request':'Submit operation','owned-state':'Read or commit state',...Object.fromEntries(a.rows.map((r,i)=>['step'+(i+3),r.edgeLabel||r.label]))};for(const stage of sol.stages){for(const e of stage.graph.edges)e.label=labels[e.id];for(const op of stage.operations){if(op.edge)op.edge.label=labels[op.edge.id];if(op.edges)for(const e of op.edges)e.label=labels[e.id];}}}
 const proof=spec.proof;
 if(proof)for(const sol of p.solutions)sol.acceptanceCases.push({id:'bounded-mechanism',given:proof[1],when:proof[2],then:proof[3],relatedRequirementIds:['r0'],evidence:{kind:'reference-test',testFile:'tools/simulatte/study-reference/batch-'+spec.batch+'-state.test.mjs',testName:proof[0]}});
 return p;
}

function buildL023(){return author({
  "id": "L023",
  "label": "Workspaces, projects and permissions",
  "scope": "Authored extension of the canonical workspace-access exercise: enforce tenant/project access during mutations and distinguish committed changes from activity publication. No production authentication is executed.",
  "requirements": ["Deny cross-workspace reads and writes; role inheritance and explicit deny have defined precedence.","Revocation races serialize with protected writes; cached decisions cannot silently extend access.","Commit mutations and activity intent atomically; publication is independently retryable."],
  "refs": [["PostgreSQL isolation","https://www.postgresql.org/docs/18/transaction-iso.html","Transactions isolate concurrent authorization and mutation decisions; retries remain explicit."],["HTTP caching","https://www.rfc-editor.org/rfc/rfc9111","Cache freshness, invalidation and private-response restrictions."]],
  "request": {"principalId":"authenticated ID","workspaceId":"uuid","projectId":"uuid","action":"read|edit|revoke","expectedVersion":"integer","commandId":"uuid"},
  "response": {"decision":"allow|deny","policyVersion":"integer","objectVersion":"integer|null"},
  "approaches": [
    {
      "id": "transactional",
      "title": "Transactional permission checks",
      "choose": "One relational authority can serialize policy and object mutations.",
      "tradeoffs": ["Policy checks add database contention.","A cache is only a hint; authoritative writes still check the policy version."],
      "engine": ["Permission transaction","Lock policy and target rows, evaluate inherited grants and explicit deny, then mutate.","policy snapshot and object version"],
      "store": ["Workspace tables","Own workspace membership, project ancestry, role grants and object rows.","tenant-scoped keys"],
      "rows": [{"label":"Policy cache","question":"Can hot reads reuse decisions?","reason":"Add a tenant/principal/resource/version keyed cache; never cache a private response under a public key.","source":"engine","target":"n3","fields":{"policyVersion":"integer","expiresAt":"timestamp"},"invariant":"Cache validity is bounded and write authorization is never delegated to a stale entry.","kind":"cache"},{"label":"Mutation outbox","question":"How is activity tied to the write?","reason":"Persist an immutable event with the authorized mutation in the same transaction.","source":"engine","target":"n4","fields":{"eventId":"uuid","objectVersion":"integer"},"invariant":"No event is emitted for a rolled-back object change.","kind":"store"},{"label":"Activity dispatcher","question":"What if publication fails after commit?","reason":"Claim durable event IDs and retry downstream independently of client success.","source":"n4","target":"n5","fields":{"eventId":"uuid","attempt":"integer"},"invariant":"Queued and published are distinct observable states.","kind":"worker"},{"label":"Consumer inbox","question":"Can activity be delivered twice?","reason":"Deduplicate event IDs before applying the activity projection.","source":"n5","target":"n6","fields":{"eventId":"uuid","applied":"boolean"},"invariant":"An event ID can affect the projection once.","kind":"store"},{"label":"Revocation barrier","question":"Can an old authorization finish after removal?","reason":"Advance policy epoch and serialize protected commits against it; reject stale decisions.","source":"engine","target":"n7","fields":{"expectedEpoch":"integer","currentEpoch":"integer"},"invariant":"Revocation cutoff is the authoritative transaction order.","kind":"module"},{"label":"Audit ledger","question":"How are denied and published actions explained?","reason":"Record decision reason, policy version and event delivery status with restricted audit access.","source":"n6","target":"n8","fields":{"principalId":"uuid","policyVersion":"integer","outcome":"allow|deny|published"},"invariant":"Audit data does not grant permission to read the protected object.","kind":"store"}],
      "code": "transaction(() => { lockWorkspacePolicy(workspaceId); const p = loadPolicy();\n assertTenant(principalId, workspaceId); requireAllowed(p, action, projectId);\n compareVersion(object, expectedVersion); applyMutation(); insertOutboxUnique(commandId); });",
      "checks": [["revocation","A user has edit at epoch 4.","Revoke at epoch 5 before a stale edit commits.","Reject the stale edit; no mutation or event commits."],["publication","A mutation commits and a dispatcher crashes.","Deliver the same outbox ID twice.","One activity record is applied; client success still means only committed mutation."]]
    },
    {
      "id": "capability",
      "title": "Short-lived scoped capabilities",
      "choose": "Read-heavy clients can carry signed scoped permission proofs with online write fencing.",
      "tradeoffs": ["Revocation requires an epoch lookup or expiry delay.","Capability signing, audience binding and rotation add security operations."],
      "engine": ["Capability verifier","Verify signature, expiry, audience, tenant and resource scope before accepting an operation.","verification keys and accepted epoch"],
      "store": ["Epoch authority","Own current workspace revocation epochs and role source of truth.","workspace epochs"],
      "rows": [{"label":"Token issuer","question":"Who may mint a scoped capability?","reason":"Issue only after an authoritative membership check and bind action, resource, audience and expiry.","source":"engine","target":"n3","fields":{"scope":"resource/action set","epoch":"integer","expiry":"timestamp"},"invariant":"A capability is not transferable across audiences or tenants.","kind":"service"},{"label":"Fenced mutation store","question":"Can a valid signature bypass a revocation?","reason":"Compare capability epoch with the authoritative epoch inside the object transaction.","source":"engine","target":"n4","fields":{"tokenEpoch":"integer","objectVersion":"integer"},"invariant":"A signed but revoked write proof is rejected.","kind":"store"},{"label":"Committed event log","question":"How are authorized changes published?","reason":"Append command identity and resulting version with the mutation.","source":"n4","target":"n5","fields":{"commandId":"uuid","version":"integer"},"invariant":"The log records completed decisions, not queued promises.","kind":"log"},{"label":"Projection consumer","question":"How do read models learn policy changes?","reason":"Apply monotonic policy epochs and object versions from replayable events.","source":"n5","target":"n6","fields":{"policyEpoch":"integer","offset":"integer"},"invariant":"An old event cannot reduce a projection epoch.","kind":"worker"},{"label":"Key rotation set","question":"What if a signing key is retired?","reason":"Publish bounded key overlap and reject unknown key IDs; compromise can force online epoch checks.","source":"n3","target":"n7","fields":{"keyId":"string","notAfter":"timestamp"},"invariant":"Key retirement and capability expiration are explicit.","kind":"directory"},{"label":"Revocation notification","question":"How are long-lived clients updated?","reason":"Notify clients to discard local proofs while server epoch fencing remains authoritative.","source":"n6","target":"n8","fields":{"workspaceId":"uuid","epoch":"integer"},"invariant":"A missed client notification cannot permit a stale write.","kind":"module"}],
      "code": "const proof = verifySignatureAndScope(token, audience, tenant, resource, action);\ntransaction(() => { const epoch = lockEpoch(tenant); if (proof.epoch !== epoch) deny();\n compareVersion(object, expectedVersion); applyMutation(); appendEventUnique(commandId); });",
      "checks": [["revocation","A capability carries epoch 4.","The authority advances to epoch 5 and the client misses notification.","The online write fence denies it even before expiry."],["publication","A projection consumer restarts at an old offset.","Replay epoch 5 followed by epoch 4.","Retain epoch 5 and deduplicate mutation events."]]
    }
  ],
  "proof": ["workspace epoch and tenant fencing rejects stale proof","A bounded permission proof has a tenant, epoch and action.","Compare against current tenant, epoch and expected version.","Return false for stale epoch or wrong tenant and true only for the matching example."],
  "batch": "04"
});}
function buildL024(){return author({
  "id": "L024",
  "label": "Scheduled bounded ingestion",
  "scope": "Extend the synthetic collection exercise with scheduled run identity, origin politeness, deduplication and provenance. Inputs are authored URLs and synthetic records; no live crawler or extraction is claimed.",
  "requirements": ["Resolve schedules into stable run IDs and bound pending work per origin.","Deduplicate source revisions while retaining fetch provenance and parser version.","Recover partial runs without advancing progress past committed outputs."],
  "refs": [["PostgreSQL isolation","https://www.postgresql.org/docs/18/transaction-iso.html","Transactions isolate concurrent authorization and mutation decisions; retries remain explicit."],["Robots protocol","https://www.rfc-editor.org/rfc/rfc9309","Robots policy governs crawler access; authorization and per-origin rate policy are separate."]],
  "request": {"scheduleId":"uuid","scheduledFor":"UTC timestamp","sourceId":"canonical origin/path","revision":"etag or content hash"},
  "response": {"runId":"schedule/instant identity","state":"queued|running|committed|quarantined"},
  "approaches": [
    {
      "id": "frontier",
      "title": "Durable URL frontier",
      "choose": "Sources expose stable URLs and incremental crawl latency is acceptable.",
      "tradeoffs": ["Frontier leases and per-origin queues add state.","Content changes need revision-aware deduplication rather than URL-only suppression."],
      "engine": ["Run coordinator","Create one run per schedule/instant and admit only configured origins.","run identity"],
      "store": ["Frontier","Own normalized URL/revision keys, lease owner, attempts and next eligible time.","URL leases"],
      "rows": [{"label":"Origin permit","question":"How is one busy site protected?","reason":"Grant a bounded concurrent permit after robots and minimum-delay checks.","source":"engine","target":"n3","fields":{"origin":"scheme/host/port","eligibleAt":"timestamp"},"invariant":"Retries consume the same per-origin budget.","kind":"module"},{"label":"Fetch executor","question":"What if a fetch times out?","reason":"Use finite response-size/time limits and conditional validators; retain status and receipt.","source":"n3","target":"n4","fields":{"etag":"string|null","bytes":"bounded byte[]","status":"integer"},"invariant":"A timeout is retryable intent, not evidence of an empty source.","kind":"worker"},{"label":"Versioned parser","question":"Can a new parser reinterpret old content?","reason":"Parse retained bytes with a pinned parser version and emit schema errors to quarantine.","source":"n4","target":"n5","fields":{"contentHash":"sha256","parserVersion":"integer"},"invariant":"Invalid records never enter the accepted output table.","kind":"worker"},{"label":"Output transaction","question":"When may the frontier advance?","reason":"Commit unique source/revision/parser outputs and completion marker atomically.","source":"n5","target":"n6","fields":{"sourceRevision":"string","recordIds":"uuid[]"},"invariant":"The completion marker never outruns output commit.","kind":"store"},{"label":"Lease recovery","question":"What if a worker dies mid-fetch?","reason":"Fence expired lease holders and retry with the same run/revision identity.","source":"engine","target":"n7","fields":{"leaseEpoch":"integer","retryAt":"timestamp"},"invariant":"A stale worker cannot complete a reassigned lease.","kind":"worker"},{"label":"Provenance index","question":"How is one record explained?","reason":"Retain source URL, receipt hash, parser version, scheduled instant and terminal state.","source":"n6","target":"n8","fields":{"sourceUrl":"https URL","receiptHash":"sha256"},"invariant":"A record is attributable to immutable inputs.","kind":"store"}],
      "code": "const run = insertRunIfAbsent(scheduleId, scheduledFor);\nconst claim = claimEligibleOriginLease(run); const bytes = boundedFetch(claim);\nconst records = parse(bytes, parserVersion); transaction(() => {\n assertLeaseEpoch(claim); insertOutputsUnique(sourceId, revision, parserVersion, records); markDone(claim); });",
      "checks": [["retry","A worker commits output but loses its acknowledgement.","Retry the same source revision under a new lease.","Retain one accepted output and the original provenance."],["partial","A parser rejects one fetched record.","Finish the bounded run.","Keep the invalid receipt quarantined and never report it committed."]]
    },
    {
      "id": "manifest",
      "title": "Snapshot manifests and partition jobs",
      "choose": "A source can publish or synthesize complete immutable manifests.",
      "tradeoffs": ["Snapshot creation delays freshness.","Large manifests need partition progress and explicit source completeness assertions."],
      "engine": ["Snapshot planner","Freeze an input manifest for one scheduled instant.","manifest identity"],
      "store": ["Manifest store","Own immutable source revision lists and partition bounds.","manifest hash and partitions"],
      "rows": [{"label":"Partition planner","question":"How are large snapshots bounded?","reason":"Split the manifest by deterministic ranges with stable partition IDs.","source":"engine","target":"n3","fields":{"manifestHash":"sha256","range":"half-open index range"},"invariant":"Ranges are disjoint and cover exactly the frozen manifest.","kind":"module"},{"label":"Partition workers","question":"Can workers consume without duplicate output?","reason":"Lease partitions and read their immutable input revision list.","source":"n3","target":"n4","fields":{"partitionId":"uuid","attempt":"integer"},"invariant":"A reassignment retains the same partition identity.","kind":"worker"},{"label":"Parse and quarantine","question":"How are malformed inputs isolated?","reason":"Apply a pinned schema/parser and retain rejected inputs separately.","source":"n4","target":"n5","fields":{"parserVersion":"integer","errors":"string[]"},"invariant":"Quarantine counts remain visible in run completeness.","kind":"worker"},{"label":"Staging output","question":"Can a half run become visible?","reason":"Write partition outputs to a run-scoped namespace before publication.","source":"n5","target":"n6","fields":{"runId":"uuid","partitionId":"uuid","hash":"sha256"},"invariant":"Readers cannot confuse staging rows with the published snapshot.","kind":"store"},{"label":"Atomic publication","question":"When is a complete generation exposed?","reason":"Compare every expected partition receipt and atomically swap the active manifest pointer.","source":"n6","target":"n7","fields":{"expectedPartitions":"integer","generation":"integer"},"invariant":"Only a complete accepted generation is published.","kind":"module"},{"label":"Retention planner","question":"How do failures avoid unbounded staging?","reason":"Delete abandoned staging only after lease expiry and retention; preserve published provenance.","source":"n7","target":"n8","fields":{"runState":"terminal state","retainUntil":"timestamp"},"invariant":"Cleanup never deletes the active generation.","kind":"worker"}],
      "code": "const manifest = freezeSources(scheduledFor);\nfor (const range of partition(manifest)) enqueueUnique(manifest.hash, range);\nwriteStagingOutputsUnderLease();\ntransaction(() => { requireAllPartitionReceipts(manifest); compareAndSwapActiveGeneration(manifest.hash); });",
      "checks": [["retry","A partition output is complete but a worker restarts.","Reprocess that partition.","Stable run/partition keys deduplicate output."],["partial","One manifest partition is quarantined or missing.","Attempt publication.","Refuse pointer swap and retain the prior generation."]]
    }
  ],
  "proof": ["manifest publication waits for committed partition coverage","Two expected partitions have one committed and one quarantined receipt.","Attempt generation publication then commit the second receipt.","Retain the prior generation until both receipts are committed."],
  "batch": "04"
});}
function buildL028(){return author({
  "id": "L028",
  "label": "Synthetic identity and approval",
  "scope": "Deidentified authored records exercise schema validation, identity resolution, ordered approval and idempotent commit. This is an ingestion pattern with no patient data, clinical rules or clinical decisions.",
  "requirements": ["Validate schema and quarantine ambiguous identity without guessing.","Bind approval to an immutable entity/revision and serialize accepted revisions.","Deduplicate events and retain decision provenance through retries."],
  "refs": [["PostgreSQL isolation","https://www.postgresql.org/docs/18/transaction-iso.html","Transactions isolate concurrent authorization and mutation decisions; retries remain explicit."]],
  "request": {"eventId":"uuid","entityHint":"synthetic identifier","revision":"integer","payloadHash":"sha256"},
  "response": {"status":"quarantined|awaiting-approval|committed|duplicate","entityId":"uuid|null"},
  "approaches": [
    {
      "id": "staged",
      "title": "Staged relational approval",
      "choose": "Approval volume is modest and a single transactional authority is available.",
      "tradeoffs": ["Review queues can grow without explicit admission limits.","Identity policy revisions require deliberate backfills."],
      "engine": ["Ingest coordinator","Validate event envelopes before accepting workflow intent.","event receipt identity"],
      "store": ["Staging ledger","Own immutable raw event hashes and revision state.","event IDs and states"],
      "rows": [{"label":"Schema validator","question":"Can malformed records reach review?","reason":"Pin schema version and store rejected raw input hashes.","source":"engine","target":"n3","fields":{"schemaVersion":"integer","errorCodes":"string[]"},"invariant":"Validation failure cannot become accepted data.","kind":"module"},{"label":"Identity resolver","question":"What if two entities match?","reason":"Require a unique stable match or quarantine; retain candidate reasons.","source":"n3","target":"n4","fields":{"candidates":"uuid[]","identityPolicy":"integer"},"invariant":"Ambiguity never silently merges identities.","kind":"module"},{"label":"Approval queue","question":"What exactly does a reviewer approve?","reason":"Freeze entity ID, revision, payload hash and policy version in review intent.","source":"n4","target":"n5","fields":{"approvalId":"uuid","payloadHash":"sha256"},"invariant":"Any payload change requires a new approval.","kind":"queue"},{"label":"Commit transaction","question":"Can an old approval overwrite newer data?","reason":"Compare expected entity revision and current approval binding atomically.","source":"n5","target":"n6","fields":{"expectedRevision":"integer","approvedHash":"sha256"},"invariant":"Out-of-order revisions remain pending or rejected.","kind":"store"},{"label":"Idempotency inbox","question":"How are repeated source deliveries handled?","reason":"Uniquely admit event ID and detect the same ID with conflicting bytes.","source":"engine","target":"n7","fields":{"eventId":"uuid","payloadHash":"sha256"},"invariant":"Conflicting reuse of an event ID is an error.","kind":"store"},{"label":"Decision provenance","question":"Can reviewers explain accepted data?","reason":"Append actor, decision, policy version and source receipt for each terminal transition.","source":"n6","target":"n8","fields":{"decisionId":"uuid","sourceHash":"sha256"},"invariant":"Audit preserves denied and superseded decisions.","kind":"log"}],
      "code": "transaction(() => { const receipt = insertEventUnique(eventId, payloadHash);\n if (receipt.hash !== payloadHash) rejectConflict(); });\nconst identity = resolveUniqueOrQuarantine(payload);\ntransaction(() => { lockEntity(identity.id); requireApproval(entityId, revision, payloadHash);\n requireNextRevision(revision); commitRecord(); appendDecision(); });",
      "checks": [["binding","Approval names revision 2 hash A.","Submit revision 2 hash B or revision 1 after revision 2 commits.","Reject stale or mismatched approval without changing accepted state."],["duplicate","One synthetic event arrives twice.","Admit and approve both deliveries.","Apply once; conflicting bytes under the same ID are quarantined."]]
    },
    {
      "id": "entity-log",
      "title": "Entity-partitioned approval log",
      "choose": "High per-entity event volume benefits from ordered append and replay.",
      "tradeoffs": ["Partition reassignment requires fencing and checkpoints.","A log orders events but does not resolve ambiguous identity automatically."],
      "engine": ["Envelope router","Validate and route resolved identities into one entity partition.","routing generation"],
      "store": ["Entity event log","Own immutable ordered pending and approved event records.","partition offsets"],
      "rows": [{"label":"Quarantine branch","question":"Where do unresolved identities go?","reason":"Route invalid or ambiguous envelopes into a separately inspectable queue.","source":"engine","target":"n3","fields":{"reason":"schema|identity","candidates":"uuid[]"},"invariant":"Unresolved identity has no accepted entity partition.","kind":"queue"},{"label":"Identity decision log","question":"Can a later mapping reinterpret history?","reason":"Append versioned mapping decisions rather than editing old events.","source":"engine","target":"n4","fields":{"mappingVersion":"integer","sourceIdentity":"string"},"invariant":"Replay uses the original mapping version.","kind":"log"},{"label":"Approval commands","question":"Can approval arrive before its event?","reason":"Buffer bounded commands keyed by event ID; require the referenced hash before applying.","source":"n4","target":"n5","fields":{"eventId":"uuid","approvedHash":"sha256"},"invariant":"An unbound approval is never a commit.","kind":"module"},{"label":"Entity reducer","question":"How is per-entity order enforced?","reason":"Consume one partition epoch and apply allowed state transitions to the next revision.","source":"state","target":"n6","fields":{"offset":"integer","leaseEpoch":"integer"},"invariant":"Offsets advance only with persisted reducer state.","kind":"worker"},{"label":"Accepted projection","question":"Can replay duplicate an accepted record?","reason":"Upsert by entity/revision/event ID with checkpoint in one transaction.","source":"n6","target":"n7","fields":{"entityRevision":"integer","eventId":"uuid"},"invariant":"Replay is idempotent for accepted revisions.","kind":"store"},{"label":"Replay verifier","question":"How are repaired identity rules evaluated?","reason":"Build a new projection generation and compare before explicit publication.","source":"n7","target":"n8","fields":{"generation":"integer","differences":"record[]"},"invariant":"A new mapping cannot mutate historic decisions in place.","kind":"worker"}],
      "code": "validateEnvelope(); const resolved = identityAtVersion(mappingVersion);\nif (!resolved.unique) quarantine(); else appendEntityEvent(resolved.entityId, event);\nfor (const e of orderedPartition()) transaction(() => {\n assertLeaseEpoch(); requireBoundApproval(e.id, e.hash); applyNextRevision(e); saveCheckpoint(e.offset); });",
      "checks": [["binding","An approval arrives before its matching event.","Replay with a mismatched payload hash.","Keep it unbound; no accepted record appears."],["duplicate","A partition consumer replays a committed event.","Apply the event and checkpoint again.","Retain one entity/revision record."]]
    }
  ],
  "proof": ["approval binds identity revision hash and next transition","An entity is at revision 1 and an approval names revision 2 hash A.","Try hash B, then A, then duplicate and skipped revision.","Accept only the first hash-A next-revision transition in this deterministic model."],
  "batch": "04"
});}
function buildL029(){return author({
  "id": "L029",
  "label": "Paired-record reconciliation",
  "scope": "Authored scalar left/right records share an entity key and revision. Compare online keyed matching with immutable batch joins. This is not settlement, financial accounting or compliance.",
  "requirements": ["Match only the same key and revision with equal scalar value.","Suppress duplicate sides and surface conflicting duplicate payloads.","Keep missing or mismatched counterparts visible with explicit late-arrival policy."],
  "refs": [["PostgreSQL isolation","https://www.postgresql.org/docs/18/transaction-iso.html","Transactions isolate concurrent authorization and mutation decisions; retries remain explicit."]],
  "request": {"entityId":"uuid","revision":"integer","side":"left|right","value":"integer","eventId":"uuid"},
  "response": {"state":"waiting|matched|mismatch|conflict","pairId":"entity/revision identity"},
  "approaches": [
    {
      "id": "keyed",
      "title": "Online keyed state machine",
      "choose": "Low-latency pair status matters and entity keys partition naturally.",
      "tradeoffs": ["Retained unmatched state needs expiry and late policy.","Hot keys can serialize many revisions."],
      "engine": ["Pair matcher","Admit one immutable side value per key/revision.","current pair transition"],
      "store": ["Pair state","Own left/right receipts and terminal match identity.","key/revision records"],
      "rows": [{"label":"Side inbox","question":"Can repeated delivery replace a value?","reason":"Deduplicate event IDs and reject conflicting side values.","source":"engine","target":"n3","fields":{"side":"left|right","value":"integer"},"invariant":"The first admitted side is immutable.","kind":"store"},{"label":"Value comparator","question":"What counts as a match?","reason":"Use exact typed scalar equality after both sides arrive.","source":"engine","target":"n4","fields":{"left":"integer","right":"integer"},"invariant":"No tolerance or missing-value default is invented.","kind":"module"},{"label":"Result outbox","question":"Can a matching pair emit twice?","reason":"Commit terminal state and one pair-result intent atomically.","source":"n4","target":"n5","fields":{"pairId":"string","state":"matched|mismatch"},"invariant":"One key/revision produces one terminal result.","kind":"store"},{"label":"Result projection","question":"What if result delivery repeats?","reason":"Apply pair ID once and preserve mismatch explanation.","source":"n5","target":"n6","fields":{"pairId":"string","reason":"string"},"invariant":"A mismatch is a visible terminal outcome.","kind":"worker"},{"label":"Missing-side timer","question":"When is waiting considered overdue?","reason":"Record deadline without fabricating a counterpart; late arrivals follow reopen/new-revision policy.","source":"engine","target":"n7","fields":{"deadline":"timestamp","missingSide":"left|right"},"invariant":"Overdue is not matched.","kind":"module"},{"label":"Reconciliation scan","question":"How are lost notifications found?","reason":"Scan durable terminal pairs against outbox/projection and repair missing publication.","source":"n6","target":"n8","fields":{"cursor":"key/revision","repairId":"uuid"},"invariant":"Repair retains the original pair identity.","kind":"worker"}],
      "code": "transaction(() => { const pair = lockPair(entityId, revision);\n insertSideOrCheckEqual(pair, side, value, eventId);\n if (pair.hasBoth && !pair.terminal) { pair.state = pair.left === pair.right ? \"matched\" : \"mismatch\";\n insertResultUnique(pair.id, pair.state); } });",
      "checks": [["pairing","Left 7 arrives twice then right 7.","Process all receipts for one key/revision.","Create one matched pair and one result intent."],["missing","Only left 7 arrives before the deadline.","Expire the timer and later receive right 8.","Keep missing status, then apply explicit mismatch policy; never invent equality."]]
    },
    {
      "id": "batch-join",
      "title": "Immutable snapshot full outer join",
      "choose": "Latency can be a bounded batch window and complete source manifests exist.",
      "tradeoffs": ["Publication waits for input completeness.","Late records create a new generation and require lineage rather than editing old output."],
      "engine": ["Join planner","Freeze left and right manifest identities for a reconciliation run.","run identity"],
      "store": ["Input snapshots","Own immutable left/right rows with source receipt hashes.","manifest hashes"],
      "rows": [{"label":"Duplicate classifier","question":"Which repeated side rows are valid?","reason":"Group key/revision/side, collapse exact repeats and isolate conflicting values.","source":"engine","target":"n3","fields":{"keyRevision":"string","distinctValues":"integer[]"},"invariant":"Conflicting duplicates do not become arbitrary winners.","kind":"module"},{"label":"Partitioned join","question":"How is large input split safely?","reason":"Hash partition both sides by the same key/revision function and full-outer join.","source":"n3","target":"n4","fields":{"partition":"integer","seed":"fixed integer"},"invariant":"Each key/revision belongs to exactly one join partition.","kind":"worker"},{"label":"Outcome table","question":"Where are missing records retained?","reason":"Write matched, mismatch, missing-left and missing-right rows explicitly.","source":"n4","target":"n5","fields":{"status":"matched|mismatch|missing-left|missing-right"},"invariant":"An inner join cannot hide unmatched records.","kind":"store"},{"label":"Completeness ledger","question":"Can incomplete sources look reconciled?","reason":"Require every declared input and partition receipt before publication.","source":"n5","target":"n6","fields":{"expected":"integer","completed":"integer"},"invariant":"Run completeness and match rate are separate.","kind":"store"},{"label":"Generation publisher","question":"How do consumers see one consistent run?","reason":"Swap one active generation pointer after all outputs are committed.","source":"n6","target":"n7","fields":{"generation":"integer","manifestHash":"sha256"},"invariant":"Readers never mix outputs from two runs.","kind":"module"},{"label":"Late-arrival delta","question":"What if the counterpart arrives next day?","reason":"Create a linked new reconciliation generation and retain old missing evidence.","source":"n7","target":"n8","fields":{"supersedes":"generation ID","lateEventIds":"uuid[]"},"invariant":"Historical results remain attributable to their frozen inputs.","kind":"worker"}],
      "code": "const run = freeze(leftManifest, rightManifest);\nconst classified = classifyExactAndConflictingDuplicates(run);\nfor (const key of fullOuterKeys(classified)) emit(classifyPair(key));\nrequireAllPartitionReceipts(); publishGeneration(run.id);",
      "checks": [["pairing","Both frozen sides contain equal values plus duplicate receipts.","Full-outer join the normalized key/revision sets.","Emit one matched row."],["missing","A frozen snapshot contains only one side.","Publish then ingest a late counterpart.","Publish missing evidence first; create a linked new generation for the late input."]]
    }
  ],
  "proof": ["paired online and snapshot mechanisms preserve missing mismatch and duplicates","Bounded typed scalar left/right records are supplied.","Run keyed admission and a full outer snapshot join.","Retain missing and mismatched rows, collapse exact repeats and classify conflicting side values."],
  "batch": "04"
});}
module.exports={buildL023,buildL024,buildL028,buildL029};
