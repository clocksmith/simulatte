'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{randomBytes}=require('node:crypto');
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim(),sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){const server=require('node:net').createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const p=server.address().port;await new Promise(r=>server.close(r));return p;}
async function until(action){let last;for(let i=0;i<100;i++){try{const value=await action();if(value)return value;}catch(e){last=e;}await sleep(100);}throw last||Error('Readiness did not converge');}
test('real application container under restricted security context survives API kill, expiry owner kills and database restart',{timeout:90000},async()=>{
 const id='lucyd-container-'+randomBytes(5).toString('hex'),password=randomBytes(24).toString('hex'),token=randomBytes(24).toString('hex'),names=[];let network=false;
 try{
  docker('network','create',id);network=true;const pg=id+'-pg';names.push(pg);docker('run','--detach','--name',pg,'--network',id,'--network-alias','postgres','--env','POSTGRES_PASSWORD='+password,'postgres:17-alpine');
  await until(()=>docker('exec',pg,'pg_isready','-U','postgres')?.includes('accepting connections'));
  const port=await freePort(),api=id+'-api',base='http://127.0.0.1:'+port,env={DATABASE_URL:`postgres://postgres:${password}@postgres:5432/postgres`,SKU:'item-0',INITIAL_STOCK:'4',RESERVATION_TTL_MS:'2000',MAX_RESERVATIONS:'200',API_TOKEN:token,LEASE_MS:'1000',POLL_MS:'50',EXPIRY_BATCH_SIZE:'100'};
  const start=(name,role,extra=[])=>{names.push(name);return docker('run','--detach','--name',name,'--network',id,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','10001:10001',...extra,...Object.entries(env).flatMap(([k,v])=>['--env',k+'='+v]),'lucyd-inventory:local',role);};
  start(api,'api',['--publish','127.0.0.1:'+port+':8080']);await until(async()=>{const r=await fetch(base+'/healthz');return r.ok;});
  const call=async(route,input,key)=>{const r=await fetch(base+route,{method:input?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','Idempotency-Key':key||'read'},body:input?JSON.stringify(input):undefined});return {status:r.status,body:await r.json()};};
  const buyers=await Promise.all(Array.from({length:10},(_,i)=>call('/v1/reservations',{customerId:'buyer-'+i},'reserve-'+i))),winners=buyers.filter(r=>r.status===201);assert.equal(winners.length,4);
  const payment={reservationId:winners[0].body.reservation.id};assert.equal((await call('/v1/payments',payment,'pay-once')).status,200);
  // Kill the actual process. PostgreSQL owns committed state, not API memory.
  docker('kill','--signal','KILL',api);docker('start',api);await until(async()=>{const r=await fetch(base+'/healthz');return r.ok;});assert.equal((await call('/v1/payments',payment,'pay-once')).status,200);
  const a=id+'-worker-a',b=id+'-worker-b';start(a,'worker');start(b,'worker');
  await until(()=>Number(docker('exec',pg,'psql','-U','postgres','-tAc','SELECT count(*) FROM worker_leases'))===1);docker('kill','--signal','KILL',a);docker('kill','--signal','KILL',b);await sleep(2200);
  start(id+'-worker-recovery','worker');await until(async()=>{const result=await call('/v1/inventory');return result.body.available===3&&result.body.sold===1&&result.body.held===0&&result.body.conserved===true;});
  docker('stop','--time','1',pg);assert.equal((await fetch(base+'/livez')).status,200);assert.equal((await fetch(base+'/healthz')).status,503);docker('start',pg);await until(async()=>{const r=await fetch(base+'/healthz');return r.ok;});
  const final=await call('/v1/inventory');assert.deepEqual([final.body.available,final.body.sold,final.body.held,final.body.conserved],[3,1,0,true]);assert.equal((await call('/v1/payments',payment,'pay-once')).status,200);
  const sql=docker('exec',pg,'psql','-U','postgres','-tAc',"SELECT initial_stock=available+sold+(SELECT COALESCE(sum(quantity),0) FROM reservations WHERE status='held') FROM inventory WHERE sku='item-0'");assert.equal(sql,'t');
 }finally{for(const name of names.reverse())try{docker('rm','--force','--volumes',name);}catch{}if(network)docker('network','rm',id);}
});
