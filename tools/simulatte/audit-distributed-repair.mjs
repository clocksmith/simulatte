import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {sourceReceipt} from './runtime-audit-sources.mjs';
import {openBrowserAudit} from './browser-session.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = root + 'artifacts/distributed-repair';
await fs.mkdir(output, {recursive:true});
const report = {source:await sourceReceipt(root),boundary:'Local browser controls on desktop and touch-emulated mobile; synthetic model, HTTP(S) restricted to the temporary loopback host, no deployment, production or human qualification.', cases:[]};
for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
  const browser = await openBrowserAudit({publicRoot:root+'public',viewport});
  const client = browser.client, errors=[], networkFailures=[], navigationCancellations=[], blockedExternal=[], requests=new Map();
  client.on('Network.requestWillBeSent', event => requests.set(event.requestId,{url:event.request.url,documentURL:event.documentURL}));
  client.on('Network.loadingFailed', event => { const request=requests.get(event.requestId); const record={error:event.errorText,canceled:event.canceled||false,...request}; if(request?.url && !request.url.startsWith(browser.host.baseUrl)) { if(!blockedExternal.includes(new URL(request.url).origin+new URL(request.url).pathname))blockedExternal.push(new URL(request.url).origin+new URL(request.url).pathname); } else if(event.canceled && request?.documentURL===browser.host.baseUrl)navigationCancellations.push(record);else networkFailures.push(record); });
  client.on('Fetch.requestPaused', async event => { if(event.request.url.startsWith(browser.host.baseUrl))await client.send('Fetch.continueRequest',{requestId:event.requestId});else { const url=new URL(event.request.url);blockedExternal.push(url.origin+url.pathname);await client.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'}); } });
  client.on('Network.responseReceived', event => { if(event.response.status>=400)networkFailures.push(`${event.response.status} ${event.response.url}`); });
  client.on('Runtime.exceptionThrown', event => errors.push(event.exceptionDetails?.text || 'exception'));
  const evaluate = async expression => { const result=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true}); if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);return result.result.value; };
  const until = async (expression, timeout=30000) => { const end=Date.now()+timeout; while(!await evaluate(expression)){if(Date.now()>end)throw Error('Timed out: '+expression);await new Promise(r=>setTimeout(r,100));} };
  async function click(label) {
    const before=await evaluate(`Number(document.body.dataset.operationSequence||0)`);
    const p=await evaluate(`(async()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Button unavailable: '+${JSON.stringify(label)});b.scrollIntoView({block:'center'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    row.lastAction={label,point:p,hit:await evaluate(`document.elementFromPoint(${p.x},${p.y})?.textContent`),viewport:await evaluate(`({x:scrollX,y:scrollY,width:innerWidth,height:innerHeight,visual:{x:visualViewport.offsetLeft,y:visualViewport.offsetTop,scale:visualViewport.scale}})`)};
    if(viewport.width<700){await client.send('Input.synthesizeTapGesture',{...p,duration:50,gestureSourceType:'touch'});}
    else{await client.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});}
    if(!label.startsWith('request-')) await until(`Number(document.body.dataset.operationSequence||0)>${before}`);
    await until(`![...document.querySelectorAll('button')].some(b=>b.getAttribute('aria-busy')==='true')`);
  }
  async function value(id, value) { await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`); }
  const row = {viewport,checks:{},errors,networkFailures,navigationCancellations,blockedExternal,screenshots:[]}; report.cases.push(row);
  try {
    await client.send('Page.enable'); await client.send('Runtime.enable'); await client.send('Network.enable'); await client.send('Fetch.enable',{patterns:[{urlPattern:'http://*',requestStage:'Request'},{urlPattern:'https://*',requestStage:'Request'}]});
    await client.send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile:viewport.width<700});
    await client.send('Emulation.setTouchEmulationEnabled',{enabled:viewport.width<700});
    await client.send('Page.navigate',{url:browser.host.baseUrl});
    await until(`Boolean(document.querySelector('[aria-label="World workbench"] a')?.getClientRects().length)`);
    await until(`document.readyState==='complete'`); await evaluate(`document.fonts.ready.then(()=>true)`);
    const entry = await evaluate(`(async()=>{const a=document.querySelector('[aria-label="World workbench"] a');a.scrollIntoView({block:'center'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const b=a.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2};})()`);
    if(viewport.width<700)await client.send('Input.synthesizeTapGesture',{...entry,duration:50,gestureSourceType:'touch'});
    else { await client.send('Input.dispatchMouseEvent',{type:'mousePressed',...entry,button:'left',clickCount:1}); await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',...entry,button:'left',clickCount:1}); }
    row.checks.worldEntry=true;
    await until(`document.getElementById('status')?.textContent.includes('running')`);
    await evaluate(`(()=>{globalThis.auditInputs=[];for(const type of ['touchstart','touchend','pointerdown','pointerup','click'])document.addEventListener(type,e=>auditInputs.push({type,target:e.target.textContent.slice(0,70),x:e.clientX,y:e.clientY,time:performance.now()}),true)})()`);
    await click('Pause'); await click('Step 1 s'); await click('Save checkpoint');
    const checkpointStatus = await evaluate(`document.getElementById('status').textContent`);
    await click('Step 1 s'); await click('Restore checkpoint');
    assert.equal(await evaluate(`document.getElementById('status').textContent`),checkpointStatus); row.checks.checkpointControls=true;
    for(let i=0;i<9;i++)await click('Step 1 s');
    assert.match(await evaluate(`document.getElementById('diagram').textContent`),/OFFLINE/);row.checks.failedStoreVisible=true;
    await evaluate(`document.getElementById('diagram').scrollLeft=document.getElementById('diagram').scrollWidth;document.getElementById('diagram').scrollIntoView({block:'center'})`);
    {const shot=await client.send('Page.captureScreenshot',{format:'png'});const file=`${viewport.width}-fault.png`;await fs.writeFile(output+'/'+file,Buffer.from(shot.data,'base64'));row.screenshots.push(file);}
    await click('Finish run'); await click('Verify replay');
    assert.match(await evaluate(`document.getElementById('editor-status').textContent`),/Exact coordinator replay matched/); row.checks.replayControl=true;
    await click('Compare policies');
    row.comparison = await evaluate(`document.getElementById('comparison').innerText`); assert.match(row.comparison,/Unfinished/); assert.match(row.comparison,/Rejected/); row.checks.pairedComparison=true;
    await click('Use bounded policy'); await click('Finish run');
    assert.equal(await evaluate(`document.querySelectorAll('#requests button').length`),18);
    await evaluate(`document.querySelectorAll('#requests button')[5].focus()`);
    await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
    await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
    await until(`document.querySelector('.wui-inspector-title')?.textContent==='request-6'`);
    assert.match(await evaluate(`document.getElementById('history').innerText`),/admission-rejected/); row.checks.keyboardRequestInspection=true;
    await click('request-1 · completed');
    assert.match(await evaluate(`document.getElementById('history').innerText`),/acknowledgement-failed/); row.checks.causalHistory=true;
    await evaluate(`document.getElementById('inspector').scrollIntoView({block:'start'})`);
    {const shot=await client.send('Page.captureScreenshot',{format:'png'});const file=`${viewport.width}-request.png`;await fs.writeFile(output+'/'+file,Buffer.from(shot.data,'base64'));row.screenshots.push(file);}
    const before = await evaluate(`document.getElementById('status').textContent`);
    await value('node-type','gpu'); await click('Add node');
    assert.match(await evaluate(`document.getElementById('revision').textContent`),/pending/);
    await click('Accept & restart'); assert.match(await evaluate(`document.getElementById('editor-status').textContent`),/Disconnected/);
    assert.equal(await evaluate(`document.getElementById('status').textContent`),before); row.checks.pendingPreservesRun=true;
    await value('from','source-1'); await value('to','store-4'); await click('Connect');
    assert.match(await evaluate(`document.getElementById('editor-status').textContent`),/Invalid connection/); row.checks.invalidConnections=true;
    await value('from','cpu-2'); await value('to','gpu-10'); await value('link-capacity','25'); await value('link-latency','0.2'); await click('Connect');
    await value('from','gpu-10'); await value('to','store-4'); await click('Connect');
    await evaluate(`for(const option of document.getElementById('group-members').options)option.selected=true`);
    await value('cluster-capacity','2'); await click('Create shared cluster');
    await evaluate(`document.getElementById('diagram').scrollLeft=0;document.getElementById('diagram').scrollIntoView({block:'center'})`);
    {const shot=await client.send('Page.captureScreenshot',{format:'png'});const file=`${viewport.width}-authoring.png`;await fs.writeFile(output+'/'+file,Buffer.from(shot.data,'base64'));row.screenshots.push(file);}
    await click('Accept & restart'); assert.match(await evaluate(`document.getElementById('revision').textContent`),/Accepted r2$/); row.checks.connectGroupAccept=true;
    await click('Step 1 s'); await click('Export replay');
    const exported = await evaluate(`document.getElementById('document').value`); const parsed=JSON.parse(exported);
    assert.equal(parsed.architecture.nodes.length,5); assert.ok(parsed.architecture.links.some(l=>l.capacity===25&&l.latency===0.2));
    await click('Import as pending'); await click('Accept imported replay'); await click('Verify replay');
    assert.match(await evaluate(`document.getElementById('editor-status').textContent`),/Exact coordinator replay matched/); row.checks.exportReimport=true;
    await value('selected','gpu-10'); await click('Remove selected'); await click('Accept & restart'); row.checks.removeAccept=true;
    await click('Step 1 s'); await click('Repair store now'); await click('Verify replay'); row.checks.repairReplay=true;
    await client.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    assert.equal(await evaluate(`matchMedia('(prefers-reduced-motion: reduce)').matches`),true);row.checks.reducedMotion=true;
    assert.equal(await evaluate(`document.documentElement.scrollWidth>innerWidth`),false);row.checks.noHorizontalPageOverflow=true;
    await click('Finish run'); await click('Compare policies');
    await evaluate(`scrollTo(0,0)`);
    const shot=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    const filename=`${viewport.width}-world.png`;await fs.writeFile(output+'/'+filename,Buffer.from(shot.data,'base64'));row.screenshot=filename;
    assert.deepEqual(errors,[]);assert.deepEqual(networkFailures,[]);row.pass=true;
  } catch(error) {row.pass=false;row.error=error.stack;row.pageStatus=await evaluate(`({inputs:globalThis.auditInputs?.slice(-12),status:document.getElementById('status')?.textContent,editor:document.getElementById('editor-status')?.textContent})`);const shot=await client.send('Page.captureScreenshot',{format:'png'});await fs.writeFile(output+`/${viewport.width}-failure.png`,Buffer.from(shot.data,'base64'));throw error;}
  finally {await fs.writeFile(output+'/browser.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
}
console.log(JSON.stringify(report,null,2));
