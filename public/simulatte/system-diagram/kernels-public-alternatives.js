(function(root,factory){const node=typeof module==='object'&&module.exports;const registry=node?require('./kernel-registry.js'):root.SimulatteSystemDiagramKernels;factory(registry,node?require('./protocol-routing.js'):root.SimulatteSystemDiagramProtocolRouting);if(node)module.exports=registry;})(globalThis,function(registry,routing){
 'use strict';
 // Alternative algorithms use the same finite commands; they do not manufacture outcomes.
 const copy=v=>structuredClone(v),size=v=>new TextEncoder().encode(JSON.stringify(v)).byteLength/1000;
 const station={concurrency:'concurrency',queueCapacity:'queueCapacity'};
 function reply(ctx,job,value,err){const fields={apiResult:value};ctx.reply(job,{ok:!err,...(err?{err}:{}),ptype:'json',kb:size(fields),fields});}
 function messaging(ctx,job,value,err){const fields={messagingResult:value};ctx.reply(job,{ok:!err,...(err?{err}:{}),ptype:'json',kb:size(fields),fields});}
 function terminal(node,c,kernel){const links=c.edges.filter(e=>e.from===node.id&&e.fromPort==='out');if(links.length!==1||links.some(e=>e.params.mode!=='sync'||c.nodes.find(n=>n.id===e.to)?.kernel!==kernel))throw Error(node.id+' requires one acknowledged '+kernel+' peer');}
 const api=registry.get('apiPracticeClient');
 registry.register({...api,id:'materializedPageClient',validateTopology(node,c){terminal(node,c,'materializedPages');}});
 registry.register({...api,id:'invoiceOutboxClient',validateTopology(node,c){terminal(node,c,'invoiceOutbox');}});
 registry.register({id:'sharedTenantDatabase',station,
  init:()=>({tenants:{},writes:0,reads:0,rejected:0}),
  onRequest(ctx,job){ctx.admit(job,ctx.p.serviceMs);},
  onServed(ctx,job){
   const edge=job.from&&ctx.edge(job.from.edgeId),tenant=edge&&edge.from===job.from.nodeId&&['tenant-a','tenant-b'].includes(edge.from)?edge.from:null;
   if(!tenant){ctx.k.rejected++;ctx.reply(job,{ok:false,err:'rejected'});return;}
   const k=ctx.k,id=JSON.stringify([tenant,job.msg.key]),idem=JSON.stringify([tenant,job.msg.idem]),signature=JSON.stringify([job.msg.key,job.msg.op,job.msg.ptype,job.msg.kb,job.msg.tokens,job.msg.fields]);
   const row=k.tenants[tenant]||(k.tenants[tenant]={keys:{},identities:{},writes:0,reads:0});
   if(job.msg.op==='read'){row.reads++;k.reads++;ctx.reply(job,{ok:true,fields:{tenant,version:row.keys[id]||0}});return;}
   if(Object.hasOwn(row.identities,idem)){if(row.identities[idem]!==signature){ctx.reply(job,{ok:false,err:'invalid'});return;}}
   else{if(Object.keys(row.identities).length>=ctx.p.maxRecords){ctx.reply(job,{ok:false,err:'rejected'});return;}row.identities[idem]=signature;row.keys[id]=(row.keys[id]||0)+1;row.writes++;k.writes++;ctx.effect(idem,{idempotent:true});}
   ctx.reply(job,{ok:true,fields:{tenant,version:row.keys[id],replicaReceipts:1}});
  },
  observe:ctx=>({detail:{Tenants:Object.keys(ctx.k.tenants).length,Writes:ctx.k.writes,Reads:ctx.k.reads,Rejected:ctx.k.rejected,Model:'Trusted direct source-to-tenant mapping, not authentication; local durable simulation state, not SQL or consensus'},records:{tenants:Object.entries(ctx.k.tenants).map(([tenant,v])=>({tenant,writes:v.writes,reads:v.reads,keys:Object.keys(v.keys).length}))}})
 });
 registry.register({id:'materializedPages',station,immutableParams:['pageSize'],
  init:()=>({rows:Array.from({length:8},(_,i)=>i+1),pages:null,served:[],copied:0,lookups:0,mutations:0}),
  onRequest(ctx,job){ctx.admit(job,ctx.p.serviceMs);},
  onServed(ctx,job){const c=job.msg.fields?.apiCommand,k=ctx.k;
   if(c?.action==='mutate'){k.rows=[0,...k.rows.filter(i=>i!==0&&i!==8)];k.mutations++;reply(ctx,job,{inserted:0,deleted:8});return;}
   if(c?.action!=='page'){reply(ctx,job,{},'invalid');return;}
   let page=0;
   if(c.cursor!==null&&c.cursor!==undefined){try{const token=JSON.parse(c.cursor);if(!token||Object.keys(token).sort().join(',')!=='page,session'||token.session!=='materialized-1'||!Number.isInteger(token.page)||token.page<1||!k.pages||token.page>=k.pages.length)throw Error('cursor');page=token.page;}catch{reply(ctx,job,{reason:'Malformed session page token'},'invalid');return;}}
   if(!k.pages){k.pages=[];for(let i=0;i<k.rows.length;i+=ctx.p.pageSize)k.pages.push(k.rows.slice(i,i+ctx.p.pageSize));k.copied=k.rows.length;}
   k.lookups++;const value={items:copy(k.pages[page]||[]),nextCursor:page+1<k.pages.length?JSON.stringify({session:'materialized-1',page:page+1}):null,scanned:k.copied};if(k.served.length>=ctx.p.maxRecords)k.served.shift();k.served.push(copy(value));reply(ctx,job,value);
  },
  observe:ctx=>({detail:{Rows:ctx.k.rows.length,Pages:ctx.k.served.length,'Copied rows':ctx.k.copied,'Page lookups':ctx.k.lookups},records:{pages:copy(ctx.k.served),rows:ctx.k.rows.map(id=>({id}))}})
 });
 const saved=registry.get('savedSearch');
 registry.register({...saved,id:'digestScanMatcher',init:()=>({...saved.init(),comparisons:0}),
  onServed(ctx,job){const c=job.msg.fields?.messaging,k=ctx.k;
   if(c?.action==='save')return saved.onServed(ctx,job);
   if(c?.action==='list'){
    if(typeof c.id!=='string'||typeof c.title!=='string'||c.title.length>512)return messaging(ctx,job,{},'invalid');
    const id=JSON.stringify(c.id),prior=k.listings[id];if(prior&&prior.title!==c.title)return messaging(ctx,job,{},'invalid');
    if(!prior){if(Object.keys(k.listings).length>=ctx.p.maxRecords)return messaging(ctx,job,{},'rejected');k.listings[id]=copy(c);ctx.effect('listing:'+c.id,{idempotent:true});}else k.duplicates++;
    return messaging(ctx,job,{stored:true,duplicate:Boolean(prior)});
   }
   if(c?.action==='digest'){
    if(!Number.isInteger(c.day)||c.day<1)return messaging(ctx,job,{},'invalid');
    const additions=new Map();for(const listing of Object.values(k.listings))for(const search of Object.values(k.searches)){k.comparisons++;const id=JSON.stringify([search.actor,listing.id]);if(listing.title.toLowerCase().split(/[^a-z]+/).includes(search.term)&&!Object.hasOwn(k.matches,id))additions.set(id,{actor:search.actor,listingId:listing.id,day:null});}
    if(Object.keys(k.matches).length+additions.size>ctx.p.maxRecords)return messaging(ctx,job,{},'rejected');for(const[id,row]of additions)k.matches[id]=row;
   }
   return saved.onServed(ctx,job);
  },
  observe(ctx){const v=saved.observe(ctx);v.detail['Digest scan comparisons']=ctx.k.comparisons;return v;}
 });
 const subscription=registry.get('subscriptionService');
 registry.register({id:'invoiceOutbox',station,
  validateTopology:subscription.validateTopology,
  init:()=>({...subscription.init(),invoices:{},inflight:{},attempts:0,settled:0}),
  onRequest(ctx,job){ctx.admit(job,ctx.p.serviceMs);},
  onServed(ctx,job){const c=job.msg.fields?.apiCommand,k=ctx.k;
   if(c?.action==='read')return reply(ctx,job,{status:k.status,version:k.version,pending:Object.values(k.invoices).filter(r=>!r.settled).length});
   if(c?.action==='reconcile'){const edge=ctx.edges('provider')[0];ctx.call(job,edge.id,{fields:{apiCommand:{action:'query'}}},{timeoutMs:ctx.p.callTimeoutMs,retries:0,slot:'reconcile'});return;}
   if(!c||!['signup','renew','cancel'].includes(c.action)||!Number.isInteger(c.version)||c.version<1||c.version>10000||typeof c.eventId!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(c.eventId))return reply(ctx,job,{},'invalid');
   const id=JSON.stringify(c.eventId),signature=JSON.stringify([c.action,c.version,c.method||null]),old=k.invoices[id];
   if(Object.hasOwn(k.applied,c.eventId)){if(k.applied[c.eventId]!==signature)return reply(ctx,job,{},'invalid');k.duplicates++;return reply(ctx,job,{status:k.status,version:k.version,duplicate:true});}
   if(old){if(old.signature!==signature)return reply(ctx,job,{},'invalid');k.duplicates++;return reply(ctx,job,{accepted:true,status:k.status,version:k.version,duplicate:true});}
   if(c.version<=k.version){k.stale++;return reply(ctx,job,{},'rejected');}
   if(new Set([...Object.keys(k.applied).map(id=>JSON.stringify(id)),...Object.keys(k.invoices)]).size>=ctx.p.maxRecords)return reply(ctx,job,{},'rejected');
   if(c.action==='cancel'){k.status='cancelled';k.version=c.version;k.applied[c.eventId]=signature;return reply(ctx,job,{status:k.status,version:k.version});}
   if(!['card','bank'].includes(c.method))return reply(ctx,job,{},'invalid');
   k.invoices[id]={command:copy(c),signature,attempts:0,settled:false};ctx.wake(ctx.p.dispatchMs/1000,{kind:'invoice',id});reply(ctx,job,{accepted:true,status:'pending',version:k.version});
  },
  onWake(ctx,w){const k=ctx.k,row=k.invoices[w.id];if(w.kind!=='invoice'||!row||row.settled||k.inflight[w.id]||row.attempts>=ctx.p.maxAttempts)return;
   const edge=ctx.edges('provider')[0];row.attempts++;k.attempts++;k.inflight[w.id]=true;
   ctx.call(null,edge.id,ctx.message({ptype:'json',kb:size(row.command),idem:row.command.eventId,fields:{apiCommand:copy(row.command)}}),{timeoutMs:ctx.p.callTimeoutMs,retries:0,slot:{invoice:w.id}});
  },
  onResult(ctx,job,slot,result){const k=ctx.k;if(slot==='reconcile'){const rows=result.msg?.fields?.apiResult?.charges;if(Array.isArray(rows)&&new Set([...Object.keys(k.applied),...Object.values(k.invoices).map(r=>r.command.eventId),...rows.map(r=>r?.eventId)]).size>ctx.p.maxRecords)return reply(ctx,job,{},'rejected');return subscription.onResult(ctx,job,slot,result);}
   const row=k.invoices[slot.invoice];if(!row||row.settled)return;delete k.inflight[slot.invoice];const value=result.msg?.fields?.apiResult,charge=value?.charge,c=row.command;
   if(result.ok&&value?.providerNodeId===ctx.edges('provider')[0]?.to&&charge?.eventId===c.eventId&&charge.action===c.action&&charge.version===c.version&&charge.method===c.method&&charge.amount===10){row.settled=true;k.settled++;if(c.version>k.version){k.status='active';k.version=c.version;k.applied[c.eventId]=row.signature;}}
   else ctx.wake(ctx.p.dispatchMs/1000,{kind:'invoice',id:slot.invoice});
  },
  onFault(ctx,f,on){if(f.type==='crash'&&on)ctx.k.inflight={};if(f.type==='crash'&&!on)for(const id of Object.keys(ctx.k.invoices))ctx.wake(0,{kind:'invoice',id});},
  observe:ctx=>({detail:{Status:ctx.k.status,Version:ctx.k.version,Invoices:Object.keys(ctx.k.invoices).length,Settled:ctx.k.settled,Attempts:ctx.k.attempts,Stale:ctx.k.stale,Duplicates:ctx.k.duplicates},records:{invoices:copy(Object.values(ctx.k.invoices)),applied:Object.keys(ctx.k.applied).map(eventId=>({eventId}))}})
 });
 registry.register({id:'commentScanStore',station,
  init:()=>({comments:{},votes:{},writes:0,duplicates:0,scans:0}),onRequest(ctx,job){ctx.admit(job,ctx.p.serviceMs);},
  onServed(ctx,job){const e=job.msg.fields?.operation,k=ctx.k;if(!e||!['comment','vote','readComments'].includes(e.action)||!Number.isInteger(e.index)||e.index<0||typeof e.key!=='string'||typeof e.actor!=='string'||!Number.isFinite(e.value)){ctx.reply(job,{ok:false,err:'invalid'});return;}
   const id=JSON.stringify(e.key),row=k.comments[id];let fields;
   function score(c){let n=0;for(const vote of Object.values(k.votes)){k.scans++;if(vote.key===c.id)n+=vote.value;}return {...copy(c),score:n};}
   if(e.action==='comment'){if(row){if(row.actor!==e.actor||row.parent!==e.parent){ctx.reply(job,{ok:false,err:'invalid'});return;}k.duplicates++;}else{if(e.parent&&!k.comments[JSON.stringify(e.parent)]||Object.keys(k.comments).length>=ctx.p.maxRecords){ctx.reply(job,{ok:false,err:'rejected'});return;}k.comments[id]={id:e.key,parent:e.parent,actor:e.actor};k.writes++;ctx.effect('comment:'+e.key,{idempotent:true});}fields={comment:score(k.comments[id])};}
   else if(e.action==='vote'){if(!row||![-1,0,1].includes(e.value)){ctx.reply(job,{ok:false,err:'invalid'});return;}const voteId=JSON.stringify([e.key,e.actor]),old=k.votes[voteId];if(!old&&Object.keys(k.votes).length>=ctx.p.maxRecords){ctx.reply(job,{ok:false,err:'rejected'});return;}if(old?.value===e.value)k.duplicates++;else{k.votes[voteId]={key:e.key,actor:e.actor,value:e.value};k.writes++;}fields={comment:score(row)};}
   else fields={comments:Object.values(k.comments).map(score).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id))};
   ctx.reply(job,{ok:true,ptype:'json',kb:size(fields),fields});
  },
  observe:ctx=>({detail:{Comments:Object.keys(ctx.k.comments).length,Votes:Object.keys(ctx.k.votes).length,Writes:ctx.k.writes,'Vote rows inspected':ctx.k.scans},records:{comments:copy(Object.values(ctx.k.comments)),votes:copy(Object.values(ctx.k.votes))}})
 });
 // A single journal owner serializes acknowledged domain commands. Retries reuse stored receipts.
 registry.register({id:'commandJournal',station:null,
  init:()=>({queue:[],active:null,entries:{},committed:0,duplicates:0,rejected:0,sequence:0}),
  onRequest(ctx,job){const k=ctx.k,id=JSON.stringify(job.msg.idem),signature=JSON.stringify([job.msg.ptype,job.msg.op,job.msg.key,job.msg.fields]),old=k.entries[id];
   if(old){if(old.signature!==signature){ctx.reply(job,{ok:false,err:'invalid'});return;}k.duplicates++;if(old.receipt){const r=old.receipt;ctx.reply(job,{ok:r.ok,...(r.ok?{ptype:r.msg.ptype,kb:r.msg.kb,fields:copy(r.msg.fields)}:{err:r.err})});return;}}
   if(k.queue.length+(k.active?1:0)>=ctx.p.capacity){k.rejected++;ctx.reply(job,{ok:false,err:'rejected'});return;}
   if(!old){if(Object.keys(k.entries).length>=ctx.p.maxRecords){ctx.reply(job,{ok:false,err:'rejected'});return;}k.entries[id]={signature,sequence:++k.sequence,receipt:null};}k.queue.push(job.id);ctx.wake(0,{kind:'pump'});
  },
  onWake(ctx,w){const k=ctx.k;if(w.kind!=='pump'||k.active)return;while(k.queue.length){const id=k.queue.shift(),job=ctx.job(id);if(!job)continue;const edge=ctx.edges('authority')[0];if(!edge){ctx.reply(job,{ok:false,err:'unavailable'});continue;}k.active=id;ctx.call(job,edge.id,{}, {timeoutMs:ctx.p.callTimeoutMs,retries:ctx.p.retries,backoffMs:50,slot:'authority'});return;}},
  onResult(ctx,job,slot,result){const k=ctx.k,id=JSON.stringify(job.msg.idem);if(k.entries[id]&&result.ok){k.entries[id].receipt=copy(result);k.committed++;}k.active=null;ctx.reply(job,{ok:result.ok,...(result.ok?{ptype:result.msg.ptype,kb:result.msg.kb,fields:copy(result.msg.fields)}:{err:result.err})});ctx.wake(0,{kind:'pump'});},
  onFault(ctx,f,on){if(f.type==='crash'&&on){ctx.k.queue=[];ctx.k.active=null;}},
  observe:ctx=>({detail:{Committed:ctx.k.committed,Duplicates:ctx.k.duplicates,Queued:ctx.k.queue.length,Rejected:ctx.k.rejected,Entries:Object.keys(ctx.k.entries).length},records:{entries:Object.entries(ctx.k.entries).map(([id,e])=>({id,sequence:e.sequence,settled:Boolean(e.receipt)}))}})
 });
 const presence=registry.get('presenceBroker');
 registry.register({...presence,id:'pollingPresence',
  onServed(ctx,job){const k=ctx.k,e=job.msg.fields?.operation;
   // Reap on demand instead of scheduling an expiry wake or broadcasting every transition.
   for(const row of Object.values(k.users))if(row.status==='active'&&ctx.t>=row.expiresAt){row.status='offline';k.expired++;}
   if(e?.action==='heartbeat'){
    if(typeof e.key!=='string'||typeof e.actor!=='string'||(!Number.isInteger(e.index)||e.index<0)||!Number.isFinite(e.value)){ctx.reply(job,{ok:false,err:'invalid'});return;}
    const id=JSON.stringify(e.key),old=k.users[id];if(!old&&Object.keys(k.users).length>=ctx.p.maxRecords){ctx.reply(job,{ok:false,err:'rejected'});return;}const row={id:e.key,status:'active',expiresAt:ctx.t+ctx.p.ttlSec,revision:(old?.revision||0)+1};k.users[id]=row;const fields={presence:copy(row)};ctx.reply(job,{ok:true,ptype:'json',kb:size(fields),fields});return;
   }
   const facade={...ctx,wake(){},send(){}};presence.onServed(facade,job);
  },onWake(){},
  observe(ctx){const v=presence.observe(ctx);v.detail.Model='Expiry is evaluated during a query; no push delivery is claimed';return v;}
 });
 const ledger=registry.get('eventLedger');
 registry.register({...ledger,id:'batchReconcile',init:()=>({...ledger.init(),batch:[],batches:0,lostBatch:0,batchRejected:0}),
  onServed(ctx,job){ctx.release(job);if(ctx.k.batch.length>=ctx.p.maxRecords){ctx.k.batchRejected++;ctx.reply(job,{ok:false,err:'rejected'});return;}ctx.k.batch.push(job.id);if(ctx.k.batch.length===1)ctx.wake(ctx.p.flushMs/1000,{kind:'flush'});},
  onWake(ctx,w){if(w.kind!=='flush')return;const rows=ctx.k.batch.splice(0);if(rows.length)ctx.k.batches++;for(const id of rows){const job=ctx.job(id);if(job)ledger.onServed(ctx,job);}},
  onFault(ctx,f,on){if(f.type==='crash'&&on){ctx.k.lostBatch+=ctx.k.batch.length;ctx.k.batch=[];}ledger.onFault?.(ctx,f,on);},
  observe(ctx){const v=ledger.observe(ctx);v.detail.Batches=ctx.k.batches;v.detail['Waiting batch records']=ctx.k.batch.length;v.detail['Lost batch records']=ctx.k.lostBatch;v.detail['Batch admission rejections']=ctx.k.batchRejected;return v;}
 });
 const workspace=registry.get('workspaceApplication'),applicationClient=registry.get('applicationClient');
 registry.register({...workspace,id:'directAuditWorkspace',
  validateTopology(node,c){const store=routing.resolveTargets(node,c,'store',{kernels:['workspaceStore'],targetPort:'in',singleTarget:true})[0];
   for(const cache of routing.resolveTargets(node,c,'permissions',{kernels:['permissionCache'],targetPort:'in'})){const target=routing.resolveTargets(cache,c,'store',{kernels:['workspaceStore'],targetPort:'in',singleTarget:true})[0];if(target.id!==store.id)throw Error('Permission and mutation authorities differ');}
   routing.resolveTargets(node,c,'events',{kernels:['workspaceJournal'],targetPort:'in',singleTarget:true});
  },
  onResult(ctx,job,slot,result){if(slot!=='activity')return workspace.onResult(ctx,job,slot,result);const publication=ctx.k.publications[job.id],value=result.msg?.fields?.applicationResult;
   const valid=result.ok&&publication&&value?.recorded===true&&value.eventId===publication.eventId;
   const checked=valid?result:{...result,ok:false,err:result.err||'invalid'};
   workspace.onResult({...ctx,reply(j,r){if(r.fields?.applicationResult?.activity?.state==='queued')r.fields.applicationResult.activity.state='applied';ctx.reply(j,r);}},job,slot,checked);
  },
  observe(ctx){const v=workspace.observe(ctx);v.detail['activity applied']=v.detail['activity queued'];delete v.detail['activity queued'];return v;}
 });
 registry.register({...applicationClient,id:'directAuditClient',validateTopology(node,c){const peers=routing.resolveTargets(node,c,'out',{kernels:['directAuditWorkspace'],targetPort:'in'});const stores=peers.map(peer=>routing.resolveTargets(peer,c,'store',{kernels:['workspaceStore'],targetPort:'in',singleTarget:true})[0].id);if(new Set(stores).size!==1)throw Error('Workspace replicas must share one authority');}});
});
