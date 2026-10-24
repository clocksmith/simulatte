const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const libraryApi = require('../public/simulatte/system-diagram/class-library.js');
const documentApi = require('../public/simulatte/system-diagram/diagram.js');
const engine = require('../public/simulatte/system-diagram/engine.js');
require('../public/simulatte/system-diagram/kernels-core.js');
require('../public/simulatte/system-diagram/kernels-ai.js');
require('../public/simulatte/system-diagram/kernels-sources.js');
const kernels = require('../public/simulatte/system-diagram/kernel-registry.js');
const config = require('../public/data/system-diagram/config.json');
const library = libraryApi.loadSync(path.join(__dirname,'../public/data/system-diagram'));
const deps={library,config,kernels};
const node=(id,classId,params={})=>({id,classId,label:id,x:0,y:0,params});
const edge=(id,from,port,to,params={})=>({id:`edge-${id}`,from:{nodeId:from,portId:port},to:{nodeId:to,portId:'in'},params:{latencyMs:0,jitterMs:0,bandwidthMbps:1000,...params}});
const fault=(id,nodeId,type,atSec,untilSec,params={})=>({id,atSec,untilSec,target:{kind:'node',id:nodeId},type,params});
const source={pattern:'burst',burstAtSec:0,burstCount:1,burstSpacingMs:0,maxRequests:1,retries:0,timeoutMs:10000,tokensMean:0,requestKb:0};
const fastModel={ttftMs:1,prefillMsPer1kTokens:0,decodeMsPerToken:0,outputTokensMean:1,contextWindow:10000,batchSlowdown:0};
function run(nodes,edges,{faults=[],until=10,seed=42}={}) {
 const diagram={schema:documentApi.SCHEMA,id:'agent-journey',name:'Agent recovery',seed,run:{horizonSec:30},classes:[],nodes,edges,groups:[],notes:[],faults,view:{x:0,y:0,zoom:1}};
 const compiled=documentApi.compile(diagram,library,config),state=engine.initialize(compiled,deps);engine.advance(compiled,state,until,deps);
 return {diagram,compiled,state,view:engine.observe(compiled,state,deps)};
}
function inspectAll(r){return r.view.requests.map(request=>engine.inspect(r.compiled,r.state,request.id,deps));}
function expectExactContinuation(r,mid=0.05){const a=engine.initialize(r.compiled,deps);engine.advance(r.compiled,a,mid,deps);const b=JSON.parse(JSON.stringify(a));engine.advance(r.compiled,b,r.view.t,deps);assert.deepEqual(b,r.state);}
function agent(toolRetries,options={}){
 return run([node('users','nl-input',{...source,...options.source}),node('agent','agent-llm',{...fastModel,toolRounds:1,toolRetries,toolRetryBackoffMs:100,toolTimeoutMs:100}),node('tool','third-party-api',{serviceMs:1,serviceDist:'constant',rateLimitPerSec:0,...options.tool})],[edge('ask','users','out','agent'),edge('invoke','agent','tools','tool')],options);
}

test('bounded tool retry repairs a dependency outage and preserves exactly two call attempts',()=>{
 const faults=[fault('tool-outage','tool','crash',0,.05)],failed=agent(0,{faults}),repaired=agent(1,{faults});
 assert.equal(failed.view.global.failed,1);assert.equal(failed.view.global.completed,0);
 assert.equal(repaired.view.global.completed,1);assert.equal(repaired.view.global.failed,0);
 const attempts=repaired.view.attempts.filter(a=>a.edgeId==='edge-invoke');assert.equal(attempts.length,2);assert.equal(attempts[0].err,'down');assert.equal(attempts[1].status,'completed');
 assert.ok(attempts[1].startedAt-attempts[0].startedAt>=.1);expectExactContinuation(repaired,.02);
 const history=inspectAll(repaired)[0].history;assert.ok(history.some(e=>e.kind==='fault-applied'));assert.ok(history.some(e=>e.kind==='call-failed'));
});

test('a tool token bucket admits one simultaneous agent call and exposes two rate-limited requests',()=>{
 const r=agent(0,{source:{burstCount:3,maxRequests:3},tool:{rateLimitPerSec:1,rateBurst:1}});
 assert.equal(r.view.global.offered,3);assert.equal(r.view.global.completed,1);assert.equal(r.view.global.failedBy['rate-limited'],2);
 assert.equal(r.view.nodes.tool.arrivals,3);assert.equal(r.view.requests.filter(q=>q.err==='rate-limited').length,2);expectExactContinuation(r);
});

test('missing or asynchronous tool results cannot masquerade as successful agent reasoning',()=>{
 const missing=run([node('users','nl-input',source),node('agent','agent-llm',{...fastModel,toolRounds:1})],[edge('ask','users','out','agent')]);
 assert.equal(missing.view.global.failedBy.unavailable,1);
 const async=run([node('users','nl-input',source),node('agent','agent-llm',{...fastModel,toolRounds:1}),node('tool','third-party-api',{serviceMs:0,rateLimitPerSec:0})],[edge('ask','users','out','agent'),edge('tool','agent','tools','tool',{mode:'async'})]);
 assert.equal(async.view.global.failedBy.invalid,1);assert.equal(async.view.nodes.tool.arrivals,0);
});

test('malformed structured generation consumes exactly the configured repair budget then remains invalid',()=>{
 const r=run([node('users','nl-input',source),node('shape','structured-response',{maxRepairs:2,validateMs:1}),node('gen','structured-llm',{...fastModel,schemaFailureRate:1})],[edge('ask','users','out','shape'),edge('generate','shape','generate','gen')]);
 assert.equal(r.view.global.completed,0);assert.equal(r.view.global.failedBy.invalid,1);assert.equal(r.view.nodes.gen.arrivals,3);assert.equal(r.view.nodes.shape.detail.repairs,2);expectExactContinuation(r,.002);
});

test('an asynchronous structured generator is rejected rather than parsing an unrelated fallback',()=>{
 const r=run([node('users','nl-input',source),node('shape','structured-response',{parseFailureRate:0}),node('gen','structured-llm',fastModel)],[edge('ask','users','out','shape'),edge('generate','shape','generate','gen',{mode:'async'})]);
 assert.equal(r.view.global.failedBy.invalid,1);assert.equal(r.view.global.completed,0);assert.equal(r.view.nodes.gen.arrivals,0);
});

function rag(nodes=[],edges=[],params={},options={}){
 return run([node('questions','nl-input',{...source,pattern:'constant',ratePerSec:2,startSec:.1,maxRequests:2,stopSec:.7}),node('rag','rag-retriever',{promptTokens:7,chunkTokens:10,topK:3,callTimeoutMs:100,retries:1,retryBackoffMs:20,...params}),node('embed','embedder',{maxBatch:1,batchWindowMs:0,batchBaseMs:1,perKTokensMs:0}),node('index','vector-index',{vectors:0,visibilityDelayMs:500,queryBaseMs:1,queryLogMs:0,upsertMs:1}),node('gen','llm',fastModel),...nodes],[edge('ask','questions','out','rag'),edge('embed','rag','embed','embed'),edge('search','rag','search','index'),edge('generate','rag','generate','gen'),...edges],options);
}
test('acknowledged but unpublished index writes cause stale rejection, then recovery after publication',()=>{
 const r=rag([node('writer','api-consumer',{...source,payload:'json',readFraction:0})],[edge('upsert','writer','out','index',{op:'write'})],{rejectStaleResults:true});
 assert.equal(r.view.global.offered,3);assert.equal(r.view.global.completed,2);assert.equal(r.view.global.failedBy.unavailable,1);
 assert.equal(r.view.nodes.index.detail.vectors,1);assert.equal(r.view.nodes.index.detail['pending upserts'],0);assert.equal(r.view.nodes.index.detail['stale queries'],1);assert.equal(r.view.nodes.gen.arrivals,1);
 expectExactContinuation(r,.2);
});

test('empty retrieval contributes zero invented context candidates',()=>{
 const r=rag();assert.equal(r.view.global.completed,2);
 const jobs=inspectAll(r).flatMap(info=>info.jobs).filter(job=>job.nodeId==='gen');assert.equal(jobs.length,2);
 for(const job of jobs){assert.equal(job.msg.tokens,7);assert.equal(job.msg.fields.contextCandidates,0);}
});

test('missing required RAG stages fail closed while optional reranking can be absent',()=>{
 const good=rag(),diagram=structuredClone(good.diagram);diagram.edges=diagram.edges.filter(e=>e.id!=='edge-embed');
 const r=run(diagram.nodes,diagram.edges);assert.equal(good.view.global.completed,2);assert.equal(r.view.global.completed,0);assert.equal(r.view.global.failedBy.unavailable,2);assert.equal(r.view.nodes.gen.arrivals,0);
});

test('context budget with no space for an output token rejects the request',()=>{
 const r=run([node('users','nl-input',{...source,requestKb:1/256}),node('model','llm',{...fastModel,contextWindow:1})],[edge('ask','users','out','model')]);
 assert.equal(r.view.global.failedBy.invalid,1);assert.equal(r.view.global.completed,0);
});

test('crawler bounds rate-limit redrives and preserves synthetic fetch provenance through document delivery',()=>{
 const r=run([node('crawl','crawler',{seedUrls:2,maxPages:2,domains:1,fetchConcurrency:1,politenessMs:0,linksPerPage:0,retries:0,maxThrottleRetries:1,stopSec:20}),node('site','website',{serviceMs:1,serviceDist:'constant',rateLimitPerSec:.001,rateBurst:1}),node('sink','data-warehouse',{serviceMs:1,serviceDist:'constant'})],[edge('fetch','crawl','fetch','site'),edge('documents','crawl','documents','sink')],{until:20});
 assert.equal(r.view.nodes.crawl.detail['pages fetched'],1);assert.equal(r.view.nodes.crawl.detail['rate-limit budget exhausted'],1);assert.equal(r.view.nodes.site.arrivals,3);assert.equal(r.view.nodes.crawl.detail.frontier,0);
 const document=inspectAll(r).flatMap(info=>info.jobs).find(j=>j.nodeId==='sink');assert.equal(document.msg.ptype,'document');assert.equal(document.msg.fields.provenance[0].originId,'domain-0');assert.match(document.msg.fields.fetchId,/synthetic-fetch-/);expectExactContinuation(r,.5);
});

function memoryWork(params,arrival={}) {return run([node('users','nl-input',{...source,...arrival}),node('gpu','gpu-worker',{maxBatch:1,batchWindowMs:0,batchBaseMs:100,perItemMs:0,memoryLimitMiB:10,...params})],[edge('work','users','out','gpu')]);}
test('GPU pressure slows remaining synthetic work by the configured factor without changing completed work',()=>{
 const light=memoryWork({memoryPerRequestMiB:10,memoryPressureThreshold:.5,memoryThrashFactor:1}),pressure=memoryWork({memoryPerRequestMiB:10,memoryPressureThreshold:.5,memoryThrashFactor:4});
 assert.equal(light.view.global.completed,1);assert.equal(pressure.view.global.completed,1);
 const a=light.view.requests[0].latencyMs,b=pressure.view.requests[0].latencyMs;assert.ok(Math.abs(a-100)<.01);assert.ok(Math.abs(b-400)<.01);assert.equal(pressure.view.global.memoryMiB,0);expectExactContinuation(pressure,.05);
});
test('GPU collection pause freezes in-service work and resumes under fenced event estimates',()=>{
 const r=memoryWork({memoryPerRequestMiB:3,memoryPressureThreshold:.5,memoryGarbageFraction:1,memoryGcPauseMs:200,memoryGcCooldownMs:1000,memoryThrashFactor:1},{pattern:'constant',ratePerSec:20/3,maxRequests:2,stopSec:.2});
 assert.equal(r.view.global.completed,2);assert.equal(r.view.global.failed,0);assert.ok(r.view.nodes.gpu.detail['GC cycles']>=1);
 const latencies=r.view.requests.map(q=>q.latencyMs).sort((a,b)=>a-b);assert.ok(Math.abs(latencies[0]-100)<.01);assert.ok(Math.abs(latencies[1]-300)<.01,JSON.stringify(latencies));expectExactContinuation(r,.2);
});

test('index publication backlog rejects before committing an effect beyond its configured bound',()=>{
 const r=run([node('writer','api-consumer',{...source,burstCount:2,maxRequests:2,payload:'embedding',readFraction:0}),node('index','vector-index',{vectors:0,upsertMs:1,visibilityDelayMs:1000,maxPendingUpserts:1})],[edge('write','writer','out','index',{op:'write'})]);
 assert.equal(r.view.global.offered,2);assert.equal(r.view.global.completed,1);assert.equal(r.view.global.failedBy.rejected,1);assert.equal(r.view.global.effects,1);
 assert.equal(r.view.nodes.index.detail.vectors,1);assert.equal(r.view.nodes.index.detail.upserts,1);assert.equal(r.view.nodes.index.detail['pending upserts'],0);expectExactContinuation(r,.2);
});

test('a permanent tool outage exhausts exactly the finite tool retry budget',()=>{
 const r=agent(2,{faults:[fault('permanent-tool-outage','tool','crash',0,null)]});
 assert.equal(r.view.global.completed,0);assert.equal(r.view.global.failedBy.down,1);
 assert.equal(r.view.attempts.filter(a=>a.edgeId==='edge-invoke').length,3);assert.equal(r.view.global.inFlight,0);assert.equal(r.view.global.memoryMiB,0);expectExactContinuation(r,.2);
});

test('agent recovery preset reproduces coordinator replay and checkpoint restoration through faults and delayed publication',async()=>{
 const runnerApi=require('../public/simulatte/system-diagram/runner.js'),diagram=require('../public/data/system-diagram/examples/agent-recovery.json');
 const runner=await runnerApi.create({diagram,...deps,profileId:'system-diagram-v1'});
 try {
  runner.advanceTo(1.2);const checkpoint=JSON.parse(JSON.stringify(await runner.checkpoint()));runner.advanceTo(20);const final=runner.view();
  assert.equal(final.error,null);assert.ok(final.global.completed>0);assert.ok(final.global.failed>0);assert.equal(final.global.inFlight,0);assert.equal(final.global.memoryMiB,0);
  await runner.restore(checkpoint);runner.advanceTo(20);assert.deepEqual(runner.view(),final);assert.equal((await runner.verify()).status,'match');
  const replay=runnerApi.replay(runner.exportReplay(),deps);assert.equal(replay.metricsHash,runner.exportReplay().metricsHash);
 } finally {await runner.dispose();}
});
