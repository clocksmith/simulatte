(function(root,factory){const node=typeof module==='object'&&module.exports;factory(node?require('./kernel-registry.js'):root.SimulatteSystemDiagramKernels);})(globalThis,function(registry){
 'use strict';
 const copy=v=>structuredClone(v),station={concurrency:'concurrency',queueCapacity:'queueCapacity'};
 registry.register({id:'connectionGateway',station,
  init:()=>({sessions:{},opened:0,expired:0,forwarded:0,sequence:0}),
  onRequest(ctx,job){ctx.admit(job,ctx.p.serviceMs);},
  onServed(ctx,job){const c=job.msg.fields?.messaging;if(!c||typeof c.actor!=='string'){ctx.reply(job,{ok:false,err:'invalid'});return;}const id=JSON.stringify(c.actor),old=ctx.k.sessions[id];
   if(!old&&Object.keys(ctx.k.sessions).length>=ctx.p.maxRecords){ctx.reply(job,{ok:false,err:'rejected'});return;}
   const session={actor:c.actor,expiresAt:ctx.t+ctx.p.idleSec,revision:(old?.revision||0)+1};if(!old)ctx.k.opened++;ctx.k.sessions[id]=session;ctx.wake(ctx.p.idleSec,{id,revision:session.revision});
   for(const edge of ctx.edges('presence'))ctx.send(edge.id,ctx.message({ptype:'json',kb:1,fields:{operation:{action:'heartbeat',index:ctx.k.sequence++,key:c.actor,actor:c.actor,value:1}}}));
   const edge=ctx.edges('backend')[0];if(!edge){ctx.reply(job,{ok:false,err:'unavailable'});return;}ctx.k.forwarded++;ctx.call(job,edge.id,{}, {timeoutMs:ctx.p.callTimeoutMs,retries:0,slot:'backend'});
  },
  onResult(ctx,job,slot,result){ctx.reply(job,{ok:result.ok,...(result.ok?{ptype:result.msg.ptype,kb:result.msg.kb,fields:copy(result.msg.fields)}:{err:result.err||'error'})});},
  onWake(ctx,wake){const row=ctx.k.sessions[wake.id];if(row&&row.revision===wake.revision&&ctx.t>=row.expiresAt){delete ctx.k.sessions[wake.id];ctx.k.expired++;}},
  onFault(ctx,fault,on){if(on&&fault.type==='crash')ctx.k.sessions={};},
  observe:ctx=>({detail:{Sessions:Object.keys(ctx.k.sessions).length,Opened:ctx.k.opened,Expired:ctx.k.expired,Forwarded:ctx.k.forwarded},records:{sessions:copy(Object.values(ctx.k.sessions))}})
 });
 registry.register({id:'pushInbox',station,
  init:()=>({messages:[],duplicates:0}),onRequest(ctx,job){ctx.admit(job,ctx.p.serviceMs);},
  onServed(ctx,job){const row=job.msg.fields?.delivery;if(!row||typeof row.id!=='string'||!Number.isInteger(row.sequence)||typeof row.text!=='string'){ctx.reply(job,{ok:false,err:'invalid'});return;}const old=ctx.k.messages.find(m=>m.id===row.id);if(old){if(old.sequence!==row.sequence||old.text!==row.text){ctx.reply(job,{ok:false,err:'invalid'});return;}ctx.k.duplicates++;}else{if(ctx.k.messages.length>=ctx.p.maxRecords){ctx.reply(job,{ok:false,err:'rejected'});return;}ctx.k.messages.push(copy(row));}ctx.reply(job,{ok:true,ptype:'json',kb:1,fields:{delivered:row.id}});},
  observe:ctx=>({detail:{Messages:ctx.k.messages.length,Duplicates:ctx.k.duplicates},records:{messages:copy(ctx.k.messages)}})
 });
});
