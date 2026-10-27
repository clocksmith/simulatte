'use strict';
// Owner: public/simulatte/system-diagram/CATSCAN.md. Finite API semantic evidence.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const base=path.resolve(__dirname,'../public/data/system-diagram');
const C=require('../public/simulatte/system-diagram/class-library.js'),D=require('../public/simulatte/system-diagram/diagram.js'),E=require('../public/simulatte/system-diagram/engine.js');
const K=require('../public/simulatte/system-diagram/kernels-all.js');require('../public/simulatte/system-diagram/kernels-api-practice.js');
const config=require('../public/data/system-diagram/config.json'),manifest=structuredClone(require('../public/data/system-diagram/class-library.json'));
if(!manifest.packs.includes('classes/api-practice.json'))manifest.packs.push('classes/api-practice.json');
const library=C.build(manifest,manifest.packs.map(file=>require(path.join(base,file)))),deps={library,config,kernels:K};
const registry=require('../public/data/system-diagram/problems.json');
const solution=id=>registry.problems.find(p=>p.id===id).solutions[0];
function run(diagram,until=20){const c=D.compile(diagram,library,config),s=E.initialize(c,deps);E.advance(c,s,until,deps);assert.equal(E.observe(c,s,deps).error,null);return s;}
const items=k=>k.results.pages.flatMap(page=>page.items);
test('offset drift, keyset exclusion and snapshot visibility are different observable contracts',()=>{
 const stages=solution('pagination').stages.map(st=>run(st.diagram).kernel);
 assert.deepEqual(items(stages[0]),[1,2,3,3,4,5,6,7]);
 assert.deepEqual(items(stages[1]),[1,2,3,4,5,6,7]);
 assert.deepEqual(items(stages[2]),[1,2,3,4,5,6,7,8]);
 assert.deepEqual(stages[2].results.rows,[0,1,2,3,4,5,6,7]);
 assert.ok(stages[1].results.scanned<stages[0].results.scanned);
 for(const k of stages){assert.equal(k.readers.results.at(-1).error,'invalid');assert.equal(k.readers.failed,1);}
});
test('idempotency changes payment effects; stale renewal cannot undo cancellation',()=>{
 const stages=solution('subscriptions').stages.map(st=>run(st.diagram).kernel);
 assert.equal(stages[0].provider.charges.length,3);
 for(const k of stages.slice(1)){assert.equal(k.provider.charges.length,2);assert.deepEqual(k.provider.charges.map(c=>c.method),['card','bank']);assert.equal(k.subscriptions.status,'cancelled');assert.equal(k.subscriptions.version,3);assert.equal(k.subscriptions.stale,1);}
 assert.equal(stages[2].subscribers.results.find(r=>r.command.action==='renew').error,'timeout');
 assert.equal(stages[2].subscriptions.reconciled,1);
});
test('lost payment reply leaves a real provider/local divergence until reconciliation',()=>{
 const d=solution('subscriptions').stages[2].diagram;
 const before=run(d,2.2).kernel;
 assert.equal(before.provider.charges.length,2);assert.equal(before.subscriptions.version,1);
 const after=run(d,3.5).kernel;assert.equal(after.subscriptions.version,2);assert.equal(after.subscriptions.reconciled,1);
});
test('all API stages reproduce kernel state and severing the payment path refuses compilation',()=>{
 for(const id of ['pagination','subscriptions'])for(const st of solution(id).stages)assert.deepEqual(run(st.diagram),run(st.diagram));
 const d=structuredClone(solution('subscriptions').stages[2].diagram);d.edges=d.edges.filter(e=>e.id!=='charge-request');assert.throws(()=>run(d),/paymentProvider authority/);
});
test('provider repeats one payment identity without a second charge and refuses identity conflicts',()=>{
 const provider=K.get('paymentProvider'),replies=[],ctx={p:{idempotent:true},k:provider.init(),effect(){},reply(job,value){replies.push(value);}};
 const command={action:'signup',eventId:'one-charge',version:1,method:'card'};
 const job=c=>({msg:{fields:{apiCommand:c}}});
 provider.onServed(ctx,job(command));provider.onServed(ctx,job(command));
 provider.onServed(ctx,job({...command,method:'bank'}));
 assert.equal(ctx.k.charges.length,1);assert.equal(ctx.k.duplicates,1);assert.equal(replies.at(-1).ok,false);assert.equal(replies.at(-1).err,'invalid');
});
test('exhausted and empty pages return no cursor; an exhausted client never restarts implicitly',()=>{
 for(const st of solution('pagination').stages){const k=run(st.diagram).kernel;assert.equal(k.results.pages.at(-1).nextCursor,null);}
 const pager=K.get('paginationStore'),responses=[];
 const ctx={p:{mode:'keyset',pageSize:3},k:{...pager.init(),rows:[]},reply(job,value){responses.push(value);}};
 pager.onServed(ctx,{msg:{fields:{apiCommand:{action:'page',cursor:null}}}});
 assert.deepEqual(responses[0].fields.apiResult.items,[]);assert.equal(responses[0].fields.apiResult.nextCursor,null);
 const client=K.get('apiPracticeClient'),wakes=[];
 const source={p:{scenario:'pagination',intervalMs:800},k:{...client.init(),index:2,exhausted:true},wake(delay,value){wakes.push(value);},beginRequest(){assert.fail('Exhaustion must not create another request');}};
 client.onWake(source);assert.equal(source.k.index,3);assert.equal(source.k.skipped,1);assert.equal(wakes.length,1);
});
test('malformed, wrong-authority and mismatched payment acknowledgements cannot activate a subscription',()=>{
 const service=K.get('subscriptionService'),command={action:'signup',eventId:'signup-1',version:1,method:'card'};
 const good={providerNodeId:'provider',charge:{...command,amount:10}};
 for(const value of [{}, {...good,providerNodeId:'other-provider'}, {...good,charge:{...good.charge,eventId:'other'}}, {...good,charge:{...good.charge,amount:100}}]){
  const replies=[],ctx={k:{...service.init(),pending:{j:command}},edges:()=>[{to:'provider'}],reply(job,result){replies.push(result);}};
  service.onResult(ctx,{id:'j'},'charge',{ok:true,msg:{fields:{apiResult:value}}});
  assert.equal(ctx.k.status,'none');assert.equal(ctx.k.version,0);assert.equal(replies.at(-1).err,'invalid');
 }
});
test('reconciliation validates every ledger row and rejects identity conflicts atomically',()=>{
 const service=K.get('subscriptionService'),charge={action:'signup',eventId:'signup-1',version:1,method:'card',amount:10};
 for(const value of [{providerNodeId:'provider'}, {providerNodeId:'other',charges:[charge]}, {providerNodeId:'provider',charges:[charge,{}]}, {providerNodeId:'provider',charges:[charge,{...charge,method:'bank'}]}]){
  const replies=[],ctx={k:service.init(),edges:()=>[{to:'provider'}],reply(job,result){replies.push(result);}};
  service.onResult(ctx,{id:'j'},'reconcile',{ok:true,msg:{fields:{apiResult:value}}});
  assert.equal(ctx.k.status,'none');assert.equal(ctx.k.version,0);assert.deepEqual(ctx.k.applied,{});assert.equal(replies.at(-1).err,'invalid');
 }
});
