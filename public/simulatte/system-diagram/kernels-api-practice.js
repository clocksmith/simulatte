(function(root,factory){const node=typeof module==='object'&&module.exports;
  const registry=node?require('./kernel-registry.js'):root.SimulatteSystemDiagramKernels;
  factory(registry);
  if(node)module.exports=registry;
  })(globalThis,function(registry){
 'use strict';

 const clone=v=>JSON.parse(JSON.stringify(v)),STATION={concurrency:'concurrency',queueCapacity:'queueCapacity'};

 const fingerprint=c=>JSON.stringify([c.action,c.version,c.method||null]);

 const validCharge=c=>c&&typeof c==='object'&&!Array.isArray(c)&&typeof c.eventId==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(c.eventId)&&['signup','renew'].includes(c.action)&&['card','bank'].includes(c.method)&&Number.isInteger(c.version)&&c.version>0&&c.version<=10000&&c.amount===10;
 const nextCommand=ctx=>{ctx.k.index++;if(ctx.k.index<traces[ctx.p.scenario].length)ctx.wake(ctx.p.intervalMs/1000,{});};
 const providerId=ctx=>ctx.edges('provider')[0]?.to;
 const size=v=>new TextEncoder().encode(JSON.stringify(v)).byteLength/1000;

 function reply(ctx,job,value,err){const fields={apiResult:value};
  ctx.reply(job,{ok:!err,...(err?{err}:{}),ptype:'json',kb:size(fields),fields});
  }
 function send(ctx,job,port,command,slot){const edge=ctx.edges(port)[0];
  if(!edge){reply(ctx,job,{reason:'Missing dependency'},'unavailable');
  return;
  }const fields={apiCommand:command};
  ctx.call(job,edge.id,{ptype:'json',kb:size(fields),fields},{timeoutMs:ctx.p.callTimeoutMs||ctx.p.timeoutMs,retries:ctx.p.retries,backoffMs:ctx.p.retryBackoffMs,slot});
  }
 const traces={pagination:[{action:'page'},{action:'mutate'},{action:'page'},{action:'page'},{action:'page',cursor:'invalid'}],subscriptions:[{action:'signup',eventId:'signup-1',version:1,method:'card'},{action:'signup',eventId:'signup-1',version:1,method:'card'},{action:'renew',eventId:'renew-2',version:2,method:'bank'},{action:'reconcile',eventId:'reconcile-2'},{action:'cancel',eventId:'cancel-3',version:3},{action:'renew',eventId:'stale-2',version:2,method:'card'},{action:'read',eventId:'read-4'}]};

 registry.register({id:'apiPracticeClient',station:null,validateTopology(node,c){const edges=c.edges.filter(e=>e.from===node.id&&e.fromPort==='out');
  const expected=node.params.scenario==='pagination'?'paginationStore':'subscriptionService';
  if(edges.length!==1||c.nodes.find(n=>n.id===edges[0].to)?.kernel!==expected)throw Error(`${node.id} requires one ${expected} destination`);
  },immutableParams:['scenario'],init:()=>({index:0,cursor:null,exhausted:false,skipped:0,results:[],completed:0,failed:0}),start:ctx=>ctx.wake(ctx.p.startSec,{}),onWake(ctx){const command=clone(traces[ctx.p.scenario][ctx.k.index]);
  if(command.action==='page'&&!Object.hasOwn(command,'cursor')){if(ctx.k.exhausted){ctx.k.skipped++;nextCommand(ctx);return;}command.cursor=ctx.k.cursor;}
  command.commandId=`command-${ctx.k.index}`;
  const fields={apiCommand:command},msg=ctx.message({ptype:'json',kb:size(fields),fields,idem:command.eventId||command.commandId});
  ctx.beginRequest(msg);
  const job=ctx.newJob(msg);
  send(ctx,job,'out',command,command);
  },
    onResult(ctx,job,command,result){const value=clone(result.msg?.fields.apiResult||{});
  ctx.k.results.push({command,ok:result.ok,error:result.err||null,value});
  ctx.k[result.ok?'completed':'failed']++;
  if(result.ok&&command.action==='page'){ctx.k.cursor=value.nextCursor;ctx.k.exhausted=value.nextCursor===null;}
  ctx.endRequest(job.msg,{ok:result.ok,err:result.err});
  ctx.reply(job,{ok:result.ok,err:result.err});
  nextCommand(ctx);
  },
    observe:ctx=>({detail:{Completed:ctx.k.completed,Failed:ctx.k.failed,'Exhausted page skips':ctx.k.skipped},records:{results:clone(ctx.k.results)}})});

 registry.register({id:'paginationStore',station:STATION,immutableParams:['mode','pageSize'],init:()=>({rows:Array.from({length:8},(_,i)=>i+1),snapshots:{},pages:[],scanned:0,mutations:0}),onRequest(ctx,job){ctx.admit(job);
  },
    onServed(ctx,job){const c=job.msg.fields.apiCommand;
  if(c?.action==='mutate'){ctx.k.rows=[0,...ctx.k.rows.filter(id=>id!==8)];
  ctx.k.mutations++;
  reply(ctx,job,{inserted:0,deleted:8});
  return;
  }if(c?.action!=='page'){reply(ctx,job,{reason:'Unknown action'},'invalid');
  return;
  }let token=null;
  if(c.cursor!==null&&c.cursor!==undefined){try{token=JSON.parse(c.cursor);
  }catch{reply(ctx,job,{reason:'Malformed cursor'},'invalid');
  return;
  }if(!token||token.mode!==ctx.p.mode||!Number.isInteger(token.offset)||token.offset<0||!Number.isInteger(token.after)||token.after<0||token.snapshot!=='snapshot-1'){reply(ctx,job,{reason:'Cursor contract mismatch'},'invalid');
  return;
  }}
 const k=ctx.k,p=ctx.p;
  if(p.mode==='snapshot'&&!k.snapshots['snapshot-1'])k.snapshots['snapshot-1']=clone(k.rows);
  const rows=p.mode==='snapshot'?k.snapshots['snapshot-1']:k.rows;
  let offset=token?.offset||0;

 if(p.mode!=='offset'&&token){let lo=0,hi=rows.length;
  while(lo<hi){const mid=(lo+hi)>>1;
  k.scanned++;
  if(rows[mid]<=token.after)lo=mid+1;
  else hi=mid;
  }offset=lo;
  }
 const items=rows.slice(offset,offset+p.pageSize);
  k.scanned+=p.mode==='offset'?offset+items.length:items.length;
  const nextCursor=items.length&&offset+items.length<rows.length?JSON.stringify({mode:p.mode,offset:offset+items.length,after:items.at(-1),snapshot:'snapshot-1'}):null;
  const page={items,nextCursor,scanned:k.scanned};
  k.pages.push(clone(page));
  reply(ctx,job,page);
  },
    observe:ctx=>({detail:{Rows:ctx.k.rows.length,Pages:ctx.k.pages.length,Scanned:ctx.k.scanned},records:{pages:clone(ctx.k.pages),rows:ctx.k.rows.map(id=>({id}))}})});

 registry.register({id:'paymentProvider',station:STATION,init:()=>({charges:[],duplicates:0}),onRequest(ctx,job){ctx.admit(job);
  },
    onServed(ctx,job){const c=job.msg.fields.apiCommand;
  if(c?.action==='query'){reply(ctx,job,{providerNodeId:ctx.nodeId,charges:clone(ctx.k.charges)});
  return;
  }if(!validCharge({...c,amount:10})){reply(ctx,job,{reason:'Invalid charge'},'invalid');
  return;
  }const old=ctx.k.charges.find(row=>row.eventId===c.eventId);
  if(old&&ctx.p.idempotent){if(old.version!==c.version||old.method!==c.method||old.action!==c.action){reply(ctx,job,{reason:'Conflicting event identity'},'invalid');
  return;
  }ctx.k.duplicates++;
  reply(ctx,job,{providerNodeId:ctx.nodeId,charge:clone(old)});
  return;
  }if(ctx.k.charges.length>=200){reply(ctx,job,{reason:'Charge capacity'},'rejected');
  return;
  }const charge={eventId:c.eventId,action:c.action,version:c.version,method:c.method,amount:10};
  ctx.k.charges.push(charge);
  ctx.effect(c.eventId,{idempotent:ctx.p.idempotent});
  reply(ctx,job,{providerNodeId:ctx.nodeId,charge:clone(charge)});
  },
    observe:ctx=>({detail:{Charges:ctx.k.charges.length,Duplicates:ctx.k.duplicates},records:{charges:clone(ctx.k.charges)}})});

 registry.register({id:'subscriptionService',station:STATION,validateTopology(node,c){const edges=c.edges.filter(e=>e.from===node.id&&e.fromPort==='provider');
  if(edges.length!==1||c.nodes.find(n=>n.id===edges[0].to)?.kernel!=='paymentProvider')throw Error(`${node.id} requires one paymentProvider authority`);
  },
    init:()=>({status:'none',version:0,applied:{},pending:{},reconciled:0,duplicates:0,stale:0}),onRequest(ctx,job){ctx.admit(job);
  },
    onServed(ctx,job){const c=job.msg.fields.apiCommand,k=ctx.k;
  if(c?.action==='read'){reply(ctx,job,{status:k.status,version:k.version});
  return;
  }if(c?.action==='reconcile'){send(ctx,job,'provider',{action:'query'},'reconcile');
  return;
  }if(!c||!['signup','renew','cancel'].includes(c.action)||!Number.isInteger(c.version)||c.version<1||c.version>10000||typeof c.eventId!=='string'||!(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/).test(c.eventId)){reply(ctx,job,{reason:'Invalid lifecycle event'},'invalid');
  return;
  }if(k.applied[c.eventId]&&ctx.p.idempotent){if(k.applied[c.eventId]!==fingerprint(c)){reply(ctx,job,{reason:'Conflicting event identity'},'invalid');
  return;
  }k.duplicates++;
  reply(ctx,job,{status:k.status,version:k.version,duplicate:true});
  return;
  }if(Object.keys(k.applied).length>=200&&!k.applied[c.eventId]){reply(ctx,job,{reason:'Lifecycle capacity'},'rejected');
  return;
  }if(c.version<k.version||c.version===k.version&&ctx.p.idempotent){k.stale++;
  reply(ctx,job,{reason:'Stale version'},'rejected');
  return;
  }if(c.action==='cancel'){k.status='cancelled';
  k.version=c.version;
  k.applied[c.eventId]=fingerprint(c);
  reply(ctx,job,{status:k.status,version:k.version});
  return;
  }k.pending[job.id]=clone(c);
  send(ctx,job,'provider',c,'charge');
  },
    onResult(ctx,job,slot,result){
      const k=ctx.k,value=result.msg?.fields?.apiResult;
      if(slot==='reconcile'){
        if(!result.ok){reply(ctx,job,{reason:'Provider unavailable'},result.err);return;}
        const charges=value?.charges,authority=providerId(ctx);
        if(!authority||value?.providerNodeId!==authority||!Array.isArray(charges)||charges.length>200||charges.some(c=>!validCharge(c))){reply(ctx,job,{reason:'Invalid provider ledger acknowledgement'},'invalid');return;}
        const events=new Map();
        for(const charge of charges){
          const prior=events.get(charge.eventId),committed=k.applied[charge.eventId];
          if(prior&&prior!==fingerprint(charge)||committed&&committed!==fingerprint(charge)){reply(ctx,job,{reason:'Conflicting provider event identity'},'invalid');return;}
          events.set(charge.eventId,fingerprint(charge));
        }
        const newEvents=[...events.keys()].filter(id=>!Object.hasOwn(k.applied,id));
        if(Object.keys(k.applied).length+newEvents.length>200){reply(ctx,job,{reason:'Lifecycle capacity'},'rejected');return;}
        // Validate the entire ledger before applying any row; malformed tails cannot partially reconcile.
        for(const charge of charges){
          if(charge.version>k.version){k.version=charge.version;k.status='active';k.applied[charge.eventId]=fingerprint(charge);k.reconciled++;}
        }
        reply(ctx,job,{status:k.status,version:k.version});return;
      }
      const c=k.pending[job.id];delete k.pending[job.id];
      if(!result.ok){reply(ctx,job,{reason:'Charge outcome requires reconciliation'},result.err);return;}
      const authority=providerId(ctx),charge=value?.charge;
      if(!c||!authority||value?.providerNodeId!==authority||!validCharge(charge)||charge.eventId!==c.eventId||fingerprint(charge)!==fingerprint(c)){reply(ctx,job,{reason:'Invalid provider charge acknowledgement'},'invalid');return;}
      if(c.version>=k.version){k.version=c.version;k.status='active';k.applied[c.eventId]=fingerprint(c);}
      reply(ctx,job,{status:k.status,version:k.version});
    },
    observe:ctx=>({detail:{Status:ctx.k.status,Version:ctx.k.version,Reconciled:ctx.k.reconciled,Duplicates:ctx.k.duplicates,Stale:ctx.k.stale},records:{applied:Object.keys(ctx.k.applied).map(eventId=>({eventId}))}})});

});

