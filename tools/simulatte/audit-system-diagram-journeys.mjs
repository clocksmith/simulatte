import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {sourceReceipt} from './runtime-audit-sources.mjs';
import {openBrowserAudit} from './browser-session.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=root+'artifacts/system-diagram-journeys';
await fs.mkdir(output,{recursive:true});
const report={source:await sourceReceipt(root),boundary:'Desktop and touch-emulated mobile blank-canvas authoring, scheduled node/network faults, exact checkpoint replay and immutable paired-comparison journey. Synthetic local model only; no production or human acceptance proof.',cases:[]};
for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
 const browser=await openBrowserAudit({publicRoot:root+'public',viewport});
 const client=browser.client,errors=[],networkFailures=[],blockedExternal=[];
 const row={viewport,checks:{},errors,networkFailures,blockedExternal,screenshots:[]};report.cases.push(row);
 client.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails?.exception?.description||e.exceptionDetails?.text));
 client.on('Network.responseReceived',e=>{if(e.response.status>=400)networkFailures.push(`${e.response.status} ${e.response.url}`);});
 client.on('Fetch.requestPaused',async e=>{if(e.request.url.startsWith(browser.host.baseUrl))await client.send('Fetch.continueRequest',{requestId:e.requestId});else{blockedExternal.push(new URL(e.request.url).origin);await client.send('Fetch.failRequest',{requestId:e.requestId,errorReason:'BlockedByClient'});}});
 const evaluate=async expression=>{const r=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const delay=ms=>new Promise(r=>setTimeout(r,ms));
 const until=async(expr,timeout=30000)=>{const end=Date.now()+timeout;while(!await evaluate(expr)){if(Date.now()>end)throw Error('Timed out: '+expr);await delay(60);}};
 const doc=()=>evaluate('SimulatteSystemDiagramEditor.document()');
 const snapshot=()=>evaluate('SimulatteSystemDiagramEditor.snapshot()');
 async function point(selector,{ratioX=.5,ratioY=.5,scroll=true}={}){return evaluate(`(async()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing: '+${JSON.stringify(selector)});${scroll?"e.scrollIntoView({block:'center',inline:'center'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));":''}const b=e.getBoundingClientRect();return{x:b.x+b.width*${ratioX},y:b.y+b.height*${ratioY}};})()`);}
 async function key(key,code,windowsVirtualKeyCode){await client.send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode});await client.send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode});await delay(60);}
 async function inputPoint(p){const v=await evaluate('({x:visualViewport.offsetLeft,y:visualViewport.offsetTop})');return{x:p.x-v.x,y:p.y-v.y};}
 // DOM rectangles use layout coordinates; CDP injects in the visual viewport.
 async function tapAt(p,modifiers=0){p=await inputPoint(p);assert.ok(p.x>=0&&p.y>=0&&p.x<viewport.width&&p.y<viewport.height,`Point outside viewport ${JSON.stringify(p)}`);if(viewport.width<700&&!modifiers)await client.send('Input.synthesizeTapGesture',{...p,duration:30,gestureSourceType:'touch'});else{await client.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1,modifiers});await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1,modifiers});}await delay(60);}
 async function click(selector,options){await tapAt(await point(selector,options));}
 async function button(label){
  const before=await evaluate('Number(document.body.dataset.operationSequence||0)');
  const selector=await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(label)}&&b.getClientRects().length);if(!b||b.disabled)throw Error('Missing enabled visible button '+${JSON.stringify(label)});b.dataset.auditButton='active';return '[data-audit-button="active"]';})()`);
  row.lastAction={button:label};await click(selector);await until(`Number(document.body.dataset.operationSequence||0)>${before}`);await evaluate(`document.querySelector('[data-audit-button="active"]')?.removeAttribute('data-audit-button')`);
 }
 async function set(id,value,{operation=false}={}){const before=await evaluate('Number(document.body.dataset.operationSequence||0)');await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});if(!e)throw Error('Missing field '+${JSON.stringify(id)});e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);if(operation)await until(`Number(document.body.dataset.operationSequence||0)>${before}`);await delay(30);}
 async function drag(a,b,{touch=viewport.width<700}={}){
  a=await inputPoint(a);b=await inputPoint(b);
  row.lastAction={drag:{from:a,to:b,touch}};
  row.lastAction.viewport=await evaluate(`({scrollX,scrollY,visual:{offsetTop:visualViewport.offsetTop,offsetLeft:visualViewport.offsetLeft,pageTop:visualViewport.pageTop,pageLeft:visualViewport.pageLeft,scale:visualViewport.scale},canvas:document.getElementById('diagram').getBoundingClientRect().toJSON()})`);
  if(touch){await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}]});for(let i=1;i<=10;i++){await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+(b.x-a.x)*i/10,y:a.y+(b.y-a.y)*i/10,id:1}]});await delay(25);}await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else{await client.send('Input.dispatchMouseEvent',{type:'mouseMoved',...a});await client.send('Input.dispatchMouseEvent',{type:'mousePressed',...a,button:'left',clickCount:1});for(let i=1;i<=10;i++){await client.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:a.x+(b.x-a.x)*i/10,y:a.y+(b.y-a.y)*i/10,button:'left',buttons:1});await delay(25);}await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',...b,button:'left',clickCount:1});}await delay(120);
 }
 async function shot(name){const r=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});const filename=`${viewport.width}-${name}.png`;await fs.writeFile(output+'/'+filename,Buffer.from(r.data,'base64'));row.screenshots.push(filename);}
 function nodeSelector(id){return `.sd-node[data-node-id="${id}"]`;}
 async function selectNode(id){await point('#diagram');let p=await point(nodeSelector(id)+' .sd-node-body',{ratioY:.2,scroll:false});if(p.x<0||p.x>viewport.width||p.y<0||p.y>viewport.height){await button('Fit');await point('#diagram');p=await point(nodeSelector(id)+' .sd-node-body',{ratioY:.2,scroll:false});}await tapAt(p);}
 async function port(id,portId){return point(`[data-port-id="${portId}"][data-node-id="${id}"]`,{scroll:false});}
 async function selectEdge(id){
  await point('#diagram');
  const visible=await evaluate(`(()=>{const group=document.querySelector('[data-edge-id="${id}"]'),path=group?.querySelector('path.sd-edge-line');if(!path)throw Error('Missing edge ${id}');const length=path.getTotalLength(),matrix=path.getScreenCTM();for(const ratio of [.5,.35,.65,.2,.8,.1,.9]){const point=path.getPointAtLength(length*ratio),p=new DOMPoint(point.x,point.y).matrixTransform(matrix);if(document.elementFromPoint(p.x,p.y)?.closest('[data-edge-id]')?.dataset.edgeId===${JSON.stringify(id)})return{x:p.x,y:p.y};}return null;})()`);
  if(visible){await tapAt(visible);row.edgeSelectionMethod='verified-path-hit';}
  else{await evaluate(`document.querySelector('[data-edge-id="${id}"]').focus()`);await key('Enter','Enter',13);row.edgeSelectionMethod='keyboard-overlap-fallback';}
  assert.deepEqual(await evaluate('SimulatteSystemDiagramEditor.selection().edges'),[id]);
 }
 async function fit(){await button('Fit');row.nodeFit=await evaluate(`(()=>{const b=document.getElementById('diagram').getBoundingClientRect();return [...document.querySelectorAll('.sd-node-body')].map(n=>{const r=n.getBoundingClientRect();return{id:n.closest('[data-node-id]').dataset.nodeId,inside:r.left>=b.left-1&&r.right<=b.right+1&&r.top>=b.top-1&&r.bottom<=b.bottom+1};});})()`);assert.ok(row.nodeFit.every(n=>n.inside),'Fit must show every node inside the canvas');}
 try{
  await client.send('Page.enable');await client.send('Runtime.enable');await client.send('Network.enable');
  await client.send('Fetch.enable',{patterns:[{urlPattern:'http://*',requestStage:'Request'},{urlPattern:'https://*',requestStage:'Request'}]});
  await client.send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile:viewport.width<700});await client.send('Emulation.setTouchEmulationEnabled',{enabled:viewport.width<700});
  await client.send('Page.navigate',{url:browser.host.baseUrl+'system-diagram'});await until(`document.body.dataset.editorReady==='true' || document.getElementById('status')?.getAttribute('role')==='alert'`);
  assert.equal(await evaluate('document.body.dataset.editorReady'),'true',await evaluate('document.getElementById("status").textContent'));
  await evaluate('document.fonts.ready.then(()=>true)');await set('preset','blank',{operation:true});assert.equal((await doc()).nodes.length,0);row.checks.blankStart=true;
  await button('Cluster');assert.equal((await doc()).groups[0].kind,'boundary');await button('Delete');assert.equal((await doc()).groups.length,0);row.checks.emptyBoundaryAuthoring=true;
  const ids={};
  for(const[classId,name,x,y]of[['web-client','client',.24,.17],['task-queue','queue',.76,.17],['worker','cpu',.24,.5],['gpu-worker','gpu',.76,.5],['database','database',.5,.82]]){
    await set('palette-search',classId==='web-client'?'Web users':classId==='task-queue'?'Task queue':classId==='gpu-worker'?'GPU':'Worker');
    if(classId==='database')await set('palette-search','Database');
    const selector=`.palette-item[data-class-id="${classId}"]`;
    await until(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start',inline:'center'});scrollTo(0,document.querySelector('.palette-panel').getBoundingClientRect().top+scrollY-10)`);
    const before=(await doc()).nodes.length;await drag(await point(selector,{scroll:false}),await point('#diagram',{ratioX:x,ratioY:y,scroll:false}));
    assert.equal((await doc()).nodes.length,before+1);ids[name]=(await doc()).nodes.at(-1).id;
  }
  row.checks.blankPaletteDrag=true;await button('Fit');await point('#diagram');
  for(const[from,out,to,input]of[[ids.client,'out',ids.queue,'in'],[ids.queue,'consumers',ids.cpu,'in'],[ids.cpu,'calls',ids.gpu,'in'],[ids.gpu,'calls',ids.database,'in']]){
    const before=(await doc()).edges.length;await point('#diagram');await drag(await port(from,out),await port(to,input));assert.equal((await doc()).edges.length,before+1);
  }
  row.checks.drawExecutableTopology=true;
  await selectNode(ids.cpu);await button('Create reusable class');const custom=(await doc()).nodes.find(n=>n.id===ids.cpu).classId;assert.match(custom,/^user\./);
  await set('property-serviceMs',100);await button('Apply class defaults');await button('Instance overrides');await set('property-concurrency',1);await button('Apply overrides');
  assert.equal((await doc()).classes.find(c=>c.id===custom).defaults.serviceMs,100);assert.equal((await doc()).nodes.find(n=>n.id===ids.cpu).params.concurrency,1);row.checks.classAndInstanceFromBlank=true;
  await button('Select multiple');await selectNode(ids.gpu);assert.equal((await evaluate('SimulatteSystemDiagramEditor.selection().nodes')).length,2);await button('Cluster');await button('Select multiple');
  assert.equal((await doc()).groups[0].kind,'resource');const groupDoc=await doc();assert.equal(groupDoc.nodes.filter(n=>n.groupId===groupDoc.groups[0].id).length,2);row.checks.authoredResourceCluster=true;
  await selectNode(ids.client);await button('Instance overrides');
  for(const[id,value]of[['property-pattern','constant'],['property-ratePerSec',2],['property-maxRequests',6],['property-stopSec',3],['property-readFraction',0],['property-payload','task']])await set(id,value);
  await button('Apply overrides');
  await selectNode(ids.queue);await button('Instance overrides');await set('property-visibilityTimeoutMs',700);await set('property-retryDelayMs',100);await set('property-maxReceives',3);await button('Apply overrides');
  await selectNode(ids.database);await button('Instance overrides');await set('property-idempotentWrites','false');await button('Apply overrides');
  await evaluate(`document.getElementById('diagram').focus()`);await key('Escape','Escape',27);await set('workload-horizon',8);await button('Apply diagram');
  await click('#fault-panel>summary');await set('fault-target','node|'+ids.database);await set('fault-type','dropReplies');await set('fault-at',.4);await set('fault-until',2.6);await button('Schedule fault');
  assert.equal((await doc()).faults.length,1);assert.equal((await doc()).faults[0].type,'dropReplies');row.checks.scheduledStoreAcknowledgementFault=true;
  const lastEdge=(await doc()).edges.at(-1).id;await set('fault-target','edge|'+lastEdge);await set('fault-type','partition');await set('fault-at',4);await set('fault-until',5);await button('Schedule fault');
  assert.equal((await doc()).faults.length,2);assert.equal((await doc()).faults[1].target.kind,'edge');row.checks.scheduledNetworkFault=true;
  await point('#fault-panel');await shot('faults');await click('#fault-panel>summary');
  await button('Capture baseline');const baseline=await evaluate('SimulatteSystemDiagramEditor.baseline()');assert.equal(baseline.faults.length,2);row.checks.captureImmutableBaseline=true;
  await button('Run');await button('Pause');await button('Step 1 s');await button('Checkpoint');const checkpoint=await snapshot();await button('Step 1 s');await button('Restore');assert.deepEqual(await snapshot(),checkpoint);row.checks.authoredRunCheckpoint=true;
  await button('Replay');assert.match(await evaluate('document.getElementById("editor-status").textContent'),/Exact replay matched/);row.checks.authoredExactReplay=true;
  const accepted=await evaluate('SimulatteSystemDiagramEditor.accepted()');
  await selectNode(ids.database);await button('Instance overrides');await set('property-idempotentWrites','true');await button('Apply overrides');assert.deepEqual(await evaluate('SimulatteSystemDiagramEditor.accepted()'),accepted);row.checks.repairRemainsPending=true;
  await button('Compare repair');const comparison=await evaluate('SimulatteSystemDiagramEditor.comparison()');assert.ok(comparison,await evaluate('document.getElementById("editor-status").textContent'));
  assert.deepEqual(comparison.baseline.arrivals,comparison.repair.arrivals);assert.equal(comparison.seed,baseline.seed);assert.deepEqual(comparison.faults,baseline.faults);assert.deepEqual(await snapshot(),checkpoint);row.checks.pairedActualArrivals=true;row.checks.comparisonPreservesAcceptedCheckpoint=true;
  assert.match(await evaluate('document.getElementById("comparison-result").textContent'),/Baseline.*Repair/s);await point('#comparison-panel');await shot('comparison');
  await button('Save');const saved=await doc();await selectNode(ids.database);await button('Duplicate');await button('Load');assert.deepEqual(await doc(),saved);row.checks.authoredSaveReload=true;
  await click('#document-panel>summary');await button('Restore loaded replay');assert.deepEqual(await snapshot(),checkpoint);await click('#document-panel>summary');row.checks.authoredAcceptedReplayReload=true;
  assert.ok((await snapshot()).requests.length);await click('#requests button');assert.ok(await evaluate('document.querySelectorAll("#history li").length>0'));row.checks.causalInspection=true;await point('#inspector');await shot('causal');
  assert.match(await evaluate('document.getElementById("metrics").textContent'),/p95 latency/);assert.match(await evaluate('document.getElementById("metrics").textContent'),/Unknown commit outcomes/);row.checks.modelReadouts=true;
  row.examples=[];
  for(const exampleId of ['streaming-burst','replica-recovery','agent-recovery','healthcare-ingestion','finance-reconciliation','lakehouse-late-data']){
    await set('preset',exampleId,{operation:true});await button('Accept & run');await button('Pause');
    for(let i=0;i<6&&!(await snapshot()).requests.length;i++)await button('Step 1 s');
    const example=await snapshot();assert.equal(example.error,null,`${exampleId}: ${example.error}`);assert.ok(example.requests.length,`${exampleId} must expose causal requests`);
    await click('#requests button');assert.ok(await evaluate('document.querySelectorAll("#history li").length>0'));
    row.examples.push({id:exampleId,time:example.t,requests:example.requests.length,offered:example.global.offered,completed:example.global.completed});
  }
  row.checks.composablePackJourneys=true;
  await set('preset','blank',{operation:true});const eventIds={};
  for(const[classId,label,x,y]of[['event-source','Synthetic event',.24,.2],['schema-validator','Schema validator',.76,.2],['event-ledger','Event ledger',.5,.7]]){
    await set('palette-search',label);const selector=`.palette-item[data-class-id="${classId}"]`;await until(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start',inline:'center'});scrollTo(0,document.querySelector('.palette-panel').getBoundingClientRect().top+scrollY-10)`);
    await drag(await point(selector,{scroll:false}),await point('#diagram',{ratioX:x,ratioY:y,scroll:false}));eventIds[classId]=(await doc()).nodes.at(-1).id;
  }
  await button('Fit');await point('#diagram');await drag(await port(eventIds['event-source'],'out'),await port(eventIds['schema-validator'],'in'));await drag(await port(eventIds['schema-validator'],'accepted'),await port(eventIds['event-ledger'],'in'));
  assert.equal((await doc()).edges.length,2);await button('Accept & run');await button('Pause');await button('Step 1 s');assert.equal((await snapshot()).error,null);assert.ok((await snapshot()).requests.length);row.checks.blankEventPipeline=true;
  await point('#diagram');await shot('event-pipeline');
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);assert.deepEqual(errors,[]);assert.deepEqual(networkFailures,[]);row.pass=true;console.log(`${viewport.width}: ${Object.keys(row.checks).length} blank-authoring journey checks passed`);
 }catch(error){row.pass=false;row.error=error.stack;row.status=await evaluate(`({status:document.getElementById('status')?.textContent,message:document.getElementById('editor-status')?.textContent,inputReceipt:document.getElementById('diagram')?.dataset.inputReceipt,selection:globalThis.SimulatteSystemDiagramEditor?.selection(),view:globalThis.SimulatteSystemDiagramEditor?.viewport(),document:globalThis.SimulatteSystemDiagramEditor?.document()})`);await shot('failure');throw error;}
 finally{await fs.writeFile(output+'/browser.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
}
console.log(JSON.stringify(report,null,2));
