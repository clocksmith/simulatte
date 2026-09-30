#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { openBrowserAudit } from './browser-session.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const sourceFiles=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','public'],{cwd:root,encoding:'utf8'}).trim().split('\n'))].filter(name=>
  /^public\/(blank\/app|shared\/(contracts|design|plugins)|simulatte\/(app|motorcycle-noise|platform))\//.test(name) && /\.(js|css|html)$/.test(name)
  || ['public/index.html','public/blank/index.html','public/world-tiers.css'].includes(name));
const hashSources=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async name=>[name,createHash('sha256').update(await fs.readFile(path.join(root,name))).digest('hex')])));
sourceFiles.push('tools/simulatte/audit-session-interactions.mjs');
const sourceHashes=await hashSources();
const mobile = process.argv.includes('--mobile');
const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 };
const out = path.join(root, 'artifacts/session-interactions', mobile ? 'mobile' : 'desktop');
await fs.mkdir(out, { recursive: true });
const routes = [
  ['datacenter/gpu-supercluster-v1', 'rack:R1-1'],
  ['city/sun-walker-v1', 'sun-walker-actor'],
  ['world/subsea-network-global-v1', 'corridor:'],
  ['country/grid-resilience-us-v1', 'grid-region:'],
  ['solar-system/orbital-transfer-planner-v1', 'body:mars'],
  ['star-chart/interstellar-relay-network-v1', 'star:'],
];
const displayRoot = path.join(root, 'artifacts/solar-drive/browser-deps/root');
const displayBinary = process.env.SIMULATTE_XVFB || await fs.access('/usr/bin/Xvfb').then(() => '/usr/bin/Xvfb', () => path.join(displayRoot, 'usr/bin/Xvfb'));
const virtualDisplay = spawn(displayBinary, ['-displayfd', '3', '-screen', '0', '1600x1200x24', '-nolisten', 'tcp', '-ac', '-noreset'], {
  env: { ...process.env, LD_LIBRARY_PATH: path.join(displayRoot, 'usr/lib/x86_64-linux-gnu') + ':' + (process.env.LD_LIBRARY_PATH || '') },
  stdio: ['ignore', 'ignore', 'pipe', 'pipe'],
});
process.env.DISPLAY = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => { virtualDisplay.kill(); reject(new Error('Xvfb startup timed out')); }, 15000);
  virtualDisplay.once('error', error => { clearTimeout(timer); reject(error); });
  virtualDisplay.stdio[3].once('data', data => { clearTimeout(timer); resolve(':' + data.toString().trim()); });
});
const selected = process.argv.find(arg => arg.startsWith('--profile='))?.split('=')[1];
const browser = await openBrowserAudit({ publicRoot: path.join(root, 'public'), viewport, headed: true, chromePath: '/usr/bin/google-chrome', webgpu: true, linuxVulkan: false,
  args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=vulkan','--enable-features=Vulkan','--use-vulkan=swiftshader','--disable-vulkan-surface','--use-webgpu-adapter=swiftshader','--enable-unsafe-swiftshader'] });
const { client, host } = browser;
const report = { navigationPolicy: 'Public landing exposes Motorcycle, GPU Cluster and Sun Walker. Other retained profiles and Your Data are tested with the launch gate disabled in this local browser only.', sourceHashes, schema: 'simulatte.sessionJourney.v1', viewport, layer: 'local-browser', backendPolicy: 'Headed Chrome on isolated Xvfb; explicit SwiftShader software rendering, not hardware performance evidence', routes: [] };
const evaluate = async expression => {
  const response = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result.value;
};
const wait = async (expression, timeout = 90000) => {
  const start = Date.now();
  for (;;) {
    const value = await evaluate(expression); if (value) return value;
    if (Date.now() - start > timeout) throw new Error(`Timed out: ${expression}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
};
const snapshot = () => evaluate(`(() => {
  const session=globalThis.SimulatteActiveSession?.snapshot();
  const contributions=globalThis.__simulattePluginPlatformV4?.contributions||[];
  const owner=contributions.find(c=>session?.id.startsWith(c.pluginId));
  const panel=document.querySelector('.sim-object-inspector');
  const canvas=[...document.querySelectorAll('canvas')].find(c=>c.__simulatteObjectTargets);
  return {session, model:owner?.state, controls:owner?.controls.controls.map(c=>({id:c.id,value:c.value})),
    inspections:owner?.inspections.map(row=>({id:row.id,targetIds:row.targetIds,fields:row.fields.map(({id,label,value,unit})=>({id,label,value,unit}))})), selected:panel?.querySelector('select').value,
    advanced:document.getElementById('decisions-drawer')?.classList.contains('is-open'),
    view:canvas?.__simulatteRenderReceipt?.().view, render:canvas?.__simulatteRenderReceipt?.().backend,
    focus:document.activeElement?.dataset.objectAction||document.activeElement?.getAttribute('aria-label'),
    scroll:panel?.querySelector('div')?.scrollTop,
    error:globalThis.__simulatteLastFailError}; })()`);
const invoke = (id, value) => evaluate(`SimulatteActiveSession.invoke(${JSON.stringify(id)},${JSON.stringify(value) || 'undefined'}).then(()=>true)`);
const click = async selector => {
  await wait(`document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled`);
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  await wait(`globalThis.SimulatteActiveSession.snapshot().pending.length===0`);
  const value = await snapshot();
  assert.notEqual(value.session.lastOperation?.status, 'failed', JSON.stringify(value.session.lastOperation));
  return value;
};
async function pixelEvidence(screenshot, { sparse = false } = {}) {
  const evidence = await evaluate(`(async () => {
    const scene = [...document.querySelectorAll('canvas')].find(c => c.__simulatteObjectTargets) || document.querySelector('.canvas canvas');
    const rect = scene.getBoundingClientRect();
    const image = new Image(); image.src = 'data:image/png;base64,${screenshot.data}'; await image.decode();
    const sample = document.createElement('canvas'); sample.width = 120; sample.height = 80;
    const ctx = sample.getContext('2d');
    ctx.drawImage(image, rect.left + rect.width * .3, rect.top, rect.width * .7, rect.height * .8, 0, 0, 120, 80);
    const pixels = ctx.getImageData(0, 0, 120, 80).data, colors = new Set();
    let nonblack = 0;
    for(let i=0;i<pixels.length;i+=4){ if(pixels[i]+pixels[i+1]+pixels[i+2]>60)nonblack++; colors.add((pixels[i]>>3)+','+(pixels[i+1]>>3)+','+(pixels[i+2]>>3)); }
    const visibleObjects=scene.__simulatteObjectTargets?.().filter(row=>row.points.some(p=>p && p.x>=0 && p.y>=0 && p.x<=rect.width && p.y<=rect.height)).length;
    return { colors: colors.size, nonblackFraction: nonblack/9600, visibleObjects };
  })()`);
  // Star fields intentionally leave most pixels black; also require projected model geometry.
  assert.ok(evidence.colors > 12 && evidence.nonblackFraction > (sparse ? .005 : .015)
    && (!sparse || evidence.visibleObjects >= 2), 'Scene pixel and geometry evidence: '+JSON.stringify(evidence));
  return evidence;
}
async function journey(route, prefix) {
  const row = { route, steps: [] }; report.routes.push(row);
  await client.send('Page.navigate', { url: host.baseUrl + route });
  await wait(`globalThis.SimulatteActiveSession?.snapshot().execution==='running' && document.querySelector('#pause-button')?.getBoundingClientRect().width>0 && !document.querySelector('#pause-button').disabled`);
  const initial = await snapshot(); assert.equal(initial.advanced, false); row.initial = initial;
  const chrome = await evaluate(`(() => {
    const bar=document.querySelector('.simulation-viewbar').getBoundingClientRect();
    return {height:bar.height, bottom:bar.bottom, viewport:innerHeight,
      camera:document.querySelector('#camera-menu > summary').getBoundingClientRect().width,
      pause:document.querySelector('#pause-button').getBoundingClientRect().width};
  })()`);
  assert.ok(chrome.height<=60 && chrome.bottom<chrome.viewport && chrome.camera>0 && chrome.pause>0, 'Compact controls remain visible: '+JSON.stringify(chrome));
  row.chrome=chrome;
  await wait(`(__simulattePluginPlatformV4?.contributions||[]).some(c=>c.state?.simulationTimeMs>0)`);
  row.steps.push('opened with Advanced closed; model time advanced');
  await click('#pause-button');
  // A pointer selects rendered geometry; the keyboard-accessible selector resolves overlapping objects.
  const target = await evaluate(`(() => {
    const canvas=[...document.querySelectorAll('canvas')].find(c=>c.__simulatteObjectTargets);
    const rect=canvas.getBoundingClientRect();
    const rows=canvas.__simulatteObjectTargets();
    const row=rows.find(r=>r.id.startsWith(${JSON.stringify(prefix)})&&r.points.some(p=>p&&p.x>20&&p.y>20&&p.x<rect.width-20&&p.y<rect.height-120));
    const point=row?.points.find(p=>p&&p.x>20&&p.y>20&&p.x<rect.width-20&&p.y<rect.height-120);
    return point?{x:point.x+rect.left,y:point.y+rect.top}:null;
  })()`);
  if (target) {
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...target, button: 'left', clickCount: 1 });
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...target, button: 'left', clickCount: 1 });
    row.pointerSelected = (await snapshot()).selected;
    assert.ok(row.pointerSelected, 'Pointer must select model geometry');
  }
  const id = await evaluate(`(() => {const select=document.querySelector('[aria-label="Inspect object"]');const option=[...select.options].find(o=>o.value.startsWith(${JSON.stringify(prefix)}));if(!option)throw Error('Object missing');select.value=option.value;select.dispatchEvent(new Event('change'));return option.value;})()`);
  await wait(`document.querySelector('.sim-object-inspector > div').hidden===false`);
  const before = await snapshot(); row.selected = before;
  if (route.includes('gpu-')) {
    await click('[data-object-action="straggler"]');
    const after = await snapshot();
    assert.equal(after.inspections.find(r=>r.targetIds.length===1&&r.targetIds[0]===id).fields.find(f=>f.id==='slowdown').value,95);
    row.action = after; row.steps.push('live rack slowdown changed the model');
  } else {
    if (route.includes('sun-walker') || route.includes('orbital')) {
      await click('[data-object-action="preview"]');
      assert.deepEqual((await snapshot()).model, before.model, 'Preview must retain the displayed run');
      row.steps.push('isolated model preview retained displayed state');
    }
    await click('[data-object-action="apply"]');
    const after = await snapshot();
    if (!route.includes('interstellar')) assert.notDeepEqual(after.controls,before.controls,'Accepted controls must change');
    assert.equal(after.session.execution,'running');
    assert.equal(after.selected,id); row.action=after; row.steps.push('applied model change and restarted explicitly');
  }
  if(route.includes('subsea')) {
    await invoke('pause'); await invoke('seek',1);
    const affected=await snapshot();
    const fields=affected.inspections.find(row=>row.targetIds.length===1 && row.targetIds[0]===id).fields;
    assert.equal(fields.find(row=>row.id==='failure').value,'failed');
    assert.equal(fields.find(row=>row.id==='available').value,0,'Selected cable failure removes modeled capacity');
    row.consequence=affected;row.steps.push('disruption snapshot verifies failed selected cable and zero available capacity');
  }
  await invoke('pause');
  await click('[data-object-action="focus"]');
  if(route.includes('sun-walker')) {
    await wait(`document.getElementById('autonomy-canvas').__simulatteRenderReceipt().camera.transitionState==='settled'`);
    const framing=await evaluate(`(() => {const canvas=document.getElementById('autonomy-canvas'),rect=canvas.getBoundingClientRect(),panel=document.querySelector('.sim-object-inspector').getBoundingClientRect();const target=canvas.__simulatteObjectTargets().find(row=>row.id===${JSON.stringify(id)});return {point:target.points[0],panelTop:panel.top-rect.top,panelRight:panel.right-rect.left};})()`);
    assert.ok(framing.point && (framing.point.y<framing.panelTop || framing.point.x>framing.panelRight),'Focused walker must not be covered by inspector');
    row.framing=framing;
  }
  const wheel=await evaluate(`(() => {const c=[...document.querySelectorAll('canvas')].find(c=>c.__simulatteObjectTargets),r=c.getBoundingClientRect();return {x:r.right-40,y:r.top+50};})()`);
  await client.send('Input.dispatchMouseEvent',{type:'mouseWheel',...wheel,deltaX:0,deltaY:80});
  await new Promise(resolve=>setTimeout(resolve,150));
  const explored=await snapshot();
  await evaluate(`document.querySelector('[data-object-action="focus"]').focus();document.querySelector('.sim-object-inspector > div').scrollTop=18`);
  await invoke('resume');
  await new Promise(resolve => setTimeout(resolve, 300));
  const focused=await snapshot();
  await wait(`__simulattePluginPlatformV4.contributions.find(c=>SimulatteActiveSession.snapshot().id.startsWith(c.pluginId)).state.simulationTimeMs>${focused.model.simulationTimeMs}`);
  await click('#pause-button');
  await new Promise(resolve => setTimeout(resolve, 150));
  const paused=await snapshot();
  await new Promise(resolve => setTimeout(resolve, 350));
  const still=await snapshot();
  assert.deepEqual(still.model,paused.model,'Paused model must not advance');
  assert.equal(still.selected,id); assert.equal(still.scroll,paused.scroll);
  if(paused.view){assert.deepEqual(still.view,paused.view,'Paused camera must remain fixed');assert.deepEqual(paused.view,explored.view,'Model updates must preserve the manually explored camera');}
  assert.equal(focused.focus,'focus','Measurement updates must preserve focus');
  row.paused=paused;row.steps.push('camera focus, resume and pause preserved selection, focus and scroll');
  if(mobile){
    await client.send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});
    await new Promise(resolve=>setTimeout(resolve,150));
    assert.equal((await snapshot()).selected,id);
    await client.send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile:true});
    row.steps.push('orientation retained selection');
  }
  const screenshot=await client.send('Page.captureScreenshot',{format:'png'});
  const filename=route.replaceAll('/','-')+'.png';await fs.writeFile(path.join(out,filename),Buffer.from(screenshot.data,'base64'));row.screenshot=filename;
  row.pixels=await pixelEvidence(screenshot,{sparse:route.includes('interstellar')});
  await click('#decisions-button');
  await evaluate(`document.getElementById('sim-mission-dock').parentElement.open=true`);
  await click('#replay-button');const replay=await snapshot();assert.equal(replay.session.execution,'running');assert.equal(replay.selected,id);
  assert.deepEqual(replay.controls,row.action.controls,'Replay must retain accepted parameters');
  await click('#decisions-close');
  row.steps.push('replayed accepted run from Advanced'); row.replay=replay; row.status='pass';
}
async function motorcycleJourney(){
  const row={route:'motorcycle',steps:[]};report.routes.push(row);
  await client.send('Page.navigate',{url:host.baseUrl+'motorcycle'});
  await wait(`globalThis.SimulatteMotorcycleSession?.snapshot().execution==='running'`);
  const read=()=>evaluate(`SimulatteMotorcycleController.snapshot()`);
  const call=(id,input)=>evaluate(`SimulatteMotorcycleSession.invoke(${JSON.stringify(id)},${JSON.stringify(input)||'undefined'}).then(()=>true)`);
  const first=await read();
  await wait(`SimulatteMotorcycleController.snapshot().time>${first.time+.15}`);
  const moving=await read();assert.notDeepEqual(moving.motorcycles,first.motorcycles);
  assert.equal(await evaluate(`document.getElementById('advanced-sheet').open`),false);
  row.steps.push('Advanced closed; seeded traffic moves');
  await call('pause');const paused=await read();
  await new Promise(resolve=>setTimeout(resolve,200));assert.equal((await read()).time,paused.time);
  const id=paused.motorcycles[0].id;
  await call('select-object',{sourceId:id});
  await evaluate(`document.getElementById('follow-selected').click()`);
  await wait(`SimulatteMotorcycleSession.snapshot().pending.length===0`);
  await evaluate(`document.getElementById('ride-selected').click()`);
  await wait(`SimulatteMotorcycleSession.snapshot().pending.length===0`);
  assert.equal((await read()).time,paused.time);assert.equal((await read()).selected,id);
  row.steps.push('selected motorcycle; follow and onboard preserve traffic time');
  const treatment=(await read()).treatments.find(row=>row.kind==='directional');
  if(treatment){
    await call('select-object',{treatmentId:treatment.id});await call('treatment',{action:'toggle'});
    assert.equal((await read()).treatments.find(row=>row.id===treatment.id).enabled,!treatment.enabled);
    row.steps.push('selected treatment and changed modeled emitter state');
  }
  const prior=(await read()).observer;
  await call('camera','map');await call('select-object',{point:{x:prior.x+8,y:prior.y+8,z:1.7},surface:'sidewalk'});
  assert.equal((await read()).time,paused.time);
  assert.notDeepEqual((await read()).observer,prior);
  row.steps.push('moved observer without resetting traffic');
  await call('resume');await wait(`SimulatteMotorcycleController.snapshot().time>${paused.time+.1}`);
  await call('pause');row.beforeReplay=await read();
  const screenshot=await client.send('Page.captureScreenshot',{format:'png'});
  row.pixels=await pixelEvidence(screenshot);
  await fs.writeFile(path.join(out,'motorcycle.png'),Buffer.from(screenshot.data,'base64'));row.screenshot='motorcycle.png';
  await call('replay');row.replay=await read();assert.ok(paused.scenarioSeed);assert.equal(row.replay.scenarioSeed,paused.scenarioSeed);assert.ok(row.replay.time<1);
  row.steps.push('paused, resumed and replayed identified traffic');row.status='pass';
}

async function formsJourney() {
  const row={route:'create-and-data',steps:[]};report.routes.push(row);
  await client.send('Page.navigate',{url:host.baseUrl+'blank/'});
  await wait(`globalThis.SimulatteCreateController && SimulatteCreateSession.snapshot().visibleStatus==='Waiting for input'`);
  await evaluate(`SimulatteCreateSession.invoke('revise-description','a red ball').then(()=>true)`);
  await wait(`SimulatteCreateController.snapshot().visible && SimulatteCreateSession.snapshot().pending.length===0`);
  await evaluate(`document.getElementById('pause-lab').click()`);
  await wait(`SimulatteCreateController.snapshot().paused && SimulatteCreateSession.snapshot().execution==='paused'`);
  await evaluate(`document.getElementById('pause-lab').click()`);
  await wait(`!SimulatteCreateController.snapshot().paused && SimulatteCreateSession.snapshot().execution==='running'`);
  await evaluate(`document.getElementById('reset-lab').click()`);
  await wait(`SimulatteCreateSession.snapshot().lastOperation?.id==='restart' && SimulatteCreateSession.snapshot().lastOperation.status==='success'`);
  row.create=await evaluate(`({controller:SimulatteCreateController.snapshot(),session:SimulatteCreateSession.snapshot(),program:SimulattePhysicsLab._browserLab.getPipelineRun()?.worldSpecContentHash})`);
  row.steps.push('Create waits for input; actual compile, pause, resume and restart publish runtime state');
  await client.send('Page.navigate',{url:host.baseUrl+'#data'});
  await wait(`globalThis.SimulatteDataWorkbench?.session.snapshot().visibleStatus==='Waiting for input'`);
  await evaluate(`document.getElementById('data-sample').click()`);
  await wait(`SimulatteDataWorkbench.session.snapshot().execution==='running'`);
  const hash=await evaluate(`SimulatteDataWorkbench.getDisplayedProgram().contentHash`);
  await evaluate(`SimulatteDataWorkbench.session.invoke('pause').then(()=>true)`);
  await evaluate(`document.getElementById('data-editor').value+=' ';document.getElementById('data-editor').dispatchEvent(new Event('input'))`);
  assert.equal(await evaluate(`SimulatteDataWorkbench.getDisplayedProgram().contentHash`),hash);
  await evaluate(`SimulatteDataWorkbench.session.invoke('replay').then(()=>true)`);
  assert.equal(await evaluate(`document.getElementById('data-workbench').dataset.replay`),'pass');
  row.data=await evaluate(`({displayedProgram:SimulatteDataWorkbench.getDisplayedProgram().contentHash,receipt:SimulatteDataWorkbench.getResult().receipt,session:SimulatteDataWorkbench.session.snapshot()})`);
  row.steps.push('Your Data waits for input; sample auto-runs; draft retains accepted identity; replay verifies trajectory');
  row.status='pass';
}

try {
  await client.send('Runtime.enable'); await client.send('Page.enable');
  await client.send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile});
  await client.send('Emulation.setTouchEmulationEnabled',{enabled:mobile});
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    if (['/world','/country','/solar-system','/star-chart','/subsea','/grid','/orbital','/interstellar'].some(prefix=>location.pathname.startsWith(prefix)) || location.hash === '#data') {
      const restore = () => {
        if (!document.documentElement?.hasAttribute('data-world-launch')) return;
        document.documentElement.removeAttribute('data-world-launch'); observer.disconnect();
      };
      const observer = new MutationObserver(restore); observer.observe(document, { childList: true, subtree: true, attributes: true }); restore();
    }
  ` });
  if(!selected){
    await client.send('Page.navigate', { url: host.baseUrl });
    await wait(`document.body?.dataset.journeyPhase==='ready'`);
    const links=await evaluate(`Array.from(document.querySelectorAll('a')).filter(a=>a.getBoundingClientRect().width>0).map(a=>new URL(a.href).pathname).sort()`);
    assert.deepEqual(links,['/datacenter','/motorcycle','/sunwalker']);
    const shot=await client.send('Page.captureScreenshot',{format:'png'});
    await fs.writeFile(path.join(out,'landing.png'),Buffer.from(shot.data,'base64'));
    report.landing={status:'pass',links,screenshot:'landing.png'};
  }
  if(selected==='forms'){try{await formsJourney();console.log('PASS Create and Your Data');}catch(error){const row=report.routes.at(-1);row.status='failed';row.error=error.message;console.log('FAIL forms',error.message);}}
  if(!selected||selected==='motorcycle'){try{await motorcycleJourney();console.log('PASS motorcycle');}catch(error){const row=report.routes.at(-1);row.status='failed';row.error=error.message;console.log('FAIL motorcycle',error.message);}}
  for(const [route,prefix] of routes.filter(([route])=>!selected||route.includes(selected))){
    try{await journey(route,prefix);console.log('PASS',route);}
    catch(error){const row=report.routes.at(-1);row.status='failed';row.error=error.message;row.failureState=await evaluate(`({error:globalThis.__simulatteLastFailError,text:document.body.innerText.slice(0,600)+document.body.innerText.slice(-600)})`).catch(()=>null);console.log('FAIL',route,error.message);}
    await fs.writeFile(path.join(out,selected?`report-${selected}.json`:'report.json'),JSON.stringify(report,null,2)+'\n');
  }
}finally{await fs.writeFile(path.join(out,selected?`report-${selected}.json`:'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();virtualDisplay.kill();}
assert.deepEqual(await hashSources(),sourceHashes,'Source changed during browser audit');
if(report.routes.some(row=>row.status!=='pass'))process.exitCode=1;
