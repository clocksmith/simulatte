'use strict';
const fs=require('node:fs/promises'),{performance}=require('node:perf_hooks'),{createHash}=require('node:crypto');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function run({plan,baseUrl,token,fetcher=fetch}){
 const jobs=[];for(const source of plan.sources)for(let i=0;i<source.count;i++){const actor=`user-${source.actorOffset+i%source.actorSpace}`,key=createHash('sha256').update(JSON.stringify([source.id,i])).digest('hex'),row={at:source.startSec*1000+i*source.intervalMs,operation:source.operation,actor,key};jobs.push(row);if(source.duplicateEvery>0&&(i+1)%source.duplicateEvery===0)jobs.push({...row,at:row.at+1,duplicate:true});}
 jobs.sort((a,b)=>a.at-b.at||a.key.localeCompare(b.key));const held=new Map(),responses=[],started=performance.now();
 for(const job of jobs){const remaining=job.at-(performance.now()-started);if(remaining>0)await sleep(remaining);let path,body;
  if(job.operation==='reserve'){path='/v1/reservations';body={customerId:job.actor,quantity:1};}
  else if(job.operation==='pay'){const reservationId=held.get(job.actor);if(!reservationId){responses.push({operation:'pay',status:'no-reservation',actor:job.actor});continue;}path='/v1/payments';body={reservationId};}
  else if(job.operation==='readInventory'){path='/v1/inventory';}
  else throw Error('Unsupported traffic operation');
  const time=performance.now();let response;
  // Replays after response loss retain the exact same request identity and body.
  for(let attempt=0;attempt<3;attempt++){try{response=await fetcher(baseUrl+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','Idempotency-Key':job.key},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(5000)});if(response.status>=500&&attempt<2){await sleep(100);continue;}break;}catch(error){if(attempt===2)throw error;await sleep(100);}}
  const value=await response.json();if(job.operation==='reserve'&&response.ok)held.set(job.actor,value.reservation.id);responses.push({operation:job.operation,key:job.key,duplicate:Boolean(job.duplicate),status:response.status,latencyMs:performance.now()-time});
 }
 const response=await fetcher(baseUrl+'/v1/inventory',{headers:{Authorization:'Bearer '+token}}),inventory=await response.json();if(!response.ok||inventory.conserved!==true)throw Error('Stock conservation failed');
 return {schema:'lucyd.inventory-traffic-observation.v1',sourceDiagramSha256:plan.sourceDiagramSha256||null,registryVersion:plan.registryVersion||null,bindings:plan.sources.map(s=>({id:s.id,nodeId:s.nodeId||null})),elapsedMs:performance.now()-started,seed:plan.simulationSeed,simulationHorizonSec:plan.simulationHorizonSec,inventory,responses,limits:'Sequential real HTTP traffic with retries, not a production throughput benchmark or calibrated simulation prediction.'};
}
async function main(file){if(!file||!process.env.BASE_URL||!process.env.API_TOKEN)throw Error('Traffic file, BASE_URL and API_TOKEN are required');console.log(JSON.stringify(await run({plan:JSON.parse(await fs.readFile(file)),baseUrl:process.env.BASE_URL,token:process.env.API_TOKEN}),null,2));}
module.exports={run,main};
