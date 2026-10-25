import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {sourceReceipt} from './runtime-audit-sources.mjs';
import {openBrowserAudit} from './browser-session.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=root+'artifacts/system-diagram-editor';
await fs.mkdir(output,{recursive:true});
const report={source:await sourceReceipt(root),boundary:'Local isolated Chrome desktop and touch-emulated mobile interaction evidence for the versioned diagram (v1 compatibility and v2 annotations), named-port library and coordinator runner. Synthetic model only; no deployment, external workloads, physical hardware or human acceptance proof.',cases:[]};
const viewports=[{width:1440,height:1000},{width:390,height:844}],requestedWidth=process.env.SIMULATTE_AUDIT_WIDTH?Number(process.env.SIMULATTE_AUDIT_WIDTH):null;
if(requestedWidth!==null&&!viewports.some(v=>v.width===requestedWidth))throw Error('Unsupported audit viewport');
for(const viewport of viewports.filter(v=>requestedWidth===null||v.width===requestedWidth)){
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
  await client.send('Page.navigate',{url:browser.host.baseUrl});await until(`document.querySelector('a[aria-label="Open System Diagram Simulator"]')`);await click('a[aria-label="Open System Diagram Simulator"]');
  await until(`document.body.dataset.editorReady==='true' || document.getElementById('status')?.getAttribute('role')==='alert'`);
  assert.equal(await evaluate(`document.body.dataset.editorReady`),'true',await evaluate(`document.getElementById('status').textContent`));await evaluate('document.fonts.ready.then(()=>true)');
  assert.equal(await evaluate('location.pathname'),'/system-diagram');row.checks.catalogNavigation=true;assert.ok(['simulatte.systemDiagram.v1','simulatte.systemDiagram.v2','simulatte.systemDiagram.v3'].includes((await doc()).schema));row.checks.canonicalDocument=true;
  await set('preset','web-service',{operation:true});
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);row.checks.noPageOverflow=true;
  await evaluate('scrollTo(0,0)');await shot('editor');
  assert.ok(await evaluate(`document.querySelectorAll('.palette-category-title').length>1`));
  assert.equal(await evaluate(`document.querySelectorAll('.palette-description').length===document.querySelectorAll('.palette-item').length`),true);
  await set('palette-search','LEASES redelivery');assert.ok(await evaluate(`document.querySelector('.palette-item[data-class-id="task-queue"]')`));
  await set('palette-search','');await set('palette-category','messaging');assert.equal(await evaluate(`document.querySelectorAll('.palette-category').length`),1);
  await set('palette-search','no-component-matches');assert.equal(await evaluate(`document.querySelectorAll('.palette-item').length`),0);
  await set('palette-search','');await set('palette-category','');row.checks.purposeAndCategorySearch=true;
  const original=await doc();await set('palette-search','Worker');
  const paletteSelector='.palette-item[data-class-id="worker"]';await evaluate(`document.querySelector(${JSON.stringify(paletteSelector)}).scrollIntoView({block:'start',inline:'center'})`);
  await evaluate(`scrollTo(0,document.querySelector('.palette-panel').getBoundingClientRect().top+scrollY-10)`);
  await drag(await point(paletteSelector,{scroll:false}),await point('#diagram',{ratioX:.65,ratioY:.45,scroll:false}));
  assert.equal((await doc()).nodes.length,original.nodes.length+1);row.checks.paletteDrag=true;
  let added=(await doc()).nodes.at(-1).id;const beforeMove=(await doc()).nodes.find(n=>n.id===added),a=await point(nodeSelector(added)+' .sd-node-body',{ratioY:.2});await drag(a,{x:a.x+24,y:a.y+24});
  const moved=(await doc()).nodes.find(n=>n.id===added);assert.ok(moved.x!==beforeMove.x||moved.y!==beforeMove.y);row.checks.nodeDrag=true;
  await evaluate(`document.querySelector(${JSON.stringify(nodeSelector(added))}).focus()`);await key('ArrowRight','ArrowRight',39);assert.equal((await doc()).nodes.find(n=>n.id===added).x,moved.x+8);row.checks.keyboardMove=true;
  await button('Duplicate');assert.equal((await doc()).nodes.length,original.nodes.length+2);row.checks.duplicate=true;
  await button('Delete');assert.equal((await doc()).nodes.length,original.nodes.length+1);row.checks.delete=true;
  await button('Undo');assert.equal((await doc()).nodes.length,original.nodes.length+2);await button('Redo');assert.equal((await doc()).nodes.length,original.nodes.length+1);row.checks.undoRedo=true;
  await selectNode(added);await button('Delete');assert.equal((await doc()).nodes.length,original.nodes.length);
  await selectNode('worker');assert.ok(await evaluate(`document.querySelector('.component-description').textContent.length>10`));
  assert.ok(await evaluate(`document.querySelectorAll('.basic-properties input,.basic-properties select').length<=6`));
  assert.equal(await evaluate(`document.querySelector('.advanced-properties').open`),false);
  await click('.advanced-properties>summary');assert.equal(await evaluate(`document.querySelector('.advanced-properties').open`),true);
  row.checks.progressiveProperties=true;
  await button('Create reusable class');let current=await doc(),userClass=current.nodes.find(n=>n.id==='worker').classId;assert.match(userClass,/^user\./);row.checks.reusableClass=true;
  await button('Instance overrides');await set('property-serviceMs',12);await button('Apply overrides');assert.equal((await doc()).nodes.find(n=>n.id==='worker').params.serviceMs,12);
  await button('Class defaults');await set('property-serviceMs',9);await button('Apply class defaults');current=await doc();assert.equal(current.classes.find(c=>c.id===userClass).defaults.serviceMs,9);assert.equal(current.nodes.find(n=>n.id==='worker').params.serviceMs,12);row.checks.classVsInstance=true;await shot('properties');
  await button('Instance overrides');await button('Clear overrides');assert.deepEqual((await doc()).nodes.find(n=>n.id==='worker').params,{});row.checks.resetOverride=true;
  await set('preset','blank',{operation:true});await set('preset','web-service',{operation:true});await set('palette-search','');await fit();row.checks.fitBounds=true;
  current=await doc();const edgeCount=current.edges.length;await point('#diagram');
  await drag(await port('clients','out'),await port('worker','calls'));assert.equal((await doc()).edges.length,edgeCount);assert.match(await evaluate(`document.getElementById('editor-status').textContent`),/port|output|input|opposite|direction/i);row.checks.invalidDirection=true;
  await evaluate(`document.querySelector('[data-node-id="clients"][data-port-id="out"]').focus()`);await key('Enter','Enter',13);await evaluate(`document.querySelector('[data-node-id="worker"][data-port-id="calls"]').focus()`);await key('Enter','Enter',13);assert.equal((await doc()).edges.length,edgeCount);await key('Escape','Escape',27);row.checks.keyboardPortValidation=true;
  await selectNode('worker');await set('instance-class','structured-response',{operation:true});assert.equal((await doc()).nodes.find(n=>n.id==='worker').classId,'structured-response');row.checks.classChange=true;
  await selectNode('clients');await set('property-payload','blob');await button('Apply overrides');await fit();const payloadEdgesBefore=(await doc()).edges.length;await point('#diagram');await drag(await port('clients','out'),await port('worker','in'));
  assert.equal((await doc()).edges.length,payloadEdgesBefore+1);assert.match(await evaluate(`document.getElementById('editor-status').textContent`),/expects|sends|payload|incompatible/i);
  await button('Run');assert.equal(await evaluate('SimulatteSystemDiagramEditor.accepted()'),null);assert.match(await evaluate(`document.getElementById('editor-status').textContent`),/incompatible payloads/i);row.checks.payloadWarningBlocksRun=true;
  await set('preset','blank',{operation:true});await set('preset','web-service',{operation:true});await fit();
  await point('#diagram');await drag(await port('clients','out'),await port('worker','in'));current=await doc();assert.equal(current.edges.length,edgeCount+1);const edge=current.edges.find(e=>e.from.nodeId==='clients'&&e.to.nodeId==='worker');assert.ok(edge);row.checks.namedPortConnection=true;
  await selectEdge(edge.id);await point('#diagram');await drag(await point(`[data-reconnect="${edge.id}"][data-side="to"]`,{scroll:false}),await port('results','in'));
  assert.equal((await doc()).edges.find(e=>e.id===edge.id).to.nodeId,'results');row.checks.endpointReconnect=true;
  await selectEdge(edge.id);await set('property-bandwidthMbps',25);await set('property-latencyMs',80);await button('Apply connection');assert.equal((await doc()).edges.find(e=>e.id===edge.id).params.bandwidthMbps,25);assert.equal((await doc()).edges.find(e=>e.id===edge.id).params.latencyMs,80);row.checks.linkProperties=true;
  await button('Delete');await fit();await button('Select multiple');await selectNode('api');await selectNode('worker');assert.equal((await evaluate('SimulatteSystemDiagramEditor.selection().nodes')).length,2);await button('Cluster');current=await doc();assert.equal(current.groups.length,1);assert.equal(current.groups[0].kind,'resource');assert.equal(current.groups[0].capacity,2);assert.equal(current.nodes.filter(n=>n.groupId===current.groups[0].id).length,2);await button('Select multiple');row.checks.resourceCluster=true;
  await button('Run');await button('Pause');assert.ok(await evaluate('SimulatteSystemDiagramEditor.accepted()'));row.checks.runPause=true;
  const groupId=(await doc()).groups[0].id,foldSnapshot=await snapshot(),foldAccepted=await evaluate('JSON.stringify(SimulatteSystemDiagramEditor.accepted())');
  await click(`[data-group-id="${groupId}"] .sd-group-toggle`);
  assert.equal((await doc()).groups[0].collapsed,true);assert.equal(await evaluate(`document.querySelector('.sd-node[data-node-id="worker"]')===null`),true);
  assert.ok(await evaluate(`document.querySelectorAll('[data-group-id="${groupId}"] .sd-proxy-port').length>0`));
  assert.deepEqual(await snapshot(),foldSnapshot);assert.equal(await evaluate('document.body.dataset.pending'),'false');
  assert.equal(await evaluate('JSON.stringify(SimulatteSystemDiagramEditor.accepted())'),foldAccepted);
  await click(`[data-group-id="${groupId}"] .sd-group-toggle`);assert.equal((await doc()).groups[0].collapsed,false);
  assert.ok(await evaluate(`document.querySelector('.sd-node[data-node-id="worker"]')!==null`));row.checks.expandCollapseActualComponents=true;
  const annotatedEdge=(await doc()).edges[0].id,acceptedBeforeLabel=await evaluate('JSON.stringify(SimulatteSystemDiagramEditor.accepted())');
  await selectEdge(annotatedEdge);await set('connection-label','Dispatch requests',{operation:true});
  assert.equal((await doc()).edges.find(e=>e.id===annotatedEdge).label,'Dispatch requests');
  assert.equal(await evaluate(`document.querySelector('[data-edge-id="${annotatedEdge}"] .sd-edge-label').textContent`),'Dispatch requests');
  assert.equal(await evaluate('document.body.dataset.pending'),'false');
  assert.equal(await evaluate('JSON.stringify(SimulatteSystemDiagramEditor.accepted())'),acceptedBeforeLabel);row.checks.annotationWithoutExecutionEdit=true;
  const acceptedBefore=await evaluate('JSON.stringify(SimulatteSystemDiagramEditor.accepted())');await selectNode('worker');await set('property-serviceMs',14);await button('Apply overrides');assert.equal(await evaluate('JSON.stringify(SimulatteSystemDiagramEditor.accepted())'),acceptedBefore);assert.match(await evaluate(`document.getElementById('revision').textContent`),/pending/);row.checks.pendingPreservesRun=true;
  await button('Undo');await button('Step 1 s');await button('Checkpoint');const cp=await snapshot();await button('Step 1 s');await button('Restore');assert.deepEqual(await snapshot(),cp);row.checks.checkpointRestore=true;
  await button('Replay');assert.match(await evaluate(`document.getElementById('editor-status').textContent`),/Exact replay matched/);row.checks.replay=true;
  await button('Save');const savedDoc=await doc();await selectNode('worker');await button('Duplicate');assert.equal((await doc()).nodes.length,savedDoc.nodes.length+1);await button('Load');assert.deepEqual(await doc(),savedDoc);row.checks.saveLoadPending=true;
  await click('#document-panel>summary');await button('Restore loaded replay');assert.deepEqual(await snapshot(),cp);row.checks.loadedReplay=true;
  await button('Show JSON');const exported=JSON.parse(await evaluate(`document.getElementById('document').value`));assert.equal(exported.diagram.schema,'simulatte.systemDiagram.v3');assert.equal(exported.diagram.edges.find(e=>e.id===annotatedEdge).label,'Dispatch requests');assert.ok(exported.accepted&&exported.checkpoint);await button('Import JSON');await button('Restore loaded replay');row.checks.jsonRoundTrip=true;
  await click('#document-panel>summary');await button('Step 1 s');assert.ok((await snapshot()).requests.length);await click('#requests button');assert.ok(await evaluate(`document.querySelectorAll('#history li').length>0`));row.checks.causalInspection=true;await point('#inspector');await shot('causal');
  await selectNode('worker');await button('Fail node');assert.equal((await snapshot()).nodes.worker.health,'down');await button('Step 1 s');await button('Repair node');assert.notEqual((await snapshot()).nodes.worker.health,'down');await button('Replay');assert.match(await evaluate(`document.getElementById('editor-status').textContent`),/Exact replay matched/);row.checks.recordedFaultRepair=true;
  await button('Reset');assert.equal((await snapshot()).t,0);row.checks.reset=true;
  const beforeZoom=await evaluate('SimulatteSystemDiagramEditor.viewport()');await button('+');const afterZoom=await evaluate('SimulatteSystemDiagramEditor.viewport()');assert.ok(afterZoom.zoom>beforeZoom.zoom);row.checks.zoom=true;
  const blank=await point('#diagram',{ratioX:.03,ratioY:.03}),panBefore=await evaluate('SimulatteSystemDiagramEditor.viewport()');await drag(blank,{x:blank.x+26,y:blank.y+24});const panAfter=await evaluate('SimulatteSystemDiagramEditor.viewport()');assert.ok(panAfter.x!==panBefore.x||panAfter.y!==panBefore.y);row.checks.pan=true;
  await fit();await evaluate('scrollTo(0,0)');await shot('final');assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);assert.deepEqual(errors,[]);assert.deepEqual(networkFailures,[]);row.pass=true;console.log(`${viewport.width}: ${Object.keys(row.checks).length} interaction checks passed`);
 }catch(error){row.pass=false;row.error=error.stack;row.status=await evaluate(`({status:document.getElementById('status')?.textContent,message:document.getElementById('editor-status')?.textContent,inputReceipt:document.getElementById('diagram')?.dataset.inputReceipt,selection:globalThis.SimulatteSystemDiagramEditor?.selection(),view:globalThis.SimulatteSystemDiagramEditor?.viewport(),document:globalThis.SimulatteSystemDiagramEditor?.document()})`);await shot('failure');throw error;}
 finally{await fs.writeFile(output+'/browser.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
}
console.log(JSON.stringify(report,null,2));
