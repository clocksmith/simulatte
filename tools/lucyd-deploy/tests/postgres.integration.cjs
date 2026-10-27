'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{randomBytes,randomUUID}=require('node:crypto');
const {InventoryStore}=require('../app/store.cjs'),{createServer}=require('../app/server.cjs'),{run}=require('../app/traffic.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){const socket=require('node:net').createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));return port;}
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
async function ready(store){let last;for(let i=0;i<100;i++){try{await store.pool.query('SELECT 1');return;}catch(e){last=e;await sleep(100);}}throw last;}
async function listen(server){await new Promise(r=>server.listen(0,'127.0.0.1',r));return 'http://127.0.0.1:'+server.address().port;}
async function stop(server){if(server)await new Promise(r=>server.close(r));}
test('real PostgreSQL inventory: concurrent writes, retries, leases, server/database restart and receipt recovery',{timeout:90000},async t=>{
 const name='lucyd-inventory-test-'+randomBytes(6).toString('hex'),password=randomBytes(24).toString('hex'),token=randomBytes(24).toString('hex');let store,server,sink;
 const publishedPort=await freePort();docker('run','--detach','--name',name,'--publish','127.0.0.1:'+publishedPort+':5432','--env','POSTGRES_PASSWORD='+password,'postgres:17-alpine');
 try{
  const port=docker('port',name,'5432/tcp').split(':').pop(),connectionString=`postgres://postgres:${password}@127.0.0.1:${port}/postgres`;
  const make=()=>new InventoryStore({connectionString,sku:'item-0',initialStock:4,ttlMs:30000});store=make();await ready(store);await store.migrate();server=createServer({store,token});let url=await listen(server);
  const call=async(path,input,key)=>{const r=await fetch(url+path,{method:input?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:input?JSON.stringify(input):undefined});return {status:r.status,body:await r.json(),replayed:r.headers.get('Idempotency-Replayed')};};
  const assertStock=async()=>{const r=(await store.pool.query("SELECT i.initial_stock,i.available,i.sold,COALESCE(sum(r.quantity) FILTER(WHERE r.status='held'),0)::int AS held,COALESCE(sum(r.quantity) FILTER(WHERE r.status='paid'),0)::int AS paid FROM inventory i LEFT JOIN reservations r ON r.sku=i.sku WHERE i.sku='item-0' GROUP BY i.sku")).rows[0];assert.equal(r.initial_stock,r.available+r.sold+r.held);assert.equal(r.sold,r.paid);assert.ok(r.available>=0);return r;};
  let winners;
  await t.test('100 HTTP reservation requests never oversell; repeated identity and payload conflicts are safe',async()=>{
   const responses=await Promise.all(Array.from({length:100},(_,i)=>call('/v1/reservations',{customerId:'buyer-'+i},'reserve-'+i)));
   winners=responses.map((r,i)=>({...r,i})).filter(r=>r.status===201);assert.equal(winners.length,4);assert.equal((await assertStock()).held,4);
   const same=await call('/v1/reservations',{customerId:'buyer-'+winners[0].i},'reserve-'+winners[0].i);assert.equal(same.replayed,'true');assert.equal(same.body.reservation.id,winners[0].body.reservation.id);
   assert.equal((await call('/v1/reservations',{customerId:'different'},'reserve-'+winners[0].i)).status,409);
   assert.equal((await call('/v1/reservations',{customerId:'buyer-'+winners[0].i},'new-same-customer')).status,200);await assertStock();
  });
  await t.test('concurrent payment identities increment sold once and durable result survives lost HTTP response',async()=>{
   const id=winners[0].body.reservation.id;const paid=await Promise.all(Array.from({length:30},(_,i)=>call('/v1/payments',{reservationId:id},'pay-'+i)));assert.ok(paid.every(r=>r.status===200));assert.equal((await assertStock()).sold,1);
   await stop(server);let drop=true;server=createServer({store,token,afterMutation:async({request,response})=>{if(drop&&request.url==='/v1/payments'){drop=false;response.destroy();}}});url=await listen(server);
   const reservationId=winners[1].body.reservation.id;await assert.rejects(call('/v1/payments',{reservationId},'pay-lost-response'));
   const retry=await call('/v1/payments',{reservationId},'pay-lost-response');assert.equal(retry.status,200);assert.equal(retry.replayed,'true');assert.equal((await assertStock()).sold,2);
  });
  await t.test('two expiry owners release stock once; a dead owner lease is recovered',async()=>{
   await store.pool.query("UPDATE reservations SET expires_at=clock_timestamp()-interval '1 second' WHERE status='held'");
   const a=randomUUID(),b=randomUUID();const attempts=await Promise.all([store.expire(a,{leaseMs:100}),store.expire(b,{leaseMs:100})]);assert.equal(attempts.reduce((s,r)=>s+r.expired,0),2);assert.equal((await assertStock()).available,2);
   const held=await call('/v1/reservations',{customerId:'lease-recovery'},'lease-recovery');assert.equal(held.status,201);
   await store.pool.query("UPDATE reservations SET expires_at=clock_timestamp()-interval '1 second' WHERE status='held'");await sleep(120);const recovered=await store.expire(randomUUID(),{leaseMs:100});assert.equal(recovered.expired,1);assert.equal((await assertStock()).available,2);
  });
  await t.test('outbox leases, duplicate delivery and conflicting receipt identities are safe',async()=>{
   const owner=randomUUID(),other=randomUUID(),events=await store.claimEvents(owner,100);assert.equal(events.length,5);assert.equal((await store.claimEvents(other,100)).length,0);
   sink=createServer({store,token,role:'events'});const sinkUrl=await listen(sink),event=events[0];const send=body=>fetch(sinkUrl+'/events',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
   assert.equal((await send(event)).status,200);assert.equal((await send(event)).status,200);assert.equal((await send({...event,kind:'changed'})).status,409);
   await sleep(120);const recovered=await store.claimEvents(other,100);assert.equal(recovered.length,5);for(const e of recovered){assert.equal((await send(e)).status,200);await store.delivered(e.id,other);}assert.equal((await store.claimEvents(owner)).length,0);
  });
  await t.test('HTTP server restart and PostgreSQL restart preserve state and idempotency',async()=>{
   await stop(server);server=null;await stop(sink);sink=null;await store.close();store=make();server=createServer({store,token});url=await listen(server);
   assert.equal((await call('/v1/payments',{reservationId:winners[1].body.reservation.id},'pay-lost-response')).replayed,'true');
   const interrupted=await store.pool.connect();interrupted.on('error',()=>{});await interrupted.query('BEGIN');await interrupted.query("UPDATE inventory SET available=available-1 WHERE sku='item-0'");
   docker('stop','--time','1',name);interrupted.release(true);assert.equal((await fetch(url+'/healthz')).status,503);docker('start',name);await ready(store);assert.equal((await fetch(url+'/healthz')).status,200);
   assert.equal((await call('/v1/payments',{reservationId:winners[1].body.reservation.id},'pay-lost-response')).replayed,'true');assert.equal((await assertStock()).sold,2);
  });
  await t.test('real traffic generator performs reserve, duplicate and pay through the HTTP contract',async()=>{
   const params={count:1,startSec:0,intervalMs:1,actorOffset:500,actorSpace:1,duplicateEvery:1,keySpace:1};
   const observation=await run({baseUrl:url,token,plan:{simulationSeed:42,simulationHorizonSec:1,sources:[{id:'nested/reserve',...params,operation:'reserve'},{id:'nested/pay',...params,startSec:0.05,operation:'pay'}]}});assert.equal(observation.inventory.conserved,true);assert.equal(observation.responses.length,4);assert.ok(observation.responses.every(r=>r.status===200||r.status===201));assert.equal((await assertStock()).sold,3);
  });
 }finally{await stop(server);await stop(sink);if(store)await store.close();docker('rm','--force','--volumes',name);}
});
