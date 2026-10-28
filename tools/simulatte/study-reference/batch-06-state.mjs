import {createHash} from 'node:crypto';
export function viewport(total,scrollTop,height,rowHeight,overscan){if(rowHeight<=0||scrollTop<0||height<0||overscan<0)throw Error('invalid viewport');return {start:Math.min(total,Math.max(0,Math.floor(scrollTop/rowHeight)-overscan)),end:Math.min(total,Math.ceil((scrollTop+height)/rowHeight)+overscan)};}
export function blockPlan(size,offset,length,blockSize){for(const n of [size,offset,length,blockSize])if(!Number.isSafeInteger(n)||n<0)throw Error('invalid range');if(blockSize===0||!Number.isSafeInteger(offset+length))throw Error('invalid range');const end=Math.min(size,offset+length),out=[];for(let at=offset;at<end;){const index=Math.floor(at/blockSize),base=index*blockSize,amount=Math.min(end-at,blockSize-(at-base));out.push({index,blockOffset:at-base,length:amount});at+=amount;}return out;}
export class BlockCache {
 constructor(budget){this.budget=budget;this.used=0;this.slots=new Map();}
 block(revision,index,bytes,fetch){const key=JSON.stringify([revision,index]);if(this.slots.has(key))return this.slots.get(key).promise;
  if(bytes>this.budget-this.used)return Promise.reject(Error('backpressure'));
  this.used+=bytes;const slot={reserved:bytes,ready:false,pins:0};this.slots.set(key,slot);
  slot.promise=Promise.resolve().then(fetch).then(value=>{if(value.byteLength>bytes)throw Error('reservation exceeded');slot.ready=true;slot.value=value;this.used-=bytes-value.byteLength;slot.reserved=value.byteLength;return value;}).catch(e=>{if(this.slots.get(key)===slot){this.slots.delete(key);this.used-=slot.reserved;}throw e;});return slot.promise;
 }
 pin(revision,index){const s=this.slots.get(JSON.stringify([revision,index]));if(!s?.ready)throw Error('not ready');s.pins++;return ()=>{if(s.pins<=0)throw Error('double unpin');s.pins--;};}
 evict(revision,index){const key=JSON.stringify([revision,index]),s=this.slots.get(key);if(!s?.ready||s.pins)return false;this.slots.delete(key);this.used-=s.reserved;return true;}
}
export class TtlMap {
 constructor(){this.entries=new Map();this.nextGeneration=0;}
 put(key,value,ttl,now){if(ttl<0||!Number.isSafeInteger(now+ttl))throw Error('invalid ttl');const generation=++this.nextGeneration,entry={value,generation,deadline:now+ttl};if(ttl===0)this.entries.delete(key);else this.entries.set(key,entry);return {...entry};}
 get(key,now){const e=this.entries.get(key);return e&&now<e.deadline?e.value:null;}
 expire(key,record,now){const e=this.entries.get(key);if(e&&e.generation===record.generation&&now>=e.deadline){this.entries.delete(key);return true;}return false;}
}
const digest=b=>createHash('sha256').update(b).digest();
export function frame(record){const bytes=Buffer.from(JSON.stringify(record)),head=Buffer.alloc(4);head.writeUInt32BE(bytes.length);return Buffer.concat([head,bytes,digest(bytes)]);}
export function recover(snapshot,wal){const state=new Map(snapshot.entries),seen=new Set(snapshot.commandIds||[]);let last=snapshot.cut,at=0;
 while(at<wal.length){if(wal.length-at<4)break;const len=wal.readUInt32BE(at);if(len>1024*1024)throw Error('invalid frame size');if(wal.length-at<4+len+32)break;
  const bytes=wal.subarray(at+4,at+4+len),hash=wal.subarray(at+4+len,at+4+len+32);if(!digest(bytes).equals(hash))throw Error('checksum mismatch');const r=JSON.parse(bytes);at+=4+len+32;
  if(r.lsn<=snapshot.cut)continue;if(r.lsn!==last+1)throw Error('LSN gap');last=r.lsn;if(seen.has(r.commandId))continue;seen.add(r.commandId);if(r.operation==='delete')state.delete(r.key);else if(r.operation==='put')state.set(r.key,r.value);else throw Error('invalid operation');
 }return {state,last,commandIds:seen};
}
export function ackEligible(waiterLsn,durableThrough){return waiterLsn<=durableThrough;}
