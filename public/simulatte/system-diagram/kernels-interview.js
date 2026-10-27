(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const registry = node ? require('./kernel-registry.js') : root.SimulatteSystemDiagramKernels;
  factory(registry);
  if (node) module.exports = registry;
})(globalThis, function (registry) {
  'use strict';
  const MS = 1000, BYTES_PER_KB = 1000;
  const payloadKb = fields => new TextEncoder().encode(JSON.stringify(fields)).byteLength / BYTES_PER_KB;
  const STATION = Object.freeze({concurrency: 'concurrency', queueCapacity: 'queueCapacity'});
  const copy = value => JSON.parse(JSON.stringify(value));
  const key = value => JSON.stringify(value);
  const own = (rows, id) => Object.hasOwn(rows, key(id)) ? rows[key(id)] : null;
  const reject = (ctx, job, err = 'invalid') => { ctx.count('rejected operations'); ctx.reply(job, {ok:false, err}); };
  function input(ctx, job, actions) {
    const event = job.msg.fields?.operation;
    if (!event || !actions.includes(event.action) || !Number.isInteger(event.index) || event.index < 0 || typeof event.key !== 'string' || typeof event.actor !== 'string' || !Number.isFinite(event.value)) { reject(ctx, job); return null; }
    return event;
  }
  function emit(ctx, port, fields) {
    for (const edge of ctx.edges(port)) ctx.send(edge.id, ctx.message({ptype:'json', kb:payloadKb(fields), fields}));
  }
  function reply(ctx, job, fields) { ctx.reply(job, {ok:true, ptype:'json', kb:payloadKb(fields), fields}); }
  function room(ctx, rows) { if (Object.keys(rows).length < ctx.p.maxRecords) return true; ctx.count('capacity rejections'); return false; }
  // Sources produce operations, not expected outcomes. Every result comes back through the graph.
  registry.register({id:'operationSource', station:null,
    init:()=>({sent:0, completed:0, failed:0, outcomes:[]}),
    start(ctx) { ctx.wake(ctx.p.startSec, {index:0}); },
    onWake(ctx, wake) {
      const i = wake.index, p = ctx.p;
      if (i >= p.count) return;
      const operation = {action:p.operation, index:i, key:`item-${i % p.keySpace}`, actor:`user-${p.actorOffset + i % p.actorSpace}`, parent:i ? `item-${Math.floor((i - 1) / 2)}` : null, value:p.value};
      const msg = ctx.message({ptype:'json', kb:p.requestKb, idem:`${ctx.nodeId}:${i}`, fields:{operation}});
      ctx.beginRequest(msg); const job = ctx.newJob(msg), edge = ctx.edges('out')[0]; ctx.k.sent++;
      if (edge && ctx.job(job.id)) ctx.call(job, edge.id, {}, {timeoutMs:p.timeoutMs, retries:p.retries, backoffMs:p.retryBackoffMs, slot:{index:i}});
      else { ctx.k.failed++; ctx.endRequest(msg, {ok:false, err:'unavailable'}); if (ctx.job(job.id)) reject(ctx, job, 'unavailable'); }
      if (p.duplicateEvery > 0 && (i + 1) % p.duplicateEvery === 0 && edge) {
        const duplicate = ctx.derive(msg, {}), duplicateJob = ctx.newJob(duplicate);
        ctx.k.sent++;
        if (ctx.job(duplicateJob.id)) ctx.call(duplicateJob, edge.id, {}, {timeoutMs:p.timeoutMs, retries:0, slot:{index:i, duplicate:true}});
      }
      if (i + 1 < p.count) ctx.wake(p.intervalMs / MS, {index:i + 1});
    },
    onResult(ctx, job, slot, result) {
      ctx.k[result.ok ? 'completed' : 'failed']++;
      if (!slot.duplicate) ctx.endRequest(job.msg, {ok:result.ok, ...(result.ok ? {} : {err:result.err || 'error'})});
      if (ctx.k.outcomes.length < ctx.p.count * 2) ctx.k.outcomes.push({index:slot.index, duplicate:Boolean(slot.duplicate), ok:result.ok, atSec:ctx.t, fields:copy(result.msg?.fields || {}), ...(result.ok ? {} : {error:result.err})});
      ctx.reply(job, {ok:result.ok, ...(result.ok ? {} : {err:result.err || 'error'})});
    },
    observe:ctx=>({detail:{Sent:ctx.k.sent, Completed:ctx.k.completed, Failed:ctx.k.failed}, records:{operations:copy(ctx.k.outcomes)}})
  });

  registry.register({id:'commentStore', station:STATION,
    init:()=>({comments:{}, votes:{}, writes:0, duplicates:0}),
    onRequest(ctx, job) { ctx.admit(job, ctx.p.serviceMs); },
    onServed(ctx, job) {
      const e = input(ctx, job, ['comment','vote','readComments']); if (!e) return;
      const k = ctx.k;
      if (e.action === 'comment') {
        const row = own(k.comments, e.key);
        if (row) { if (row.actor !== e.actor || row.parent !== e.parent) { reject(ctx, job); return; } k.duplicates++; }
        else {
          if (e.parent && !own(k.comments, e.parent)) { reject(ctx, job); return; }
          if (!room(ctx, k.comments)) { reject(ctx, job, 'rejected'); return; }
          k.comments[key(e.key)] = {id:e.key, parent:e.parent, actor:e.actor, score:0}; k.writes++; ctx.effect(`comment:${e.key}`, {idempotent:true});
          emit(ctx, 'updates', {comment:copy(k.comments[key(e.key)])});
        }
        reply(ctx, job, {comment:copy(k.comments[key(e.key)])}); return;
      }
      if (e.action === 'vote') {
        const row = own(k.comments, e.key); if (!row || ![-1,0,1].includes(e.value)) { reject(ctx, job); return; }
        const voteId = key([e.key,e.actor]), old = Object.hasOwn(k.votes, voteId) ? k.votes[voteId] : 0;
        if (!Object.hasOwn(k.votes, voteId) && !room(ctx, k.votes)) { reject(ctx, job, 'rejected'); return; }
        row.score += e.value - old; k.votes[voteId] = e.value;
        if (old === e.value) k.duplicates++; else { k.writes++; emit(ctx, 'updates', {comment:copy(row)}); }
        reply(ctx, job, {comment:copy(row)}); return;
      }
      const comments = Object.values(k.comments).map(copy).sort((a,b)=>b.score-a.score || a.id.localeCompare(b.id));
      reply(ctx, job, {comments});
    },
    observe:ctx=>({detail:{Comments:Object.keys(ctx.k.comments).length, Writes:ctx.k.writes, 'Duplicate mutations':ctx.k.duplicates}, records:{comments:Object.values(ctx.k.comments).map(copy)}})
  });

  registry.register({id:'storyStore', station:STATION,
    immutableParams:['ttlSec','audienceSize'],
    init:()=>({stories:{}, expired:[], denied:0}),
    onRequest(ctx, job) { ctx.admit(job, ctx.p.serviceMs); },
    onServed(ctx, job) {
      const e = input(ctx, job, ['publishStory','readStory']); if (!e) return;
      let row = own(ctx.k.stories, e.key);
      if (e.action === 'publishStory') {
        if (row && row.owner !== e.actor) { reject(ctx, job); return; }
        if (!row) {
          if (ctx.k.expired.includes(e.key)) { reject(ctx, job); return; }
          if (Object.keys(ctx.k.stories).length + ctx.k.expired.length >= ctx.p.maxRecords) { reject(ctx, job, 'rejected'); return; }
          row = {id:e.key, owner:e.actor, audience:Array.from({length:ctx.p.audienceSize},(_,i)=>`user-${i}`), expiresAt:ctx.t+ctx.p.ttlSec, views:[]};
          ctx.k.stories[key(e.key)] = row; ctx.wake(ctx.p.ttlSec, {id:e.key, expiresAt:row.expiresAt});
          ctx.effect(e.key, {idempotent:true}); emit(ctx, 'updates', {story:copy(row)});
        }
        reply(ctx, job, {story:copy(row)}); return;
      }
      if (!row || ctx.t >= row.expiresAt) { reject(ctx, job, 'unavailable'); return; }
      if (row.owner !== e.actor && !row.audience.includes(e.actor)) { ctx.k.denied++; reject(ctx, job, 'rejected'); return; }
      if (!row.views.includes(e.actor)) row.views.push(e.actor);
      reply(ctx, job, {story:copy(row)});
    },
    onWake(ctx, wake) {
      const row = own(ctx.k.stories,wake.id);
      if (row && row.expiresAt === wake.expiresAt && ctx.t >= row.expiresAt) { delete ctx.k.stories[key(wake.id)]; if (ctx.k.expired.length < ctx.p.maxRecords) ctx.k.expired.push(wake.id); emit(ctx,'updates',{expiredStoryId:wake.id}); ctx.log('story-expired',`${wake.id} is no longer visible`); }
    },
    observe:ctx=>({detail:{Visible:Object.keys(ctx.k.stories).length, Expired:ctx.k.expired.length, Denied:ctx.k.denied}, records:{stories:Object.values(ctx.k.stories).map(copy), expired:ctx.k.expired.map(id=>({id}))}})
  });

  registry.register({id:'inventoryReservations', station:STATION,
    immutableParams:['stock','ttlSec'],
    init:ctx=>({available:ctx.p.stock, sold:0, reservations:{}, rejected:0, expired:0}),
    onRequest(ctx, job) { ctx.admit(job,ctx.p.serviceMs); },
    onServed(ctx, job) {
      const e = input(ctx, job, ['reserve','pay','readInventory']); if (!e) return;
      const k = ctx.k, id = key([e.key,e.actor]); let row = Object.hasOwn(k.reservations,id) ? k.reservations[id] : null;
      if (e.action === 'reserve') {
        if (!row) {
          if (!room(ctx,k.reservations) || !k.available) { k.rejected++; reject(ctx,job,'rejected'); return; }
          row={id, item:e.key, actor:e.actor, status:'reserved', expiresAt:ctx.t+ctx.p.ttlSec}; k.reservations[id]=row; k.available--;
          ctx.wake(ctx.p.ttlSec,{id,expiresAt:row.expiresAt}); ctx.effect(`reserve:${id}`,{idempotent:true});
        }
        if (row.status === 'expired') { reject(ctx,job,'rejected'); return; }
        reply(ctx,job,{reservation:copy(row)}); return;
      }
      if (e.action === 'pay') {
        if (!row || row.status === 'expired' || (row.status === 'reserved' && ctx.t >= row.expiresAt)) { reject(ctx,job,'rejected'); return; }
        if (row.status !== 'paid') { row.status='paid'; k.sold++; ctx.effect(`pay:${id}`,{idempotent:true}); emit(ctx,'updates',{reservation:copy(row)}); }
        reply(ctx,job,{reservation:copy(row)}); return;
      }
      reply(ctx,job,{available:k.available, sold:k.sold, held:Object.values(k.reservations).filter(r=>r.status==='reserved').length});
    },
    onWake(ctx,wake) {
      const row=ctx.k.reservations[wake.id];
      if (row && row.status==='reserved' && row.expiresAt===wake.expiresAt && ctx.t>=row.expiresAt) { row.status='expired'; ctx.k.available++; ctx.k.expired++; emit(ctx,'updates',{reservation:copy(row)}); ctx.log('reservation-expired',`${row.actor}: stock returned`); }
    },
    observe:ctx=>({detail:{Available:ctx.k.available, Sold:ctx.k.sold, Held:Object.values(ctx.k.reservations).filter(r=>r.status==='reserved').length, Expired:ctx.k.expired, Rejected:ctx.k.rejected},records:{reservations:Object.values(ctx.k.reservations).map(copy)}})
  });

  registry.register({id:'presenceBroker', station:STATION,
    immutableParams:['ttlSec'],
    init:()=>({users:{}, subscriptions:{}, notifications:0, expired:0}),
    onRequest(ctx,job) { ctx.admit(job,ctx.p.serviceMs); },
    onServed(ctx,job) {
      const e=input(ctx,job,['heartbeat','subscribe','readPresence']); if(!e)return;
      if(e.action==='subscribe') {
        const id=key([e.key,e.actor]); if(!Object.hasOwn(ctx.k.subscriptions,id) && !room(ctx,ctx.k.subscriptions)){reject(ctx,job,'rejected');return;}
        ctx.k.subscriptions[id]={target:e.key,watcher:e.actor}; reply(ctx,job,{subscribed:true});return;
      }
      if(e.action==='heartbeat') {
        const old=own(ctx.k.users,e.key); if(!old && !room(ctx,ctx.k.users)){reject(ctx,job,'rejected');return;}
        const row={id:e.key,status:'active',expiresAt:ctx.t+ctx.p.ttlSec,revision:(old?.revision||0)+1};ctx.k.users[key(e.key)]=row;
        ctx.wake(ctx.p.ttlSec,{id:e.key,revision:row.revision}); if(old?.status!=='active')notify(ctx,row);
        reply(ctx,job,{presence:copy(row)});return;
      }
      reply(ctx,job,{presences:Object.values(ctx.k.users).map(copy)});
    },
    onWake(ctx,wake) {
      const row=own(ctx.k.users,wake.id); if(row && row.revision===wake.revision && row.status==='active' && ctx.t>=row.expiresAt){row.status='offline';ctx.k.expired++;notify(ctx,row);ctx.log('presence-expired',`${row.id} went offline`);}
    },
    observe:ctx=>({detail:{Users:Object.keys(ctx.k.users).length, Subscribers:Object.keys(ctx.k.subscriptions).length, Notifications:ctx.k.notifications, Expired:ctx.k.expired},records:{presences:Object.values(ctx.k.users).map(copy),subscriptions:Object.values(ctx.k.subscriptions).map(copy)}})
  });
  function notify(ctx,row) {
    for(const s of Object.values(ctx.k.subscriptions).filter(s=>s.target===row.id)){ctx.k.notifications++;emit(ctx,'updates',{presence:copy(row),watcher:s.watcher});}
  }
});
