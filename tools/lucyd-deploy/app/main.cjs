'use strict';
const {InventoryStore}=require('./store.cjs'),{createServer}=require('./server.cjs'),{randomUUID}=require('node:crypto');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 const role=process.argv[2]||'api';if(role==='traffic')return require('./traffic.cjs').main(process.argv[3]);
 const integer=(key,min,max)=>{const value=Number(process.env[key]);if(!Number.isInteger(value)||value<min||value>max)throw Error(`${key} must be an explicit integer in [${min},${max}]`);return value;};
 const store=new InventoryStore({connectionString:process.env.DATABASE_URL,sku:process.env.SKU,initialStock:integer('INITIAL_STOCK',1,1000000),ttlMs:integer('RESERVATION_TTL_MS',1,3600000),maxRecords:integer('MAX_RESERVATIONS',1,1000000)});await store.migrate();
 let stop=false,server=null;const shutdown=()=>{stop=true;server?.close();};process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
 if(role==='api'||role==='events'){server=createServer({store,token:process.env.API_TOKEN,role});await new Promise(resolve=>server.listen(Number(process.env.PORT||8080),'0.0.0.0',resolve));console.log(JSON.stringify({event:'listening',role,port:server.address().port}));await new Promise(resolve=>server.on('close',resolve));}
 else if(role==='worker'){
  const owner=randomUUID(),leaseMs=integer('LEASE_MS',1000,3600000),pollMs=integer('POLL_MS',50,60000),batchSize=integer('EXPIRY_BATCH_SIZE',1,1000);
  while(!stop){try{const expiry=await store.expire(owner,{leaseMs,batchSize});if(expiry.expired)console.log(JSON.stringify({event:'expiry',...expiry}));if(process.env.EVENT_SINK_URL){for(const event of await store.claimEvents(owner,leaseMs)){const response=await fetch(process.env.EVENT_SINK_URL,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.API_TOKEN},body:JSON.stringify(event),signal:AbortSignal.timeout(5000)});if(response.ok)await store.delivered(event.id,owner);}}}catch(error){console.error(JSON.stringify({event:'worker_retry',code:error.code||error.name}));}if(!stop)await sleep(pollMs);}
 }else throw Error('Unknown role');await store.close();
}
if(require.main===module)main().catch(error=>{console.error(JSON.stringify({event:'startup_failed',code:error.code||error.name,message:error.code?undefined:error.message}));process.exitCode=1;});
module.exports={main};
