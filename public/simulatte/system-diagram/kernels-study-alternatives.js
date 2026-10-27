(function(root,factory){const node=typeof module==='object'&&module.exports;factory(node?require('./kernel-registry.js'):root.SimulatteSystemDiagramKernels,node?require('./study-runtime.js'):root.SimulatteStudyRuntime);})(globalThis,function(registry,S){
 'use strict';
 const {machine,required,copy,answer,station}=S;
 const FILE='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
 const ORIGINAL_VALUES=Object.freeze([1,2,3,4,5,6,7,8]);
 const MAX_VALUE_CHARACTERS=4096,MAX_VALUE_DEPTH=8,MAX_VALUE_NODES=1024;

 machine('flatText',()=>({points:[],copiedCodePoints:0,reads:0}),function(k,c,p){
  if(c.op==='text')return {accepted:true,text:k.points.join(''),length:k.points.length,copiedCodePoints:k.copiedCodePoints};
  const length=k.points.length;required(Number.isInteger(c.index)&&c.index>=0&&c.index<=length);
  if(c.op==='insert'){
   required(typeof c.text==='string'&&c.text.length<=2*p.maxRecords);
   const points=Array.from(c.text);required(length+points.length<=p.maxRecords);
   k.points=[...k.points.slice(0,c.index),...points,...k.points.slice(c.index)];k.copiedCodePoints+=k.points.length;
  }else if(c.op==='delete'){
   required(Number.isInteger(c.length)&&c.length>=0&&c.index+c.length<=length);
   k.points=[...k.points.slice(0,c.index),...k.points.slice(c.index+c.length)];k.copiedCodePoints+=k.points.length;
  }else if(c.op==='read'){
   required(c.index<length);k.reads++;return {accepted:true,char:k.points[c.index],length,copiedCodePoints:k.copiedCodePoints};
  }else throw Error('Unsupported flat text command');
  return {accepted:true,text:k.points.join(''),length:k.points.length,copiedCodePoints:k.copiedCodePoints};
 });

 machine('eagerSequence',()=>({values:[...ORIGINAL_VALUES],transforms:0,visits:0,materializations:0}),function(k,c,p){
  if(c.op==='reset'){k.values=[...ORIGINAL_VALUES];k.transforms=0;return {accepted:true};}
  if(c.op==='map'||c.op==='filter'){
   required(typeof c.value==='number'&&Number.isFinite(c.value));
   if(k.transforms>=p.maxRecords)return {accepted:false,reason:'pipeline capacity'};
   const values=c.op==='map'?k.values.map(value=>value*c.value):k.values.filter(value=>value>=c.value);
   required(values.every(Number.isFinite));k.visits+=k.values.length;k.values=values;k.transforms++;k.materializations++;
   return {accepted:true,queued:0,applied:k.transforms,visits:k.visits,materializations:k.materializations};
  }
  required(c.op==='collect'||c.op==='find');
  if(c.op==='find'){
   required(typeof c.value==='number'&&Number.isFinite(c.value));let found=null;
   for(const value of k.values){k.visits++;if(value===c.value){found=value;break;}}
   return {accepted:true,found,visits:k.visits,materializations:k.materializations};
  }
  return {accepted:true,values:copy(k.values),visits:k.visits,materializations:k.materializations};
 });

 function readCommand(job){const c=job.msg.fields?.command;return c&&c.op==='read'&&Number.isInteger(c.offset)&&Number.isInteger(c.length)&&c.offset>=0&&c.length>=0&&c.offset+c.length<=FILE.length?c:null;}
 function requestFile(ctx,job){
  const c=readCommand(job);if(!c){ctx.reply(job,{ok:false,err:'invalid'});return;}
  if(!c.length||ctx.k.file!==null){ctx.admit(job,1);return;}
  if(ctx.k.pendingOwner&&!ctx.job(ctx.k.pendingOwner))ctx.k.pendingOwner=null;
  if(ctx.k.pendingOwner){
   if(!job.msg.fields.waitingForWholeFile){job.msg.fields.waitingForWholeFile=true;ctx.k.coalesced++;}
   ctx.wake(Math.max(1,ctx.p.serviceMs)/1000,{waiting:job.id});return;
  }
  if(ctx.admit(job,ctx.p.serviceMs))ctx.k.pendingOwner=job.id;
 }
 registry.register({id:'wholeFileCache',station,
  init:()=>({file:null,pendingOwner:null,fetches:0,fetchedBytes:0,hits:0,coalesced:0,reads:0,history:[]}),
  onRequest:requestFile,
  onWake(ctx,wake){const job=ctx.job(wake.waiting);if(job)requestFile(ctx,job);},
  onServed(ctx,job){const c=readCommand(job);if(!c){ctx.reply(job,{ok:false,err:'invalid'});return;}
   if(c.length){if(ctx.k.file===null){ctx.k.file=FILE;ctx.k.fetches++;ctx.k.fetchedBytes+=FILE.length;}else ctx.k.hits++;}
   if(ctx.k.pendingOwner===job.id)ctx.k.pendingOwner=null;ctx.k.reads++;
   if(ctx.k.history.length<ctx.p.maxRecords)ctx.k.history.push({offset:c.offset,length:c.length,fetchedBytes:ctx.k.fetchedBytes,residentBytes:ctx.k.file?.length||0});
   answer(ctx,job,{offset:c.offset,text:c.length?ctx.k.file.slice(c.offset,c.offset+c.length):'',fetches:ctx.k.fetches,hits:ctx.k.hits,coalesced:ctx.k.coalesced,fetchedBytes:ctx.k.fetchedBytes,residentBytes:ctx.k.file?.length||0});
  },
  onFault(ctx,fault,on){if(on&&fault.type==='crash'){ctx.k.pendingOwner=null;if(!ctx.p.durable)ctx.k.file=null;}},
  observe:ctx=>({detail:{Reads:ctx.k.reads,Fetches:ctx.k.fetches,Hits:ctx.k.hits,Coalesced:ctx.k.coalesced,'Fetched bytes':ctx.k.fetchedBytes,'Resident bytes':ctx.k.file?.length||0},records:{cache:ctx.k.file===null?[]:[{bytes:ctx.k.file.length,text:ctx.k.file}],reads:copy(ctx.k.history)}})
 });

 function ring(capacity){return {slots:Array(capacity).fill(null),head:0,count:0};}
 function push(q,value){required(q.count<q.slots.length);q.slots[(q.head+q.count)%q.slots.length]=value;q.count++;}
 function pop(q){if(!q.count)return null;const value=q.slots[q.head];q.slots[q.head]=null;q.head=(q.head+1)%q.slots.length;q.count--;return value;}
 function entries(q){return Array.from({length:q.count},(_,i)=>q.slots[(q.head+i)%q.slots.length]);}
 function remove(q,predicate){let at=-1;for(let i=0;i<q.count;i++)if(predicate(q.slots[(q.head+i)%q.slots.length])){at=i;break;}if(at<0)return null;
  const value=q.slots[(q.head+at)%q.slots.length];for(let i=at;i<q.count-1;i++)q.slots[(q.head+i)%q.slots.length]=q.slots[(q.head+i+1)%q.slots.length];q.slots[(q.head+q.count-1)%q.slots.length]=null;q.count--;return value;
 }
 function boundedJson(value){let remaining=MAX_VALUE_CHARACTERS,nodes=MAX_VALUE_NODES;const ancestors=new Set();
  function visit(row,depth){if(--nodes<0||depth>MAX_VALUE_DEPTH)return false;if(row===null||typeof row==='boolean')return true;if(typeof row==='number')return Number.isFinite(row);if(typeof row==='string'){remaining-=row.length;return remaining>=0;}
   if(!row||typeof row!=='object'||ancestors.has(row))return false;const prototype=Object.getPrototypeOf(row);if(!Array.isArray(row)&&prototype!==Object.prototype&&prototype!==null)return false;
   if(Array.isArray(row)&&Object.keys(row).length!==row.length)return false;
   ancestors.add(row);for(const [key,child]of Object.entries(row)){remaining-=key.length;if(remaining<0||!visit(child,depth+1)){ancestors.delete(row);return false;}}ancestors.delete(row);return true;
  }return visit(value,0)&&JSON.stringify(value).length<=MAX_VALUE_CHARACTERS;
 }
 const identity=value=>typeof value==='string'&&value.length>0&&value.length<=128;
 registry.register({id:'ringQueue',station:null,immutableParams:['capacity','maxRecords'],
  init:ctx=>({items:ring(ctx.p.capacity),producers:ring(ctx.p.maxRecords),consumers:ring(ctx.p.maxRecords),closed:false,put:0,taken:0,timedOut:0,slotWrites:0}),
  onRequest(ctx,job){
   const c=job.msg.fields?.command;if(!c||!['put','take','close','cancel'].includes(c.op)){ctx.reply(job,{ok:false,err:'invalid'});return;}
   if((c.op==='put'&&(!Object.hasOwn(c,'value')||!boundedJson(c.value)))||(c.op==='cancel'&&!identity(c.id))){ctx.reply(job,{ok:false,err:'invalid'});return;}
   const waiterId=c.requestId??c.id??job.id;if(!identity(waiterId)){ctx.reply(job,{ok:false,err:'invalid'});return;}
   const k=ctx.k;
   if(c.op==='close'){
    k.closed=true;for(const list of ['producers','consumers']){let row;while((row=pop(k[list]))!==null){const held=ctx.job(row.jobId);if(held)answer(ctx,held,{accepted:false,reason:'closed'});}}
    answer(ctx,job,{accepted:true,closed:true});return;
   }
   if(c.op==='cancel'){
    for(const list of ['producers','consumers']){const row=remove(k[list],row=>row.id===c.id);if(row){const held=ctx.job(row.jobId);if(held)answer(ctx,held,{accepted:false,reason:'cancelled'});}}
    answer(ctx,job,{accepted:true});return;
   }
   if(c.op==='put'){
    if(k.closed){answer(ctx,job,{accepted:false,reason:'closed'});return;}
    let consumer;while((consumer=pop(k.consumers))!==null){const held=ctx.job(consumer.jobId);if(held){answer(ctx,held,{accepted:true,value:JSON.parse(JSON.stringify(c.value))});k.taken++;k.put++;answer(ctx,job,{accepted:true});return;}}
    if(k.items.count<k.items.slots.length){push(k.items,JSON.parse(JSON.stringify(c.value)));k.slotWrites++;k.put++;answer(ctx,job,{accepted:true,size:k.items.count});return;}
    wait('producers');return;
   }
   if(k.items.count){
    const value=pop(k.items);k.slotWrites++;k.taken++;let producer;
    while((producer=pop(k.producers))!==null){const held=ctx.job(producer.jobId);if(held){push(k.items,producer.value);k.slotWrites++;k.put++;answer(ctx,held,{accepted:true});break;}}
    answer(ctx,job,{accepted:true,value});return;
   }
   if(k.closed)answer(ctx,job,{accepted:false,reason:'closed'});else wait('consumers');
   function wait(list){if(k[list].count>=k[list].slots.length){answer(ctx,job,{accepted:false,reason:'waiter capacity'});return;}
    push(k[list],{id:waiterId,jobId:job.id,...(list==='producers'?{value:JSON.parse(JSON.stringify(c.value))}:{})});ctx.wake(ctx.p.waitTimeoutMs/1000,{list,jobId:job.id});
   }
  },
  onWake(ctx,wake){if(!['producers','consumers'].includes(wake.list))return;const row=remove(ctx.k[wake.list],row=>row.jobId===wake.jobId);if(!row)return;const held=ctx.job(row.jobId);if(held)answer(ctx,held,{accepted:false,reason:'wait timeout'});ctx.k.timedOut++;},
  onFault(ctx,fault,on){if(on&&fault.type==='crash'){ctx.k.producers=ring(ctx.p.maxRecords);ctx.k.consumers=ring(ctx.p.maxRecords);if(!ctx.p.durable)ctx.k.items=ring(ctx.p.capacity);}},
  observe:ctx=>({detail:{Queued:ctx.k.items.count,Producers:ctx.k.producers.count,Consumers:ctx.k.consumers.count,Put:ctx.k.put,Taken:ctx.k.taken,TimedOut:ctx.k.timedOut,'Item slot writes':ctx.k.slotWrites},records:{items:entries(ctx.k.items).map((value,index)=>({index,value:copy(value)})),waiters:copy([...entries(ctx.k.producers),...entries(ctx.k.consumers)])}})
 });
});
