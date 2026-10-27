(function(root,factory){const node=typeof module==='object'&&module.exports;const r=node?require('./kernel-registry.js'):root.SimulatteSystemDiagramKernels;factory(r);if(node)module.exports=r;})(globalThis,function(registry){
 'use strict';
 const station={concurrency:'concurrency',queueCapacity:'queueCapacity'},copy=v=>structuredClone(v),key=v=>JSON.stringify(v);
 const size=v=>new TextEncoder().encode(JSON.stringify(v)).byteLength/1000;
 function reply(ctx,job,value){ctx.reply(job,{ok:true,ptype:'json',kb:size(value),fields:{messagingResult:value}});}
 function reject(ctx,job,err='invalid'){ctx.count('rejected operations');ctx.reply(job,{ok:false,err});}
 function command(job){return job.msg.fields?.messaging;}
 function trace(scenario){
  if(scenario==='chat')return [
   [0,{action:'send',id:'m1',actor:'alice',recipient:'bob',text:'Hello'}],
   [.5,{action:'send',id:'m1',actor:'alice',recipient:'bob',text:'Hello'}],
   [1,{action:'send',id:'m2',actor:'bob',recipient:'alice',text:'Hi'}],
   [2,{action:'sync',actor:'bob',cursor:0}],
   [3,{action:'send',id:'m3',actor:'alice',recipient:'bob',text:'While disconnected'}],
   [4,{action:'sync',actor:'bob',cursor:1}],
   [6,{action:'sync',actor:'bob',cursor:1}],
   [7,{action:'sync',actor:'outsider',cursor:0}]
  ];
  return [
   [0,{action:'save',id:'s1',actor:'alice',term:'distributed'}],
   [.2,{action:'save',id:'s2',actor:'bob',term:'database'}],
   [1,{action:'list',id:'b1',title:'Distributed Database'}],
   [1.2,{action:'list',id:'b2',title:'Gardening Guide'}],
   [1.4,{action:'list',id:'b3',title:'Distributed Systems'}],
   [1.6,{action:'list',id:'b1',title:'Distributed Database'}],
   [3,{action:'digest',day:1}],
   [5,{action:'digest',day:1}],
   [7,{action:'list',id:'b4',title:'Database Internals'}],
   [8,{action:'digest',day:2}],
   [10,{action:'digest',day:2}]
  ];
 }
 registry.register({id:'messagingSource',station:null,
  immutableParams:['scenario'],
  init:ctx=>({script:trace(ctx.p.scenario),sent:0,completed:0,failed:0,outcomes:[]}),
  start(ctx){ctx.wake(0,{index:0});},
  onWake(ctx,w){const row=ctx.k.script[w.index];if(!row)return;const msg=ctx.message({ptype:'json',kb:size(row[1]),idem:`${ctx.nodeId}:${w.index}`,fields:{messaging:copy(row[1]),synthetic:true}});ctx.beginRequest(msg);const job=ctx.newJob(msg),edge=ctx.edges('out')[0];ctx.k.sent++;if(edge&&ctx.job(job.id))ctx.call(job,edge.id,{}, {timeoutMs:ctx.p.timeoutMs,retries:0,slot:w.index});else{ctx.k.failed++;ctx.endRequest(msg,{ok:false,err:'unavailable'});reject(ctx,job,'unavailable');}const next=ctx.k.script[w.index+1];if(next)ctx.wake(next[0]-row[0],{index:w.index+1});},
  onResult(ctx,job,index,result){ctx.k[result.ok?'completed':'failed']++;ctx.k.outcomes.push({index,atSec:ctx.t,ok:result.ok,...(result.ok?{value:copy(result.msg?.fields?.messagingResult||{})}:{error:result.err})});ctx.endRequest(job.msg,{ok:result.ok,...(result.ok?{}:{err:result.err})});ctx.reply(job,{ok:result.ok,...(result.ok?{}:{err:result.err})});},
  observe:ctx=>({detail:{Sent:ctx.k.sent,Completed:ctx.k.completed,Failed:ctx.k.failed},records:{operations:copy(ctx.k.outcomes)}})
 });
 registry.register({id:'chatMailbox',station,
  init:()=>({messages:[],duplicates:0,syncs:0,denied:0}),
  onRequest(ctx,job){ctx.admit(job,ctx.p.serviceMs);},
  onServed(ctx,job){const c=command(job),k=ctx.k;if(!c||!['send','sync'].includes(c.action))return reject(ctx,job);if(!['alice','bob'].includes(c.actor)){k.denied++;return reject(ctx,job,'rejected');}
   if(c.action==='sync'){if(!Number.isInteger(c.cursor)||c.cursor<0||c.cursor>k.messages.length)return reject(ctx,job);k.syncs++;return reply(ctx,job,{messages:copy(k.messages.filter(m=>m.sequence>c.cursor)),cursor:k.messages.length});}
   if(typeof c.id!=='string'||!c.id||!['alice','bob'].includes(c.recipient)||c.actor===c.recipient||typeof c.text!=='string'||!c.text.length||c.text.length>512)return reject(ctx,job);
   const prior=k.messages.find(m=>m.id===c.id);if(prior){if(prior.actor!==c.actor||prior.recipient!==c.recipient||prior.text!==c.text)return reject(ctx,job);k.duplicates++;return reply(ctx,job,{message:copy(prior),duplicate:true});}
   if(k.messages.length>=ctx.p.maxRecords)return reject(ctx,job,'rejected');const m={...copy(c),sequence:k.messages.length+1,atSec:ctx.t};delete m.action;k.messages.push(m);ctx.effect(c.id,{idempotent:true});for(const edge of ctx.edges('updates'))ctx.send(edge.id,ctx.message({ptype:'json',kb:size(m),fields:{delivery:copy(m)}}));reply(ctx,job,{message:copy(m),duplicate:false});
  },
  observe:ctx=>({detail:{Messages:ctx.k.messages.length,Duplicates:ctx.k.duplicates,Syncs:ctx.k.syncs,Denied:ctx.k.denied},records:{messages:copy(ctx.k.messages)}})
 });
 function sendDigest(ctx,job,route){
  if(route.index>=route.ids.length){delete ctx.k.routes[job.id];return reply(ctx,job,{digests:route.ids.length});}
  const row=ctx.k.digests[route.ids[route.index]],edge=ctx.edges('delivery')[0];if(!edge){delete ctx.k.routes[job.id];return reject(ctx,job,'unavailable');}
  ctx.call(job,edge.id,{ptype:'json',kb:size(row),fields:{messaging:{action:'email',...copy(row)}}},{timeoutMs:ctx.p.callTimeoutMs,retries:ctx.p.retries,backoffMs:ctx.p.retryBackoffMs,slot:'delivery'});
 }
 registry.register({id:'savedSearch',station,
  init:()=>({searches:{},listings:{},matches:{},digests:{},routes:{},duplicates:0}),
  onRequest(ctx,job){ctx.admit(job,ctx.p.serviceMs);},
  onServed(ctx,job){const c=command(job),k=ctx.k;if(!c||!['save','list','digest'].includes(c.action))return reject(ctx,job);
   if(c.action==='save'){if(typeof c.id!=='string'||typeof c.actor!=='string'||typeof c.term!=='string'||!/^[a-z]+$/.test(c.term))return reject(ctx,job);const id=key(c.id),prior=k.searches[id];if(prior){if(prior.actor!==c.actor||prior.term!==c.term)return reject(ctx,job);k.duplicates++;}else{if(Object.keys(k.searches).length>=ctx.p.maxRecords)return reject(ctx,job,'rejected');k.searches[id]=copy(c);}return reply(ctx,job,{saved:true});}
   if(c.action==='list'){if(typeof c.id!=='string'||typeof c.title!=='string'||c.title.length>512)return reject(ctx,job);const id=key(c.id),prior=k.listings[id];if(prior){if(prior.title!==c.title)return reject(ctx,job);k.duplicates++;return reply(ctx,job,{duplicate:true});}const searches=Object.values(k.searches).filter(s=>c.title.toLowerCase().split(/[^a-z]+/).includes(s.term));const additions=searches.filter(s=>!Object.hasOwn(k.matches,key([s.actor,c.id])));if(Object.keys(k.listings).length>=ctx.p.maxRecords||Object.keys(k.matches).length+additions.length>ctx.p.maxRecords)return reject(ctx,job,'rejected');k.listings[id]=copy(c);for(const s of additions)k.matches[key([s.actor,c.id])]={actor:s.actor,listingId:c.id,day:null};ctx.effect(`listing:${c.id}`,{idempotent:true});return reply(ctx,job,{matched:searches.length});}
   if(!Number.isInteger(c.day)||c.day<1)return reject(ctx,job);const pending=Object.values(k.matches).filter(m=>m.day===null);const actors=[...new Set(pending.map(m=>m.actor))].sort();const fresh=actors.filter(actor=>!Object.hasOwn(k.digests,key([actor,c.day])));if(Object.keys(k.digests).length+fresh.length>ctx.p.maxRecords)return reject(ctx,job,'rejected');for(const actor of fresh){const id=key([actor,c.day]),matches=pending.filter(m=>m.actor===actor);k.digests[id]={id,actor,day:c.day,listingIds:matches.map(m=>m.listingId).sort(),delivered:false};for(const m of matches)m.day=c.day;}
   const ids=Object.keys(k.digests).filter(id=>k.digests[id].day===c.day&&!k.digests[id].delivered).sort();const route={ids,index:0};k.routes[job.id]=route;sendDigest(ctx,job,route);
  },
  onResult(ctx,job,slot,result){const route=ctx.k.routes[job.id];if(!route)return;if(!result.ok){delete ctx.k.routes[job.id];return reject(ctx,job,result.err||'error');}const row=ctx.k.digests[route.ids[route.index]],ack=result.msg?.fields?.messagingResult;if(ack?.accepted!==true||ack.digestId!==row.id){delete ctx.k.routes[job.id];return reject(ctx,job,'invalid');}row.delivered=true;route.index++;sendDigest(ctx,job,route);},
  onFault(ctx,fault,active){if(active&&fault.type==='crash')ctx.k.routes={};},
  observe:ctx=>({detail:{Searches:Object.keys(ctx.k.searches).length,Listings:Object.keys(ctx.k.listings).length,Matches:Object.keys(ctx.k.matches).length,Digests:Object.keys(ctx.k.digests).length,Delivered:Object.values(ctx.k.digests).filter(d=>d.delivered).length},records:{searches:copy(Object.values(ctx.k.searches)),matches:copy(Object.values(ctx.k.matches)),digests:copy(Object.values(ctx.k.digests))}})
 });
 registry.register({id:'digestMailbox',station,
  init:()=>({emails:{},duplicates:0}),onRequest(ctx,job){ctx.admit(job,ctx.p.serviceMs);},
  onServed(ctx,job){const c=command(job),k=ctx.k;if(!c||c.action!=='email'||typeof c.id!=='string'||typeof c.actor!=='string'||!Number.isInteger(c.day)||!Array.isArray(c.listingIds)||!c.listingIds.length||c.listingIds.some(x=>typeof x!=='string'))return reject(ctx,job);const id=key(c.id),old=k.emails[id];const row={id:c.id,actor:c.actor,day:c.day,listingIds:copy(c.listingIds)};if(old){if(JSON.stringify(old)!==JSON.stringify(row))return reject(ctx,job);k.duplicates++;}else{if(Object.keys(k.emails).length>=ctx.p.maxRecords)return reject(ctx,job,'rejected');k.emails[id]=row;ctx.effect(c.id,{idempotent:true});}reply(ctx,job,{accepted:true,digestId:c.id,duplicate:Boolean(old)});},
  observe:ctx=>({detail:{Emails:Object.keys(ctx.k.emails).length,Duplicates:ctx.k.duplicates},records:{emails:copy(Object.values(ctx.k.emails))}})
 });
});
