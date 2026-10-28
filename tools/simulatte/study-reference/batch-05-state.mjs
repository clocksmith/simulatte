// Deterministic bounded admission and identity rules, not network or consensus execution.
export function admitJob(jobs,id,hash){if(jobs.has(id)){if(jobs.get(id)!==hash)throw Error('job identity conflict');return false;}jobs.set(id,hash);return true;}
export function eligibleOrigins(origins){return origins.filter(o=>o.complete&&o.healthy&&o.capacity>0).map(o=>o.id);}
export function acceptFence(installed,incoming){return incoming>=installed;}
export function recoverPrefix(snapshotIndex,entries){let index=snapshotIndex;for(const e of entries){if(e.index<=index)continue;if(e.index!==index+1)throw Error('log gap');if(!e.committed)break;index=e.index;}return index;}
export function reserve(remaining,request){if(request.some((n,i)=>!Number.isSafeInteger(n)||n<0||n>remaining[i]))return null;return remaining.map((n,i)=>n-request[i]);}
export function chargeOnce(seen,allocation,epoch,sequence,elapsed){if(elapsed<0)throw Error('negative interval');const key=JSON.stringify([allocation,epoch,sequence]);if(seen.has(key))return 0;seen.add(key);return elapsed;}
