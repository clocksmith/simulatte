// Deterministic bounded transition models. These do not exercise OS mutexes,
// condition-variable implementations, cloud storage or deployed services.

// L040 ring-monitor: one lock; wake() re-evaluates every waiter predicate under that lock.
export class QueueTransitions {
 constructor(capacity){if(!Number.isInteger(capacity)||capacity<=0)throw RangeError('capacity');this.capacity=capacity;this.items=[];this.waiters=[];this.closed=false;this.outcomes=new Map();}
 request(id,kind,item){if(this.outcomes.has(id)||this.waiters.some(w=>w.id===id))throw Error('duplicate operation');if(!['put','take'].includes(kind))throw Error('operation');this.waiters.push({id,kind,item});this.wake();return this.outcomes.get(id)||{state:'waiting'};}
 wake(){let changed=true;while(changed){changed=false;for(let i=0;i<this.waiters.length;i++){const w=this.waiters[i];if(w.kind==='put'&&this.closed){this.outcomes.set(w.id,{state:'closed'});}else if(w.kind==='put'&&this.items.length<this.capacity){this.items.push(w.item);this.outcomes.set(w.id,{state:'done'});}else if(w.kind==='take'&&this.items.length){this.outcomes.set(w.id,{state:'done',item:this.items.shift()});}else if(w.kind==='take'&&this.closed){this.outcomes.set(w.id,{state:'closed-empty'});}else continue;this.waiters.splice(i--,1);changed=true;}}if(this.items.length>this.capacity)throw Error('capacity invariant');}
 cancel(id){const i=this.waiters.findIndex(w=>w.id===id);if(i<0)return false;this.waiters.splice(i,1);this.outcomes.set(id,{state:'canceled'});return true;}
 close(){this.closed=true;this.wake();}
}
// L040 generic condition-variable model: signal() moves one waiter to the lock queue. A waiter
// interrupted after it was signaled has absorbed that signal; with passOn it re-tests the
// predicate after reacquiring the lock and signals once more before propagating.
export class SignalingTakers {
 constructor({passOn=true}={}){this.items=[];this.waiting=[];this.signaled=[];this.passOn=passOn;this.outcomes=new Map();}
 take(id){if(this.items.length)this.outcomes.set(id,{state:'done',item:this.items.shift()});else{this.waiting.push(id);this.outcomes.set(id,{state:'waiting'});}return this.outcomes.get(id);}
 put(item){this.items.push(item);this.signal();}
 signal(){const id=this.waiting.shift();if(id!==undefined)this.signaled.push(id);}
 resume(id){const i=this.signaled.indexOf(id);if(i<0)return this.outcomes.get(id);this.signaled.splice(i,1);if(this.items.length)this.outcomes.set(id,{state:'done',item:this.items.shift()});else this.waiting.push(id);return this.outcomes.get(id);}
 interrupt(id){let i=this.waiting.indexOf(id);if(i>=0)this.waiting.splice(i,1);else{i=this.signaled.indexOf(id);if(i<0)return false;this.signaled.splice(i,1);if(this.passOn&&this.items.length)this.signal();}this.outcomes.set(id,{state:'canceled'});return true;}
}
// L040 two-lock-linked: put/take/close transitions that record every lock acquisition and
// signal together with the locks already held.
export class TwoLockQueue {
 constructor(capacity){if(!Number.isInteger(capacity)||capacity<=0)throw RangeError('capacity');this.capacity=capacity;this.items=[];this.count=0;this.closed=false;this.held=[];this.trace=[];}
 acquire(op,lock){this.trace.push({op,acquire:lock,holding:[...this.held]});this.held.push(lock);}
 release(lock){const i=this.held.lastIndexOf(lock);if(i<0)throw Error('release of unheld '+lock);this.held.splice(i,1);}
 signal(op,condition){this.trace.push({op,signal:condition,holding:[...this.held]});}
 put(item){if(item==null)throw TypeError('null item');let old=-1;this.acquire('put','putLock');
  try{if(this.closed)return {state:'closed'};if(this.count===this.capacity)return {state:'full'};this.items.push(item);old=this.count++;if(old+1<this.capacity)this.signal('put','notFull');}finally{this.release('putLock');}
  if(old===0){this.acquire('put','takeLock');try{this.signal('put','notEmpty');}finally{this.release('takeLock');}}return {state:'done'};}
 take(){let old=-1,item;this.acquire('take','takeLock');
  try{if(this.count===0)return {state:this.closed?'closed-empty':'empty'};item=this.items.shift();old=this.count--;if(old>1)this.signal('take','notEmpty');}finally{this.release('takeLock');}
  if(old===this.capacity){this.acquire('take','putLock');try{this.signal('take','notFull');}finally{this.release('putLock');}}return {state:'done',item};}
 close(){this.acquire('close','putLock');try{this.acquire('close','takeLock');try{this.closed=true;this.signal('close','notFull:all');this.signal('close','notEmpty:all');}finally{this.release('takeLock');}}finally{this.release('putLock');}}
}

// L041 clock adapter shared by both counters: nondecreasing seconds; regressions clamp and count.
export class MonotoneClock {
 constructor(){this.last=0;this.rollbacks=0;}
 read(raw){if(raw!==undefined){if(!Number.isSafeInteger(raw)||raw<0)throw RangeError('time');if(raw<this.last)this.rollbacks++;this.last=Math.max(raw,this.last);}return this.last;}
}
const COUNT_LIMIT=2**32-1; // count field of a packed 64-bit {round,count} slot word
// L041 striped-ring: each slot holds one immutable {round,count} value standing for a packed
// 64-bit atomic word. hit loads, proposes and compare-and-sets; getHits takes no lock.
export class CasRingCounter {
 constructor({mode='counter'}={}){if(!['counter','limiter'].includes(mode))throw Error('mode');this.mode=mode;this.clock=new MonotoneClock();this.words=new Array(300).fill(null);this.casFailures=0;this.admission=null;this.beforeCas=null;}
 get rollbacks(){return this.clock.rollbacks;}
 compareAndSet(i,expected,next){if(this.words[i]!==expected){this.casFailures++;return false;}this.words[i]=next;return true;}
 record(now){for(;;){const i=now%300,round=Math.floor(now/300),word=this.words[i],current=word?word.round:-1;
  if(current>round){now=this.clock.read();continue;} // slot already advanced: resample, never move it back
  if(current===round&&word.count>=COUNT_LIMIT)throw RangeError('slot count overflow');
  const next=Object.freeze({round,count:current===round?word.count+1:1}),hook=this.beforeCas;this.beforeCas=null;hook?.();
  if(this.compareAndSet(i,word,next))return now;now=this.clock.read();}}
 hit(raw,sampled){if(this.mode!=='counter')throw Error('limiter keys admit through tryAcquire');this.clock.read(raw);return this.record(sampled??this.clock.read());}
 // Weakly consistent: snapshotTime is the newest second observed; each word is loaded once.
 scan(raw,onSlot){let snapshotTime=this.clock.read(raw);const seen=[];for(let i=0;i<300;i++){onSlot?.(i);const w=this.words[i];seen.push(w);if(w)snapshotTime=Math.max(snapshotTime,w.round*300+i);}
  let count=0;seen.forEach((w,i)=>{if(!w)return;const s=w.round*300+i;if(s>snapshotTime-300&&s<=snapshotTime){count+=w.count;if(!Number.isSafeInteger(count))throw RangeError('sum overflow');}});return {count,snapshotTime};}
 count(raw){return this.scan(raw).count;}
 // Limiter keys: one per-key admission mutex, modeled as a held ticket, spans scan and increment.
 beginAdmission(raw,limit){if(this.mode!=='limiter')throw Error('counter keys do not admit');if(this.admission)return null;const ticket={limit,view:this.scan(raw)};this.admission=ticket;return ticket;}
 finishAdmission(ticket){if(this.admission!==ticket)throw Error('not the admission owner');try{if(ticket.view.count>=ticket.limit)return false;this.record(this.clock.read());return true;}finally{this.admission=null;}}
 tryAcquire(raw,limit){const ticket=this.beginAdmission(raw,limit);if(!ticket)throw Error('admission busy');return this.finishAdmission(ticket);}
}
// L041 timestamp-deque: a key has S stripes picked by calling-thread hash; each stripe owns an
// ascending {second,count} deque under its own mutex (modeled as an owner field).
export class StripedDequeCounter {
 constructor(stripes=4){this.clock=new MonotoneClock();this.stripes=Array.from({length:stripes},()=>({buckets:[],total:0,owner:null}));}
 get rollbacks(){return this.clock.rollbacks;}
 lock(i,owner){const s=this.stripes[i];if(s.owner!==null)return false;s.owner=owner;return true;}
 unlock(i,owner){if(this.stripes[i].owner!==owner)throw Error('unlock by non-owner');this.stripes[i].owner=null;}
 expire(s,now){while(s.buckets.length&&s.buckets[0].second<=now-300)s.total-=s.buckets.shift().count;}
 append(s,now){if(!Number.isSafeInteger(s.total+1))throw RangeError('stripe total overflow');const tail=s.buckets.at(-1);if(tail?.second===now)tail.count++;else s.buckets.push({second:now,count:1});s.total++;}
 stripeOf(thread){return thread%this.stripes.length;}
 beginHit(thread,raw){const i=this.stripeOf(thread);if(!this.lock(i,thread))return null;return {i,thread,now:this.clock.read(raw)};}
 finishHit(t){try{const s=this.stripes[t.i];this.expire(s,t.now);this.append(s,t.now);}finally{this.unlock(t.i,t.thread);}return true;}
 hit(thread,raw){const t=this.beginHit(thread,raw);if(!t)throw Error('stripe busy');return this.finishHit(t);}
 // getHits and tryAcquire hold every stripe in ascending order: one linearizable per-key total.
 withAll(owner,fn){const taken=[];try{for(let i=0;i<this.stripes.length;i++){if(!this.lock(i,owner))throw Error('stripe busy');taken.push(i);}return fn();}finally{for(const i of taken.reverse())this.unlock(i,owner);}}
 total(now){let sum=0;for(const s of this.stripes){this.expire(s,now);sum+=s.total;if(!Number.isSafeInteger(sum))throw RangeError('sum overflow');}return sum;}
 count(raw){return this.withAll('reader',()=>this.total(this.clock.read(raw)));}
 tryAcquire(thread,raw,limit){return this.withAll('admit',()=>{const now=this.clock.read(raw);if(this.total(now)>=limit)return false;this.append(this.stripes[this.stripeOf(thread)],now);return true;});}
}

// L025 push-slots: submit() only enqueues; one worker drains up to maxBatch per modeled GPU call.
export class PushPipeline {
 constructor(capacity,maxBatch,compute){this.capacity=capacity;this.maxBatch=maxBatch;this.compute=compute;this.queue=[];this.receipts=[];this.computeCalls=0;this.computed=new Map();}
 submit(id){if(this.computed.has(id)||this.queue.includes(id))return 'duplicate';if(this.queue.length>=this.capacity){this.receipts.push({id,state:'rejected-compute'});return 'rejected';}this.queue.push(id);return 'queued';}
 workerStep(){const batch=this.queue.splice(0,this.maxBatch);if(!batch.length)return [];this.computeCalls++;const outputs=this.compute(batch);batch.forEach((id,i)=>this.computed.set(id,outputs[i]));return batch;}
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
const contentKey=bytes=>'sha256:'+bytes; // stand-in for a content hash
// L025 pull-cdn: deduplicated bounded admission, immutable manifest versions with explicit gaps,
// reference-counted content keys, and read pins that defer deletion past a floor advance.
export class PullSpool {
 constructor(queueBound){this.queueBound=queueBound;this.queued=new Set();this.states=new Map();this.bytes=new Map();this.refs=new Map();this.pins=new Map();this.versions=[Object.freeze({version:0,floor:0,entries:new Map()})];this.resets=[];}
 get manifest(){return this.versions.at(-1);}
 publish(change){const prior=this.manifest,entries=new Map(prior.entries),floor=change(entries)??prior.floor,next=Object.freeze({version:prior.version+1,floor,entries});this.versions.push(next);return next;}
 admit(seq){const prior=this.states.get(seq);if(prior)return {state:prior,duplicate:true};
  if(this.queued.size>=this.queueBound){this.states.set(seq,'rejected');this.publish(e=>{e.set(seq,Object.freeze({seq,outcome:'rejected'}));});return {state:'rejected'};}
  this.queued.add(seq);this.states.set(seq,'queued');return {state:'queued'};}
 complete(seq,bytes){if(!this.queued.delete(seq))throw Error('not queued');const key=contentKey(bytes);if(!this.bytes.has(key))this.bytes.set(key,bytes);this.refs.set(key,(this.refs.get(key)||0)+1);this.states.set(seq,'committed');return this.publish(e=>{e.set(seq,Object.freeze({seq,outcome:'committed',key}));});}
 prune(floor){const dropped=[],m=this.publish(e=>{for(const [seq,entry]of e)if(seq<floor){e.delete(seq);dropped.push(entry);}return Math.max(floor,this.manifest.floor);});
  for(const entry of dropped)if(entry.key){this.refs.set(entry.key,this.refs.get(entry.key)-1);this.release(entry.key);}return m;}
 release(key){if(!this.refs.get(key)&&!this.pins.get(key)){this.refs.delete(key);this.bytes.delete(key);}}
 read(key){if(!this.bytes.has(key))throw Error('missing bytes '+key);return this.bytes.get(key);}
 async pull(cursor,cdn){const m=this.manifest;
  if(cursor.next<m.floor)return {state:'expired',status:410,floor:m.floor,version:m.version};
  const entry=m.entries.get(cursor.next);if(!entry)return {state:'not-ready',version:m.version};
  if(entry.outcome==='rejected')return {state:'gap',seq:entry.seq,next:entry.seq+1,version:m.version};
  this.pins.set(entry.key,(this.pins.get(entry.key)||0)+1); // same step as the floor check
  try{const bytes=await cdn.get(entry.key,()=>this.read(entry.key));if(contentKey(bytes)!==entry.key)throw Error('hash mismatch');return {state:'available',seq:entry.seq,bytes,next:entry.seq+1,version:m.version};}
  finally{const k=this.pins.get(entry.key)-1;if(k>0)this.pins.set(entry.key,k);else this.pins.delete(entry.key);this.release(entry.key);}}
 reset(cursor){const m=this.manifest,skipped={from:cursor.next,to:m.floor,version:m.version};this.resets.push(skipped);return {next:m.floor,skipped};}
}

// L002 illustrative synchronous reports: receipts keyed by (owner, requestKey) hold the source
// cutoff, a running attempt token and a deadline; the first completion wins.
export class IllustrativeSyncReports {
 constructor(nextCutoff,deadline=30){this.nextCutoff=nextCutoff;this.deadline=deadline;this.receipts=new Map();this.sequence=0;}
 identity(principal,ownerId,key){if(principal!==ownerId)throw Error('forbidden');return JSON.stringify([ownerId,key]);}
 begin(principal,ownerId,key,parametersHash,now){const identity=this.identity(principal,ownerId,key);let r=this.receipts.get(identity);
  if(!r){r={reportId:'illustrative-sync-'+(++this.sequence),ownerId,parametersHash,cutoff:this.nextCutoff(),status:'running',attempt:1,deadline:now+this.deadline,artifactHash:null};this.receipts.set(identity,r);return {action:'render',attempt:1,cutoff:r.cutoff,reportId:r.reportId};}
  if(r.parametersHash!==parametersHash)throw Error('intent conflict');
  if(r.status==='complete')return {action:'return',receipt:{...r}};
  if(r.deadline>now)return {action:'wait',status:'running',reportId:r.reportId};
  r.attempt++;r.deadline=now+this.deadline;return {action:'render',attempt:r.attempt,cutoff:r.cutoff,reportId:r.reportId};}
 complete(principal,ownerId,key,attempt,artifactHash,actualHash){const r=this.receipts.get(this.identity(principal,ownerId,key));if(!r||!Number.isInteger(attempt)||attempt<1||attempt>r.attempt)throw Error('unknown attempt');if(artifactHash!==actualHash)throw Error('hash mismatch');
  if(r.status==='complete')return {won:false,receipt:{...r}};r.status='complete';r.artifactHash=artifactHash;return {won:true,receipt:{...r}};}
}
// L002 illustrative durable jobs: claims require an accepted job or an expired lease.
export class IllustrativeJobs {
 constructor(){this.receipts=new Map();this.jobs=new Map();this.sequence=0;this.outbox=[];}
 submit(owner,key,parametersHash){const identity=JSON.stringify([owner,key]);const prior=this.receipts.get(identity);if(prior){if(prior.parametersHash!==parametersHash)throw Error('intent conflict');return prior.id;}const id='illustrative-'+(++this.sequence);this.jobs.set(id,{id,owner,parametersHash,token:0,status:'accepted',lease:null,artifactHash:null});this.receipts.set(identity,{id,parametersHash});this.outbox.push(id);return id;}
 claim(id,workerId,now,leaseMs=10){const job=this.jobs.get(id);if(!job)throw Error('unknown job');if(job.status==='complete')throw Error('already complete');if(job.status==='running'&&job.lease.deadline>now)throw Error('lease held');job.token++;job.status='running';job.lease={workerId,deadline:now+leaseMs};return job.token;}
 complete(id,token,artifactHash,actualHash){const job=this.jobs.get(id);if(token!==job.token)throw Error('stale fence');if(artifactHash!==actualHash)throw Error('hash mismatch');job.artifactHash=artifactHash;job.status='complete';return {...job};}
 read(owner,id){const job=this.jobs.get(id);if(job.owner!==owner)throw Error('forbidden');return {...job};}
}
