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
function buildL022(){return author({
  "batch": 3,
  "id": "L022",
  "title": "Partitioned URL counting",
  "scope": "Count a separate immutable URL dataset through three map partitions and three reduce partitions. Shuffle blocks have separate storage ownership; losing a CPU does not imply losing those stored blocks. Counts require deterministic parsing and exactly one selected successful attempt per logical partition. The hash-partitioner box denotes per-map logical partitioning/transport, not a centralized service: underlying map-to-reducer all-to-all block transfers and their network cost remain. Spill boxes likewise summarize per-partition bounded operations.",
  "requirements": ["Partition immutable input and count normalized URLs without dropping or duplicating records.","Shuffle keyed blocks across three reducers with bounded spill.","Recover lost compute or shuffle blocks through versioned lineage and committed attempts."],
  "refs": [["Spark RDD guide","https://spark.apache.org/docs/latest/rdd-programming-guide.html","Partitioned transforms, shuffle, spill and lineage recomputation."]],
  "approaches": [
    {
      "id": "driver",
      "title": "Driver scheduling with external shuffle blocks",
      "choose": "A central driver can coordinate a bounded batch and track partition attempts.",
      "trade": ["Driver state needs recovery; external shuffle adds storage I/O but survives executor replacement."],
      "assumptions": ["The worked scale is three map and three reduce partitions, not a throughput benchmark."],
      "steps": [
        {"label":"Count job","question":"What is the input snapshot?","reason":"Accept an immutable dataset identity and explicit URL normalization version.","state":"job and snapshot identity","request":{"jobId":"uuid","inputHash":"sha256","normalizerVersion":"integer"},"response":{"accepted":"boolean"},"kind":"service"},
        {"label":"Partition plan","question":"How are logical tasks identified?","reason":"Expand driver; persist three map ranges and three reducer partitions with lineage.","state":"logical partition lineage","request":{"inputHash":"sha256","mapPartitions":"3","reducePartitions":"3"},"response":{"partitionIds":"stable ids[]"},"kind":"store"},
        {"label":"Map CPUs","question":"How is each URL counted?","reason":"Run one fenced attempt per logical map range and combine duplicate keys locally.","state":"map attempt epoch and counts","request":{"partitionId":"string","attempt":"integer","records":"URL rows[]"},"response":{"partialCounts":"URL/count pairs[]"},"kind":"worker"},
        {"label":"Shuffle stores","question":"Who owns map output blocks?","reason":"Partition partial counts by deterministic URL hash into three independently retained shuffle stores.","state":"keyed blocks and checksums","request":{"mapId":"string","reduceId":"0..2","attempt":"integer"},"response":{"blockId":"string","checksum":"sha256"},"kind":"store"},
        {"label":"Spill buffers","question":"What if a partition exceeds RAM?","reason":"Spill sorted bounded runs and merge them without changing integer counts.","state":"memory budget and spill manifests","request":{"pairs":"URL/count pairs[]","memoryLimit":"positive bytes"},"response":{"sortedRuns":"immutable refs[]"},"kind":"module"},
        {"label":"Reduce CPUs","question":"How are competing attempts handled?","reason":"Read only selected map-attempt blocks and sum each URL under its reducer owner.","state":"reduce attempt epoch","request":{"reduceId":"0..2","selectedBlocks":"block refs[]"},"response":{"counts":"URL/count pairs[]"},"kind":"worker"},
        {"label":"Output manifest","question":"When is the result complete?","reason":"Atomically publish one chosen output for each of the three logical reducers.","state":"selected reducer outputs","request":{"jobId":"uuid","outputs":"three reducer refs"},"response":{"resultHash":"sha256"},"kind":"store"},
        {"label":"Lineage recovery","question":"Does CPU loss erase shuffle?","reason":"Retain external blocks across compute loss; recompute only missing block lineage after storage loss.","state":"missing-block recovery work","request":{"lostResource":"cpu|shuffle-store","blockIds":"string[]"},"response":{"recompute":"logical map ids[]"},"kind":"worker"},
      ],
      "edges": [
        [["schedule","control","n2",2,"schedule logical map ranges","request-response"]],
        [],
        [["spill","n3","n4",4,"spill bounded sorted runs","request-response"]],
        [["reduce","n3","n5",5,"read selected map blocks","request-response"],["merge-runs","n4","n5",4,"merge spill runs","request-response"]],
        [["result-commit","n5","n6",6,"commit reducer partition output","storage"]],
        [["lineage","n7","state",1,"read partition and artifact lineage","storage"],["retry","n7","control",2,"reschedule missing logical maps","request-response"]],
      ],
      "recovery": "if (loss.kind === \"cpu\") return rescheduleUnfinishedAttempts(loss.cpuId);\nconst missing = shuffleManifest.blocks.filter(b=>!storage.hasValidChecksum(b));\nfor (const mapId of distinct(missing.map(b=>b.mapId))) enqueueSameLogicalMapWithNewAttempt(mapId);\n// Existing valid external shuffle survives CPU loss; selected attempt manifests fence obsolete blocks.",
      "cases": [
        ["count","A logical map is retried after its output block was already stored.","Choose one successful attempt and reduce.","Count each input record once by selected logical partition, never sum both attempts."],
        ["loss","A map CPU dies while its external shuffle blocks remain intact.","Recover and then separately delete one shuffle store.","CPU replacement reuses valid blocks; storage loss recomputes only upstream maps for missing blocks."],
        ["spill","A skewed URL partition exceeds the memory budget.","Spill sorted partial-count runs and merge.","The integer URL totals equal a serial reference while in-memory buffering remains bounded."],
      ],
      "algorithmOwner": "n5",
    },
    {
      "id": "checkpoints",
      "title": "Checkpointed partition dataflow",
      "choose": "Repeated downstream analyses justify durable intermediate partitions.",
      "trade": ["Durable checkpoints write more data and need garbage collection/versioning; recovery avoids regenerating retained stages."],
      "assumptions": ["Checkpoints are immutable and keyed by input/code version; worker-local files are not durable checkpoints."],
      "steps": [
        {"label":"Dataflow submission","question":"What is deterministic in the job?","reason":"Pin input bytes, parsing and hash partition function before any task runs.","state":"dataflow definition hash","request":{"inputHash":"sha256","codeVersion":"string"},"response":{"jobId":"uuid"},"kind":"service"},
        {"label":"Checkpoint catalogue","question":"Which stage results may be reused?","reason":"Expand coordinator with immutable per-stage manifests and selected attempt IDs.","state":"checkpoint manifests","request":{"stageId":"string","inputHash":"sha256"},"response":{"committedPartitions":"partition refs[]"},"kind":"store"},
        {"label":"Map task queue","question":"How are ranges assigned?","reason":"Lease three deterministic input ranges, fencing old worker completions.","state":"range lease epochs","request":{"mapId":"0..2","epoch":"integer"},"response":{"range":"half-open record offsets"},"kind":"queue"},
        {"label":"Map checkpoint writer","question":"How are duplicate keys reduced?","reason":"Parse/normalize each row and commit a local combine output under its attempt key.","state":"map counts and attempt receipts","request":{"records":"URL rows[]","normalizerVersion":"integer"},"response":{"partialCounts":"URL/count pairs[]"},"kind":"worker"},
        {"label":"Shuffle partitioner","question":"How do reducers find all keys?","reason":"Route each URL to hash(URL) mod 3 and persist independent keyed blocks with spill manifests.","state":"shuffle block manifests","request":{"partials":"URL/count pairs[]"},"response":{"blocks":"three reducer block sets"},"kind":"store"},
        {"label":"Reduce dataflow","question":"What is a safe replay?","reason":"Aggregate only manifest-selected blocks; retries replace an attempt selection instead of appending counts again.","state":"reduce attempt selection","request":{"blocks":"selected checksum refs[]"},"response":{"counts":"URL/count pairs[]"},"kind":"worker"},
        {"label":"Result commit","question":"Can a partial result look complete?","reason":"Require all three reducer partitions before publishing an immutable output manifest.","state":"result commit identity","request":{"outputs":"three reducer refs"},"response":{"resultHash":"sha256"},"kind":"store"},
        {"label":"Checkpoint repair","question":"Which work is repeated after failure?","reason":"Validate checkpoint/block checksums; retain valid external storage across CPU loss and reconstruct only absent dependencies.","state":"checkpoint validation cursor","request":{"manifestId":"string","lostBlocks":"string[]"},"response":{"replayFrom":"nearest valid stage"},"kind":"worker"},
      ],
      "edges": [
        [["queue","control","n2",2,"lease deterministic map ranges","request-response"]],
        [["map","n2","n3",3,"run map and local combine","request-response"]],
        [],
        [["aggregate","n4","n5",5,"reduce selected checkpoint blocks","request-response"]],
        [["publish","n5","n6",6,"publish reducer result set","storage"]],
        [["catalogue","n7","state",1,"validate checkpoint manifests","storage"],["replay","n7","n2",2,"requeue absent checkpoint lineage","request-response"]],
      ],
      "recovery": "const checkpoint = nearestValidManifest(inputHash, codeVersion);\nfor (const partition of checkpoint.partitions) {\n if (!allReferencedBlocksValid(partition)) enqueueMissingDependencies(partition.lineage);\n}\n// Reusing an immutable map checkpoint is legal only for the same input, normalizer and partition function.",
      "cases": [
        ["count","A checkpoint contains a successful and a retried map output for one logical range.","Resolve the selected-attempt manifest before reduction.","Only the selected map output contributes to totals."],
        ["loss","Compute is lost but checkpoint objects and external blocks still exist.","Validate artifacts then replace a missing block.","Retain valid artifacts and replay only the nearest missing dependency, not all unrelated stages."],
        ["spill","The map checkpoint writer sees a high-cardinality input.","Use bounded sorted runs and merge.","Checksummed persisted blocks preserve serial URL counts and the declared three-way partition function."],
      ],
      "algorithmOwner": "n5",
    },
  ],
  "code": "const totals = new Map();\nfor (const block of selectedAttemptBlocks) for (const [url,count] of block)\n totals.set(url,(totals.get(url)||0)+count);\n// Select exactly one successful attempt per logical map; duplicate delivery is not another partition.",
  "given": "Three map partitions include repeated URLs and one logical map is retried.",
  "when": "Select one successful attempt per map and reduce its three hash partitions.",
  "then": "Counts equal the serial input count; selecting a retry does not double-count its original attempt.",
});}
function buildL030(){return author({
  "batch": 3,
  "id": "L030",
  "title": "Event-time windows and schema evolution",
  "scope": "Finite events carry explicit event timestamps and schema-version transitions. Compare incremental keyed event-time state with immutable microbatch recomputation. Watermarks express a lateness policy; bounded memory/spill and replay are explicit.",
  "requirements": ["Decode declared schema versions and preserve event identity and event time.","Compute half-open tumbling sums/counts and quarantine excessively late events.","Bound memory, spill deterministically and commit progress with state/output."],
  "refs": [["Spark streaming guide","https://spark.apache.org/docs/latest/streaming/apis-on-dataframes-and-datasets.html","Event-time watermarks, late data policy and stateful streaming."],["PostgreSQL isolation","https://www.postgresql.org/docs/18/transaction-iso.html","Versioned transactions and retrying serialization conflicts."]],
  "approaches": [
    {
      "id": "incremental",
      "title": "Incremental keyed state with watermark",
      "choose": "Low-latency updates matter and state fits partitioned ownership with bounded spill.",
      "trade": ["Watermark mistakes can drop useful late events; state backend/checkpoint recovery is operationally significant."],
      "assumptions": ["Worked windows use milliseconds and max-seen minus allowed lateness; idle-partition policy must be explicit."],
      "steps": [
        {"label":"Event intake","question":"What is event time?","reason":"Accept source event ID, partition, schema version and an event timestamp separate from arrival time.","state":"source event identity","request":{"eventId":"uuid","partition":"integer","schemaVersion":"1|2","eventTime":"integer ms"},"response":{"accepted":"boolean"},"kind":"service"},
        {"label":"Offset authority","question":"Which progress is committed?","reason":"Expand ingress with source offsets, schema compatibility and state checkpoint identities.","state":"offset and checkpoint versions","request":{"partition":"integer","offset":"integer"},"response":{"checkpointId":"uuid"},"kind":"store"},
        {"label":"Version decoder","question":"Can v2 change the meaning of v1?","reason":"Decode v1/v2 through explicit converters to one canonical value; reject unknown versions.","state":"schema conversion registry","request":{"schemaVersion":"1|2","payload":"versioned event"},"response":{"key":"string","value":"number","eventTime":"integer"},"kind":"module"},
        {"label":"Partition FIFO","question":"Can transfer reorder a source?","reason":"Keep per-partition FIFO with bounded buffers and backpressure on source admission.","state":"partition queue and byte budget","request":{"partition":"integer","offset":"integer"},"response":{"queued":"boolean"},"kind":"queue"},
        {"label":"Window state","question":"Which bucket owns a boundary event?","reason":"Update floor(eventTime/windowSize) half-open sum/count after deduplicating event IDs.","state":"key/window sum, count and dedupe","request":{"key":"string","eventTime":"integer","value":"number"},"response":{"windowStart":"integer","sum":"number","count":"integer"},"kind":"store"},
        {"label":"Watermark gate","question":"When is an event too late?","reason":"Advance a monotonic watermark under declared partition/idleness policy and route older events to quarantine.","state":"watermark and late-event reasons","request":{"eventTime":"integer","watermark":"integer"},"response":{"route":"window|quarantine"},"kind":"module"},
        {"label":"Spill checkpoint","question":"How does state exceed memory safely?","reason":"Spill bounded sorted runs and atomically checkpoint state references plus source offsets.","state":"spill manifests and checkpoints","request":{"memoryBytes":"integer","offsets":"partition offsets"},"response":{"checkpoint":"immutable ref"},"kind":"worker"},
        {"label":"Replay and finalize","question":"What if the worker crashes after output?","reason":"Restore a checkpoint, deduplicate replayed IDs and publish versioned window results; finality follows the declared watermark rule.","state":"output versions and replay cursor","request":{"checkpointId":"uuid","offsets":"partition offsets"},"response":{"restored":"boolean"},"kind":"worker"},
      ],
      "edges": [
        [["decode","control","n2",2,"decode declared event schema","request-response"]],
        [["enqueue","n2","n3",3,"enqueue partition FIFO","event-stream"]],
        [["initialize","control","n4",4,"initialize empty window state","storage"]],
        [["lateness","n3","n5",5,"check event-time watermark","request-response"],["admit","n5","n4",4,"apply eligible event","storage"]],
        [["spill","n4","n6",6,"write spill and checkpoint","request-response"],["offset","n6","state",1,"commit state and source offsets","storage"]],
        [["restore","n7","n6",6,"restore checkpoint and spill","request-response"],["resume","n7","state",1,"resume committed source offsets","storage"]],
      ],
      "recovery": "const cp = loadCommittedCheckpoint();\nrestoreWindowState(cp.stateRefs, cp.dedupeRefs, cp.watermark);\nfor (const event of source.after(cp.offsets)) applyIfNewEventId(event);\ncommitOutputVersionsWithCheckpoint();\n// Finalize a window only under the declared watermark rule; late quarantine is retained separately.",
      "cases": [
        ["boundary","An event lands exactly at a tumbling-window boundary.","Decode its version and compute floor(eventTime/width).","Assign the event to the new half-open window, independent of arrival order."],
        ["late","Watermark is 5 and events at 4 and 5 arrive.","Classify both under the declared event-time policy.","Quarantine time 4 and allow time 5; idle partitions must follow an explicit policy."],
        ["replay","A worker crashes after output is written but before source checkpoint commit.","Restore and replay the same event identities.","Deduplicate or reconcile versioned output so sum/count do not double; unknown schema versions remain quarantined."],
      ],
      "algorithmOwner": "n4",
    },
    {
      "id": "microbatch",
      "title": "Immutable microbatches and transactional window merges",
      "choose": "Batch latency is acceptable and immutable recomputation simplifies recovery.",
      "trade": ["Microbatch delay is visible; keeping raw events and recomputing touched windows costs storage/I/O."],
      "assumptions": ["A batch pins its upper offsets and watermark; new arrivals enter a later batch."],
      "steps": [
        {"label":"Batch cutoff","question":"Which arrivals belong to this batch?","reason":"Freeze upper source offsets and a unique batch identity without treating arrival time as event time.","state":"batch offset interval","request":{"batchId":"uuid","upperOffsets":"partition offsets"},"response":{"accepted":"boolean"},"kind":"service"},
        {"label":"Batch catalogue","question":"Can a retry create a new interval?","reason":"Expand batch coordinator with immutable offset ranges and commit receipts.","state":"batch identity and ranges","request":{"batchId":"uuid"},"response":{"lowerOffsets":"map","upperOffsets":"map"},"kind":"store"},
        {"label":"Raw event archive","question":"What survives a transform failure?","reason":"Retain event IDs, event times and original schema version in an immutable batch object.","state":"raw batch bytes and digest","request":{"events":"versioned event rows[]"},"response":{"objectHash":"sha256"},"kind":"store"},
        {"label":"Schema normalize","question":"How do mixed versions combine?","reason":"Convert each declared version to canonical key/value fields and quarantine unknown versions.","state":"conversion version and rejects","request":{"schemaVersion":"1|2","payload":"versioned event"},"response":{"canonical":"key/time/value"},"kind":"module"},
        {"label":"Sort and spill","question":"What is the bounded-memory plan?","reason":"Sort by key/window/event ID into bounded disk runs, deduplicating repeated source identities.","state":"sorted spill runs","request":{"canonical":"event rows[]","memoryLimit":"positive bytes"},"response":{"runs":"immutable refs[]"},"kind":"worker"},
        {"label":"Lateness partition","question":"How is late data classified consistently?","reason":"Use the frozen batch watermark; eligible events update windows, older events enter a retained quarantine dataset.","state":"batch watermark and quarantine","request":{"eventTime":"integer","batchWatermark":"integer"},"response":{"route":"eligible|quarantine"},"kind":"module"},
        {"label":"Atomic window merge","question":"Can replay double-count a batch?","reason":"Commit touched-window aggregates and batch receipt together, or recompute from selected immutable batches.","state":"window versions and batch receipts","request":{"batchId":"uuid","windowDeltas":"key/window/sum/count[]"},"response":{"applied":"boolean"},"kind":"store"},
        {"label":"Batch recovery","question":"Can output commit outrun offsets?","reason":"Reuse frozen ranges and batch identity, reconcile merge receipt, then advance source checkpoint.","state":"recovery cursor and output receipt","request":{"batchId":"uuid"},"response":{"state":"replay|already-committed"},"kind":"worker"},
      ],
      "edges": [
        [["archive","control","n2",2,"persist raw batch bytes","storage"]],
        [["normalize","n2","n3",3,"normalize versioned records","request-response"]],
        [["sort","n3","n4",4,"sort and spill canonical events","request-response"]],
        [["late","n4","n5",5,"partition by frozen watermark","request-response"]],
        [["merge","n5","n6",6,"merge eligible window deltas","storage"]],
        [["recover","n7","n6",6,"check atomic batch receipt","storage"],["offset","n7","state",1,"advance frozen batch offsets","storage"]],
      ],
      "recovery": "const batch = loadFrozenBatch(batchId);\nif (windowStore.hasBatchReceipt(batch.id)) return advanceOffsets(batch.upperOffsets);\nconst deltas = recomputeFromImmutableEvents(batch, batch.watermark);\ntransaction(()=> { mergeDeltas(deltas); insertBatchReceiptUnique(batch.id); });\nadvanceOffsets(batch.upperOffsets);",
      "cases": [
        ["boundary","A frozen batch contains v1 and v2 events at timestamps 9 and 10.","Normalize to canonical values and group into 10ms windows.","Produce separate [0,10) and [10,20) aggregates with explicit conversion versions."],
        ["late","New arrivals appear while a batch runs.","Finish the frozen upper offsets and watermark.","The new arrivals enter a later batch; old timestamps follow the recorded late/quarantine policy."],
        ["replay","A batch merge commits but the process crashes before advancing source offsets.","Replay the same batch identity.","Read the unique batch receipt and advance offsets without adding its deltas again."],
      ],
      "algorithmOwner": "n6",
    },
  ],
  "code": "if (seen.has(event.id)) return \"duplicate\";\nseen.add(event.id);\nif (event.time < watermark) return \"quarantine\";\nconst start = Math.floor(event.time / width) * width;\nwindows[start] ??= {sum:0,count:0}; windows[start].sum += event.value; windows[start].count++;",
  "given": "A 10ms tumbling window sees timestamps 9,10, a duplicate ID, and a timestamp below watermark 5.",
  "when": "Apply mixed-schema canonical values to the bounded window fold.",
  "then": "Time 9 maps to [0,10), time 10 to [10,20); the duplicate is ignored and timestamp 4 quarantined.",
});}
function buildL044(){return author({
  "batch": 3,
  "id": "L044",
  "title": "Transactional table metadata",
  "scope": "Provide snapshot isolation and schema evolution over immutable data objects and an ordered transaction log. Compare backend-supported conditional commit creation with an external commit coordinator. S3 currently supports conditional writes; neither design assumes atomic directory rename or append.",
  "requirements": ["Publish one ordered immutable commit per table version with complete data references.","Validate optimistic conflicts and protocol/schema compatibility before commit.","Read consistent snapshots and compact metadata without deleting files needed by live readers."],
  "refs": [["S3 conditional writes","https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html","Conditional creation and compare-and-swap object writes; backend-specific preconditions."],["Delta transaction protocol","https://github.com/delta-io/delta/blob/master/PROTOCOL.md","Versioned commit actions, checkpoints and reader/writer protocol compatibility."]],
  "approaches": [
    {
      "id": "conditional",
      "title": "Conditional version-file creation",
      "choose": "The chosen backend provides qualified atomic create-if-absent semantics.",
      "trade": ["Writers contend on commit versions and must rebase/revalidate; backend behavior and credentials must be qualified."],
      "assumptions": ["Data files are uploaded before log publication; a conditional create is the commit point."],
      "steps": [
        {"label":"Table transaction","question":"What does a writer read?","reason":"Start from a pinned table snapshot and record read predicates plus intended additions/removals.","state":"transaction read version","request":{"tableId":"uuid","readVersion":"integer"},"response":{"transactionId":"uuid"},"kind":"service"},
        {"label":"Snapshot catalogue","question":"Which state is authoritative?","reason":"Expand transaction boundary with ordered immutable log actions and protocol metadata.","state":"table log versions","request":{"tableId":"uuid","version":"integer"},"response":{"actions":"add/remove/metadata actions[]"},"kind":"store"},
        {"label":"Data staging","question":"Can a commit refer to missing files?","reason":"Upload immutable data objects and verify their hashes before attempting publication.","state":"staged object refs and hashes","request":{"transactionId":"uuid","files":"object refs[]"},"response":{"verified":"boolean"},"kind":"worker"},
        {"label":"Conflict validation","question":"Does a newer version always conflict?","reason":"Read intervening commits; compare read/write predicates and schema/protocol changes under declared isolation.","state":"validated read and write sets","request":{"readVersion":"integer","currentVersion":"integer"},"response":{"status":"compatible|conflict"},"kind":"module"},
        {"label":"Conditional commit","question":"How do writers claim the same next version?","reason":"Create the next immutable log key with If-None-Match star; a loser rereads and revalidates before retry.","state":"commit key and attempt identity","request":{"version":"integer","actionsHash":"sha256"},"response":{"created":"boolean","conflict":"boolean"},"kind":"module"},
        {"label":"Snapshot reader","question":"Can a reader mix versions?","reason":"Choose one committed version and replay checkpoint plus contiguous log suffix.","state":"reader snapshot version","request":{"version":"integer"},"response":{"activeFiles":"immutable object refs[]"},"kind":"module"},
        {"label":"Metadata checkpoint","question":"Can compaction replace history unsafely?","reason":"Publish a complete checkpoint after each illustrative ten commits; verify checksum and retain required log suffix.","state":"checkpoint version and checksum","request":{"version":"multiple of 10"},"response":{"checkpointHash":"sha256"},"kind":"worker"},
        {"label":"Retention and orphan cleanup","question":"When can files be removed?","reason":"Collect only unreferenced staged files after a grace period; respect active-reader retention and reconcile unknown commit outcomes by transaction ID.","state":"retention floor and orphan receipts","request":{"transactionId":"uuid","readerFloor":"integer"},"response":{"safeToDelete":"object refs[]"},"kind":"worker"},
      ],
      "edges": [
        [["stage","control","n2",2,"verify immutable data objects","request-response"]],
        [["validate","control","n3",3,"validate intervening commits","request-response"],["read-log","n3","state",1,"read ordered log suffix","storage"]],
        [["create","n3","n4",4,"conditionally create next commit","request-response"],["data-ready","n4","n2",2,"require staged file verification","request-response"],["commit-log","n4","state",4,"publish immutable version key","storage"]],
        [["snapshot","caller","n5",5,"read pinned table snapshot","request-response"],["log","n5","state",1,"replay contiguous commit prefix","storage"]],
        [["checkpoint","n6","state",1,"read complete log prefix","storage"],["accelerate","n5","n6",6,"load verified checkpoint","request-response"]],
        [["orphan","n7","n2",7,"reconcile staged orphan files","request-response"],["tx-status","n7","state",1,"resolve transaction commit identity","storage"]],
      ],
      "recovery": "const committed = findTransactionInLog(transactionId);\nif (committed) return committed.receipt;\nfor (const object of stagedObjects(transactionId)) {\n if (olderThanGrace(object) && !referencedByRetainedSnapshot(object, readerFloor)) deleteAndRecord(object);\n}\n// An unknown create outcome is reconciled before retrying or deleting referenced data.",
      "cases": [
        ["winner","Two writers target the same version key after reading one snapshot.","Create with backend-supported If-None-Match star.","Only one creates that immutable version; loser rereads and revalidates conflict predicates."],
        ["snapshot","A reader pins version 12 while version 13 commits and checkpoint 10 is available.","Replay checkpoint 10 plus commits 11 and 12.","Read version 12 consistently without mixing new metadata or requiring directory rename."],
        ["retention","An old snapshot still references a data file while an uncommitted upload ages past grace.","Run cleanup with the active-reader floor.","Retain referenced files and collect only proven orphan objects; schema/protocol conflicts abort unsafe commits."],
      ],
      "algorithmOwner": "n4",
    },
    {
      "id": "coordinator",
      "title": "External serialized commit coordinator",
      "choose": "The backend lacks qualified conditional creation or high write contention benefits from a commit owner.",
      "trade": ["Coordinator availability and fencing become part of commit correctness; object publication and coordinator receipts need recovery."],
      "assumptions": ["A fenced coordinator is the sole publisher; reservation alone is not a committed table version."],
      "steps": [
        {"label":"Commit request","question":"What must the coordinator validate?","reason":"Submit base version, read predicates and immutable staged file references.","state":"writer request identity","request":{"transactionId":"uuid","baseVersion":"integer"},"response":{"state":"accepted|conflict"},"kind":"service"},
        {"label":"Coordinator ledger","question":"Who orders table versions?","reason":"Expand commit API with transaction receipts, monotonic table version and publisher epoch.","state":"table sequence and writer receipts","request":{"tableId":"uuid","expectedVersion":"integer"},"response":{"version":"integer","epoch":"integer"},"kind":"store"},
        {"label":"Staging verifier","question":"Can a writer fabricate object references?","reason":"Verify object existence, schema and digest before reserving commit publication.","state":"verified staged refs","request":{"files":"object refs[]","schemaVersion":"integer"},"response":{"valid":"boolean"},"kind":"worker"},
        {"label":"OCC validator","question":"Can concurrent writers touch disjoint data?","reason":"Validate against all intervening committed actions and enforce declared conflict semantics.","state":"read/write set verdict","request":{"readPredicates":"typed predicates","newActions":"actions[]"},"response":{"conflict":"boolean"},"kind":"module"},
        {"label":"Fenced publisher","question":"What if coordinator ownership changes?","reason":"Only the current publisher epoch can materialize ordered log records; recover pending publication before issuing later versions.","state":"publication epoch and pending record","request":{"epoch":"integer","version":"integer","transactionId":"uuid"},"response":{"published":"boolean"},"kind":"worker"},
        {"label":"Committed view","question":"Does a reserved version count?","reason":"Readers expose only a contiguous committed prefix with immutable log hashes.","state":"committed prefix and snapshot","request":{"requestedVersion":"integer"},"response":{"snapshot":"active file refs[]"},"kind":"module"},
        {"label":"Checkpoint builder","question":"How are readers accelerated?","reason":"Create immutable checkpoints with protocol/schema metadata from the committed prefix.","state":"checkpoint digest and version","request":{"version":"integer"},"response":{"checkpointHash":"sha256"},"kind":"worker"},
        {"label":"Publication reconciler","question":"What happens after a lost acknowledgement?","reason":"Resolve transaction identity against log/coordinator receipts before retry or cleanup; never skip a missing log version.","state":"pending publication recovery","request":{"transactionId":"uuid","publisherEpoch":"integer"},"response":{"state":"committed|pending|conflict"},"kind":"worker"},
      ],
      "edges": [
        [["verify","control","n2",2,"verify staged file hashes","request-response"]],
        [["occ","n2","n3",3,"validate snapshot conflict sets","request-response"],["suffix","n3","state",1,"read committed table actions","storage"]],
        [["publish","n3","n4",4,"publish under fenced epoch","request-response"],["record","n4","state",4,"record ordered publication","storage"]],
        [["read","caller","n5",5,"read committed table version","request-response"],["prefix","n5","state",1,"resolve contiguous committed prefix","storage"]],
        [["checkpoint","n6","n5",5,"build checkpoint from committed view","request-response"]],
        [["reconcile","n7","n4",7,"resolve pending publication","request-response"],["receipt","n7","state",1,"read transaction receipt","storage"]],
      ],
      "recovery": "const pending = ledger.find(transactionId);\nif (pending.state === \"committed\") return pending.receipt;\nassertCurrentPublisherEpoch(epoch);\nconst object = await readLogObject(pending.version);\nif (object.hash === pending.actionsHash) markCommittedAndAdvancePrefix(pending);\nelse retainPendingAndBlockLaterVersionPublication();\n// Fence old publishers and never treat a reserved sequence number as a committed snapshot.",
      "cases": [
        ["winner","Two writers update overlapping predicates from one base version.","Serialize validation/publication through current coordinator epoch.","Select a valid commit or conflict; stale publishers cannot publish under an obsolete epoch."],
        ["snapshot","A version is reserved but its log object is not verified.","Read the latest table snapshot.","Expose only the contiguous committed prefix, excluding the reservation."],
        ["retention","Publication succeeded but its acknowledgement was lost.","Reconcile by transaction identity before retry or garbage collection.","Recover the original receipt and retain every file referenced by live snapshots."],
      ],
      "algorithmOwner": "n3",
      "code": "assertCurrentPublisherEpoch(epoch);\nconst current = loadCommittedPrefix(tableId);\nif (interveningActionsConflict(tx, current)) return conflict();\nconst pending = reserveOrderedPublication(tx.id, current.version + 1, epoch);\n// Reservation is not reader-visible; fenced publisher verifies immutable log bytes before marking committed.",
    },
  ],
  "code": "const intervening = log.after(tx.readVersion);\nif (intervening.some(c => overlapsReadWrite(tx,c) || incompatibleMetadata(tx,c))) return \"conflict\";\nconst next = currentVersion + 1;\nreturn conditionalCreate(logKey(next), encode(tx.actions));\n// A failed create requires re-read and conflict validation, not overwriting the winner.",
  "given": "Two writers read version 4 and both try to create version 5.",
  "when": "Attempt atomic create-if-absent, then revalidate a loser whose predicate overlaps the winning write.",
  "then": "Only one version-5 commit exists; the overlapping loser conflicts rather than overwriting or silently appending.",
});}
function buildL045(){return author({
  "batch": 3,
  "id": "L045",
  "title": "DAG scheduler and execution",
  "scope": "Schedule a declared DAG, distinguish narrow transforms from shuffle boundaries, track worker leases and artifact lineage, and select one result from speculative attempts. Distributed scheduling and performance are design claims requiring implementation evidence.",
  "requirements": ["Reject cycles and schedule a task only after committed predecessor outputs.","Separate task attempts, worker liveness and retained shuffle/data ownership.","Bound shuffle/spill and select one committed result across retries/speculation."],
  "refs": [["Spark RDD guide","https://spark.apache.org/docs/latest/rdd-programming-guide.html","Partitioned transforms, shuffle, spill and lineage recomputation."],["Spark job scheduling","https://spark.apache.org/docs/latest/job-scheduling.html","Application/job scheduling concepts; this authored design is not a Spark implementation."]],
  "approaches": [
    {
      "id": "central",
      "title": "Central DAG coordinator with ready queues",
      "choose": "A single durable owner can track the DAG and locality across a bounded cluster.",
      "trade": ["Central coordination can limit scale; failover must fence stale schedulers and retain decisions."],
      "assumptions": ["Completion is an immutable output receipt, not a worker heartbeat."],
      "steps": [
        {"label":"DAG planner","question":"Where are stage boundaries?","reason":"Validate acyclicity and coalesce narrow dependencies while separating wide shuffle edges.","state":"DAG and stage identities","request":{"tasks":"task definitions[]","edges":"typed dependencies[]"},"response":{"stages":"stage definitions[]"},"kind":"service"},
        {"label":"Coordinator state","question":"What survives scheduler loss?","reason":"Expand planner; persist remaining dependencies, attempt epochs and selected output receipts.","state":"DAG state and epochs","request":{"jobId":"uuid","taskId":"uuid"},"response":{"state":"blocked|ready|running|done"},"kind":"store"},
        {"label":"Ready queue","question":"When does a task become runnable?","reason":"Enqueue only when all distinct predecessor output receipts exist.","state":"ready task identities","request":{"taskId":"uuid","remaining":"integer"},"response":{"queued":"boolean"},"kind":"queue"},
        {"label":"Worker leases","question":"Does heartbeat imply completion?","reason":"Assign tasks under epoch leases and record locality hints without confusing them with correctness authority.","state":"worker lease and task attempt","request":{"workerId":"uuid","attemptEpoch":"integer"},"response":{"leaseUntil":"timestamp"},"kind":"directory"},
        {"label":"Shuffle storage","question":"What survives executor death?","reason":"Retain partition blocks separately and enforce bounded spill and backpressure.","state":"block checksums and spill manifests","request":{"partitionId":"string","attempt":"integer"},"response":{"artifactRef":"immutable ref"},"kind":"store"},
        {"label":"Attempt selection","question":"Can speculation produce two outputs?","reason":"Launch a bounded speculative attempt and atomically select the first valid successful result per logical task.","state":"selected attempt ID","request":{"taskId":"uuid","attemptId":"uuid","artifactHash":"sha256"},"response":{"selected":"boolean"},"kind":"module"},
        {"label":"Dependency release","question":"How do children start once?","reason":"Deduplicate selected predecessor completion before reducing child dependency counts.","state":"completion receipts and counters","request":{"parentId":"uuid","childId":"uuid"},"response":{"remaining":"integer"},"kind":"module"},
        {"label":"Lineage rescheduler","question":"What is recomputed after loss?","reason":"Fence failed attempts, retain valid artifacts, and regenerate only missing lineage; cancel losing speculative work.","state":"recovery frontier","request":{"lostWorker":"uuid|null","lostArtifacts":"ref[]"},"response":{"readyTasks":"uuid[]"},"kind":"worker"},
      ],
      "edges": [
        [["ready","control","n2",2,"enqueue satisfied task","request-response"]],
        [["lease","n2","n3",3,"lease task to live worker","request-response"]],
        [["artifact","n3","n4",4,"persist partition artifacts","storage"]],
        [["select","n4","n5",5,"select valid attempt output","request-response"]],
        [["complete","n5","n6",6,"release child dependency","request-response"],["enqueue-child","n6","n2",2,"enqueue newly ready child","request-response"]],
        [["lineage","n7","state",1,"read task lineage","storage"],["retained","n7","n4",4,"verify retained artifacts","storage"],["retry","n7","n2",2,"reschedule missing work","request-response"]],
      ],
      "recovery": "for (const failed of expiredAttemptLeases(now)) fenceAttempt(failed);\nfor (const artifact of missingArtifactManifest()) enqueueLineageProducer(artifact);\nfor (const task of tasksWithWinner()) cancelNonWinningAttempts(task);\n// CPU heartbeat loss does not delete separately retained shuffle; only selected outputs release children.",
      "cases": [
        ["dag","A task graph contains a cycle or a child lacks one committed parent output.","Compile and schedule.","Reject the cycle and keep the incomplete child blocked."],
        ["speculation","Two attempts finish successfully for one logical task.","Compare-and-set the winner and deliver completion twice.","Publish one selected artifact and decrement each child prerequisite once."],
        ["loss","A compute worker is lost but shuffle persists; later a block is deleted.","Recover each fault separately.","Reuse retained blocks after CPU loss and recompute only missing artifact lineage; bounded spill preserves the declared memory limit."],
      ],
      "algorithmOwner": "n5",
    },
    {
      "id": "partitioned",
      "title": "Partitioned task actors and durable completion events",
      "choose": "Large DAGs justify sharding task state and ready-frontier ownership.",
      "trade": ["Cross-shard dependency events need deduplication; per-task ownership and job cancellation require fencing."],
      "assumptions": ["Partition-local ordering is sufficient when each child deduplicates predecessor identities."],
      "steps": [
        {"label":"DAG partitioner","question":"Which shard owns a task?","reason":"Validate graph and assign each stable task ID to one owner shard.","state":"DAG hash and ownership map","request":{"dagId":"uuid","tasks":"task ids[]"},"response":{"owners":"task/shard map"},"kind":"service"},
        {"label":"Task actor journal","question":"What can a shard replay?","reason":"Expand partitioner with task transition logs and committed predecessor receipts.","state":"task journal and ownership epoch","request":{"taskId":"uuid","ownerEpoch":"integer"},"response":{"version":"integer"},"kind":"log"},
        {"label":"Completion inbox","question":"Can delivery release twice?","reason":"Deduplicate prerequisite completion IDs at each child actor before emitting ready state.","state":"child prerequisite set","request":{"childId":"uuid","parentId":"uuid","receipt":"immutable ref"},"response":{"remaining":"integer"},"kind":"store"},
        {"label":"Shard ready frontier","question":"How are runnable tasks offered?","reason":"Publish ready tasks under owner epoch and lease bounded work to executors.","state":"frontier entries and leases","request":{"taskId":"uuid","epoch":"integer"},"response":{"leaseId":"uuid"},"kind":"queue"},
        {"label":"Artifact exchange","question":"How does shuffle span shards?","reason":"Route typed partition artifacts via checksum manifests with per-partition FIFO/backpressure and spill.","state":"artifact manifests and spill budget","request":{"taskId":"uuid","partitionId":"integer"},"response":{"artifactRef":"immutable ref"},"kind":"store"},
        {"label":"Commit arbiter","question":"How is a speculative winner chosen?","reason":"Each task owner atomically selects one valid artifact receipt and emits stable completion identity.","state":"winner receipt and loser attempts","request":{"taskId":"uuid","attemptId":"uuid"},"response":{"winner":"uuid"},"kind":"module"},
        {"label":"Completion fan-out","question":"How are downstream shards notified?","reason":"Deliver selected task completion to dependent-owner inboxes through a durable replayable outbox.","state":"completion outbox and delivery offsets","request":{"parentId":"uuid","children":"uuid[]"},"response":{"eventIds":"stable ids[]"},"kind":"worker"},
        {"label":"Shard recovery","question":"What happens after owner failover?","reason":"Advance owner epoch, replay journals and pending completion outboxes, and reschedule only artifacts missing from lineage.","state":"shard recovery offsets","request":{"shardId":"uuid","previousEpoch":"integer"},"response":{"newEpoch":"integer"},"kind":"worker"},
      ],
      "edges": [
        [["inbox","state","n2",2,"replay predecessor receipts","event-stream"]],
        [["ready","n2","n3",3,"publish ready frontier","request-response"]],
        [["exchange","n3","n4",4,"persist typed partition artifact","storage"]],
        [["arbitrate","n4","n5",5,"select owner-fenced winner","request-response"]],
        [["fanout","n5","n6",6,"emit selected completion","request-response"],["deliver","n6","n2",2,"deliver child prerequisite receipt","storage"]],
        [["replay","state","n7",7,"replay task owner journal","event-stream"],["resume","n7","n6",6,"resume completion outbox","request-response"],["frontier","n7","n3",3,"restore ready frontier","request-response"]],
      ],
      "recovery": "const epoch = advanceShardEpoch(shardId);\nconst tasks = replayTaskJournal(shardId);\nfor (const task of tasks) {\n resendPendingCompletionIds(task.outbox);\n if (!task.winner && allPredecessorReceiptsPresent(task)) leaseReadyTask(task, epoch);\n}\n// Child inbox deduplication tolerates replay; old-owner completion cannot overwrite current attempt state.",
      "cases": [
        ["dag","Task partitioning receives a cycle or an unknown parent ID.","Validate before assigning owner shards.","Reject the graph without partially releasing a ready frontier."],
        ["speculation","Two attempts and duplicate completion events reach different shards.","Choose a winner under task-owner epoch and apply child inbox transitions.","One immutable receipt wins; each child deduplicates predecessor ID independently."],
        ["loss","A shard owner fails after publishing only part of its completion outbox.","Advance epoch and replay pending events.","Resume stable event identities, fence stale owners and recompute only absent artifact lineage."],
      ],
      "algorithmOwner": "n5",
    },
  ],
  "code": "if (!allPredecessorReceiptsPresent(task)) return \"blocked\";\nif (task.winner) return task.winner;\nassert(validArtifact(attempt.artifact));\nreturn compareAndSetWinner(task.id, null, attempt.id);\n// Only the selected receipt emits completion; losing attempts never decrement children again.",
  "given": "Two speculative attempts finish for one task whose child also depends on another predecessor.",
  "when": "Select a winner and deliver duplicate selected completion, then the other predecessor.",
  "then": "Exactly one attempt is selected; the child becomes ready only after both distinct predecessor receipts exist.",
});}
module.exports={buildL022,buildL030,buildL044,buildL045};
