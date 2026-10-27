import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {sourceReceipt} from './runtime-audit-sources.mjs';
import {openBrowserAudit} from './browser-session.mjs';
import {authorFamilyJourneys} from './system-diagram-family-journeys.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=root+'artifacts/system-diagram-journeys';
await fs.mkdir(output,{recursive:true});
const report={source:await sourceReceipt(root),boundary:'Desktop and touch-emulated mobile blank-canvas authoring, run settings, scheduled node/network faults, fractional checkpoint and restore, exact replay and immutable paired-comparison journey through the Run menu. Synthetic local model only; no production or human acceptance proof.',cases:[]};
const requestedWidth=process.env.SIMULATTE_AUDIT_WIDTH?Number(process.env.SIMULATTE_AUDIT_WIDTH):null;
for(const viewport of [{width:1440,height:1000},{width:390,height:844}].filter(v=>requestedWidth===null||v.width===requestedWidth)){
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
 const snapshot=()=>evaluate('SimulatteSystemDiagramEditor.playback.controller.view()');
 const runState=()=>evaluate('SimulatteSystemDiagramEditor.playback.controller.state()');
 async function point(selector,{ratioX=.5,ratioY=.5,scroll=true}={}){return evaluate(`(async()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing: '+${JSON.stringify(selector)});${scroll?"e.scrollIntoView({block:'center',inline:'center'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));":''}const b=e.getBoundingClientRect();return{x:b.x+b.width*${ratioX},y:b.y+b.height*${ratioY}};})()`);}
 async function key(key,code,windowsVirtualKeyCode){await client.send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode});await client.send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode});await delay(60);}
 async function inputPoint(p){const v=await evaluate('({x:visualViewport.offsetLeft,y:visualViewport.offsetTop})');return{x:p.x-v.x,y:p.y-v.y};}
 // DOM rectangles use layout coordinates; CDP injects in the visual viewport.
 async function tapAt(p,modifiers=0){p=await inputPoint(p);assert.ok(p.x>=0&&p.y>=0&&p.x<viewport.width&&p.y<viewport.height,`Point outside viewport ${JSON.stringify(p)}`);if(viewport.width<700&&!modifiers)await client.send('Input.synthesizeTapGesture',{...p,duration:30,gestureSourceType:'touch'});else{await client.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1,modifiers});await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1,modifiers});}await delay(60);}
 async function click(selector,options){await tapAt(await point(selector,options));}
 // Controls live in the Menu, the Properties drawer or rail sections; reach them the way a person would.
 async function reveal(label,scope='button'){
  const where=await evaluate(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(scope)})].find(b=>b.textContent===${JSON.stringify(label)});if(!b)return null;return b.closest('#workspace-menu')?'menu':b.closest('#properties-drawer')?'properties':b.closest('#palette-drawer')?'rail':'page';})()`);
  if(where==='menu')await evaluate(`(()=>{const m=document.getElementById('workspace-menu');if(!m.open){m.open=true;m.dataset.auditOpened='1';}})()`);
  if(where==='properties'&&await evaluate(`document.getElementById('properties-drawer').inert`))await click('#properties-toggle');
  if(where==='properties')await evaluate(`Promise.all(document.getElementById('properties-drawer').getAnimations({subtree:true}).map(a=>a.finished))`);
  if(where==='rail'){if(await evaluate(`document.body.dataset.paletteExpanded!=='true'`))await click('#palette-toggle');await evaluate(`(()=>{const b=[...document.querySelectorAll('#palette-drawer button')].find(b=>b.textContent===${JSON.stringify(label)});const d=b?.closest('details:not([open])');if(d)d.open=true;})()`);}
 }
 async function press(label,{operation}){
  await reveal(label);
  const before=await evaluate('Number(document.body.dataset.operationSequence||0)');
  const selector=await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(label)}&&b.getClientRects().length);if(!b||b.disabled)throw Error('Missing enabled visible button '+${JSON.stringify(label)});b.dataset.auditButton='active';return '[data-audit-button="active"]';})()`);
  row.lastAction={button:label};await click(selector);if(operation)await until(`Number(document.body.dataset.operationSequence||0)>${before}`);await evaluate(`document.querySelector('[data-audit-button="active"]')?.removeAttribute('data-audit-button')`);await evaluate(`(()=>{const m=document.getElementById('workspace-menu');if(m?.dataset.auditOpened){m.open=false;delete m.dataset.auditOpened;}})()`);
 }
 const button=label=>press(label,{operation:true});
 const dialogButton=label=>press(label,{operation:false});
 // Rail, drawer and dock transitions move targets; measure only after every animation has finished.
 async function settle(){await evaluate(`Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>null))).then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))`);}
 async function collapseRail(){if(await evaluate(`document.body.dataset.paletteExpanded==='true'&&innerWidth<700`))await click('#palette-toggle');await settle();}
 async function closeDialog(){await dialogButton('Close');await until(`!document.querySelector('dialog[open]')`);}
 async function discardIfAsked(){if(await evaluate(`!document.getElementById('unsaved-dialog').hidden`))await click('#unsaved-discard');}
 async function runMenu(command){
  if(!await evaluate(`document.querySelector('.sd-run-more').open`))await click('.sd-run-more > summary');
  const selector=`[data-run-command="${command}"]`;assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)}).disabled`),false,`Run menu ${command} is enabled`);
  row.lastAction={run:command};await click(selector);
 }
 async function restart(){await click('[data-run-command="restart"]');await until(`(()=>{const s=SimulatteSystemDiagramEditor.playback.controller.state();return s.accepted&&!s.busy&&s.time===0;})()`);}
 async function step(){const t=(await runState()).time;await click('[data-run-command="step"]');await until(`SimulatteSystemDiagramEditor.playback.controller.state().time>${t}`);}
 async function advanceTo(t){await runMenu('advance');await until(`Boolean(document.getElementById('run-advance-to'))`);await set('run-advance-to',t);await dialogButton('Advance');await until(`SimulatteSystemDiagramEditor.playback.controller.state().time===${t}`);await closeDialog();}
 async function verifyReplay(){await runMenu('verify');await until(`/Replay match/.test(document.getElementById('editor-status').textContent)`);}
 async function runSettings({seed,horizonSec}){await runMenu('settings');await until(`Boolean(document.getElementById('run-seed'))`);if(seed!==undefined)await set('run-seed',seed);if(horizonSec!==undefined)await set('run-horizonSec',horizonSec);await dialogButton('Apply run settings');await until(`/Applied/.test(document.querySelector('dialog[open] [role=status]').textContent)`);await closeDialog();}
 async function scheduleFault({kind,id,type,atSec,untilSec,params={}}){
  await runMenu('failures');await until(`Boolean(document.getElementById('fault-target'))`);const before=(await doc()).faults.length;
  await set('fault-target',`${kind}:${id}`);await set('fault-type',type);for(const[key,value]of Object.entries(params))await set('fault-param-'+key,value);
  await set('fault-at',atSec);await set('fault-until',untilSec===null?'':untilSec);await dialogButton('Schedule fault');
  await until(`SimulatteSystemDiagramEditor.document().faults.length===${before+1}`);await closeDialog();
 }
 async function captureBaseline(){await runMenu('baseline');await until('Boolean(SimulatteSystemDiagramEditor.playback.baseline())');return evaluate('SimulatteSystemDiagramEditor.playback.baseline()');}
 async function compareRepair(){await runMenu('compare');await until(`document.querySelector('.simulation-comparison').open||document.getElementById('editor-status').dataset.error==='true'`,60000);const comparison=await evaluate('SimulatteSystemDiagramEditor.playback.comparison()');assert.ok(comparison,await evaluate('document.getElementById("editor-status").textContent'));return comparison;}
 async function loadSaved(){const before=await evaluate('Number(document.body.dataset.operationSequence||0)');await dialogButton('Load');await until(`!document.getElementById('unsaved-dialog').hidden||Number(document.body.dataset.operationSequence||0)>${before}`);await discardIfAsked();await until(`Number(document.body.dataset.operationSequence||0)>${before}`);}
 async function set(id,value,{operation=false}={}){const before=await evaluate('Number(document.body.dataset.operationSequence||0)');const same=await evaluate(`document.getElementById(${JSON.stringify(id)})?.value===${JSON.stringify(String(value))}`);await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});if(!e)throw Error('Missing field '+${JSON.stringify(id)});e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);if(operation&&!same)await until(`Number(document.body.dataset.operationSequence||0)>${before}`);await delay(30);}
 async function drag(a,b,{touch=viewport.width<700}={}){
  a=await inputPoint(a);b=await inputPoint(b);
  row.lastAction={drag:{from:a,to:b,touch}};
  row.lastAction.viewport=await evaluate(`({scrollX,scrollY,visual:{offsetTop:visualViewport.offsetTop,offsetLeft:visualViewport.offsetLeft,pageTop:visualViewport.pageTop,pageLeft:visualViewport.pageLeft,scale:visualViewport.scale},canvas:document.getElementById('diagram').getBoundingClientRect().toJSON()})`);
  if(touch){await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}]});for(let i=1;i<=10;i++){await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+(b.x-a.x)*i/10,y:a.y+(b.y-a.y)*i/10,id:1}]});await delay(25);}await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else{await client.send('Input.dispatchMouseEvent',{type:'mouseMoved',...a});await client.send('Input.dispatchMouseEvent',{type:'mousePressed',...a,button:'left',clickCount:1});for(let i=1;i<=10;i++){await client.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:a.x+(b.x-a.x)*i/10,y:a.y+(b.y-a.y)*i/10,button:'left',buttons:1});await delay(25);}await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',...b,button:'left',clickCount:1});}await delay(120);
 }
 // At a phone-sized Fit, port touch targets overlap; pinch out around the pair first, as a person would.
 async function pinchAround(a,b){
  const span=Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y),1);
  const area=await usable(),room=Math.min(area.right-area.left,area.bottom-area.top)-60;
  const scale=Math.max(1,Math.min(4,room/span));if(scale<1.2)return;const c=await inputPoint({x:(a.x+b.x)/2,y:(a.y+b.y)/2}),fingers=d=>[{id:1,x:c.x-d,y:c.y,radiusX:3,radiusY:3,force:1},{id:2,x:c.x+d,y:c.y,radiusX:3,radiusY:3,force:1}],zoom=await evaluate('SimulatteSystemDiagramEditor.viewport().zoom');
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:fingers(24)});
  for(let i=1;i<=10;i++){await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:fingers(24*(1+(scale-1)*i/10))});await delay(25);}
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle();
  assert.ok(await evaluate('SimulatteSystemDiagramEditor.viewport().zoom')>zoom,'Two-finger pinch zooms the canvas');
 }
 // The usable canvas lies between the task card and the run dock; pan by dragging empty canvas, as a person would.
 async function usable(){return evaluate(`(()=>{const d=document.getElementById('diagram').getBoundingClientRect(),t=document.querySelector('.lucyd-task-bar')?.getBoundingClientRect(),k=document.querySelector('.sd-run-dock')?.getBoundingClientRect(),top=Math.max(d.top,t?.bottom||0)+8,bottom=Math.min(d.bottom,k?.top||d.bottom)-8;return{x:(d.left+d.right)/2,y:(top+bottom)/2,top,bottom,left:d.left+8,right:d.right-8};})()`);}
 async function emptyCanvasPoint(){return evaluate(`(()=>{const d=document.getElementById('diagram').getBoundingClientRect(),t=document.querySelector('.lucyd-task-bar')?.getBoundingClientRect(),k=document.querySelector('.sd-run-dock')?.getBoundingClientRect();for(let y=(t?.bottom||d.top)+20;y<(k?.top||d.bottom)-20;y+=17)for(let x=d.left+20;x<d.right-20;x+=17){const e=document.elementFromPoint(x,y);if(e&&e.closest('#diagram')&&!e.closest('.sd-node,.sd-edge,.sd-port,.sd-group,.sd-note,button,.sd-canvas-hint'))return{x,y};}return null;})()`);}
 async function owned(nodeId,portId,p){return evaluate(`Boolean(document.elementFromPoint(${p.x},${p.y})?.closest('[data-node-id="${nodeId}"]'))`);}
 async function connect(fromId,fromPort,toId,toPort){
  await settle();await point('#diagram');let a=await port(fromId,fromPort),b=await port(toId,toPort);
  if(viewport.width<700){
   await button('Fit');await settle();a=await port(fromId,fromPort);b=await port(toId,toPort);
   const width=await evaluate(`document.querySelector('.sd-node[data-node-id="${fromId}"] .sd-node-body').getBoundingClientRect().width`);
   if(width<120){
    const area=await usable(),start=await emptyCanvasPoint();assert.ok(start,'An empty canvas point is available for panning');
    const dx=area.x-(a.x+b.x)/2,dy=area.y-(a.y+b.y)/2;await drag(start,{x:Math.min(Math.max(start.x+dx,area.left),area.right),y:Math.min(Math.max(start.y+dy,area.top),area.bottom)});await settle();
    a=await port(fromId,fromPort);b=await port(toId,toPort);await pinchAround(a,b);a=await port(fromId,fromPort);b=await port(toId,toPort);
   }
  }
  if(!(await owned(fromId,fromPort,a)&&await owned(toId,toPort,b))){
   // Dense phone layouts can leave no pan and zoom where both touch targets are exposed; use the editor's keyboard connection and record it.
   assert.ok(viewport.width<700,`Ports ${fromId}.${fromPort} and ${toId}.${toPort} are covered on desktop`);
   row.connectionFallbacks=(row.connectionFallbacks||0)+1;row.lastAction={keyboardConnect:{fromId,fromPort,toId,toPort}};
   for(const[nodeId,portId]of[[fromId,fromPort],[toId,toPort]]){await evaluate(`document.querySelector('[data-node-id="${nodeId}"][data-port-id="${portId}"]').focus()`);await key('Enter','Enter',13);}
   return 'keyboard';
  }
  row.lastAction={connect:{fromId,fromPort,toId,toPort}};await drag(a,b);return viewport.width<700?'touch':'mouse';
 }
 async function shot(name){const r=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});const filename=`${viewport.width}-${name}.png`;await fs.writeFile(output+'/'+filename,Buffer.from(r.data,'base64'));row.screenshots.push(filename);}
 function nodeSelector(id){return `.sd-node[data-node-id="${id}"]`;}
 // Nodes can sit under floating controls such as the task card; tap only a point the node actually owns.
 async function selectNode(id){
  const owned=async()=>{await point('#diagram');const p=await point(nodeSelector(id)+' .sd-node-body',{ratioY:.2,scroll:false});const mine=p.x>=0&&p.x<viewport.width&&p.y>=0&&p.y<viewport.height&&await evaluate(`Boolean(document.elementFromPoint(${p.x},${p.y})?.closest(${JSON.stringify(nodeSelector(id))}))`);return mine?p:null;};
  let p=await owned();if(!p){await button('Fit');p=await owned();}assert.ok(p,`Node ${id} is reachable after Fit`);await tapAt(p);
  await until(`SimulatteSystemDiagramEditor.selection().nodes.includes(${JSON.stringify(id)})`);
 }
 async function port(id,portId){return point(`[data-port-id="${portId}"][data-node-id="${id}"]`,{scroll:false});}
 async function selectEdge(id){
  await point('#diagram');
  const visible=await evaluate(`(()=>{const group=document.querySelector('[data-edge-id="${id}"]'),path=group?.querySelector('path.sd-edge-line');if(!path)throw Error('Missing edge ${id}');const length=path.getTotalLength(),matrix=path.getScreenCTM();for(const ratio of [.5,.35,.65,.2,.8,.1,.9]){const point=path.getPointAtLength(length*ratio),p=new DOMPoint(point.x,point.y).matrixTransform(matrix);if(document.elementFromPoint(p.x,p.y)?.closest('[data-edge-id]')?.dataset.edgeId===${JSON.stringify(id)})return{x:p.x,y:p.y};}return null;})()`);
  if(visible){await tapAt(visible);row.edgeSelectionMethod='verified-path-hit';}
  else{await evaluate(`document.querySelector('[data-edge-id="${id}"]').focus()`);await key('Enter','Enter',13);row.edgeSelectionMethod='keyboard-overlap-fallback';}
  assert.deepEqual(await evaluate('SimulatteSystemDiagramEditor.selection().edges'),[id]);
 }
 async function fit(){await button('Fit');}
 try{
  await client.send('Page.enable');await client.send('Runtime.enable');await client.send('Network.enable');
  await client.send('Fetch.enable',{patterns:[{urlPattern:'http://*',requestStage:'Request'},{urlPattern:'https://*',requestStage:'Request'}]});
  await client.send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile:viewport.width<700});await client.send('Emulation.setTouchEmulationEnabled',{enabled:viewport.width<700});
  const open=async()=>{await until(`document.body.dataset.editorReady==='true' || document.getElementById('status')?.getAttribute('role')==='alert'`);assert.equal(await evaluate('document.body.dataset.editorReady'),'true',await evaluate('document.getElementById("status").textContent'));await evaluate('document.fonts.ready.then(()=>true)');};
  await client.send('Page.navigate',{url:browser.host.baseUrl+'system-diagram'});await open();
  assert.equal((await doc()).nodes.length,0);row.checks.blankStart=true;
  await button('Group');assert.equal((await doc()).groups[0].kind,'boundary');await button('Delete');assert.equal((await doc()).groups.length,0);row.checks.emptyBoundaryAuthoring=true;
  const ids={};
  for(const[classId,name,x,y]of[['web-client','client',.24,.17],['task-queue','queue',.76,.17],['worker','cpu',.24,.5],['gpu-worker','gpu',.76,.5],['database','database',.5,.82]]){
   if(viewport.width<700)await collapseRail();else if(await evaluate(`document.body.dataset.paletteExpanded!=='true'`))await click('#palette-toggle');
   await set('palette-search',classId==='web-client'?'Web users':classId==='task-queue'?'Task queue':classId==='gpu-worker'?'GPU':classId==='database'?'Database':'Worker');
   const selector=`.palette-item[data-class-id="${classId}"]`;
   await until(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
   await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`);
   const before=(await doc()).nodes.length;await drag(await point(selector,{scroll:false}),await point('#diagram',{ratioX:x,ratioY:y,scroll:false}));
   assert.equal((await doc()).nodes.length,before+1,`palette drag adds ${classId}`);ids[name]=(await doc()).nodes.at(-1).id;
  }
  await set('palette-search','');row.checks.blankPaletteDrag=true;await collapseRail();await button('Fit');await settle();await point('#diagram');
  for(const[from,out,to,input]of[[ids.client,'out',ids.queue,'in'],[ids.queue,'consumers',ids.cpu,'in'],[ids.cpu,'calls',ids.gpu,'in'],[ids.gpu,'calls',ids.database,'in']]){
   const before=(await doc()).edges.length;await connect(from,out,to,input);assert.equal((await doc()).edges.length,before+1,`connect ${out} to ${input}: ${await evaluate('document.getElementById("editor-status").textContent')}`);
  }
  row.checks.drawExecutableTopology=true;
  await selectNode(ids.cpu);await button('Create reusable class');const custom=(await doc()).nodes.find(n=>n.id===ids.cpu).classId;assert.match(custom,/^user\./);
  await set('property-serviceMs',100);await button('Apply class defaults');await button('Instance overrides');await set('property-concurrency',1);await button('Apply overrides');
  assert.equal((await doc()).classes.find(c=>c.id===custom).defaults.serviceMs,100);assert.equal((await doc()).nodes.find(n=>n.id===ids.cpu).params.concurrency,1);row.checks.classAndInstanceFromBlank=true;
  await button('Select multiple');await selectNode(ids.gpu);assert.equal((await evaluate('SimulatteSystemDiagramEditor.selection().nodes')).length,2);await button('Group');await button('Select multiple');
  await set('cluster-kind','resource');await until(`SimulatteSystemDiagramEditor.document().groups[0]?.kind==='resource'`);
  const groupDoc=await doc();assert.equal(groupDoc.groups[0].capacity,2);assert.equal(groupDoc.nodes.filter(n=>n.groupId===groupDoc.groups[0].id).length,2);row.checks.authoredResourceCluster=true;
  await selectNode(ids.client);await button('Instance overrides');
  for(const[id,value]of[['property-pattern','constant'],['property-ratePerSec',2],['property-maxRequests',6],['property-stopSec',3],['property-readFraction',0],['property-payload','task']])await set(id,value);
  await button('Apply overrides');
  await selectNode(ids.queue);await button('Instance overrides');await set('property-visibilityTimeoutMs',700);await set('property-retryDelayMs',100);await set('property-maxReceives',3);await button('Apply overrides');
  await selectNode(ids.database);await button('Instance overrides');await set('property-idempotentWrites','false');await button('Apply overrides');
  if(!await evaluate(`document.getElementById('properties-drawer').inert`))await click('#properties-toggle');
  await runSettings({seed:42,horizonSec:8});assert.deepEqual([(await doc()).seed,(await doc()).run.horizonSec],[42,8]);row.checks.runSettings=true;
  await scheduleFault({kind:'node',id:ids.database,type:'dropReplies',atSec:.4,untilSec:2.6});
  assert.equal((await doc()).faults[0].type,'dropReplies');row.checks.scheduledStoreAcknowledgementFault=true;
  const lastEdge=(await doc()).edges.at(-1).id;await scheduleFault({kind:'edge',id:lastEdge,type:'partition',atSec:4,untilSec:5});
  assert.equal((await doc()).faults[1].target.kind,'edge');row.checks.scheduledNetworkFault=true;
  await runMenu('failures');await until(`document.querySelectorAll('.simulation-fault-schedule li').length===2`);assert.doesNotMatch(await evaluate(`document.querySelector('.simulation-fault-schedule').textContent`),/wire-|edge-[0-9a-f]{6}/);await shot('faults');await closeDialog();
  const baseline=await captureBaseline();assert.equal(baseline.diagram.faults.length,2);assert.equal(baseline.diagram.seed,42);row.checks.captureImmutableBaseline=true;
  await click('[data-run-command="toggle"]');await until(`SimulatteSystemDiagramEditor.playback.controller.state().running`);await click('[data-run-command="toggle"]');await until(`!SimulatteSystemDiagramEditor.playback.controller.state().running`);
  await restart();await advanceTo(.35);await runMenu('checkpoint');await until(`SimulatteSystemDiagramEditor.playback.controller.state().checkpointSec===.35`);const checkpoint=await snapshot();
  await step();await step();assert.notDeepEqual(await snapshot(),checkpoint);await runMenu('restore');await until(`SimulatteSystemDiagramEditor.playback.controller.state().time===.35`);assert.deepEqual(await snapshot(),checkpoint);row.checks.fractionalCheckpointRestore=true;
  await verifyReplay();row.checks.authoredExactReplay=true;
  for(let i=0;i<4;i++)await step();
  await runMenu('requests');await until(`document.querySelectorAll('.simulation-request-row').length>0`);await click('.simulation-request-row');
  const detail=await evaluate(`document.querySelector('dialog.simulation-records').innerText`);assert.match(detail,/Delivery attempts/);assert.match(detail,/Input/);await shot('causal');await closeDialog();row.checks.causalInspection=true;
  await selectNode(ids.database);await button('Instance overrides');await set('property-idempotentWrites','true');await button('Apply overrides');
  if(!await evaluate(`document.getElementById('properties-drawer').inert`))await click('#properties-toggle');
  assert.equal((await runState()).accepted,false,'a repair edit leaves accepted execution for an explicit restart');assert.deepEqual(await evaluate('SimulatteSystemDiagramEditor.playback.baseline()'),baseline);row.checks.repairRemainsPending=true;
  const comparison=await compareRepair();
  assert.deepEqual(comparison.baseline.arrivals,comparison.repair.arrivals);assert.equal(comparison.seed,42);assert.deepEqual(comparison.faults,baseline.diagram.faults);row.checks.pairedActualArrivals=true;
  assert.ok(comparison.baseline.metrics.duplicateEffects>0);assert.equal(comparison.repair.metrics.duplicateEffects,0);
  assert.ok(comparison.baseline.metrics.unknownEffects>0);assert.equal(comparison.repair.metrics.unknownEffects,0);row.checks.independentRepairOutcome=true;
  const table=await evaluate(`document.getElementById('comparison-result').textContent`);assert.match(table,/Baseline.*Repair/s);assert.match(table,/p95 latency/);assert.match(table,/Unknown commit outcomes/);row.checks.modelReadouts=true;
  await shot('comparison');await closeDialog();
  await button('Save');const saved=await doc();await selectNode(ids.database);await button('Duplicate');assert.equal((await doc()).nodes.length,saved.nodes.length+1);await loadSaved();
  await until(`SimulatteSystemDiagramEditor.document().nodes.length===${saved.nodes.length}`);assert.deepEqual({...await doc(),view:null},{...saved,view:null});row.checks.authoredSaveReload=true;
  await restart();await advanceTo(.35);const beforeReload=await snapshot();
  await client.send('Page.reload');await open();await loadSaved();await until(`SimulatteSystemDiagramEditor.document().nodes.length===${saved.nodes.length}`);
  assert.deepEqual({...await doc(),view:null},{...saved,view:null});await restart();await advanceTo(.35);assert.deepEqual(await snapshot(),beforeReload);await verifyReplay();row.checks.reloadReplayReproducesRun=true;
  await authorFamilyJourneys({root,row,viewport,evaluate,until,doc,snapshot,runState,settle,collapseRail,connect,point,tapAt,click,button,dialogButton,closeDialog,discardIfAsked,runMenu,restart,step,advanceTo,verifyReplay,runSettings,scheduleFault,captureBaseline,compareRepair,loadSaved,set,drag,shot,key,selectNode,selectEdge,port});
  for(const preset of ['web-service','blank']){await set('preset',preset);await discardIfAsked();await until(`SimulatteSystemDiagramEditor.document().nodes.length ${preset==='blank'?'===0':'>0'}`);}
  const eventIds={};
  for(const[classId,label,x,y]of[['event-source','Synthetic event',.24,.2],['schema-validator','Schema validator',.76,.2],['event-ledger','Event ledger',.5,.7]]){
   if(viewport.width<700)await collapseRail();else if(await evaluate(`document.body.dataset.paletteExpanded!=='true'`))await click('#palette-toggle');
   await set('palette-search',label);const selector=`.palette-item[data-class-id="${classId}"]`;await until(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
   await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`);
   await drag(await point(selector,{scroll:false}),await point('#diagram',{ratioX:x,ratioY:y,scroll:false}));eventIds[classId]=(await doc()).nodes.at(-1).id;
  }
  await set('palette-search','');await collapseRail();await button('Fit');await connect(eventIds['event-source'],'out',eventIds['schema-validator'],'in');await connect(eventIds['schema-validator'],'accepted',eventIds['event-ledger'],'in');
  assert.equal((await doc()).edges.length,2);await restart();await step();assert.equal((await snapshot()).error,null);assert.ok((await snapshot()).requests.length);row.checks.blankEventPipeline=true;
  await point('#diagram');await shot('event-pipeline');
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);assert.deepEqual(errors,[]);assert.deepEqual(networkFailures,[]);row.pass=true;console.log(`${viewport.width}: ${Object.keys(row.checks).length} blank-authoring journey checks passed`);
 }catch(error){row.pass=false;row.error=error.stack;row.status=await evaluate(`({message:document.getElementById('editor-status')?.textContent,selection:globalThis.SimulatteSystemDiagramEditor?.selection(),view:globalThis.SimulatteSystemDiagramEditor?.viewport(),document:globalThis.SimulatteSystemDiagramEditor?.document()})`).catch(e=>String(e));await shot('failure');throw error;}
 finally{await fs.writeFile(output+'/browser.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
}
console.log(JSON.stringify(report,null,2));
