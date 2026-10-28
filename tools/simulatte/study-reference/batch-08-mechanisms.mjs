// Deterministic bounded transition models. These do not exercise OS mutexes,
// condition-variable implementations, cloud storage or deployed services.
export class QueueTransitions {
 constructor(capacity){if(!Number.isInteger(capacity)||capacity<=0)throw RangeError('capacity');this.capacity=capacity;this.items=[];this.waiters=[];this.closed=false;this.outcomes=new Map();}
 request(id,kind,item){if(this.outcomes.has(id)||this.waiters.some(w=>w.id===id))throw Error('duplicate operation');if(!['put','take'].includes(kind))throw Error('operation');this.waiters.push({id,kind,item});this.wake();return this.outcomes.get(id)||{state:'waiting'};}
 wake(){let changed=true;while(changed){changed=false;for(let i=0;i<this.waiters.length;i++){const w=this.waiters[i];if(w.kind==='put'&&this.closed){this.outcomes.set(w.id,{state:'closed'});}else if(w.kind==='put'&&this.items.length<this.capacity){this.items.push(w.item);this.outcomes.set(w.id,{state:'done'});}else if(w.kind==='take'&&this.items.length){this.outcomes.set(w.id,{state:'done',item:this.items.shift()});}else if(w.kind==='take'&&this.closed){this.outcomes.set(w.id,{state:'closed-empty'});}else continue;this.waiters.splice(i--,1);changed=true;}}if(this.items.length>this.capacity)throw Error('capacity invariant');}
 cancel(id){const i=this.waiters.findIndex(w=>w.id===id);if(i<0)return false;this.waiters.splice(i,1);this.outcomes.set(id,{state:'canceled'});return true;}
 close(){this.closed=true;this.wake();}
}
export class RingCounter {
 constructor(){this.slots=Array.from({length:300},()=>({second:-1,count:0}));this.last=0;this.rollbacks=0;}
 time(raw){if(!Number.isSafeInteger(raw)||raw<0)throw RangeError('time');if(raw<this.last)this.rollbacks++;return this.last=Math.max(raw,this.last);}
 countAt(now){return this.slots.reduce((sum,s)=>sum+(s.second>now-300&&s.second<=now?s.count:0),0);}
 count(raw){const now=this.time(raw);return this.countAt(now);}
 hit(raw,limit=Infinity){const now=this.time(raw),count=this.countAt(now);if(count>=limit)return false;const slot=this.slots[now%300];if(slot.second!==now){slot.second=now;slot.count=0;}if(!Number.isSafeInteger(slot.count+1))throw RangeError('overflow');slot.count++;return true;}
}
export class DequeCounter {
 constructor(){this.buckets=[];this.total=0;this.last=0;this.rollbacks=0;}
 expire(raw){if(!Number.isSafeInteger(raw)||raw<0)throw RangeError('time');if(raw<this.last)this.rollbacks++;const now=this.last=Math.max(raw,this.last);while(this.buckets.length&&this.buckets[0].second<=now-300)this.total-=this.buckets.shift().count;return now;}
 count(raw){this.expire(raw);return this.total;}
 hit(raw,limit=Infinity){const now=this.expire(raw);if(this.total>=limit)return false;if(!Number.isSafeInteger(this.total+1))throw RangeError('overflow');const tail=this.buckets.at(-1);if(tail?.second===now)tail.count++;else this.buckets.push({second:now,count:1});this.total++;return true;}
}
export class FanoutSlots {
 constructor(window){this.window=window;this.sessions=new Map();this.epoch=0;this.receipts=[];}
 open(id){const epoch=++this.epoch;this.sessions.set(id,{epoch,outstanding:new Set()});return epoch;}
 send(id,chunk){const s=this.sessions.get(id);if(!s)return false;if(s.outstanding.has(chunk))return true;if(s.outstanding.size>=this.window){this.receipts.push({id,chunk,state:'rejected-slow'});return false;}s.outstanding.add(chunk);return true;}
 ack(id,epoch,chunk){const s=this.sessions.get(id);return !!s&&s.epoch===epoch&&s.outstanding.delete(chunk);}
 close(id){const s=this.sessions.get(id);if(!s)return [];this.sessions.delete(id);const lost=[...s.outstanding];for(const chunk of lost)this.receipts.push({id,chunk,state:'unacknowledged'});return lost;}
}
export class CoalescedFill {
 constructor(maxFills=4,maxWaiters=8){this.cache=new Map();this.inflight=new Map();this.maxFills=maxFills;this.maxWaiters=maxWaiters;}
 get(key,loader,signal){if(signal?.aborted)return Promise.reject(Error('canceled'));if(this.cache.has(key))return Promise.resolve(this.cache.get(key));let row=this.inflight.get(key);if(!row){if(this.inflight.size>=this.maxFills)return Promise.reject(Error('fill capacity'));row={waiters:0,promise:null};this.inflight.set(key,row);row.promise=Promise.resolve().then(loader).then(bytes=>{this.cache.set(key,bytes);return bytes;}).finally(()=>this.inflight.delete(key));}if(row.waiters>=this.maxWaiters)return Promise.reject(Error('waiter capacity'));row.waiters++;return new Promise((resolve,reject)=>{let done=false;const settle=(fn,value)=>{if(done)return;done=true;row.waiters--;signal?.removeEventListener('abort',abort);fn(value);};const abort=()=>settle(reject,Error('canceled'));signal?.addEventListener('abort',abort,{once:true});row.promise.then(v=>settle(resolve,v),e=>settle(reject,e));});}
}
export class IllustrativeJobs {
 constructor(){this.receipts=new Map();this.jobs=new Map();this.sequence=0;this.outbox=[];}
 submit(owner,key,parametersHash){const identity=JSON.stringify([owner,key]);const prior=this.receipts.get(identity);if(prior){if(prior.parametersHash!==parametersHash)throw Error('intent conflict');return prior.id;}const id='illustrative-'+(++this.sequence);this.jobs.set(id,{id,owner,parametersHash,token:0,status:'accepted',artifactHash:null});this.receipts.set(identity,{id,parametersHash});this.outbox.push(id);return id;}
 claim(id){const job=this.jobs.get(id);if(job.status==='complete')throw Error('already complete');job.token++;job.status='running';return job.token;}
 complete(id,token,artifactHash,actualHash){const job=this.jobs.get(id);if(token!==job.token)throw Error('stale fence');if(artifactHash!==actualHash)throw Error('hash mismatch');job.artifactHash=artifactHash;job.status='complete';return {...job};}
 read(owner,id){const job=this.jobs.get(id);if(job.owner!==owner)throw Error('forbidden');return {...job};}
}
