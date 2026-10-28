// Bounded reference transitions only. No Spark engine, distributed object store or WAL durability test runs here.
// JSON text stands in for a content hash; these models make no cryptographic or durability claim.
const digest=value=>JSON.stringify(value);
export const reducerOf=url=>[...url].reduce((n,c)=>(n*31+c.codePointAt(0))>>>0,0)%3;
export const overlaps=(a=[],b=[])=>a.some(x=>b.includes(x));

// L022: attempts are [{mapId, attemptId, rows}]; selected maps each logical map to one attempt ID.
// Every stored attempt stays present, but only the selected attempt of each logical map contributes.
export function partitionedCounts(attempts,selected,mapIds=[0,1,2]){
 const shuffle=[new Map(),new Map(),new Map()];
 for(const mapId of mapIds){
  const chosen=attempts.filter(a=>a.mapId===mapId&&a.attemptId===selected.get(mapId));
  if(chosen.length!==1)throw Error('map '+mapId+' needs exactly one selected attempt');
  const combined=new Map();for(const url of chosen[0].rows)combined.set(url,(combined.get(url)||0)+1);
  for(const [url,count]of combined){const bucket=shuffle[reducerOf(url)];bucket.set(url,(bucket.get(url)||0)+count);}
 }
 return new Map(shuffle.flatMap(bucket=>[...bucket]));
}
// L022 driver: blocks are [{map, store}] written to external shuffle stores. CPU loss erases no stored block.
export function recoverBlocks(blocks,loss){if(loss.kind==='cpu')return [];return [...new Set(blocks.filter(b=>loss.lostStores.has(b.store)).map(b=>b.map))].sort((a,b)=>a-b);}
// L022 checkpoints: a committed map checkpoint is reusable only for the same inputHash and codeVersion with a valid checksum.
export function planCheckpointReuse(catalogue,job,mapIds=[0,1,2]){
 const reuse=new Map(),run=[];
 for(const mapId of mapIds){
  const hit=catalogue.find(c=>c.mapId===mapId&&c.inputHash===job.inputHash&&c.codeVersion===job.codeVersion&&c.checksumValid);
  if(hit)reuse.set(mapId,hit.selectedAttemptId);else run.push(mapId);
 }
 return {reuse,run};
}

// L030 shared decoding and half-open windows.
export const decode=e=>e.schema===1?e.value:e.schema===2?e.amount:undefined;
export const windowStart=(time,width)=>Math.floor(time/width)*width;
// L030 incremental: open windows own their event-ID sets. An event is late only when its window end is at or below
// the watermark (Spark guide: late data still updates a window until the watermark passes the window end).
export function createIncrementalState(){return {watermark:-Infinity,maxTime:-Infinity,open:new Map(),emitted:new Map(),quarantine:[]};}
export function incrementalStep(state,event,{width,lateness}){
 const value=decode(event);
 if(value===undefined){state.quarantine.push({id:event.id,reason:'schema'});return 'quarantine';}
 const start=windowStart(event.time,width);
 if(start+width<=state.watermark){state.quarantine.push({id:event.id,reason:'late'});return 'quarantine';}
 const win=state.open.get(start)||{sum:0,count:0,ids:new Set()};
 if(win.ids.has(event.id))return 'duplicate';
 win.ids.add(event.id);win.sum+=value;win.count++;state.open.set(start,win);
 state.maxTime=Math.max(state.maxTime,event.time);state.watermark=Math.max(state.watermark,state.maxTime-lateness);
 for(const [s,w]of state.open)if(s+width<=state.watermark){state.emitted.set(s,{sum:w.sum,count:w.count});state.open.delete(s);}
 return 'window';
}
// L030 microbatch: one batch commits deltas, the per-window event-ID index and its receipt together, or nothing.
export function createMicrobatchStore(){return {receipts:new Set(),windows:new Map(),quarantine:[]};}
export function commitMicrobatch(store,batch,width){
 if(store.receipts.has(batch.id))return {state:'already-committed',store};
 const next=structuredClone(store);
 for(const e of batch.events){
  const value=decode(e);
  if(value===undefined){next.quarantine.push({id:e.id,batch:batch.id,reason:'schema'});continue;}
  const start=windowStart(e.time,width);
  if(start+width<=batch.watermark){next.quarantine.push({id:e.id,batch:batch.id,reason:'late'});continue;}
  const win=next.windows.get(start)||{sum:0,count:0,ids:new Set(),final:false};
  if(win.ids.has(e.id))continue;
  win.ids.add(e.id);win.sum+=value;win.count++;next.windows.set(start,win);
 }
 for(const [s,w]of next.windows)if(!w.final&&s+width<=batch.watermark)next.windows.set(s,{sum:w.sum,count:w.count,ids:new Set(),final:true});
 next.receipts.add(batch.id);
 return {state:'committed',store:next};
}

// L044 conditional: the log is a Map(version -> record); createCommit models If-None-Match create-if-absent.
export function createCommit(log,version,record){if(log.has(version))return false;log.set(version,structuredClone(record));return true;}
const suffix=(log,after)=>[...log.keys()].filter(v=>v>after).sort((a,b)=>a-b).map(v=>log.get(v));
export function tryCommit(log,tx){
 const intervening=suffix(log,tx.readVersion);
 if(intervening.some(c=>c.abortTransactionId===tx.id))return {state:'aborted'};
 if(intervening.some(c=>overlaps(tx.reads,c.writes)||overlaps(tx.writes,c.writes)))return {state:'conflict'};
 const next=tx.readVersion+intervening.length+1;
 if(!createCommit(log,next,{txId:tx.id,writes:tx.writes,files:tx.files}))return {state:'retry'};
 return {state:'committed',version:next};
}
// Cleanup claims the next log version with an abort marker before deleting; a slow writer then validates against it.
export function cleanupStaged(log,staged,now,grace){
 const records=[...log.values()];
 if(records.some(c=>c.txId===staged.txId))return {state:'retained'};
 if(!records.some(c=>c.abortTransactionId===staged.txId)){
  if(now-staged.stagedAt<grace)return {state:'retained'};
  if(!createCommit(log,Math.max(...log.keys())+1,{abortTransactionId:staged.txId,writes:[]}))return {state:'retry'};
 }
 return {state:'deleted',files:[...staged.files]};
}

// L044 coordinator: the ledger orders reservations under one publisher epoch and retains each reservation's action bytes.
export function reserveCommit(ledger,tx,epoch){
 if(epoch!==ledger.epoch)return {state:'fenced'};
 const later=ledger.versions.filter(v=>v.version>tx.baseVersion&&v.state!=='aborted');
 if(later.some(v=>overlaps(tx.reads,v.writes)||overlaps(tx.writes,v.writes)))return {state:'conflict'};
 const version=++ledger.head;
 ledger.versions.push({version,txId:tx.id,state:'pending',writes:[...tx.writes],actions:structuredClone(tx.actions),actionsHash:digest(tx.actions),objectKey:'v'+version+'-'+tx.id});
 return {state:'pending',version};
}
export function publishReserved(ledger,objects,version,epoch){
 if(epoch!==ledger.epoch)return {state:'fenced'};
 const entry=ledger.versions.find(v=>v.version===version);
 objects.set(entry.objectKey,{hash:entry.actionsHash,actions:structuredClone(entry.actions)});entry.state='committed';
 return {state:'committed',version};
}
export function recoverPublication(ledger,objects,txId,epoch){
 const entry=ledger.versions.find(v=>v.txId===txId);
 if(!entry)return {state:'unknown'};
 if(entry.state!=='pending')return {state:entry.state,version:entry.version};
 if(epoch!==ledger.epoch)return {state:'fenced'};
 const object=objects.get(entry.objectKey);
 if(object?.hash===entry.actionsHash)entry.state='committed';
 else if(entry.actions&&digest(entry.actions)===entry.actionsHash){objects.set(entry.objectKey,{hash:entry.actionsHash,actions:structuredClone(entry.actions)});entry.state='committed';}
 else {objects.set(entry.objectKey,{hash:digest({abortTransactionId:txId}),actions:[]});entry.state='aborted';}
 return {state:entry.state,version:entry.version};
}
// Readers see the longest contiguous prefix of committed or aborted (no-op) versions; a pending reservation stops it.
export function committedPrefix(ledger){
 let v=ledger.base;
 for(const e of [...ledger.versions].sort((a,b)=>a.version-b.version)){if(e.version!==v+1||e.state==='pending')break;v=e.version;}
 return v;
}

// L045: a task's winner is keyed by (taskId, generation); artifact loss advances the generation.
export function createTask(){return {generation:0,winners:new Map(),artifacts:new Map()};}
export function selectWinner(task,attempt){
 if(attempt.generation!==task.generation)return null;
 if(!task.winners.has(task.generation)){task.winners.set(task.generation,attempt.id);task.artifacts.set(task.generation,attempt.artifact);}
 return task.winners.get(task.generation);
}
export function invalidateOnLoss(task){task.generation++;return task.generation;}
// Readiness is computed from the declared parent set; undeclared or repeated receipts change nothing.
export function createChild(parents){return {parents:new Set(parents),receipts:new Map()};}
export function deliverCompletion(child,parentId,receiptId){
 if(!child.parents.has(parentId))return {accepted:false,ready:isReady(child)};
 child.receipts.set(parentId,receiptId);
 return {accepted:true,ready:isReady(child)};
}
export function revokeCompletion(child,parentId){child.receipts.delete(parentId);return isReady(child);}
export const isReady=child=>[...child.parents].every(p=>child.receipts.has(p));
// L045 partitioned: the owner shard fences arbitration by epoch and keeps completion events in an outbox until delivered.
const completionId=(taskId,generation,child)=>taskId+'@'+generation+'->'+child;
export function arbitrate(shard,taskId,attempt,ownerEpoch){
 if(ownerEpoch!==shard.epoch)return {state:'fenced'};
 const task=shard.tasks.get(taskId),had=task.winners.has(task.generation),winner=selectWinner(task,attempt);
 if(winner===null)return {state:'stale-generation'};
 if(!had)for(const child of task.children)shard.outbox.push({eventId:completionId(taskId,task.generation,child),kind:'complete',parentId:taskId,generation:task.generation,child,delivered:false});
 return {state:'selected',winner};
}
// Failover advances the epoch, reschedules tasks whose winning artifact is missing, cancels their undelivered
// completions, emits revocations for delivered ones, and resends every other pending event under its original ID.
export function recoverShard(shard,artifactStore){
 shard.epoch++;
 const rescheduled=[];
 for(const [taskId,task]of shard.tasks){
  const won=task.winners.has(task.generation);
  if(won&&!artifactStore.has(task.artifacts.get(task.generation))){
   const lost=task.generation;invalidateOnLoss(task);rescheduled.push(taskId);
   for(const e of shard.outbox)if(e.kind==='complete'&&e.parentId===taskId&&e.generation===lost&&!e.delivered)e.cancelled=true;
   for(const child of task.children)shard.outbox.push({eventId:completionId(taskId,lost,child)+':revoke',kind:'revoke',revokes:completionId(taskId,lost,child),parentId:taskId,generation:lost,child,delivered:false});
  }else if(!won&&task.ready)rescheduled.push(taskId);
 }
 return {epoch:shard.epoch,resent:shard.outbox.filter(e=>!e.delivered&&!e.cancelled).map(e=>e.eventId),rescheduled};
}
// A child inbox applies each event ID once, ignores undeclared parents and drops a receipt only for its revoked generation.
export function receiveCompletion(inbox,event){
 if(inbox.seen.has(event.eventId))return {accepted:false,ready:isReady(inbox.child)};
 inbox.seen.add(event.eventId);
 if(event.kind==='revoke'){if(inbox.child.receipts.get(event.parentId)===event.revokes)revokeCompletion(inbox.child,event.parentId);return {accepted:true,ready:isReady(inbox.child)};}
 return deliverCompletion(inbox.child,event.parentId,event.eventId);
}
