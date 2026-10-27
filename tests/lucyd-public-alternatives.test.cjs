'use strict';
// Owner: public/simulatte/system-diagram/CATSCAN.md. Synthetic protocol evidence only.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const D=require('../public/simulatte/system-diagram/diagram.js'),E=require('../public/simulatte/system-diagram/engine.js');
const K=require('../public/simulatte/system-diagram/kernels-all.js');require('../public/simulatte/system-diagram/kernels-public-alternatives.js');
const C=require('../public/simulatte/system-diagram/class-library.js'),base=path.resolve(__dirname,'../public/data/system-diagram'),m=structuredClone(require(base+'/class-library.json'));
if(!m.packs.includes('classes/public-alternatives.json'))m.packs.push('classes/public-alternatives.json');
const library=C.build(m,m.packs.map(p=>require(base+'/'+p))),config=require(base+'/config.json'),deps={library,config,kernels:K};
const node=(id,classId,params={})=>({id,classId,label:id,x:0,y:0,params});
const edge=(id,from,to,fp='out',tp='in')=>({id,from:{nodeId:from,portId:fp},to:{nodeId:to,portId:tp},params:{latencyMs:2,bandwidthMbps:1000}});
function graph(nodes,edges,horizonSec=20,faults=[]){return {schema:'simulatte.systemDiagram.v4',id:'alternative-test',name:'Alternative protocol control',description:'Synthetic bounded control',seed:42,run:{horizonSec},classes:[],nodes,edges,groups:[],notes:[],faults,view:{x:0,y:0,zoom:1}};}
function run(d,checkpoint=false){const c=D.compile(d,library,config);let s=E.initialize(c,deps);if(checkpoint){E.advance(c,s,.4,deps);s=JSON.parse(JSON.stringify(s));}E.advance(c,s,d.run.horizonSec,deps);const v=E.observe(c,s,deps);assert.equal(v.error,null);return {s,v};}
function replay(d){const a=run(d);assert.deepEqual(run(d,true).s,a.s);return a;}
test('shared namespaces separate equal keys and reject unknown incoming identities',()=>{
 const p={pattern:'burst',burstAtSec:0,burstCount:4,readFraction:0,keySpace:1,retries:0,timeoutMs:1000};
 const d=graph([node('tenant-a','burst-producer',p),node('tenant-b','burst-producer',p),node('outsider','burst-producer',p),node('shared','shared-tenant-database')],[edge('a','tenant-a','shared'),edge('b','tenant-b','shared'),edge('other','outsider','shared')]);
 const {s,v}=replay(d);assert.equal(s.kernel.shared.writes,8);assert.equal(s.kernel.shared.rejected,4);assert.equal(s.kernel.shared.tenants['tenant-a'].writes,4);assert.equal(s.kernel.shared.tenants['tenant-b'].writes,4);assert.equal(Object.keys(s.kernel.shared.tenants['tenant-a'].keys).length,1);assert.equal(v.global.effects,8);
});
test('materialized pages preserve the initial session while mutations change live rows',()=>{
 const d=graph([node('client','materialized-page-client',{scenario:'pagination'}),node('pages','materialized-page-store',{pageSize:3})],[edge('pages-link','client','pages')]);
 const {s}=replay(d);assert.deepEqual(s.kernel.pages.served.flatMap(p=>p.items),[1,2,3,4,5,6,7,8]);assert.deepEqual(s.kernel.pages.rows,[0,1,2,3,4,5,6,7]);assert.equal(s.kernel.pages.copied,8);assert.equal(s.kernel.pages.lookups,3);assert.equal(s.kernel.client.failed,1);assert.equal(s.kernel.pages.served.at(-1).nextCursor,null);
});
test('digest-time matching scans real listings, excludes nonmatches and deduplicates provider effects',()=>{
 const d=graph([node('users','messaging-workload',{scenario:'saved-search',timeoutMs:6000}),node('matcher','digest-scan-matcher',{retries:2,callTimeoutMs:200}),node('email','digest-mailbox')],[edge('commands','users','matcher'),edge('mail','matcher','email','delivery')],15);
 const {s}=replay(d);assert.equal(Object.keys(s.kernel.matcher.listings).length,4);assert.equal(Object.keys(s.kernel.matcher.matches).length,4);assert.equal(s.kernel.matcher.comparisons,28);assert.equal(Object.keys(s.kernel.email.emails).length,3);assert.equal(s.kernel.matcher.digests['["alice",1]'].listingIds.includes('b2'),false);
});
test('invoice outbox separates acceptance from settlement and fences late activation after cancellation',()=>{
 const d=graph([node('client','invoice-outbox-client',{scenario:'subscriptions',intervalMs:800,timeoutMs:600,retries:0}),node('billing','invoice-outbox',{dispatchMs:50,callTimeoutMs:200,maxAttempts:20}),node('provider','payment-provider',{idempotent:true})],[edge('commands','client','billing'),edge('charges','billing','provider','provider')],20,[{id:'lost-provider-ack',type:'dropReplies',atSec:1.5,untilSec:4.5,target:{kind:'node',id:'provider'},params:{}}]);
 const {s}=replay(d);assert.equal(s.kernel.provider.charges.length,2);assert.equal(s.kernel.billing.status,'cancelled');assert.equal(s.kernel.billing.version,3);assert.equal(s.kernel.billing.settled,2);assert.ok(s.kernel.provider.duplicates>0);assert.ok(s.kernel.client.results.some(r=>r.value.status==='pending'));
});
test('an invalid digest cannot create match state and repeated settled invoice replies cannot double count',()=>{
 const scan=K.get('digestScanMatcher'),k=scan.init(),replies=[];scan.onServed({k,p:{maxRecords:200},reply(j,r){replies.push(r);}}, {msg:{fields:{messaging:{action:'digest',day:-1}}}});assert.equal(k.comparisons,0);assert.deepEqual(k.matches,{});assert.equal(replies[0].err,'invalid');
 const outbox=K.get('invoiceOutbox'),command={action:'renew',eventId:'r',version:2,method:'bank'},state=outbox.init();state.invoices.r={command,settled:true};state.settled=1;
 outbox.onResult({k:state},null,{invoice:'r'},{ok:true});assert.equal(state.settled,1);
});
test('read-time vote sums preserve parent constraints and actor vote replacement',()=>{
 const d=graph([node('comments','operation-client',{operation:'comment',count:4,intervalMs:100,duplicateEvery:2}),node('votes','operation-client',{operation:'vote',count:8,intervalMs:100,startSec:1,keySpace:4,actorSpace:4}),node('reads','operation-client',{operation:'readComments',count:1,startSec:3}),node('store','comment-scan-store')],[edge('post','comments','store'),edge('vote','votes','store'),edge('read','reads','store')],5);
 const {s}=replay(d);assert.equal(Object.keys(s.kernel.store.comments).length,4);assert.equal(Object.keys(s.kernel.store.votes).length,4);assert.deepEqual(s.kernel.reads.outcomes[0].fields.comments.map(c=>c.score),[1,1,1,1]);assert.ok(s.kernel.store.scans>0);assert.equal(Object.hasOwn(Object.values(s.kernel.store.comments)[0],'score'),false);
});
test('command journal serializes real stock authority requests without overselling',()=>{
 const d=graph([node('buyers','operation-client',{operation:'reserve',count:8,intervalMs:10,keySpace:1,actorSpace:8,duplicateEvery:2}),node('journal','command-journal'),node('stock','inventory-reservations',{stock:4,ttlSec:10})],[edge('admit','buyers','journal'),edge('authority','journal','stock','authority')],5);
 const {s,v}=replay(d);assert.equal(s.kernel.stock.available,0);assert.equal(Object.keys(s.kernel.stock.reservations).length,4);assert.ok(s.kernel.journal.duplicates>0);assert.equal(v.global.effects,4);assert.ok(v.global.failed>0);
});
test('polled presence has no timed expiry or invented notification delivery',()=>{
 const d=graph([node('beats','operation-client',{operation:'heartbeat',count:1,keySpace:1,actorSpace:1}),node('reads','operation-client',{operation:'readPresence',count:1,startSec:3}),node('presence','polling-presence',{ttlSec:1})],[edge('beat-link','beats','presence'),edge('read-link','reads','presence')],5);
 const {s}=replay(d);assert.equal(s.kernel.presence.users['"item-0"'].status,'offline');assert.equal(s.kernel.presence.expired,1);assert.equal(s.kernel.presence.notifications,0);
});
test('batched pair matching retains mismatch rejection and exactly four result effects',()=>{
 const d=graph([node('events','event-source',{count:12,intervalMs:100,paired:true,amount:100,mismatchEvery:3,mismatchDelta:1,callTimeoutMs:15000}),node('ledger','batch-reconciliation',{mode:'reconcile',flushMs:250}),node('results','idempotent-store'),node('exceptions','event-quarantine')],[edge('records','events','ledger'),edge('matches','ledger','results','accepted'),edge('mismatch','ledger','exceptions','quarantine')],10);
 const {s}=replay(d);assert.equal(s.kernel.ledger.reconciled,4);assert.equal(s.kernel.ledger.mismatches,2);assert.ok(s.kernel.ledger.batches>0);assert.equal(s.kernel.results.writes,4);assert.equal(s.kernel.ledger.batch.length,0);
});
test('direct audit validates the actual journal acknowledgement and reports application rather than queue acceptance',()=>{
 const kernel=K.get('directAuditWorkspace');for(const valid of [false,true]){const k=kernel.init(),eventId='["w","command"]',replies=[];k.publications.j={eventId,value:{taskId:'task'}};k.routes.j={};kernel.onResult({k,reply(j,v){replies.push(v);}}, {id:'j',msg:{fields:{}}},'activity',{ok:true,msg:{fields:{applicationResult:{recorded:true,eventId:valid?eventId:'wrong'}}}});assert.equal(k.activityFailed,valid?0:1);assert.equal(replies[0].fields.applicationResult.activity.state,valid?'applied':'failed');}
});
test('digest matching deduplicates staged actor/listing matches before capacity admission',()=>{
 const kernel=K.get('digestScanMatcher'),k=kernel.init(),responses=[],calls=[];k.searches={a:{actor:'alice',term:'distributed'},b:{actor:'alice',term:'database'}};k.listings={one:{id:'book',title:'Distributed Database'}};k.matches.old={actor:'alice',listingId:'old-book',day:1};
 const ctx={k,p:{maxRecords:2,callTimeoutMs:100,retries:0,retryBackoffMs:0},edges:()=>[{id:'mail'}],call(...args){calls.push(args);},reply(j,r){responses.push(r);}};
 kernel.onServed(ctx,{id:'j',msg:{fields:{messaging:{action:'digest',day:2}}}});assert.equal(Object.keys(k.matches).length,2);assert.deepEqual(k.digests['["alice",2]'].listingIds,['book']);assert.equal(calls.length,1);assert.equal(responses.length,0);
});
test('materialized page observation history stays bounded while total lookups remain accurate',()=>{
 const kernel=K.get('materializedPages'),k=kernel.init(),responses=[],ctx={k,p:{pageSize:3,maxRecords:2},reply(j,r){responses.push(r);}};
 for(let i=0;i<5;i++)kernel.onServed(ctx,{msg:{fields:{apiCommand:{action:'page',cursor:null}}}});assert.equal(k.served.length,2);assert.equal(k.lookups,5);assert.equal(responses.length,5);assert.deepEqual(responses[4].fields.apiResult.items,[1,2,3]);
});
test('batch admission refuses excess pending jobs and crash fences the pending flush',()=>{
 const kernel=K.get('batchReconcile'),k=kernel.init(),replies=[],wakes=[],ctx={k,p:{maxRecords:2,flushMs:250},release(){},wake(...v){wakes.push(v);},reply(j,r){replies.push(r);},job(){assert.fail('A crash-cleared batch must not resolve orphan jobs');}};
 for(const id of ['one','two','three'])kernel.onServed(ctx,{id});assert.equal(k.batch.length,2);assert.equal(k.batchRejected,1);assert.equal(replies[0].err,'rejected');assert.equal(wakes.length,1);kernel.onFault(ctx,{type:'crash'},true);kernel.onWake(ctx,{kind:'flush'});assert.equal(k.batch.length,0);assert.equal(k.lostBatch,2);
});
test('invoice capacity bounds cancellation identities as well as invoice rows',()=>{
 const kernel=K.get('invoiceOutbox'),k=kernel.init(),replies=[],ctx={k,p:{maxRecords:2},reply(j,r){replies.push(r);}};
 for(let i=1;i<=3;i++)kernel.onServed(ctx,{msg:{fields:{apiCommand:{action:'cancel',eventId:'cancel-'+i,version:i}}}});assert.equal(Object.keys(k.applied).length,2);assert.equal(k.version,2);assert.equal(replies[2].err,'rejected');
 kernel.onServed(ctx,{msg:{fields:{apiCommand:{action:'cancel',eventId:'cancel-1',version:1}}}});assert.equal(replies.at(-1).ok,true);assert.equal(k.version,2);
 kernel.onResult(ctx,{msg:{}},'reconcile',{ok:true,msg:{fields:{apiResult:{charges:[{eventId:'third-charge'}]}}}});assert.equal(replies.at(-1).err,'rejected');assert.equal(Object.keys(k.applied).length,2);
});
test('journal crash drops pending jobs and a later real retry pumps the same admitted identity',()=>{
 const kernel=K.get('commandJournal'),k=kernel.init(),calls=[],jobs={},ctx={k,p:{capacity:2,maxRecords:2,callTimeoutMs:100,retries:0},wake(){},reply(){},job:id=>jobs[id],edges:()=>[{id:'authority'}],call(...args){calls.push(args);}};
 const msg={idem:'command',ptype:'json',op:'write',key:'x',fields:{operation:{action:'reserve'}}};jobs.old={id:'old',msg};kernel.onRequest(ctx,jobs.old);kernel.onFault(ctx,{type:'crash'},true);delete jobs.old;kernel.onWake(ctx,{kind:'pump'});assert.equal(calls.length,0);assert.equal(k.active,null);
 jobs.retry={id:'retry',msg};kernel.onRequest(ctx,jobs.retry);kernel.onWake(ctx,{kind:'pump'});assert.equal(calls.length,1);assert.equal(k.active,'retry');assert.equal(Object.keys(k.entries).length,1);
});
