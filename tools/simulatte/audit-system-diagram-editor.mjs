import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {sourceReceipt} from './runtime-audit-sources.mjs';
import {openBrowserAudit} from './browser-session.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=root+'artifacts/system-diagram-editor';
await fs.mkdir(output,{recursive:true});
const report={source:await sourceReceipt(root),boundary:'Local isolated Chrome desktop and touch-emulated mobile interaction evidence. Synthetic model only; no deployment, external workloads, physical hardware or human acceptance proof.',cases:[]};
for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
 const browser=await openBrowserAudit({publicRoot:root+'public',viewport});
 const client=browser.client,errors=[],networkFailures=[],blockedExternal=[];
 const row={viewport,checks:{},errors,networkFailures,blockedExternal,screenshots:[]};report.cases.push(row);
 client.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails?.exception?.description||e.exceptionDetails?.text));
 client.on('Network.responseReceived',e=>{if(e.response.status>=400)networkFailures.push(`${e.response.status} ${e.response.url}`);});
 client.on('Fetch.requestPaused',async e=>{if(e.request.url.startsWith(browser.host.baseUrl))await client.send('Fetch.continueRequest',{requestId:e.requestId});else{blockedExternal.push(new URL(e.request.url).origin);await client.send('Fetch.failRequest',{requestId:e.requestId,errorReason:'BlockedByClient'});}});
 const evaluate=async expression=>{const r=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const delay=ms=>new Promise(r=>setTimeout(r,ms));
 const until=async(expr,timeout=20000)=>{const end=Date.now()+timeout;while(!await evaluate(expr)){if(Date.now()>end)throw Error('Timed out: '+expr);await delay(60);}};
 const doc=()=>evaluate('SimulatteSystemDiagramEditor.document()');
 const snapshot=()=>evaluate('SimulatteSystemDiagramEditor.snapshot()');
 async function point(selector,{ratioX=.5,ratioY=.5,scroll=true}={}){return evaluate(`(async()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing: '+${JSON.stringify(selector)});${scroll?"e.scrollIntoView({block:'center',inline:'center'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));":''}const b=e.getBoundingClientRect();return{x:b.x+b.width*${ratioX},y:b.y+b.height*${ratioY}};})()`);}
 async function key(key,code,windowsVirtualKeyCode){await client.send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode});await client.send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode});await delay(50);}
 async function tapAt(p,modifiers=0){if(viewport.width<700&&!modifiers)await client.send('Input.synthesizeTapGesture',{...p,duration:30,gestureSourceType:'touch'});else{await client.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1,modifiers});await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1,modifiers});}await delay(60);}
 async function click(selector,options){await tapAt(await point(selector,options));}
 async function button(label){const selector=await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Missing enabled button '+${JSON.stringify(label)});b.dataset.auditButton='active';return '[data-audit-button="active"]';})()`);await click(selector);await evaluate(`document.querySelector('[data-audit-button="active"]')?.removeAttribute('data-audit-button')`);}
 async function set(id,value){await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});if(!e)throw Error('Missing field '+${JSON.stringify(id)});e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await delay(30);}
 async function drag(a,b,{touch=viewport.width<700}={}){
  if(touch){await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}]});for(let i=1;i<=8;i++){await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+(b.x-a.x)*i/8,y:a.y+(b.y-a.y)*i/8,id:1}]});await delay(20);}await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else{await client.send('Input.dispatchMouseEvent',{type:'mouseMoved',...a});await client.send('Input.dispatchMouseEvent',{type:'mousePressed',...a,button:'left',clickCount:1});for(let i=1;i<=8;i++){await client.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:a.x+(b.x-a.x)*i/8,y:a.y+(b.y-a.y)*i/8,button:'left',buttons:1});await delay(20);}await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',...b,button:'left',clickCount:1});}await delay(100);
 }
 async function shot(name){const r=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});const filename=`${viewport.width}-${name}.png`;await fs.writeFile(output+'/'+filename,Buffer.from(r.data,'base64'));row.screenshots.push(filename);}
 function nodeSelector(id){return `.graph-node[data-node-id="${id}"]`;}
 async function nodePoint(id){return point(nodeSelector(id),{ratioX:.5,ratioY:.2});}
 async function selectNode(id,modifiers=0){await tapAt(await nodePoint(id),modifiers);}
 async function port(id,direction){return point(`[data-port="${direction}"][data-node-id="${id}"]`,{scroll:false});}
 try{
  await client.send('Page.enable');await client.send('Runtime.enable');await client.send('Network.enable');
  await client.send('Fetch.enable',{patterns:[{urlPattern:'http://*',requestStage:'Request'},{urlPattern:'https://*',requestStage:'Request'}]});
  await client.send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile:viewport.width<700});
  await client.send('Emulation.setTouchEmulationEnabled',{enabled:viewport.width<700});
  await client.send('Page.navigate',{url:browser.host.baseUrl});
  await until(`document.querySelector('a[aria-label="Open System Diagram Simulator"]')`);
  await click('a[aria-label="Open System Diagram Simulator"]');
  await until(`document.body.dataset.editorReady==='true' || document.getElementById('status')?.getAttribute('role')==='alert'`);
  assert.equal(await evaluate(`document.body.dataset.editorReady`),'true',await evaluate(`document.getElementById('status').textContent`));
  assert.equal(await evaluate('location.pathname'),'/system-diagram');row.checks.catalogNavigation=true;
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);row.checks.noPageOverflow=true;
  await evaluate('scrollTo(0,0)');await shot('editor');
  const original=await doc(),cpuClass=original.classes.find(c=>c.type==='cpu').id;
  const paletteSelector=`.palette-item[data-class-id="${cpuClass}"]`;
  await evaluate(`document.querySelector(${JSON.stringify(paletteSelector)}).scrollIntoView({block:'start',inline:'center'})`);
  const source=await point(paletteSelector,{scroll:false}),target=await point('#diagram',{ratioX:.65,ratioY:.4,scroll:false});
  if(source.y<0||target.y>viewport.height)await evaluate(`scrollTo(0,document.querySelector('.palette-panel').getBoundingClientRect().top+scrollY-10)`);
  await drag(await point(paletteSelector,{scroll:false}),await point('#diagram',{ratioX:.65,ratioY:.45,scroll:false}));
  assert.equal((await doc()).nodes.length,original.nodes.length+1);row.checks.paletteDrag=true;
  let added=(await doc()).nodes.at(-1).id;
  const beforeMove=(await doc()).nodes.find(n=>n.id===added),a=await nodePoint(added);await drag(a,{x:a.x+25,y:a.y+30});
  const moved=(await doc()).nodes.find(n=>n.id===added);assert.ok(moved.x!==beforeMove.x||moved.y!==beforeMove.y);row.checks.nodeDrag=true;
  await evaluate(`document.querySelector(${JSON.stringify(nodeSelector(added))}).focus()`);await key('ArrowRight','ArrowRight',39);assert.equal((await doc()).nodes.find(n=>n.id===added).x,moved.x+10);row.checks.keyboardMove=true;
  await button('Duplicate');assert.equal((await doc()).nodes.length,original.nodes.length+2);row.checks.duplicate=true;
  await button('Delete');assert.equal((await doc()).nodes.length,original.nodes.length+1);row.checks.delete=true;
  await button('Undo');assert.equal((await doc()).nodes.length,original.nodes.length+2);await button('Redo');assert.equal((await doc()).nodes.length,original.nodes.length+1);row.checks.undoRedo=true;
  await selectNode(added);await button('Delete');assert.equal((await doc()).nodes.length,original.nodes.length);
  const cpu=original.nodes.find(n=>original.classes.find(c=>c.id===n.classId).type==='rpc');
  await selectNode(cpu.id);await set('property-serviceTime',1.25);await button('Apply overrides');assert.equal((await doc()).nodes.find(n=>n.id===cpu.id).overrides.serviceTime,1.25);
  await button('Class defaults');await set('property-serviceTime',.9);await button('Apply class defaults');let current=await doc();assert.equal(current.classes.find(c=>c.id===cpu.classId).defaults.serviceTime,.9);assert.equal(current.nodes.find(n=>n.id===cpu.id).overrides.serviceTime,1.25);row.checks.classVsInstance=true;await shot('properties');
  await button('Instance overrides');await button('Clear overrides');assert.deepEqual((await doc()).nodes.find(n=>n.id===cpu.id).overrides,{});
  await button('Create reusable class');assert.equal((await doc()).classes.length,original.classes.length+1);row.checks.reusableClass=true;
  // Restore the starter by the actual preset selector before connection journeys.
  await set('preset','blank');await set('preset','pipeline');await button('Fit');
  row.nodeFit=await evaluate(`(()=>{const b=document.getElementById('diagram').getBoundingClientRect();return [...document.querySelectorAll('.graph-node')].map(n=>{const r=n.getBoundingClientRect();return{id:n.dataset.nodeId,inside:r.left>=b.left&&r.right<=b.right&&r.top>=b.top&&r.bottom<=b.bottom};});})()`);assert.ok(row.nodeFit.every(n=>n.inside),'Fit must show every node inside the canvas');row.checks.fitBounds=true;
  current=await doc();const getType=type=>current.nodes.find(n=>current.classes.find(c=>c.id===n.classId).type===type).id;
  const clientId=getType('client'),replicaId=getType('replica'),rpcId=getType('rpc'),queueId=getType('queue'),dbId=getType('database');
  // An invalid natural-language client -> structured-only replica port is rejected atomically.
  const linksBefore=current.links.length;await point('#diagram');row.wireViewport=await evaluate('SimulatteSystemDiagramEditor.viewport()');await drag(await port(clientId,'out'),await port(replicaId,'in'));
  assert.equal((await doc()).links.length,linksBefore);assert.match(await evaluate(`document.getElementById('editor-status').textContent`),/Incompatible|opposite typed port/);row.checks.invalidConnection=true;
  await evaluate(`document.querySelector('[data-port="out"][data-node-id="${clientId}"]').focus()`);await key('Enter','Enter',13);await evaluate(`document.querySelector('[data-port="in"][data-node-id="${replicaId}"]').focus()`);await key('Enter','Enter',13);assert.equal((await doc()).links.length,linksBefore);assert.match(await evaluate(`document.getElementById('editor-status').textContent`),/Incompatible/);row.checks.keyboardPortValidation=true;
  // Add a valid alternative execution edge, then reconnect its endpoint to another compatible node.
  await drag(await port(clientId,'out'),await port(rpcId,'in'));current=await doc();assert.equal(current.links.length,linksBefore+1);const edge=current.links.find(l=>l.from===clientId&&l.to===rpcId);row.checks.portConnection=true;
  await click(`[data-link-id="${edge.id}"] .graph-link-hit`);await point('#diagram');await drag(await point(`[data-reconnect="${edge.id}"][data-side="to"]`),await port(dbId,'in'));
  assert.equal((await doc()).links.find(l=>l.id===edge.id).to,dbId);row.checks.endpointReconnect=true;
  await button('Delete');await button('Fit');
  if(viewport.width<700){await button('Select multiple');await selectNode(queueId);await selectNode(rpcId);}else{await selectNode(queueId);await selectNode(rpcId,8);}assert.equal((await evaluate('SimulatteSystemDiagramEditor.selection()')).length,2);await button('Cluster');assert.equal((await doc()).clusters.length,1);row.checks.cluster=true;if(viewport.width<700)await button('Select multiple');
  await evaluate('scrollTo(0,0)');await button('Run');await button('Pause');assert.ok(await evaluate('SimulatteSystemDiagramEditor.accepted()'));row.checks.runPause=true;
  await button('Step 1 s');await button('Checkpoint');const cp=await snapshot();await button('Step 1 s');await button('Restore');assert.deepEqual(await snapshot(),cp);row.checks.checkpointRestore=true;
  await button('Replay');assert.match(await evaluate(`document.getElementById('editor-status').textContent`),/Exact seeded replay matched/);row.checks.replay=true;
  await button('Save');const savedDoc=await doc();await selectNode(queueId);await button('Duplicate');assert.equal((await doc()).nodes.length,savedDoc.nodes.length+1);await button('Load');assert.deepEqual(await doc(),savedDoc);row.checks.saveLoadPending=true;
  await click('#document-panel>summary');await button('Restore loaded replay');assert.deepEqual(await snapshot(),cp);row.checks.loadedReplay=true;
  await button('Show JSON');const exported=JSON.parse(await evaluate(`document.getElementById('document').value`));assert.equal(exported.document.schema,'simulatte.systemDiagram.v2');assert.ok(exported.accepted&&exported.checkpoint);await button('Import JSON');await button('Restore loaded replay');row.checks.jsonRoundTrip=true;
  await click('#document-panel>summary');
  await button('Step 1 s');const requests=await snapshot();assert.ok(requests.requests.length);
  await click('#requests button');assert.ok(await evaluate(`document.querySelectorAll('#history li').length>0`));row.checks.causalInspection=true;await point('#inspector');await shot('causal');
  await button('Reset');assert.equal((await snapshot()).time,0);row.checks.reset=true;
  const beforeZoom=await evaluate('SimulatteSystemDiagramEditor.viewport()');await button('+');const afterZoom=await evaluate('SimulatteSystemDiagramEditor.viewport()');assert.ok(afterZoom.zoom>beforeZoom.zoom);row.checks.zoom=true;
  const blank=await point('#diagram',{ratioX:.05,ratioY:.05});const panBefore=await evaluate('SimulatteSystemDiagramEditor.viewport()');await drag(blank,{x:blank.x+30,y:blank.y+25});const panAfter=await evaluate('SimulatteSystemDiagramEditor.viewport()');assert.ok(panAfter.x!==panBefore.x||panAfter.y!==panBefore.y);row.checks.pan=true;
  await button('Fit');await evaluate('scrollTo(0,0)');await shot('final');
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);assert.deepEqual(errors,[]);assert.deepEqual(networkFailures,[]);row.pass=true;
 }catch(error){row.pass=false;row.error=error.stack;row.status=await evaluate(`({status:document.getElementById('status')?.textContent,message:document.getElementById('editor-status')?.textContent,selection:globalThis.SimulatteSystemDiagramEditor?.selection(),document:globalThis.SimulatteSystemDiagramEditor?.document()})`);await shot('failure');throw error;}
 finally{await fs.writeFile(output+'/browser.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
}
console.log(JSON.stringify(report,null,2));
