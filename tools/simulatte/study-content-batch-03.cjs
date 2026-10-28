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
   },[t.invariant],t.checks);
   b.solution.stages.at(-1).explanation=t.reason+' The graph is an authored conceptual design; guarantees require the named deployment contracts.';
  }
  // POST submits through the stage-1 command contract; GET reads through its own read-only shape, never a stage-2 internal contract.
  b.api('POST','/'+spec.id.toLowerCase()+'/'+a.id,JSON.stringify(a.steps[0].request),JSON.stringify(a.steps[0].response),a.errors,'control');
  b.api('GET','/'+spec.id.toLowerCase()+'/'+a.id+'/state',JSON.stringify(a.read.request),JSON.stringify(a.read.response),a.read.errors,'state');
  b.algorithm('bounded-rule',a.algorithmOwner,a.code,['The code states the bounded decision rule; unimplemented helpers remain pseudocode.','External effects, distributed failure and latency require separate execution evidence.']);
  b.algorithm('recover','n7',a.recovery,[a.steps[7].reason]);
  // Cases are authored per approach: [id, given, when, then, covered requirement IDs, optional reference test name].
  for(const [id,given,when,then,requirementIds,testName]of a.cases){
   b.check(id,given,when,then,requirementIds);
   if(testName)b.solution.acceptanceCases.at(-1).evidence={kind:'reference-test',testFile:'tools/simulatte/study-reference/batch-'+String(spec.batch).padStart(2,'0')+'-mechanisms.test.mjs',testName};
  }
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
        {"label":"Count job","question":"What is the input snapshot?","reason":"Accept an immutable dataset identity and explicit URL normalization version.","state":"job and snapshot identity","request":{"jobId":"uuid","inputHash":"sha256","normalizerVersion":"integer"},"response":{"accepted":"boolean"},"kind":"service","invariant":"A jobId binds exactly one inputHash and normalizerVersion; the same jobId with different input or normalizer is rejected, never re-planned.","checks":["submit"]},
        {"label":"Partition plan","question":"How are logical tasks identified?","reason":"Expand driver; persist three map ranges and three reducer partitions with lineage.","state":"logical partition lineage","request":{"inputHash":"sha256","mapPartitions":"3","reducePartitions":"3"},"response":{"partitionIds":"stable ids[]"},"kind":"store","invariant":"Logical map and reducer partition IDs and their lineage are fixed before any attempt runs; an attempt never redefines its partition.","checks":["mechanism","loss"]},
        {"label":"Map CPUs","question":"How is each URL counted?","reason":"Run one fenced attempt per logical map range and combine duplicate keys locally.","state":"map attempt epoch and counts","request":{"partitionId":"string","attempt":"integer","records":"URL rows[]"},"response":{"partialCounts":"URL/count pairs[]"},"kind":"worker","invariant":"Every map output carries its logical map ID and attempt; a retry produces a second attempt, not a second logical partition.","checks":["mechanism","count"]},
        {"label":"Shuffle stores","question":"Who owns map output blocks?","reason":"Partition partial counts by deterministic URL hash into three independently retained shuffle stores.","state":"keyed blocks and checksums","request":{"mapId":"string","reduceId":"0..2","attempt":"integer"},"response":{"blockId":"string","checksum":"sha256"},"kind":"store","invariant":"A block is owned by its shuffle store, addressed by map, attempt and reducer with a checksum, and outlives the CPU that wrote it.","checks":["loss"]},
        {"label":"Spill buffers","question":"What if a partition exceeds RAM?","reason":"Spill sorted bounded runs and merge them without changing integer counts.","state":"memory budget and spill manifests","request":{"pairs":"URL/count pairs[]","memoryLimit":"positive bytes"},"response":{"sortedRuns":"immutable refs[]"},"kind":"module","invariant":"Buffered pairs never exceed memoryLimit; merging the sorted runs yields the same integer totals as the unspilled input.","checks":["spill"]},
        {"label":"Reduce CPUs","question":"How are competing attempts handled?","reason":"Read only selected map-attempt blocks and sum each URL under its reducer owner.","state":"reduce attempt epoch","request":{"reduceId":"0..2","selectedBlocks":"block refs[]"},"response":{"counts":"URL/count pairs[]"},"kind":"worker","invariant":"A reducer reads exactly one selected attempt per logical map and refuses to run while any logical map lacks a selection.","checks":["mechanism","count"]},
        {"label":"Output manifest","question":"When is the result complete?","reason":"Atomically publish one chosen output for each of the three logical reducers.","state":"selected reducer outputs","request":{"jobId":"uuid","outputs":"three reducer refs"},"response":{"resultHash":"sha256"},"kind":"store","invariant":"The result manifest names one output for each reducer 0..2 and is published only when all three exist.","checks":["count"]},
        {"label":"Lineage recovery","question":"Does CPU loss erase shuffle?","reason":"Retain external blocks across compute loss; recompute only missing block lineage after storage loss.","state":"missing-block recovery work","request":{"lostResource":"cpu|shuffle-store","blockIds":"string[]"},"response":{"recompute":"logical map ids[]"},"kind":"worker","invariant":"CPU loss recomputes no stored block; store loss recomputes only the logical maps that wrote blocks to that store.","checks":["loss"]},
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
      "errors": "400 unsupported normalizerVersion; 404 inputHash is not in the immutable dataset catalogue; 409 jobId already bound to a different inputHash or normalizerVersion",
      "read": {"request":{"jobId":"uuid"},"response":{"phase":"planned|mapping|reducing|published|failed","selectedAttempts":"logical map/reducer id to attempt id","resultHash":"sha256|null"},"errors":"404 unknown jobId; 410 job lineage removed by retention"},
      "cases": [
        ["mechanism","The driver holds an original and a retried attempt for logical map 1, both stored with identical rows, plus a fenced partial attempt.","Reduce the three hash partitions with the driver's selected attempt per logical map.","Totals equal the serial count; only the selected attempt contributes, and reduction refuses to run while any logical map lacks a selection.",["r0","r2"],"L022 only the selected map attempt contributes to URL counts"],
        ["count","A logical map is retried after its output block was already stored.","Choose one successful attempt and reduce.","Count each input record once by selected logical partition, never sum both attempts.",["r0","r2"]],
        ["loss","A map CPU dies while its external shuffle blocks remain intact.","Recover and then separately delete one shuffle store.","CPU replacement reuses valid blocks; storage loss recomputes only upstream maps for missing blocks.",["r2"],"L022 driver recovery recomputes only maps whose shuffle blocks were lost"],
        ["spill","A skewed URL partition exceeds the memory budget.","Spill sorted partial-count runs and merge.","The integer URL totals equal a serial reference while in-memory buffering remains bounded.",["r1"]],
        ["submit","Job J is accepted for inputHash H with normalizer version 2.","Resubmit J with inputHash H2 or normalizer version 3, then resubmit it unchanged.","The changed resubmissions are rejected with 409 and create no second plan; the unchanged one returns the original acceptance.",["r0"]],
      ],
      "algorithmOwner": "n5",
      "code": "for (const mapId of [0,1,2]) if (!selected.has(mapId)) return \"blocked\";\nconst totals = new Map();\nfor (const block of reducerBlocks.filter(b => selected.get(b.mapId) === b.attemptId))\n for (const [url,count] of block.pairs) totals.set(url,(totals.get(url)||0)+count);\n// Retried and fenced attempts stay stored, but only the driver-selected attempt contributes.",
    },
    {
      "id": "checkpoints",
      "title": "Checkpointed partition dataflow",
      "choose": "Repeated downstream analyses justify durable intermediate partitions.",
      "trade": ["Durable checkpoints write more data and need garbage collection/versioning; recovery avoids regenerating retained stages."],
      "assumptions": ["Checkpoints are immutable and keyed by input/code version; worker-local files are not durable checkpoints."],
      "steps": [
        {"label":"Dataflow submission","question":"What is deterministic in the job?","reason":"Pin input bytes and codeVersion (parser, normalizer and hash partition function) before any task runs; report which maps reuse committed checkpoints.","state":"dataflow definition hash","request":{"inputHash":"sha256","codeVersion":"string"},"response":{"jobId":"uuid","reusedMapIds":"logical map ids[]"},"kind":"service","invariant":"A job pins inputHash and codeVersion before planning; those two values are the only key under which a map checkpoint can be reused.","checks":["reuse"]},
        {"label":"Checkpoint catalogue","question":"Which stage results may be reused?","reason":"Expand coordinator with immutable per-stage manifests and selected attempt IDs.","state":"checkpoint manifests","request":{"stageId":"string","inputHash":"sha256","codeVersion":"string"},"response":{"committedPartitions":"partition refs with selected attempt[]"},"kind":"store","invariant":"Catalogue entries are immutable, keyed by stage, map, inputHash and codeVersion, and name exactly one selected attempt each.","checks":["mechanism","reuse"]},
        {"label":"Map task queue","question":"How are ranges assigned?","reason":"Lease only maps without a reusable checkpoint over deterministic input ranges, fencing old worker completions.","state":"range lease epochs","request":{"mapId":"0..2","epoch":"integer"},"response":{"range":"half-open record offsets"},"kind":"queue","invariant":"A map with a valid checkpoint for the same inputHash and codeVersion is never leased; a completion from an older lease epoch is fenced.","checks":["reuse","mechanism"]},
        {"label":"Map checkpoint writer","question":"How are duplicate keys reduced?","reason":"Parse/normalize each row and commit a local combine output under its attempt key.","state":"map counts and attempt receipts","request":{"records":"URL rows[]","normalizerVersion":"integer"},"response":{"partialCounts":"URL/count pairs[]"},"kind":"worker","invariant":"Each map checkpoint commits under its own attempt key with a checksum; a retry writes a new attempt key and never overwrites.","checks":["mechanism","spill"]},
        {"label":"Shuffle partitioner","question":"How do reducers find all keys?","reason":"Route each URL to hash(URL) mod 3 and persist independent keyed blocks with spill manifests.","state":"shuffle block manifests","request":{"partials":"URL/count pairs[]"},"response":{"blocks":"three reducer block sets"},"kind":"store","invariant":"Every URL routes to hash(URL) mod 3, and the spill manifest lists every sorted run with its checksum.","checks":["spill"]},
        {"label":"Reduce dataflow","question":"What is a safe replay?","reason":"Aggregate only manifest-selected blocks; retries replace an attempt selection instead of appending counts again.","state":"reduce attempt selection","request":{"blocks":"selected checksum refs[]"},"response":{"counts":"URL/count pairs[]"},"kind":"worker","invariant":"A reducer aggregates only manifest-selected blocks; reselecting an attempt replaces its contribution instead of adding to it.","checks":["mechanism","count"]},
        {"label":"Result commit","question":"Can a partial result look complete?","reason":"Require all three reducer partitions before publishing an immutable output manifest.","state":"result commit identity","request":{"outputs":"three reducer refs"},"response":{"resultHash":"sha256"},"kind":"store","invariant":"The output manifest is published only with all three reducer partitions present.","checks":["count"]},
        {"label":"Checkpoint repair","question":"Which work is repeated after failure?","reason":"Validate checkpoint/block checksums; retain valid external storage across CPU loss and reconstruct only absent dependencies.","state":"checkpoint validation cursor","request":{"manifestId":"string","lostBlocks":"string[]"},"response":{"replayFrom":"nearest valid stage"},"kind":"worker","invariant":"Repair reruns only partitions whose referenced checkpoint or block fails its checksum; valid checkpoints are reused.","checks":["loss","reuse"]},
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
      "errors": "404 inputHash is not in the immutable dataset catalogue; 422 codeVersion is not a registered parser, normalizer and partitioner build",
      "read": {"request":{"jobId":"uuid"},"response":{"phase":"planned|mapping|reducing|published|failed","reusedMapIds":"logical map ids[]","resultHash":"sha256|null"},"errors":"404 unknown jobId; 410 checkpoint manifest removed by retention"},
      "cases": [
        ["mechanism","The checkpoint manifest holds an original and a retried output for logical map 1 and selects the retry.","Reduce the three hash partitions from manifest-selected checkpoints.","Totals equal the serial count; the unselected output contributes nothing, and a map without a selected checkpoint blocks reduction.",["r0","r2"],"L022 only the selected map attempt contributes to URL counts"],
        ["count","A checkpoint contains a successful and a retried map output for one logical range.","Resolve the selected-attempt manifest before reduction.","Only the selected map output contributes to totals.",["r0","r2"]],
        ["loss","Compute is lost but checkpoint objects and external blocks still exist.","Validate artifacts then replace a missing block.","Retain valid artifacts and replay only the nearest missing dependency, not all unrelated stages.",["r2"]],
        ["spill","The map checkpoint writer sees a high-cardinality input.","Use bounded sorted runs and merge.","Checksummed persisted blocks preserve serial URL counts and the declared three-way partition function.",["r1"]],
        ["reuse","Job 1 committed checkpoints for maps 0..2 under inputHash H and codeVersion 7.","Resubmit H/7, then H/8 and H2/7, then H/7 again after map 2's checkpoint fails its checksum.","H/7 leases no map task and reproduces the serial counts from the reused checkpoints; a changed codeVersion or inputHash reruns every map; the corrupted checkpoint reruns only map 2.",["r0","r2"],"L022 checkpoints reuse map checkpoints only for the same inputHash and codeVersion"],
      ],
      "algorithmOwner": "n5",
      "code": "const reuse = catalogue.reusable(inputHash, codeVersion); // valid checksum, one selected attempt per map\nfor (const mapId of [0,1,2]) if (!reuse.has(mapId)) leaseMapRange(mapId, inputHash, codeVersion);\nconst selected = new Map([...reuse, ...committedNewAttempts()]);\nif (selected.size !== 3) return \"blocked\";\nconst totals = new Map();\nfor (const block of reducerBlocks.filter(b => selected.get(b.mapId) === b.attemptId))\n for (const [url,count] of block.pairs) totals.set(url,(totals.get(url)||0)+count);",
    },
  ],
});}
function buildL030(){return author({
  "batch": 3,
  "id": "L030",
  "title": "Event-time windows and schema evolution",
  "scope": "Finite events carry explicit event timestamps and schema-version transitions. Compare incremental keyed event-time state with immutable microbatch recomputation. Watermarks express a lateness policy: as in the cited Spark guide, a late event still updates its window until the watermark passes that window's end. Bounded memory/spill and replay are explicit.",
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
        {"label":"Event intake","question":"What is event time?","reason":"Accept source event ID, partition, schema version and an event timestamp separate from arrival time.","state":"source event identity","request":{"eventId":"uuid","partition":"integer","schemaVersion":"1|2","eventTime":"integer ms"},"response":{"accepted":"boolean"},"kind":"service","invariant":"Event time comes from the payload, never from arrival; an event without an integer eventTime is rejected at intake.","checks":["boundary"]},
        {"label":"Offset authority","question":"Which progress is committed?","reason":"Expand ingress with source offsets, schema compatibility and state checkpoint identities.","state":"offset and checkpoint versions","request":{"partition":"integer","offset":"integer"},"response":{"checkpointId":"uuid"},"kind":"store","invariant":"A source offset is committed only together with the state checkpoint that reflects every event before it.","checks":["replay"]},
        {"label":"Version decoder","question":"Can v2 change the meaning of v1?","reason":"Decode v1/v2 through explicit converters to one canonical value; reject unknown versions.","state":"schema conversion registry","request":{"schemaVersion":"1|2","payload":"versioned event"},"response":{"key":"string","value":"number","eventTime":"integer"},"kind":"module","invariant":"v1 value and v2 amount decode to one canonical value; an unknown version is quarantined, never defaulted.","checks":["boundary","mechanism"]},
        {"label":"Partition FIFO","question":"Can transfer reorder a source?","reason":"Keep per-partition FIFO with bounded buffers and backpressure on source admission.","state":"partition queue and byte budget","request":{"partition":"integer","offset":"integer"},"response":{"queued":"boolean"},"kind":"queue","invariant":"Per-partition offset order is preserved and queued bytes never exceed the partition budget; a full queue pauses admission instead of dropping.","checks":["backpressure"]},
        {"label":"Window state","question":"Which bucket owns a boundary event?","reason":"Update the half-open window [floor(eventTime/width)*width, +width) once per event ID; each open window owns its own event-ID set.","state":"key/window sum, count and dedupe","request":{"key":"string","eventTime":"integer","value":"number"},"response":{"windowStart":"integer","sum":"number","count":"integer"},"kind":"store","invariant":"An event updates exactly one half-open window, once per event ID, and only while that window is open.","checks":["boundary","mechanism"]},
        {"label":"Watermark gate","question":"When is an event too late?","reason":"Advance a monotonic watermark (max event time minus allowed lateness) under declared idleness policy; quarantine events whose window already closed and evict closed windows with their event IDs.","state":"watermark and late-event reasons","request":{"eventTime":"integer","windowEnd":"integer","watermark":"integer"},"response":{"route":"window|quarantine"},"kind":"module","invariant":"An event is quarantined only when its window end is at or below the watermark; when the watermark passes a window end, that window is emitted and its sums and event IDs are evicted.","checks":["late","mechanism"]},
        {"label":"Spill checkpoint","question":"How does state exceed memory safely?","reason":"Spill bounded sorted runs and atomically checkpoint state references plus source offsets.","state":"spill manifests and checkpoints","request":{"memoryBytes":"integer","offsets":"partition offsets"},"response":{"checkpoint":"immutable ref"},"kind":"worker","invariant":"In-memory state stays within memoryBytes; spilled runs and source offsets are referenced by one atomic checkpoint.","checks":["replay"]},
        {"label":"Replay and finalize","question":"What if the worker crashes after output?","reason":"Restore a checkpoint, deduplicate replayed IDs and publish versioned window results; finality follows the declared watermark rule.","state":"output versions and replay cursor","request":{"checkpointId":"uuid","offsets":"partition offsets"},"response":{"restored":"boolean"},"kind":"worker","invariant":"Replay after the committed offsets reapplies events by ID into restored open windows, so sums never double; a finalized window is emitted once.","checks":["replay"]},
      ],
      "edges": [
        [["decode","control","n2",2,"decode declared event schema","request-response"]],
        [["enqueue","n2","n3",3,"enqueue partition FIFO","event-stream"]],
        [["initialize","control","n4",4,"initialize empty window state","storage"]],
        [["lateness","n3","n5",5,"check event-time watermark","request-response"],["admit","n5","n4",4,"apply eligible event","storage"]],
        [["spill","n4","n6",6,"write spill and checkpoint","request-response"],["offset","n6","state",1,"commit state and source offsets","storage"]],
        [["restore","n7","n6",6,"restore checkpoint and spill","request-response"],["resume","n7","state",1,"resume committed source offsets","storage"]],
      ],
      "recovery": "const cp = loadCommittedCheckpoint();\nrestoreWindowState(cp.openWindows, cp.watermark); // each open window carries its event-ID set\nfor (const event of source.after(cp.offsets)) applyIfNewEventId(event);\ncommitOutputVersionsWithCheckpoint();\n// Closed windows were emitted and evicted before the checkpoint; their late events stay in quarantine.",
      "errors": "400 unknown schemaVersion or non-integer eventTime; 429 partition FIFO at its byte budget, retry with the same eventId",
      "read": {"request":{"key":"string","windowStart":"integer ms"},"response":{"sum":"number","count":"integer","final":"boolean","watermark":"integer ms"},"errors":"404 no event has reached this key and window; 410 window finalized and evicted, read its emitted result"},
      "cases": [
        ["mechanism","10ms windows with 5ms allowed lateness receive times 9, 10, a duplicate 9, an out-of-order 4, an unknown schema, then 25, a straggler at 7 and a redelivered 10.","Fold them through the incremental window state.","Time 4 still counts in the open [0,10) window; at watermark 20 windows [0,10) and [10,20) are emitted and their sums and event IDs evicted, so the straggler and the redelivery are quarantined rather than recounted; the duplicate is ignored and the unknown schema quarantined.",["r0","r1","r2"],"L030 incremental windows follow window-end lateness and evict finalized state"],
        ["boundary","An event lands exactly at a tumbling-window boundary.","Decode its version and compute floor(eventTime/width).","Assign the event to the new half-open window, independent of arrival order.",["r0","r1"]],
        ["late","Windows are 10ms, allowed lateness is 5ms and the max event time seen is 17, so the watermark is 12.","Events at times 4 and 11 arrive.","Time 4 is quarantined because window [0,10) closed at watermark 12; time 11 still updates the open [10,20) window although it is below the watermark.",["r1"],"L030 incremental windows follow window-end lateness and evict finalized state"],
        ["replay","A worker crashes after output is written but before source checkpoint commit.","Restore and replay the same event identities.","Deduplicate or reconcile versioned output so sum/count do not double; unknown schema versions remain quarantined.",["r0","r2"]],
        ["backpressure","A partition's FIFO reaches its byte budget while window state is spilling.","The source offers more events for that partition.","Admission pauses for that partition; queued events keep offset order and none is dropped or reordered.",["r2"]],
      ],
      "algorithmOwner": "n4",
      "code": "const value = decode(event.schemaVersion, event.payload); // unknown versions go to quarantine\nconst start = Math.floor(event.time / width) * width;\nif (start + width <= watermark) return quarantine(event, \"late\"); // its window already closed\nconst win = open.get(start) ?? openWindow(start);\nif (win.ids.has(event.id)) return \"duplicate\";\nwin.ids.add(event.id); win.sum += value; win.count++;\nmaxEventTime = Math.max(maxEventTime, event.time); watermark = Math.max(watermark, maxEventTime - lateness);\nfor (const [s, w] of open) if (s + width <= watermark) { emitFinal(s, w.sum, w.count); open.delete(s); } // evicts sums and IDs",
    },
    {
      "id": "microbatch",
      "title": "Immutable microbatches and transactional window merges",
      "choose": "Batch latency is acceptable and immutable recomputation simplifies recovery.",
      "trade": ["Microbatch delay is visible; keeping raw events and recomputing touched windows costs storage/I/O."],
      "assumptions": ["A batch pins its upper offsets and watermark; new arrivals enter a later batch."],
      "steps": [
        {"label":"Batch cutoff","question":"Which arrivals belong to this batch?","reason":"Freeze upper source offsets and a unique batch identity without treating arrival time as event time.","state":"batch offset interval","request":{"batchId":"uuid","upperOffsets":"partition offsets"},"response":{"accepted":"boolean"},"kind":"service","invariant":"A batchId binds one frozen set of upper offsets and one watermark; arrivals after the cutoff belong to a later batch.","checks":["late"]},
        {"label":"Batch catalogue","question":"Can a retry create a new interval?","reason":"Expand batch coordinator with immutable offset ranges and commit receipts.","state":"batch identity and ranges","request":{"batchId":"uuid"},"response":{"lowerOffsets":"map","upperOffsets":"map"},"kind":"store","invariant":"Offset ranges are immutable per batchId; a retried batch reuses its range rather than opening a new interval.","checks":["replay"]},
        {"label":"Raw event archive","question":"What survives a transform failure?","reason":"Retain event IDs, event times and original schema version in an immutable batch object.","state":"raw batch bytes and digest","request":{"events":"versioned event rows[]"},"response":{"objectHash":"sha256"},"kind":"store","invariant":"Raw batch bytes keep event ID, event time and original schema version and are never rewritten, so recomputation sees the same input.","checks":["replay"]},
        {"label":"Schema normalize","question":"How do mixed versions combine?","reason":"Convert each declared version to canonical key/value fields and quarantine unknown versions.","state":"conversion version and rejects","request":{"schemaVersion":"1|2","payload":"versioned event"},"response":{"canonical":"key/time/value"},"kind":"module","invariant":"Each declared version converts to one canonical value; unknown versions are quarantined with their batchId.","checks":["boundary","mechanism"]},
        {"label":"Sort and spill","question":"What is the bounded-memory plan?","reason":"Sort by key/window/event ID into bounded disk runs, deduplicating repeated source identities.","state":"sorted spill runs","request":{"canonical":"event rows[]","memoryLimit":"positive bytes"},"response":{"runs":"immutable refs[]"},"kind":"worker","invariant":"Sorted runs stay within memoryLimit, and an event ID repeated inside one batch collapses to one row before merge.","checks":["mechanism"]},
        {"label":"Lateness partition","question":"How is late data classified consistently?","reason":"Use the frozen batch watermark: events whose window end is above it update windows; events for closed windows enter a retained quarantine dataset.","state":"batch watermark and quarantine","request":{"eventTime":"integer","windowEnd":"integer","batchWatermark":"integer"},"response":{"route":"eligible|quarantine"},"kind":"module","invariant":"Under the batch's frozen watermark an event is eligible while its window end is above it; otherwise it is quarantined with its batchId.","checks":["late","mechanism"]},
        {"label":"Atomic window merge","question":"Can replay double-count a batch?","reason":"Commit touched-window deltas, the per-window event-ID index and the batch receipt in one transaction; drop the ID index of windows the watermark has closed.","state":"window versions and batch receipts","request":{"batchId":"uuid","windowDeltas":"key/window/sum/count[]","eventIds":"key/window/event ID rows[]"},"response":{"applied":"boolean"},"kind":"store","invariant":"Window deltas, the per-window event-ID index and the batch receipt commit together; an event ID already indexed for its window adds nothing, even from another batch.","checks":["mechanism","replay"]},
        {"label":"Batch recovery","question":"Can output commit outrun offsets?","reason":"Reuse frozen ranges and batch identity, reconcile merge receipt, then advance source checkpoint.","state":"recovery cursor and output receipt","request":{"batchId":"uuid"},"response":{"state":"replay|already-committed"},"kind":"worker","invariant":"Source offsets advance only after the batch receipt exists; a replay that finds the receipt adds no deltas.","checks":["replay"]},
      ],
      "edges": [
        [["archive","control","n2",2,"persist raw batch bytes","storage"]],
        [["normalize","n2","n3",3,"normalize versioned records","request-response"]],
        [["sort","n3","n4",4,"sort and spill canonical events","request-response"]],
        [["late","n4","n5",5,"partition by frozen watermark","request-response"]],
        [["merge","n5","n6",6,"merge eligible window deltas","storage"]],
        [["recover","n7","n6",6,"check atomic batch receipt","storage"],["offset","n7","state",1,"advance frozen batch offsets","storage"]],
      ],
      "recovery": "const batch = loadFrozenBatch(batchId);\nif (windowStore.hasBatchReceipt(batch.id)) return advanceOffsets(batch.upperOffsets);\nconst {deltas, ids} = recomputeFromImmutableEvents(batch, batch.watermark, windowStore.idIndex);\ntransaction(()=> { mergeDeltas(deltas); insertIds(ids); insertBatchReceiptUnique(batch.id); });\nadvanceOffsets(batch.upperOffsets);",
      "errors": "409 batchId already bound to different upper offsets; 422 upper offsets below the previous batch's upper offsets",
      "read": {"request":{"key":"string","windowStart":"integer ms"},"response":{"sum":"number","count":"integer","final":"boolean","lastBatchId":"uuid"},"errors":"404 no committed batch has touched this key and window"},
      "cases": [
        ["mechanism","Batch b1 holds time 9 (delivered twice) and time 10; b2 redelivers the time-9 event under a new offset with an out-of-order time 4 and an unknown schema at frozen watermark 5; b3 has watermark 20 and a straggler at time 4.","Commit b1 and b2, replay b2, then commit b3.","The redelivered event adds nothing to [0,10) and time 4 counts because that window is still open; replaying b2 is already-committed; in b3 the straggler is quarantined and closed windows keep their sums but drop their event-ID index.",["r0","r1","r2"],"L030 microbatch commits window deltas with a per-window event-ID index and batch receipt"],
        ["boundary","A frozen batch contains v1 and v2 events at timestamps 9 and 10.","Normalize to canonical values and group into 10ms windows.","Produce separate [0,10) and [10,20) aggregates with explicit conversion versions.",["r0","r1"]],
        ["late","New arrivals appear while a batch runs.","Finish the frozen upper offsets and watermark.","The new arrivals enter a later batch; an event is quarantined only when its window end is at or below that batch's frozen watermark.",["r1"]],
        ["replay","A batch merge commits but the process crashes before advancing source offsets.","Replay the same batch identity.","Read the unique batch receipt and advance offsets without adding its deltas again.",["r2"],"L030 microbatch commits window deltas with a per-window event-ID index and batch receipt"],
      ],
      "algorithmOwner": "n6",
      "code": "if (windowStore.hasReceipt(batch.id)) return \"already-committed\";\nconst deltas = new Map(), ids = [];\nfor (const e of normalizedSortedUnique(batch)) { // repeats inside the batch collapse here\n const start = Math.floor(e.time / width) * width;\n if (start + width <= batch.watermark) { quarantine(e, batch.id); continue; }\n if (windowStore.idIndex(e.key, start).has(e.id)) continue; // already counted by an earlier batch\n addDelta(deltas, e.key, start, e.value); ids.push([e.key, start, e.id]);\n}\ntransaction(() => { mergeDeltas(deltas); insertIds(ids); dropIdIndexForWindowsEndingBy(batch.watermark); insertBatchReceiptUnique(batch.id); });",
    },
  ],
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
        {"label":"Table transaction","question":"What does a writer read?","reason":"Start from a pinned table snapshot and record read predicates plus intended additions/removals.","state":"transaction read version","request":{"tableId":"uuid","readVersion":"integer"},"response":{"transactionId":"uuid"},"kind":"service","invariant":"A transaction records its readVersion, read predicates and intended actions before staging any file; its next version is derived from that readVersion.","checks":["winner","mechanism"]},
        {"label":"Snapshot catalogue","question":"Which state is authoritative?","reason":"Expand transaction boundary with ordered immutable log actions and protocol metadata.","state":"table log versions","request":{"tableId":"uuid","version":"integer"},"response":{"actions":"add/remove/metadata actions[]"},"kind":"store","invariant":"Each table version is one immutable log object; versions are contiguous and never rewritten.","checks":["snapshot"]},
        {"label":"Data staging","question":"Can a commit refer to missing files?","reason":"Upload immutable data objects and verify their hashes before attempting publication.","state":"staged object refs and hashes","request":{"transactionId":"uuid","files":"object refs[]"},"response":{"verified":"boolean"},"kind":"worker","invariant":"Every file a commit references was uploaded and hash-verified before the create attempt, and stays until an abort marker for its transaction commits.","checks":["mechanism","retention"]},
        {"label":"Conflict validation","question":"Does a newer version always conflict?","reason":"Read every commit after readVersion, including abort markers; compare read/write predicates and schema/protocol changes under declared isolation.","state":"validated read and write sets","request":{"readVersion":"integer","currentVersion":"integer"},"response":{"status":"compatible|conflict|aborted"},"kind":"module","invariant":"A transaction validates every version after its readVersion; an abort marker for it, an overlapping predicate or an incompatible schema/protocol change stops the commit.","checks":["winner","mechanism"]},
        {"label":"Conditional commit","question":"How do writers claim the same next version?","reason":"Create version readVersion + intervening commits + 1 with If-None-Match star; a loser rereads and revalidates before retry.","state":"commit key and attempt identity","request":{"version":"integer","actionsHash":"sha256"},"response":{"created":"boolean","conflict":"boolean"},"kind":"module","invariant":"The commit point is the If-None-Match create of readVersion + intervening + 1; a failed create rereads and revalidates and never overwrites the winner.","checks":["winner","mechanism"]},
        {"label":"Snapshot reader","question":"Can a reader mix versions?","reason":"Choose one committed version and replay checkpoint plus contiguous log suffix; abort markers are no-ops.","state":"reader snapshot version","request":{"version":"integer"},"response":{"activeFiles":"immutable object refs[]"},"kind":"module","invariant":"A reader replays one checkpoint plus the contiguous suffix up to its pinned version and never reads a later version's metadata.","checks":["snapshot"]},
        {"label":"Metadata checkpoint","question":"Can compaction replace history unsafely?","reason":"Publish a complete checkpoint after each illustrative ten commits; verify checksum and retain required log suffix.","state":"checkpoint version and checksum","request":{"version":"multiple of 10"},"response":{"checkpointHash":"sha256"},"kind":"worker","invariant":"A checkpoint is published only complete and checksummed; the log suffix after it stays retained for pinned readers.","checks":["snapshot"]},
        {"label":"Retention and orphan cleanup","question":"When can files be removed?","reason":"Retain files of committed or in-grace transactions and of retained snapshots; delete an aged orphan only after an abort marker for its transaction commits as the next log version.","state":"retention floor and orphan receipts","request":{"transactionId":"uuid","readerFloor":"integer"},"response":{"abortVersion":"integer|null","safeToDelete":"object refs[]"},"kind":"worker","invariant":"Staged files are deleted only after their transaction's abort marker commits in the log, so a slow writer can no longer commit them; files in retained snapshots stay.","checks":["retention","mechanism"]},
      ],
      "edges": [
        [["stage","control","n2",2,"verify immutable data objects","request-response"]],
        [["validate","control","n3",3,"validate intervening commits","request-response"],["read-log","n3","state",1,"read ordered log suffix","storage"]],
        [["create","n3","n4",4,"conditionally create next commit","request-response"],["data-ready","n4","n2",2,"require staged file verification","request-response"],["commit-log","n4","state",4,"publish immutable version key","storage"]],
        [["snapshot","caller","n5",5,"read pinned table snapshot","request-response"],["log","n5","state",1,"replay contiguous commit prefix","storage"]],
        [["checkpoint","n6","state",1,"read complete log prefix","storage"],["accelerate","n5","n6",6,"load verified checkpoint","request-response"]],
        [["orphan","n7","n2",7,"reconcile staged orphan files","request-response"],["tx-status","n7","state",1,"resolve transaction commit identity","storage"]],
      ],
      "recovery": "if (findTransactionInLog(transactionId)) return retainCommittedFiles(transactionId);\nconst staged = stagedObjects(transactionId);\nif (!findAbortMarker(transactionId)) {\n if (!staged.every(o => olderThanGrace(o))) return \"retain\";\n const v = latestVersion() + 1;\n if (!conditionalCreate(logKey(v), encode({abortTransaction: transactionId}))) return \"retry\"; // re-read: the writer may have won v\n}\nfor (const object of staged) if (!referencedByRetainedSnapshot(object, readerFloor)) deleteAndRecord(object);\n// The writer's validation reads the abort marker, so it can no longer commit the deleted files.",
      "errors": "404 unknown tableId; 410 readVersion older than the retained log suffix; 426 table protocol requires a newer writer",
      "read": {"request":{"tableId":"uuid","version":"integer|latest"},"response":{"version":"integer","protocol":"reader/writer versions","activeFiles":"immutable object refs[]"},"errors":"404 unknown tableId or version not yet committed; 410 version older than the retained checkpoint and log suffix"},
      "cases": [
        ["mechanism","Writers A and B with overlapping predicates and a disjoint writer C all read version 4; writer D staged files long before cleanup runs.","A creates version 5, B and C retry, cleanup creates an abort marker for D, then D tries to commit.","Only A owns version 5; B conflicts; C rebases to version 6; D aborts because the marker precedes its commit, so its deleted files are never referenced.",["r0","r1","r2"],"L044 conditional create commits once, rebases disjoint writers and aborts slow writers through the log"],
        ["winner","Two writers target the same version key after reading one snapshot.","Create with backend-supported If-None-Match star.","Only one creates that immutable version; loser rereads and revalidates conflict predicates.",["r0","r1"]],
        ["snapshot","A reader pins version 12 while version 13 commits and checkpoint 10 is available.","Replay checkpoint 10 plus commits 11 and 12.","Read version 12 consistently without mixing new metadata or requiring directory rename.",["r2"]],
        ["retention","An old snapshot still references a data file while transaction D's uncommitted upload ages past grace.","Run cleanup with the active-reader floor, then let D try to commit.","Referenced files stay; D's upload is deleted only after an abort marker commits in the log, and D's later commit attempt aborts instead of referencing deleted files.",["r2"],"L044 conditional create commits once, rebases disjoint writers and aborts slow writers through the log"],
      ],
      "algorithmOwner": "n4",
      "code": "const intervening = log.after(tx.readVersion);\nif (intervening.some(c => c.abortTransaction === tx.id)) return \"aborted\";\nif (intervening.some(c => overlapsReadWrite(tx,c) || incompatibleMetadata(tx,c))) return \"conflict\";\nconst next = tx.readVersion + intervening.length + 1;\nreturn conditionalCreate(logKey(next), encode(tx.actions)) ? next : \"retry\";\n// A failed create re-reads the suffix and revalidates; it never overwrites the winner.",
    },
    {
      "id": "coordinator",
      "title": "External serialized commit coordinator",
      "choose": "The backend lacks qualified conditional creation or high write contention benefits from a commit owner.",
      "trade": ["Coordinator availability and fencing become part of commit correctness; object publication and coordinator receipts need recovery."],
      "assumptions": ["A fenced coordinator is the sole publisher; reservation alone is not a committed table version."],
      "steps": [
        {"label":"Commit request","question":"What must the coordinator validate?","reason":"Submit tableId, base version, read predicates, staged file references and the exact actions to publish.","state":"writer request identity","request":{"tableId":"uuid","transactionId":"uuid","baseVersion":"integer","readPredicates":"typed predicates[]","files":"staged object refs with sha256[]","actions":"add/remove/metadata actions[]"},"response":{"state":"pending|committed|conflict","version":"integer|null"},"kind":"service","invariant":"A commit request carries tableId, baseVersion, read predicates, staged files and the exact actions; the coordinator publishes nothing outside it.","checks":["winner","staging"]},
        {"label":"Coordinator ledger","question":"Who orders table versions?","reason":"Expand commit API with transaction receipts, monotonic table version, publisher epoch and the retained action bytes of each reservation.","state":"table sequence and writer receipts","request":{"tableId":"uuid","expectedVersion":"integer"},"response":{"version":"integer","epoch":"integer"},"kind":"store","invariant":"The ledger assigns versions in sequence under one publisher epoch and keeps each reservation's action bytes and hash until it is committed or aborted.","checks":["mechanism","snapshot"]},
        {"label":"Staging verifier","question":"Can a writer fabricate object references?","reason":"Verify object existence, schema and digest before reserving commit publication.","state":"verified staged refs","request":{"files":"object refs[]","schemaVersion":"integer"},"response":{"valid":"boolean"},"kind":"worker","invariant":"A request whose files are absent or fail their digest is rejected before any version number is consumed.","checks":["staging"]},
        {"label":"OCC validator","question":"Can concurrent writers touch disjoint data?","reason":"Validate against every reserved or committed version after the base version and enforce declared conflict semantics.","state":"read/write set verdict","request":{"readPredicates":"typed predicates","newActions":"actions[]"},"response":{"conflict":"boolean"},"kind":"module","invariant":"Validation covers every reserved or committed version after baseVersion, so two overlapping writers can never both reserve.","checks":["winner","mechanism"]},
        {"label":"Fenced publisher","question":"What if coordinator ownership changes?","reason":"Only the current publisher epoch reserves and writes log records, each under a key unique to its version and transaction; recover pending publication before issuing later versions.","state":"publication epoch and pending record","request":{"epoch":"integer","version":"integer","transactionId":"uuid"},"response":{"published":"boolean"},"kind":"worker","invariant":"Only the current epoch reserves or publishes, and each log object key is unique to its version and transaction, so a stale publisher cannot replace a record.","checks":["winner","mechanism"]},
        {"label":"Committed view","question":"Does a reserved version count?","reason":"Readers expose only the contiguous prefix of committed or aborted (no-op) versions with immutable log hashes.","state":"committed prefix and snapshot","request":{"requestedVersion":"integer"},"response":{"snapshot":"active file refs[]"},"kind":"module","invariant":"Readers see the longest contiguous prefix of committed or aborted no-op versions; a pending reservation hides every later version.","checks":["snapshot","mechanism"]},
        {"label":"Checkpoint builder","question":"How are readers accelerated?","reason":"Create immutable checkpoints with protocol/schema metadata from the committed prefix.","state":"checkpoint digest and version","request":{"version":"integer"},"response":{"checkpointHash":"sha256"},"kind":"worker","invariant":"Checkpoints are built only from the committed prefix and carry its protocol and schema metadata.","checks":["snapshot"]},
        {"label":"Publication reconciler","question":"What happens after a lost acknowledgement?","reason":"Resolve a pending version by transaction identity: confirm its log object, republish the retained same-hash actions, or record an aborted no-op version; never skip or stall a version.","state":"pending publication recovery","request":{"transactionId":"uuid","publisherEpoch":"integer"},"response":{"state":"committed|aborted|pending|conflict"},"kind":"worker","invariant":"A pending version whose log object is missing is republished from retained bytes with the same hash or recorded as an aborted no-op; it never blocks the committed prefix indefinitely.","checks":["retention","mechanism"]},
      ],
      "edges": [
        [["verify","control","n2",2,"verify staged file hashes","request-response"]],
        [["occ","n2","n3",3,"validate snapshot conflict sets","request-response"],["suffix","n3","state",1,"read committed table actions","storage"]],
        [["publish","n3","n4",4,"publish under fenced epoch","request-response"],["record","n4","state",4,"record ordered publication","storage"]],
        [["read","caller","n5",5,"read committed table version","request-response"],["prefix","n5","state",1,"resolve contiguous committed prefix","storage"]],
        [["checkpoint","n6","n5",5,"build checkpoint from committed view","request-response"]],
        [["reconcile","n7","n4",7,"resolve pending publication","request-response"],["receipt","n7","state",1,"read transaction receipt","storage"]],
      ],
      "recovery": "const pending = ledger.find(transactionId);\nif (pending.state !== \"pending\") return pending.receipt;\nassertCurrentPublisherEpoch(epoch);\nconst object = await readLogObject(pending.objectKey);\nif (object?.hash === pending.actionsHash) return markCommitted(pending);\nif (pending.actions && sha256(pending.actions) === pending.actionsHash) { await writeLogObject(pending.objectKey, pending.actions); return markCommitted(pending); }\nawait writeLogObject(pending.objectKey, abortRecord(transactionId)); return markAborted(pending);\n// An aborted no-op version keeps the committed prefix contiguous; a reservation is never a committed snapshot.",
      "errors": "400 actions reference files that are absent or fail their digest; 404 unknown tableId; 409 conflicts with a reserved or committed version after baseVersion; 503 no current publisher epoch",
      "read": {"request":{"tableId":"uuid","version":"integer|latest"},"response":{"version":"committed prefix version","activeFiles":"immutable object refs[]"},"errors":"404 unknown tableId or version beyond the committed prefix; 410 version older than the retained checkpoint"},
      "cases": [
        ["mechanism","Publisher epoch 3; writers A and B overlap from base 4 and C is disjoint; A's log object is never written and D's retained bytes are lost.","Reserve A, B and C, publish C, attempt epoch-2 publication, then reconcile A and D.","B conflicts with A's reservation; epoch 2 is fenced; the prefix stays at 4 until A is republished from retained bytes; D becomes an aborted no-op so version 8 becomes visible.",["r0","r1","r2"],"L044 coordinator serializes fenced reservations and recovers missing log objects"],
        ["winner","Two writers update overlapping predicates from one base version.","Serialize validation/publication through current coordinator epoch.","Select a valid commit or conflict; stale publishers cannot publish under an obsolete epoch.",["r0","r1"]],
        ["snapshot","A version is reserved but its log object is not verified.","Read the latest table snapshot.","Expose only the contiguous committed prefix, excluding the reservation.",["r2"],"L044 coordinator serializes fenced reservations and recovers missing log objects"],
        ["retention","Publication succeeded but its acknowledgement was lost.","Reconcile by transaction identity before retry or garbage collection.","Recover the original receipt and retain every file referenced by live snapshots.",["r0","r2"]],
        ["staging","A request references a file that is absent or whose digest differs from its staged hash.","Submit it to the coordinator.","The request is rejected before reservation and no version number is consumed.",["r0"]],
      ],
      "algorithmOwner": "n3",
      "code": "assertCurrentPublisherEpoch(epoch);\nif (!stagedFilesVerified(tx.files)) return reject(\"unverified-files\");\nconst later = ledger.versionsAfter(tx.baseVersion).filter(v => v.state !== \"aborted\"); // reserved or committed\nif (later.some(v => overlapsReadWrite(tx, v) || incompatibleMetadata(tx, v))) return conflict();\nreturn ledger.reserveNext(tx.id, epoch, encode(tx.actions)); // retains bytes and hash\n// Reservation is not reader-visible; the fenced publisher writes a version/transaction-unique log object.",
    },
  ],
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
        {"label":"DAG planner","question":"Where are stage boundaries?","reason":"Validate acyclicity and coalesce narrow dependencies while separating wide shuffle edges.","state":"DAG and stage identities","request":{"tasks":"task definitions[]","edges":"typed dependencies[]"},"response":{"stages":"stage definitions[]"},"kind":"service","invariant":"A cyclic graph or an edge to an undeclared task is rejected before any stage exists.","checks":["dag"]},
        {"label":"Coordinator state","question":"What survives scheduler loss?","reason":"Expand planner; persist remaining dependencies, task generations, attempt epochs and per-generation selected output receipts.","state":"DAG state and epochs","request":{"jobId":"uuid","taskId":"uuid"},"response":{"state":"blocked|ready|running|done"},"kind":"store","invariant":"Each task's current generation, attempt epochs and per-generation winner persist with the job and survive scheduler loss.","checks":["mechanism","loss"]},
        {"label":"Ready queue","question":"When does a task become runnable?","reason":"Enqueue only when every declared predecessor has a current output receipt.","state":"ready task identities","request":{"taskId":"uuid","remaining":"integer"},"response":{"queued":"boolean"},"kind":"queue","invariant":"A task is enqueued only when every declared parent holds a current receipt; undeclared or repeated receipts never count.","checks":["dag","mechanism"]},
        {"label":"Worker leases","question":"Does heartbeat imply completion?","reason":"Assign tasks under epoch leases and record locality hints without confusing them with correctness authority.","state":"worker lease and task attempt","request":{"workerId":"uuid","attemptEpoch":"integer"},"response":{"leaseUntil":"timestamp"},"kind":"directory","invariant":"A heartbeat only extends a lease; an attempt completes only with an immutable output receipt.","checks":["loss"]},
        {"label":"Shuffle storage","question":"What survives executor death?","reason":"Retain partition blocks separately and enforce bounded spill and backpressure.","state":"block checksums and spill manifests","request":{"partitionId":"string","attempt":"integer"},"response":{"artifactRef":"immutable ref"},"kind":"store","invariant":"Blocks outlive the executor that wrote them, and spill stays within the declared memory budget.","checks":["loss"]},
        {"label":"Attempt selection","question":"Can speculation produce two outputs?","reason":"Launch a bounded speculative attempt and atomically select the first valid successful result per task and generation.","state":"selected attempt ID","request":{"taskId":"uuid","generation":"integer","attemptId":"uuid","artifactHash":"sha256"},"response":{"selected":"boolean"},"kind":"module","invariant":"At most one winner exists per (taskId, generation); an attempt from an older generation is never selected.","checks":["speculation","mechanism"]},
        {"label":"Dependency release","question":"How do children start once?","reason":"Record the selected completion per declared parent and compute readiness from the declared parent set; duplicates and undeclared parents change nothing.","state":"completion receipts per declared parent","request":{"parentId":"uuid","generation":"integer","childId":"uuid"},"response":{"ready":"boolean"},"kind":"module","invariant":"Readiness is computed from the declared parent set; a duplicate or undeclared completion never releases a child.","checks":["speculation","mechanism"]},
        {"label":"Lineage rescheduler","question":"What is recomputed after loss?","reason":"Fence failed attempts, retain valid artifacts, advance the producer generation of each lost artifact and revoke receipts held by unstarted children; cancel losing speculative work.","state":"recovery frontier","request":{"lostWorker":"uuid|null","lostArtifacts":"ref[]"},"response":{"readyTasks":"uuid[]"},"kind":"worker","invariant":"Artifact loss advances its producer's generation so a recomputed attempt can win; CPU loss alone recomputes nothing.","checks":["loss","mechanism"]},
      ],
      "edges": [
        [["ready","control","n2",2,"enqueue satisfied task","request-response"]],
        [["lease","n2","n3",3,"lease task to live worker","request-response"]],
        [["artifact","n3","n4",4,"persist partition artifacts","storage"]],
        [["select","n4","n5",5,"select valid attempt output","request-response"]],
        [["complete","n5","n6",6,"release child dependency","request-response"],["enqueue-child","n6","n2",2,"enqueue newly ready child","request-response"]],
        [["lineage","n7","state",1,"read task lineage","storage"],["retained","n7","n4",4,"verify retained artifacts","storage"],["retry","n7","n2",2,"reschedule missing work","request-response"]],
      ],
      "recovery": "for (const failed of expiredAttemptLeases(now)) fenceAttempt(failed);\nfor (const artifact of missingArtifactManifest()) {\n const task = producerOf(artifact); task.generation++; // the lost winner no longer satisfies readers\n for (const child of unstartedChildren(task)) revokeReceipt(child, task.id);\n enqueueAttempt(task, task.generation);\n}\nfor (const task of tasksWithWinner()) cancelNonWinningAttempts(task, task.generation);\n// CPU heartbeat loss does not delete separately retained shuffle; only selected outputs release children.",
      "errors": "400 cycle or edge to an undeclared task; 413 DAG exceeds the declared task limit",
      "read": {"request":{"jobId":"uuid","taskId":"uuid"},"response":{"state":"blocked|ready|running|done","generation":"integer","winnerAttemptId":"uuid|null"},"errors":"404 unknown jobId or taskId"},
      "cases": [
        ["mechanism","Task T has attempts a and b in generation 0; child C declares parents P1 and P2.","Select a, then b; lose T's artifact and finish the stale b and a recomputed c; deliver P1 twice, an undeclared PX, then P2; revoke and redeliver P1.","a wins generation 0; after the loss the stale b is rejected and c wins generation 1; C becomes ready only when both declared parents hold receipts, and again after P1 is redelivered.",["r0","r2"],"L045 central winner is keyed by generation and readiness by declared parents"],
        ["dag","A task graph contains a cycle or a child lacks one committed parent output.","Compile and schedule.","Reject the cycle and keep the incomplete child blocked.",["r0"]],
        ["speculation","Two attempts finish successfully for one logical task.","Compare-and-set the winner and deliver completion twice.","Publish one selected artifact and record each child prerequisite once.",["r0","r2"],"L045 central winner is keyed by generation and readiness by declared parents"],
        ["loss","A compute worker is lost but shuffle persists; later a block is deleted.","Recover each fault separately.","Reuse retained blocks after CPU loss and recompute only missing artifact lineage in a new generation; bounded spill preserves the declared memory limit.",["r1","r2"]],
      ],
      "algorithmOwner": "n5",
      "code": "if (![...task.declaredParents].every(p => receipts.has(p))) return \"blocked\";\nif (attempt.generation !== task.generation) return \"stale-generation\";\nassert(validArtifact(attempt.artifact));\nreturn compareAndSetWinner([task.id, task.generation], null, attempt.id);\n// Only the selected receipt emits completion; artifact loss advances task.generation so a recomputed attempt can win.",
    },
    {
      "id": "partitioned",
      "title": "Partitioned task actors and durable completion events",
      "choose": "Large DAGs justify sharding task state and ready-frontier ownership.",
      "trade": ["Cross-shard dependency events need deduplication; per-task ownership and job cancellation require fencing."],
      "assumptions": ["Partition-local ordering is sufficient when each child deduplicates predecessor identities."],
      "steps": [
        {"label":"DAG partitioner","question":"Which shard owns a task?","reason":"Validate graph and assign each stable task ID to one owner shard.","state":"DAG hash and ownership map","request":{"dagId":"uuid","tasks":"task ids[]"},"response":{"owners":"task/shard map"},"kind":"service","invariant":"Every task ID maps to exactly one owner shard; a cyclic graph or unknown parent is rejected before any assignment.","checks":["dag"]},
        {"label":"Task actor journal","question":"What can a shard replay?","reason":"Expand partitioner with task transition logs and committed predecessor receipts.","state":"task journal and ownership epoch","request":{"taskId":"uuid","ownerEpoch":"integer"},"response":{"version":"integer"},"kind":"log","invariant":"A shard journal records each task's generation, winner and outbox under the owner epoch that wrote it.","checks":["loss","mechanism"]},
        {"label":"Completion inbox","question":"Can delivery release twice?","reason":"Deduplicate completion event IDs at each child actor, ignore undeclared parents and apply revocations for lost generations before emitting ready state.","state":"child prerequisite set","request":{"childId":"uuid","parentId":"uuid","eventId":"task@generation->child","kind":"complete|revoke"},"response":{"ready":"boolean"},"kind":"store","invariant":"A child applies each completion or revocation event ID once and computes readiness only from its declared parents.","checks":["speculation","mechanism"]},
        {"label":"Shard ready frontier","question":"How are runnable tasks offered?","reason":"Publish ready tasks under owner epoch and lease bounded work to executors.","state":"frontier entries and leases","request":{"taskId":"uuid","epoch":"integer"},"response":{"leaseId":"uuid"},"kind":"queue","invariant":"A task enters the frontier only with every declared predecessor receipt and only under the current owner epoch.","checks":["dag"]},
        {"label":"Artifact exchange","question":"How does shuffle span shards?","reason":"Route typed partition artifacts via checksum manifests with per-partition FIFO/backpressure and spill.","state":"artifact manifests and spill budget","request":{"taskId":"uuid","partitionId":"integer"},"response":{"artifactRef":"immutable ref"},"kind":"store","invariant":"Artifacts are addressed by task, generation and partition with a checksum, and spill stays within the partition budget.","checks":["loss"]},
        {"label":"Commit arbiter","question":"How is a speculative winner chosen?","reason":"Each task owner, under its current epoch, atomically selects one valid artifact receipt per task and generation and emits stable completion identity.","state":"winner receipt and loser attempts","request":{"taskId":"uuid","generation":"integer","attemptId":"uuid","ownerEpoch":"integer"},"response":{"winner":"uuid|null"},"kind":"module","invariant":"Only the current owner epoch arbitrates, and it selects at most one winner per (taskId, generation).","checks":["speculation","mechanism"]},
        {"label":"Completion fan-out","question":"How are downstream shards notified?","reason":"Deliver selected task completion to dependent-owner inboxes through a durable replayable outbox.","state":"completion outbox and delivery offsets","request":{"parentId":"uuid","children":"uuid[]"},"response":{"eventIds":"stable ids[]"},"kind":"worker","invariant":"Completion events carry a stable ID (task, generation, child) and stay in the outbox until delivered.","checks":["speculation","loss"]},
        {"label":"Shard recovery","question":"What happens after owner failover?","reason":"Advance owner epoch, replay journals, resend undelivered outbox events under their original IDs, and reschedule every task whose winning artifact is missing in a new generation.","state":"shard recovery offsets","request":{"shardId":"uuid","previousEpoch":"integer"},"response":{"newEpoch":"integer"},"kind":"worker","invariant":"Failover advances the owner epoch, resends undelivered events unchanged, and reschedules every task whose winning artifact is missing, revoking that generation's completions.","checks":["loss","mechanism"]},
      ],
      "edges": [
        [["inbox","state","n2",2,"replay predecessor receipts","event-stream"]],
        [["ready","n2","n3",3,"publish ready frontier","request-response"]],
        [["exchange","n3","n4",4,"persist typed partition artifact","storage"]],
        [["arbitrate","n4","n5",5,"select owner-fenced winner","request-response"]],
        [["fanout","n5","n6",6,"emit selected completion","request-response"],["deliver","n6","n2",2,"deliver child prerequisite receipt","storage"]],
        [["replay","state","n7",7,"replay task owner journal","event-stream"],["resume","n7","n6",6,"resume completion outbox","request-response"],["frontier","n7","n3",3,"restore ready frontier","request-response"]],
      ],
      "recovery": "const epoch = advanceShardEpoch(shardId);\nfor (const task of replayTaskJournal(shardId)) {\n const winner = task.winners.get(task.generation);\n if (winner && !artifactStore.has(winner.artifact)) {\n  revokeGenerationCompletions(task, task.generation); // cancel undelivered, emit revocations for delivered\n  task.generation++; leaseReadyTask(task, epoch);\n } else if (!winner && allPredecessorReceiptsPresent(task)) leaseReadyTask(task, epoch);\n resendPendingCompletionIds(task.outbox); // original event IDs; child inboxes deduplicate\n}",
      "errors": "400 cycle or unknown parent ID; 409 dagId already bound to a different task set",
      "read": {"request":{"dagId":"uuid","taskId":"uuid"},"response":{"ownerShard":"uuid","ownerEpoch":"integer","generation":"integer","state":"blocked|ready|running|done"},"errors":"404 unknown dagId or taskId; 503 owner shard is failing over"},
      "cases": [
        ["mechanism","Shard epoch 1 owns tasks T1 and T2, both feeding child C on another shard; T1's completion was delivered and T2's is still in the outbox.","Arbitrate from epoch 0, fail over with T1's artifact lost, deliver events twice, then select a recomputed T1 attempt.","Epoch 0 is fenced; failover moves to epoch 2, resends T2's event under its original ID, revokes T1's generation-0 completion and reschedules T1 in generation 1 while T2 is untouched; C counts each event once and is ready only after T1's generation-1 completion.",["r0","r1","r2"],"L045 partitioned owner epoch fences arbitration and failover recomputes lost artifacts"],
        ["dag","Task partitioning receives a cycle or an unknown parent ID.","Validate before assigning owner shards.","Reject the graph without partially releasing a ready frontier.",["r0"]],
        ["speculation","Two attempts and duplicate completion events reach different shards.","Choose a winner under task-owner epoch and apply child inbox transitions.","One immutable receipt wins; each child deduplicates predecessor ID independently.",["r0","r2"]],
        ["loss","A shard owner fails after publishing only part of its completion outbox.","Advance epoch and replay pending events.","Resume stable event identities, fence stale owners and recompute only absent artifact lineage.",["r1","r2"],"L045 partitioned owner epoch fences arbitration and failover recomputes lost artifacts"],
      ],
      "algorithmOwner": "n5",
      "code": "if (ownerEpoch !== shard.epoch) return \"fenced\";\nif (attempt.generation !== task.generation || !validArtifact(attempt.artifact)) return \"rejected\";\nconst winner = compareAndSetWinner([task.id, task.generation], null, attempt.id);\nif (winner === attempt.id) for (const child of task.children) outbox.appendUnique(task.id + \"@\" + task.generation + \"->\" + child);\nreturn winner;",
    },
  ],
});}
module.exports={buildL022,buildL030,buildL044,buildL045};
