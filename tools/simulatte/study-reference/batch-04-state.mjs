// Bounded deterministic mechanisms; no database isolation, auth, transport or production claims.
// Signatures are modeled as a boolean verdict; these models make no cryptographic claim.

// L023 shared policy rule: explicit deny on the workspace or project beats any inherited allow; no grant means deny.
export function evaluatePolicy(grants,principal,workspaceId,projectId,action){
 const rows=grants.filter(g=>g.principal===principal&&g.workspaceId===workspaceId&&(g.projectId==='*'||g.projectId===projectId)&&g.actions.includes(action));
 if(rows.some(g=>g.effect==='deny'))return 'deny';
 return rows.some(g=>g.effect==='allow')?'allow':'deny';
}
const commandKey=(workspaceId,principal,commandId)=>workspaceId+'/'+principal+'/'+commandId;
function replay(db,key,requestHash){const prior=db.commands.get(key);if(!prior)return null;return prior.requestHash===requestHash?{...prior.response,status:'replayed'}:{status:'rejected',code:422};}
function commit(db,key,command,extra){
 db.version++;const response={status:'committed',objectVersion:db.version,...extra};
 db.commands.set(key,{requestHash:command.requestHash,response});db.events.push({eventId:command.commandId,objectVersion:db.version});
 return response;
}
// L023 transactional: one transaction looks up the command ID first, then evaluates current policy, then the version.
export function transactionalCommand(db,principal,command){
 const key=commandKey(command.workspaceId,principal,command.commandId),prior=replay(db,key,command.requestHash);
 if(prior)return prior;
 if(evaluatePolicy(db.grants,principal,command.workspaceId,command.projectId,command.action)!=='allow')return {status:'denied',code:403};
 if(command.expectedVersion!==db.version)return {status:'stale',code:409,objectVersion:db.version};
 return commit(db,key,command,{policyVersion:db.policyVersion});
}
// L023 capability: verify key, audience, expiry and scope offline; replay a committed command ID; fence epoch and version online.
export function capabilityCommand(db,token,command,now){
 if(!db.keys.has(token.keyId)||!token.signatureValid)return {status:'denied',code:401,reason:'signature'};
 if(token.audience!==db.audience||command.audience!==db.audience)return {status:'denied',code:401,reason:'audience'};
 if(now>=token.expiresAt)return {status:'denied',code:401,reason:'expired'};
 if(token.workspaceId!==command.workspaceId||token.projectId!==command.projectId||!token.actions.includes(command.action))return {status:'denied',code:403,reason:'scope'};
 const key=commandKey(token.workspaceId,token.principal,command.commandId),prior=replay(db,key,command.requestHash);
 if(prior)return prior;
 if(token.epoch!==db.epochs.get(command.workspaceId))return {status:'denied',code:403,reason:'epoch'};
 if(command.expectedVersion!==db.version)return {status:'stale',code:409,objectVersion:db.version};
 return commit(db,key,command,{epoch:token.epoch});
}

// L024 frontier: an output commit needs the current lease epoch; one output per source/revision/parser keeps its provenance.
export function commitFetch(store,claim,result){
 const lease=store.leases.get(claim.sourceId);
 if(!lease||lease.epoch!==claim.leaseEpoch)return {state:'stale-lease'};
 const key=claim.sourceId+'@'+result.revision+'#'+result.parserVersion,done=claim.runId+'/'+claim.sourceId;
 if(store.outputs.has(key)){store.done.add(done);return {state:'duplicate',provenance:store.outputs.get(key).provenance};}
 for(const r of result.rejected)store.quarantine.push({sourceId:claim.sourceId,revision:result.revision,record:r});
 store.outputs.set(key,{records:[...result.records],provenance:{receiptHash:result.receiptHash,leaseEpoch:claim.leaseEpoch,runId:claim.runId}});store.done.add(done);
 return {state:'committed'};
}
export function reassignLease(store,sourceId){const lease=store.leases.get(sourceId);lease.epoch++;return lease.epoch;}
// L024 manifest: publish only a complete run, by compare-and-swap on the prior active generation, and only forward.
export function publishGeneration(pointer,expectedActive,run,receipts){
 if(new Set(run.expected).size!==run.expected.length)throw Error('duplicate partition');
 if(!run.expected.every(id=>receipts.get(id)==='committed'))return {published:false,reason:'incomplete',active:pointer.active};
 if(pointer.active!==expectedActive)return {published:false,reason:'stale-expected',active:pointer.active};
 if(run.generation<=pointer.active)return {published:false,reason:'not-newer',active:pointer.active};
 pointer.active=run.generation;return {published:true,active:pointer.active};
}

// L028 staged: an event ID is admitted once; a redelivery returns duplicate and different bytes are quarantined.
export function admitEvent(ledger,eventId,payloadHash){
 const prior=ledger.get(eventId);
 if(!prior){ledger.set(eventId,{hash:payloadHash,status:'awaiting-approval'});return {status:'awaiting-approval'};}
 if(prior.hash!==payloadHash)return {status:'quarantined',reason:'event-id-conflict'};
 return {status:'duplicate',prior:prior.status};
}
// An approval binds entity, revision and hash, and only the entity's next revision commits.
export function applyApproval(state,event,approval){
 if(approval.entityId!==event.entityId||approval.revision!==event.revision||approval.hash!==event.hash)return {state,accepted:false};
 if(state.events.has(event.id))return {state,accepted:false};
 if(event.revision!==state.revision+1)return {state,accepted:false};
 return {state:{revision:event.revision,events:new Set([...state.events,event.id])},accepted:true};
}
// L028 entity-log: events and approvals are ordered records in one partition. The reducer keeps both pending in its
// state, applies an event once its bound approval exists and it is the entity's next revision, and advances the offset
// on every record so a missing approval never blocks other entities.
export function createReducer(){return {offset:0,entities:{},pendingEvents:{},pendingApprovals:{}};}
export function reduceRecord(state,record){
 if(record.offset<=state.offset)return state;
 if(record.offset!==state.offset+1)throw Error('offset gap');
 const next=structuredClone(state);next.offset=record.offset;
 const applied=id=>Object.values(next.entities).some(e=>e.applied.includes(id));
 if(record.type==='event'){if(!applied(record.id)&&!next.pendingEvents[record.id])next.pendingEvents[record.id]=record;}
 else if(!applied(record.eventId))next.pendingApprovals[record.eventId]=record;
 for(let progressed=true;progressed;){
  progressed=false;
  for(const [id,e]of Object.entries(next.pendingEvents)){
   const a=next.pendingApprovals[id],entity=next.entities[e.entityId]||{revision:0,applied:[]};
   if(a&&a.entityId===e.entityId&&a.revision===e.revision&&a.hash===e.hash&&e.revision===entity.revision+1){
    next.entities[e.entityId]={revision:e.revision,applied:[...entity.applied,id]};delete next.pendingEvents[id];delete next.pendingApprovals[id];progressed=true;
   }
  }
 }
 return next;
}

// L029 keyed: one row per key/revision. The first value per side is immutable; a different value is a recorded
// conflict that leaves the pair state and its single terminal result unchanged. Redelivery replays the first reply.
export function createPair(deadline){return {left:null,right:null,state:'waiting',missingSide:null,terminal:false,results:[],conflicts:[],replies:{},deadline};}
export function admitSide(pair,{side,value,eventId}){
 if(!['left','right'].includes(side)||!Number.isSafeInteger(value))throw Error('invalid scalar side');
 if(pair.replies[eventId])return {pair,reply:pair.replies[eventId]};
 const next=structuredClone(pair);let reply;
 if(next[side]!==null&&next[side]!==value){next.conflicts.push({side,value,eventId});reply='conflict';}
 else{
  next[side]=value;
  if(next.left!==null&&next.right!==null&&!next.terminal){next.state=next.left===next.right?'matched':'mismatch';next.missingSide=null;next.terminal=true;next.results.push(next.state);}
  reply=next.state;
 }
 next.replies[eventId]=reply;return {pair:next,reply};
}
export function expirePair(pair,now){
 if(pair.terminal||pair.state!=='waiting'||now<pair.deadline)return pair;
 return {...structuredClone(pair),state:'overdue',missingSide:pair.left===null?'left':'right'};
}
// L029 batch join: rows are arrays so repeated deliveries stay visible. Group by key, revision and side; exact repeats
// collapse, distinct values for one side are a conflict, then classify the full outer join.
export function snapshotJoin(leftRows,rightRows){
 const group=rows=>{const m=new Map();for(const r of rows){const k=r.key+'@'+r.revision,s=m.get(k)||new Set();s.add(r.value);m.set(k,s);}return m;};
 const left=group(leftRows),right=group(rightRows),keys=[...new Set([...left.keys(),...right.keys()])].sort();
 return new Map(keys.map(k=>{const l=left.get(k),r=right.get(k);
  return [k,(l&&l.size>1)||(r&&r.size>1)?'conflict':!l?'missing-left':!r?'missing-right':[...l][0]===[...r][0]?'matched':'mismatch'];}));
}
