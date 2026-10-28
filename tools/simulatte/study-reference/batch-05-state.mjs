// Deterministic bounded admission and identity rules, not network or consensus execution.
export function admitJob(jobs,id,hash){if(jobs.has(id)){if(jobs.get(id)!==hash)throw Error('job identity conflict');return false;}jobs.set(id,hash);return true;}
export function eligibleOrigins(origins){return origins.filter(o=>o.complete&&o.healthy&&o.capacity>0).map(o=>o.id);}
export function acceptFence(installed,incoming){return incoming>=installed;}
export function recoverPrefix(snapshotIndex,entries){let index=snapshotIndex;for(const e of entries){if(e.index<=index)continue;if(e.index!==index+1)throw Error('log gap');if(!e.committed)break;index=e.index;}return index;}

// L016 cache-aside: the request receipt commits with the update, so a retry replays the original result.
export function updateOnce(store,requestId,inputHash,expectedVersion,value){
 const prior=store.receipts.get(requestId);
 if(prior){if(prior.inputHash!==inputHash)throw Error('request identity conflict');return {...prior.result,replayed:true};}
 let result;
 if(store.version===expectedVersion){store.version++;store.value=value;result={status:'ok',version:store.version};}
 else result={status:'conflict',version:store.version};
 store.receipts.set(requestId,{inputHash,result});
 return {...result,replayed:false};
}
// L016 cache-aside: a lease claim bumps the epoch; the result commit is one conditional update on that epoch.
export function claimJob(jobs,jobId,now,leaseMs){
 const job=jobs.get(jobId);if(!job||job.state==='done'||job.leaseUntil>now)return null;
 job.leaseEpoch++;job.leaseUntil=now+leaseMs;return job.leaseEpoch;
}
export function commitIfLeaseEpoch(jobs,jobId,epoch,resultHash){
 const job=jobs.get(jobId);
 if(job?.state==='done'&&job.leaseEpoch===epoch&&job.resultHash===resultHash)return 'duplicate';
 if(!job||job.state!=='open'||job.leaseEpoch!==epoch)return 'stale-lease';
 job.state='done';job.resultHash=resultHash;return 'committed';
}

// L019 peer-assisted: CDN fallback stays home only while home is eligible, otherwise fails over to the eligible origin with most capacity.
export function chooseFallbackRegion(home,origins){
 const eligible=new Set(eligibleOrigins(origins));if(eligible.has(home))return home;
 const ranked=origins.filter(o=>eligible.has(o.id)).sort((a,b)=>b.capacity-a.capacity||a.id.localeCompare(b.id));
 return ranked.length?ranked[0].id:null;
}

// L026 fenced-primary: fence check, receipt lookup, append and receipt insert are one storage step.
export class FencedJournal{
 constructor(){this.fence=0;this.entries=[];this.receipts=new Map();}
 install(token){if(!Number.isSafeInteger(token)||token<=this.fence)throw Error('fence must increase');this.fence=token;}
 appendIfFenceAtLeast(token,requestId,inputHash,command){
  if(!acceptFence(this.fence,token))return {status:'fenced',fence:this.fence};
  const prior=this.receipts.get(requestId);
  if(prior){if(prior.inputHash!==inputHash)throw Error('request identity conflict');return {status:'duplicate',lsn:prior.lsn,fence:prior.fence};}
  const lsn=this.entries.length+1;this.entries.push({lsn,fence:token,requestId,command});this.receipts.set(requestId,{lsn,fence:token,inputHash});
  return {status:'appended',lsn,fence:token};
 }
}

// L046: vectors must have identical dimensions; a shorter request is malformed, not a fit.
export function reserve(remaining,request){
 if(!Array.isArray(remaining)||!Array.isArray(request)||remaining.length!==request.length)throw Error('resource vector dimension mismatch');
 if(request.some((n,i)=>!Number.isSafeInteger(n)||n<0||n>remaining[i]))return null;
 return remaining.map((n,i)=>n-request[i]);
}
// L046: usage is charged once per (allocation, fenced epoch, sequence). Sequences are contiguous per open allocation,
// so retained identities are bounded by open allocations times the retention window; settle forgets a released allocation.
export class UsageLedger{
 constructor(window){if(!Number.isSafeInteger(window)||window<1)throw Error('invalid retention window');this.window=window;this.open=new Map();}
 begin(allocation,epoch){const prior=this.open.get(allocation);if(!Number.isSafeInteger(epoch)||(prior&&epoch<=prior.epoch))throw Error('fenced epoch');this.open.set(allocation,{epoch,next:1,recent:new Map()});}
 charge(allocation,epoch,sequence,elapsed){
  if(!Number.isSafeInteger(elapsed)||elapsed<0)throw Error('negative interval');
  if(!Number.isSafeInteger(sequence)||sequence<1)throw Error('invalid sequence');
  const s=this.open.get(allocation);if(!s)throw Error('allocation not open');if(epoch!==s.epoch)throw Error('fenced epoch');
  if(sequence<s.next){const prior=s.recent.get(sequence);if(prior===undefined)throw Error('interval identity outside retention window');if(prior!==elapsed)throw Error('usage identity conflict');return 0;}
  if(sequence>s.next)throw Error('usage sequence gap');
  s.recent.set(sequence,elapsed);s.next++;s.recent.delete(sequence-this.window);return elapsed;
 }
 settle(allocation){this.open.delete(allocation);}
 get retained(){let n=0;for(const s of this.open.values())n+=s.recent.size;return n;}
}
