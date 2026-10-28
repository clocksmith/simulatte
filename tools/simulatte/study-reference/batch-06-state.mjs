import {createHash} from 'node:crypto';
export function viewport(total,scrollTop,height,rowHeight,overscan){if(rowHeight<=0||scrollTop<0||height<0||overscan<0)throw Error('invalid viewport');return {start:Math.min(total,Math.max(0,Math.floor(scrollTop/rowHeight)-overscan)),end:Math.min(total,Math.ceil((scrollTop+height)/rowHeight)+overscan)};}

// L033 stream-spool: credit already granted but not yet received is still committed budget.
export class CreditWindow{
 constructor(budget){if(!Number.isSafeInteger(budget)||budget<=0)throw Error('invalid budget');this.budget=budget;this.retained=0;this.outstanding=0;}
 grant(){const amount=Math.max(0,this.budget-this.retained-this.outstanding);this.outstanding+=amount;return amount;}
 receive(bytes){if(!Number.isSafeInteger(bytes)||bytes<0||bytes>this.outstanding)throw Error('chunk exceeds granted credit');this.outstanding-=bytes;this.retained+=bytes;}
 release(bytes){if(!Number.isSafeInteger(bytes)||bytes<0||bytes>this.retained)throw Error('invalid release');this.retained-=bytes;}
 revoke(){const revoked=this.outstanding;this.outstanding=0;return revoked;}
}

// L035: each slice names the whole aligned block to fetch (blockStart, fetchLength clamped at EOF) and the bytes to copy from it.
export function blockPlan(size,offset,length,blockSize){for(const n of [size,offset,length,blockSize])if(!Number.isSafeInteger(n)||n<0)throw Error('invalid range');if(blockSize===0||!Number.isSafeInteger(offset+length))throw Error('invalid range');const end=Math.min(size,offset+length),out=[];for(let at=offset;at<end;){const index=Math.floor(at/blockSize),blockStart=index*blockSize,offsetInBlock=at-blockStart,amount=Math.min(end-at,blockSize-offsetInBlock);out.push({index,blockStart,fetchLength:Math.min(blockSize,size-blockStart),offsetInBlock,length:amount});at+=amount;}return out;}
const blockKey=(revision,index)=>JSON.stringify([revision,index]);
export class BlockCache {
 constructor(budget){this.budget=budget;this.used=0;this.slots=new Map();this.metadataHeld=false;this.resetFreed();}
 // Model of the metadata mutex. Critical sections are synchronous, so no fetch or byte wait can happen while it is held.
 critical(fn){if(this.metadataHeld)throw Error('metadata lock already held');this.metadataHeld=true;try{return fn();}finally{this.metadataHeld=false;}}
 resetFreed(){this.freed=new Promise(resolve=>{this.signalFreed=resolve;});}
 notifyFreed(){const wake=this.signalFreed;this.resetFreed();wake();}
 enter(revision,index,bytes,fetch,pin){
  const key=blockKey(revision,index);
  const {slot,owner}=this.critical(()=>{let slot=this.slots.get(key),owner=false;
   if(!slot){if(bytes>this.budget-this.used)return {};this.used+=bytes;slot={reserved:bytes,ready:false,pins:0};this.slots.set(key,slot);owner=true;}
   if(pin)slot.pins++;return {slot,owner};});
  if(!slot)return {promise:Promise.reject(Error('backpressure'))};
  if(owner)slot.promise=Promise.resolve().then(fetch).then(value=>this.critical(()=>{if(value.byteLength>bytes)throw Error('reservation exceeded');slot.ready=true;slot.value=value;this.used-=bytes-value.byteLength;slot.reserved=value.byteLength;return value;})).catch(e=>{this.critical(()=>{if(this.slots.get(key)===slot){this.slots.delete(key);this.used-=slot.reserved;}});this.notifyFreed();throw e;});
  return {slot,promise:slot.promise};
 }
 block(revision,index,bytes,fetch){return this.enter(revision,index,bytes,fetch,false).promise;}
 // The lease is pinned in the same critical section as lookup/install and returned before publication,
 // so a reader that stops waiting can release it immediately. release is idempotent.
 acquire(revision,index,bytes,fetch){
  const {slot,promise}=this.enter(revision,index,bytes,fetch,true);
  if(!slot)return {promise,release(){}};
  let released=false;
  return {promise,release:()=>{if(released)return;released=true;this.critical(()=>{slot.pins--;});this.notifyFreed();}};
 }
 // When bytes are short: evict unpinned READY blocks under the lock; if still short, wait for a release after leaving the lock,
 // then recheck because another reader may have installed the same block meanwhile.
 async acquireWhenBytesFree(revision,index,bytes,fetch){
  for(;;){
   const wait=this.critical(()=>{
    if(this.slots.has(blockKey(revision,index)))return null;
    for(const [key,s]of this.slots){if(bytes<=this.budget-this.used)break;if(s.ready&&!s.pins){this.slots.delete(key);this.used-=s.reserved;}}
    return bytes<=this.budget-this.used?null:this.freed;});
   if(!wait)return this.acquire(revision,index,bytes,fetch);
   await wait;
  }
 }
 pin(revision,index){const s=this.critical(()=>{const s=this.slots.get(blockKey(revision,index));if(!s?.ready)throw Error('not ready');s.pins++;return s;});return ()=>{this.critical(()=>{if(s.pins<=0)throw Error('double unpin');s.pins--;});this.notifyFreed();};}
 evict(revision,index){const evicted=this.critical(()=>{const key=blockKey(revision,index),s=this.slots.get(key);if(!s?.ready||s.pins)return false;this.slots.delete(key);this.used-=s.reserved;return true;});if(evicted)this.notifyFreed();return evicted;}
}
// Copies a byte range through the cache: whole blocks are fetched at blockStart and only the requested slice is copied.
export async function readRange(cache,fetchBlock,revision,size,offset,length,blockSize){
 const slices=blockPlan(size,offset,length,blockSize),out=new Uint8Array(slices.reduce((n,s)=>n+s.length,0));let at=0;
 for(const s of slices){const lease=cache.acquire(revision,s.index,s.fetchLength,()=>fetchBlock(s.blockStart,s.fetchLength));
  try{const block=await lease.promise;if(block.byteLength!==s.fetchLength)throw Error('partial block');out.set(block.subarray(s.offsetInBlock,s.offsetInBlock+s.length),at);at+=s.length;}finally{lease.release();}}
 return out;
}

export class TtlMap {
 constructor(){this.entries=new Map();this.nextGeneration=0;}
 put(key,value,ttl,now){if(ttl<0||!Number.isSafeInteger(now+ttl))throw Error('invalid ttl');const generation=++this.nextGeneration,entry={value,generation,deadline:now+ttl};if(ttl===0)this.entries.delete(key);else this.entries.set(key,entry);return {...entry};}
 get(key,now){const e=this.entries.get(key);return e&&now<e.deadline?e.value:null;}
 expire(key,record,now){const e=this.entries.get(key);if(e&&e.generation===record.generation&&now>=e.deadline){this.entries.delete(key);return true;}return false;}
}
// L042 heap: map and expiry heap share one exclusive write lock; heap access asserts that the lock is held.
export class HeapTtlCache{
 constructor(clock){this.clock=clock;this.map=new Map();this.heap=[];this.nextGeneration=0;this.writer=false;}
 write(fn){if(this.writer)throw Error('write lock already held');this.writer=true;try{return fn();}finally{this.writer=false;}}
 requireWriter(){if(!this.writer)throw Error('heap access without write lock');}
 heapPush(record){this.requireWriter();const h=this.heap;h.push(record);for(let i=h.length-1;i>0;){const p=(i-1)>>1;if(h[p].deadline<=h[i].deadline)break;[h[p],h[i]]=[h[i],h[p]];i=p;}}
 heapPop(){this.requireWriter();const h=this.heap,top=h[0],last=h.pop();if(h.length){h[0]=last;for(let i=0;;){const l=2*i+1,r=l+1;let m=i;if(l<h.length&&h[l].deadline<h[m].deadline)m=l;if(r<h.length&&h[r].deadline<h[m].deadline)m=r;if(m===i)break;[h[m],h[i]]=[h[i],h[m]];i=m;}}return top;}
 put(key,value,ttl){return this.write(()=>{const now=this.clock();if(!Number.isSafeInteger(ttl)||ttl<0||!Number.isSafeInteger(now+ttl))throw Error('invalid ttl');const generation=++this.nextGeneration;if(ttl===0){this.map.delete(key);return generation;}const deadline=now+ttl;this.map.set(key,{value,deadline,generation});this.heapPush({key,generation,deadline});return generation;});}
 get(key){const e=this.map.get(key);return e&&this.clock()<e.deadline?e.value:null;}
 sweep(budget){if(!Number.isSafeInteger(budget)||budget<1)throw Error('invalid sweep budget');return this.write(()=>{const now=this.clock();let popped=0,removed=0;
  while(popped<budget&&this.heap.length&&this.heap[0].deadline<=now){const r=this.heapPop();popped++;const current=this.map.get(r.key);if(current&&current.generation===r.generation&&now>=current.deadline){this.map.delete(r.key);removed++;}}
  return {popped,removed,backlog:this.heap.filter(r=>r.deadline<=now).length};});}
}
// L042 wheel: validated TTL, ttl=0 schedules nothing, and bucket drains tolerate keys removed since scheduling.
export class WheelTtlCache{
 constructor(slots,tickMs){if(!Number.isSafeInteger(slots)||slots<1||!Number.isSafeInteger(tickMs)||tickMs<1)throw Error('invalid wheel');this.buckets=Array.from({length:slots},()=>[]);this.tickMs=tickMs;this.map=new Map();this.nextGeneration=0;}
 put(key,value,ttl,now){if(!Number.isSafeInteger(ttl)||ttl<0||!Number.isSafeInteger(now+ttl))throw Error('invalid ttl');const generation=++this.nextGeneration;if(ttl===0){this.map.delete(key);return generation;}
  const deadline=now+ttl,tick=Math.ceil(deadline/this.tickMs);this.map.set(key,{value,deadline,generation});this.buckets[tick%this.buckets.length].push({key,generation,deadline,tick});return generation;}
 get(key,now){const e=this.map.get(key);return e&&now<e.deadline?e.value:null;}
 tick(tick,now,budget){const bucket=this.buckets[tick%this.buckets.length];let drained=0,removed=0;
  for(let i=0;i<bucket.length&&drained<budget;){const r=bucket[i];if(r.tick>tick){i++;continue;}bucket.splice(i,1);drained++;const current=this.map.get(r.key);if(current&&current.generation===r.generation&&now>=current.deadline){this.map.delete(r.key);removed++;}}
  return {drained,removed};}
 get scheduled(){return this.buckets.reduce((n,b)=>n+b.length,0);}
}

// L043: a frame is length(4) | sha256(length)(32) | payload | sha256(payload)(32). The header has its own checksum, so a damaged
// length cannot masquerade as a torn tail. An unverifiable frame is a torn tail only when no verifiable frame follows it.
const digest=b=>createHash('sha256').update(b).digest(),HEADER=36,MAX_FRAME=1024*1024;
export function frame(record){const bytes=Buffer.from(JSON.stringify(record)),length=Buffer.alloc(4);length.writeUInt32BE(bytes.length);return Buffer.concat([length,digest(length),bytes,digest(bytes)]);}
function frameAt(wal,at){
 if(wal.length-at<HEADER)return {kind:'torn'};
 const length=wal.subarray(at,at+4);if(!digest(length).equals(wal.subarray(at+4,at+HEADER)))return {kind:'bad',reason:'header checksum mismatch',from:at+1};
 const n=length.readUInt32BE(0);if(n>MAX_FRAME)return {kind:'bad',reason:'invalid frame size',from:at+1,fatal:true};
 if(wal.length-at<HEADER+n+32)return {kind:'torn'};
 const end=at+HEADER+n+32,bytes=wal.subarray(at+HEADER,at+HEADER+n);if(!digest(bytes).equals(wal.subarray(at+HEADER+n,end)))return {kind:'bad',reason:'checksum mismatch',from:end};
 return {kind:'ok',bytes,end};
}
function verifiableFrameFrom(wal,from){for(let p=from;p+HEADER<=wal.length;p++)if(frameAt(wal,p).kind==='ok')return true;return false;}
export function recover(snapshot,wal){const state=new Map(snapshot.entries),seen=new Set(snapshot.commandIds||[]);let last=snapshot.cut,at=0;
 while(at<wal.length){const f=frameAt(wal,at);if(f.kind==='torn')break;
  if(f.kind==='bad'){if(f.fatal||verifiableFrameFrom(wal,f.from))throw Error(f.reason);break;}
  const r=JSON.parse(f.bytes);at=f.end;
  if(r.lsn<=snapshot.cut)continue;if(r.lsn!==last+1)throw Error('LSN gap');last=r.lsn;if(seen.has(r.commandId))continue;seen.add(r.commandId);if(r.operation==='delete')state.delete(r.key);else if(r.operation==='put')state.set(r.key,r.value);else throw Error('invalid operation');
 }return {state,last,commandIds:seen};
}
export function ackEligible(waiterLsn,durableThrough){return waiterLsn<=durableThrough;}
// L043 sync and group: a failed fsync fails every waiter of that batch and the log refuses writes and further fsyncs
// until it is reopened from disk; the failed LSNs are resolved by what recovery finds on disk.
export class GroupCommit{
 constructor(next=1){this.next=next;this.durableThrough=next-1;this.pending=[];this.failed=null;}
 submit(record){if(this.failed)throw Error('log failed; recover from disk before accepting writes');const lsn=this.next++;this.pending.push({lsn,record});return lsn;}
 sync(fsync){if(this.failed)throw Error('log failed; recover from disk instead of retrying fsync');const batch=this.pending.splice(0);if(!batch.length)return {released:[],failed:[]};
  try{fsync(batch.map(w=>w.lsn));}catch(error){this.failed=error;return {released:[],failed:batch.map(w=>w.lsn)};}
  this.durableThrough=batch.at(-1).lsn;return {released:batch.map(w=>w.lsn).filter(lsn=>ackEligible(lsn,this.durableThrough)),failed:[]};}
 static reopen(snapshot,wal){const recovered=recover(snapshot,wal);return {log:new GroupCommit(recovered.last+1),state:recovered.state};}
}
