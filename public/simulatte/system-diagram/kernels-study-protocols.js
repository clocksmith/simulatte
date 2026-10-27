(function(root,factory){const node=typeof module==='object'&&module.exports;factory(node?require('./kernel-registry.js'):root.SimulatteSystemDiagramKernels,node?require('./study-runtime.js'):root.SimulatteStudyRuntime,node?require('./study-commands.js'):root.SimulatteStudyCommands);})(globalThis,function(registry,S,commands){
 'use strict';
 const {copy,answer,station,required,read,put}=S;
 registry.register({id:'studySource',station:null,
  init:()=>({sent:0,completed:0,failed:0,latest:0,displayed:null,stale:0,outcomes:[]}),
  start(ctx){ctx.wake(ctx.p.startSec,{index:0});},
  onWake(ctx,wake){const rows=commands.commands(ctx.p.scenario,ctx.p.variant),i=wake.index;if(i>=rows.length)return;const command=rows[i],msg=ctx.message({ptype:'json',kb:1,idem:ctx.nodeId+':'+i,key:command.key||String(i),fields:{command:{...command,requestId:command.id||'command-'+i}}});
   ctx.k.latest=Math.max(ctx.k.latest,command.sequence||0);ctx.beginRequest(msg);const job=ctx.newJob(msg),edge=ctx.edges('out')[0];ctx.k.sent++;
   if(edge)ctx.call(job,edge.id,{}, {timeoutMs:ctx.p.timeoutMs,retries:ctx.p.retries,backoffMs:50,slot:{index:i,sequence:command.sequence||0}});else{ctx.endRequest(msg,{ok:false,err:'unavailable'});ctx.reply(job,{ok:false,err:'unavailable'});}
   if(i+1<rows.length)ctx.wake(ctx.p.intervalMs/1000,{index:i+1});},
  onResult(ctx,job,slot,result){ctx.k[result.ok?'completed':'failed']++;const fields=copy(result.msg?.fields?.result||{});if(slot.sequence){if(ctx.p.discardStale&&slot.sequence<ctx.k.latest)ctx.k.stale++;else ctx.k.displayed=fields;}
   ctx.k.outcomes.push({index:slot.index,atSec:ctx.t,ok:result.ok,result:fields,error:result.err||null});ctx.endRequest(job.msg,{ok:result.ok,...(result.ok?{}:{err:result.err||'error'})});ctx.reply(job,{ok:result.ok,...(result.ok?{}:{err:result.err||'error'})});},
  observe:ctx=>({detail:{Sent:ctx.k.sent,Completed:ctx.k.completed,Failed:ctx.k.failed,'Ignored stale replies':ctx.k.stale},records:{commands:copy(ctx.k.outcomes),display:ctx.k.displayed?[copy(ctx.k.displayed)]:[]}})
 });
 registry.register({id:'searchIndex',station,
  init:()=>({cache:{},hits:0,misses:0}),
  onRequest(ctx,job){const c=job.msg.fields?.command;if(c?.op!=='query'||typeof c.key!=='string'){ctx.reply(job,{ok:false,err:'invalid'});return;}const row=read(ctx.k.cache,c.key);ctx.admit(job,row&&row.until>ctx.t?1:Math.min(c.delayMs||ctx.p.serviceMs,1000));},
  onServed(ctx,job){const c=job.msg.fields.command;let row=read(ctx.k.cache,c.key);if(row&&row.until>ctx.t)ctx.k.hits++;else{ctx.k.misses++;row={until:ctx.t+ctx.p.ttlSec,result:{query:c.key,matches:['dataset','dataframe','database'].filter(s=>s.startsWith(c.key))}};if(Object.keys(ctx.k.cache).length>=ctx.p.capacity)delete ctx.k.cache[Object.keys(ctx.k.cache)[0]];put(ctx.k.cache,c.key,row);}answer(ctx,job,{...row.result,sequence:c.sequence,hits:ctx.k.hits,misses:ctx.k.misses});},
  observe:ctx=>({detail:{Hits:ctx.k.hits,Misses:ctx.k.misses},records:{keys:Object.keys(ctx.k.cache).map(key=>({key}))}})
 });
 const file='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
 registry.register({id:'blockCache',station,
  init:()=>({blocks:{},pending:{},clock:0,fetches:0,hits:0,coalesced:0}),
  onRequest(ctx,job){const c=job.msg.fields?.command;if(!c||c.op!=='read'||!Number.isInteger(c.offset)||!Number.isInteger(c.length)||c.offset<0||c.length<0||c.offset+c.length>file.length){ctx.reply(job,{ok:false,err:'invalid'});return;}
   const blocks=[];for(let b=Math.floor(c.offset/ctx.p.blockBytes);b<=Math.floor((c.offset+c.length-1)/ctx.p.blockBytes)&&c.length;b++)blocks.push(b);job.msg.fields.blocks=blocks;
   const missing=blocks.filter(b=>!ctx.k.blocks[b]);if(missing.length&&ctx.p.coalesce&&missing.every(b=>ctx.k.pending[b])){ctx.k.coalesced++;ctx.wake(ctx.p.serviceMs/1000,{waiting:job.id});return;}
   if(ctx.admit(job,missing.length?ctx.p.serviceMs:1))for(const b of missing)if(!ctx.k.pending[b])ctx.k.pending[b]=job.id;},
  onWake(ctx,wake){const job=ctx.job(wake.waiting);if(job)registry.get('blockCache').onRequest(ctx,job);},
  onServed(ctx,job){const c=job.msg.fields.command;let content='';for(const b of job.msg.fields.blocks){if(ctx.k.blocks[b])ctx.k.hits++;else{ctx.k.fetches++;if(Object.keys(ctx.k.blocks).length>=ctx.p.capacity){const oldest=Object.keys(ctx.k.blocks).sort((a,b)=>ctx.k.blocks[a].used-ctx.k.blocks[b].used)[0];delete ctx.k.blocks[oldest];}ctx.k.blocks[b]={text:file.slice(b*ctx.p.blockBytes,(b+1)*ctx.p.blockBytes),used:0};}ctx.k.blocks[b].used=++ctx.k.clock;content+=ctx.k.blocks[b].text;if(ctx.k.pending[b]===job.id)delete ctx.k.pending[b];}answer(ctx,job,{offset:c.offset,text:content.slice(c.offset%ctx.p.blockBytes,c.offset%ctx.p.blockBytes+c.length),fetches:ctx.k.fetches,hits:ctx.k.hits,coalesced:ctx.k.coalesced});},
  onFault(ctx,fault,on){if(on&&fault.type==='crash')ctx.k.pending={};},
  observe:ctx=>({detail:{Fetches:ctx.k.fetches,Hits:ctx.k.hits,Coalesced:ctx.k.coalesced},records:{blocks:Object.entries(ctx.k.blocks).map(([id,row])=>({id,...copy(row)}))}})
 });
 registry.register({id:'blockingQueue',station:null,
  init:()=>({items:[],producers:[],consumers:[],closed:false,put:0,taken:0,timedOut:0}),
  onRequest(ctx,job){const c=job.msg.fields?.command;if(!c||!['put','take','close','cancel'].includes(c.op)){ctx.reply(job,{ok:false,err:'invalid'});return;}
   const k=ctx.k;if(c.op==='close'){k.closed=true;for(const row of [...k.producers,...k.consumers]){const held=ctx.job(row.jobId);if(held)answer(ctx,held,{accepted:false,reason:'closed'});}k.producers=[];k.consumers=[];answer(ctx,job,{accepted:true,closed:true});return;}
   if(c.op==='cancel'){for(const list of [k.producers,k.consumers]){const i=list.findIndex(r=>r.id===c.id);if(i>=0){const row=list.splice(i,1)[0],held=ctx.job(row.jobId);if(held)answer(ctx,held,{accepted:false,reason:'cancelled'});}}answer(ctx,job,{accepted:true});return;}
   if(c.op==='put'){if(k.closed){answer(ctx,job,{accepted:false,reason:'closed'});return;}const consumer=k.consumers.shift();if(consumer){const held=ctx.job(consumer.jobId);if(held)answer(ctx,held,{accepted:true,value:c.value});k.taken++;k.put++;answer(ctx,job,{accepted:true});return;}if(k.items.length<ctx.p.capacity){k.items.push(c.value);k.put++;answer(ctx,job,{accepted:true,size:k.items.length});return;}wait('producers');}
   else if(k.items.length){const value=k.items.shift();k.taken++;const producer=k.producers.shift();if(producer){const held=ctx.job(producer.jobId);if(held){k.items.push(producer.value);k.put++;answer(ctx,held,{accepted:true});}}answer(ctx,job,{accepted:true,value});}
   else if(k.closed)answer(ctx,job,{accepted:false,reason:'closed'});else wait('consumers');
   function wait(list){if(k[list].length>=ctx.p.maxRecords){answer(ctx,job,{accepted:false,reason:'waiter capacity'});return;}k[list].push({id:c.requestId,jobId:job.id,value:c.value});ctx.wake(ctx.p.waitTimeoutMs/1000,{list,jobId:job.id});}
  },
  onWake(ctx,wake){const rows=ctx.k[wake.list],i=rows.findIndex(r=>r.jobId===wake.jobId);if(i<0)return;rows.splice(i,1);const job=ctx.job(wake.jobId);if(job)answer(ctx,job,{accepted:false,reason:'wait timeout'});ctx.k.timedOut++;},
  onFault(ctx,fault,on){if(on&&fault.type==='crash'){ctx.k.producers=[];ctx.k.consumers=[];if(!ctx.p.durable)ctx.k.items=[];}},
  observe:ctx=>({detail:{Queued:ctx.k.items.length,Producers:ctx.k.producers.length,Consumers:ctx.k.consumers.length,Put:ctx.k.put,Taken:ctx.k.taken,TimedOut:ctx.k.timedOut},records:{items:ctx.k.items.map((value,index)=>({index,value})),waiters:copy([...ctx.k.producers,...ctx.k.consumers])}})
 });
});
