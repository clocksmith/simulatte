#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { openBrowserAudit } from './browser-session.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const sourceFiles=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','public'],{cwd:root,encoding:'utf8'}).trim().split('\n'))].filter(name=>
  /^public\/(blank\/app|shared\/(contracts|core|design|plugins)|simulatte\/(app|motorcycle-noise|platform))\//.test(name) && /\.(js|css|html)$/.test(name)
  || ['public/index.html','public/blank/index.html','public/world-tiers.css'].includes(name));
const hashSources=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async name=>[name,createHash('sha256').update(await fs.readFile(path.join(root,name))).digest('hex')])));
sourceFiles.push('tools/simulatte/audit-session-interactions.mjs');
const sourceHashes=await hashSources();
const mobile = process.argv.includes('--mobile');
const soakSeconds = Number(process.argv.find(arg=>arg.startsWith('--soak-seconds='))?.slice(15) ?? 60);
assert.ok(Number.isFinite(soakSeconds) && soakSeconds>=0 && soakSeconds<=600,'Soak duration must be 0..600 seconds');
const publicOnly = process.argv.includes('--public');
const hardware = process.argv.includes('--hardware');
const deployedBase = process.argv.find(arg => arg.startsWith('--base-url='))?.slice(11);
const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 };
const out = process.argv.find(arg=>arg.startsWith('--out='))?.slice(6) || path.join(root, 'artifacts/session-interactions', (deployedBase ? 'deployed-' : '') + (hardware ? 'hardware-' : '') + (mobile ? 'mobile' : 'desktop'));
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
  args:hardware ? ['--no-sandbox','--disable-dev-shm-usage','--use-angle=vulkan','--enable-features=Vulkan','--disable-vulkan-surface'] : ['--no-sandbox','--disable-dev-shm-usage','--use-angle=vulkan','--enable-features=Vulkan','--use-vulkan=swiftshader','--disable-vulkan-surface','--use-webgpu-adapter=swiftshader','--enable-unsafe-swiftshader'] });
const { client, host } = browser;
const baseUrl = deployedBase ? deployedBase.replace(/\/?$/, '/') : host.baseUrl;
const report = { navigationPolicy: publicOnly ? 'Three public journeys with the launch gate untouched.' : 'Public landing exposes Motorcycle, GPU Cluster and Sun Walker. Other retained profiles and Your Data are tested with the launch gate disabled in this local browser only.', sourceHashes, schema: 'simulatte.sessionJourney.v1', viewport, soakSeconds, layer: deployedBase ? 'served-browser' : 'local-browser', physicalDevice: 'not run; emulated viewport and CDP touch input', backendPolicy: hardware ? 'Hardware adapter required' : 'Headed Chrome on isolated Xvfb; explicit SwiftShader software rendering, not hardware performance evidence', routes: [] };
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
    adapter:canvas?.__simulatteRenderReceipt?.().adapter, view:canvas?.__simulatteRenderReceipt?.().view, render:canvas?.__simulatteRenderReceipt?.().backend,
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
async function largeTextCheck(selectors) {
  return evaluate(`(()=>{
    const nodes=[...document.querySelectorAll(${JSON.stringify(selectors)})].filter(el=>el.getBoundingClientRect().width>0);
    const old=nodes.map(el=>el.style.fontSize);nodes.forEach(el=>el.style.fontSize=(parseFloat(getComputedStyle(el).fontSize)*1.5)+'px');
    const results=nodes.map(el=>{const r=el.getBoundingClientRect();return {text:el.textContent,left:r.left,right:r.right,width:r.width,viewport:innerWidth};});
    nodes.forEach((el,i)=>el.style.fontSize=old[i]);return results;
  })()`);
}
async function journey(route, prefix) {
  const row = { route, steps: [] }; report.routes.push(row);
  await client.send('Page.navigate', { url: baseUrl + route });
  await wait(`globalThis.SimulatteActiveSession?.snapshot().execution==='running' && document.querySelector('#pause-button')?.getBoundingClientRect().width>0 && !document.querySelector('#pause-button').disabled`);
  const initial = await snapshot(); if(hardware && initial.render==='webgpu')assert.ok(initial.adapter && !initial.adapter.isFallbackAdapter && !/swiftshader|llvmpipe|software/i.test(JSON.stringify(initial.adapter)),'Rendered scene must use hardware: '+JSON.stringify(initial.adapter)); assert.equal(initial.advanced, false); row.initial = initial;
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
  await wait(`(()=>{const c=[...document.querySelectorAll('canvas')].find(c=>c.__simulatteRenderReceipt);return c?.__simulatteRenderReceipt().camera?.transitionState!=='active';})()`);
  await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))`);
  row.readouts=await evaluate(`(() => {
    const panel=document.getElementById('experience-readouts'),r=panel.getBoundingClientRect();
    const cells=[...panel.querySelectorAll('dl > div')]; globalThis.__auditMetricCells=cells;
    globalThis.__auditObjectOptions=[...document.querySelector('[aria-label="Inspect object"]').options];
    const owner=__simulattePluginPlatformV4.contributions.find(c=>SimulatteActiveSession.snapshot().id.startsWith(c.pluginId));
    return { visible:!panel.hidden && r.height>0 && r.bottom<innerHeight, values:cells.map(c=>[c.firstElementChild.textContent,c.lastElementChild.textContent]),
      objectLabels:__auditObjectOptions.map(o=>o.textContent), selectedCount:__auditObjectOptions.length,
      totalObjects:owner.objects.length, model:owner.state.measures };
  })()`);
  assert.ok(row.readouts.visible,'Primary model readouts must be visible with Advanced closed');
  assert.equal(row.readouts.values.length,3,'Exactly three distinct primary measurements');
  assert.equal(new Set(row.readouts.values.map(([label])=>label)).size,3);
  await click('#experience-summary-stats .measurement-definition');
  assert.ok(await evaluate(`document.querySelector('#experience-summary-stats > div').dataset.expanded==='true'`));
  assert.ok(row.readouts.model.some(m=>m.measurement?.timeBasis==='accumulated'));
  await click('#experience-summary-stats .measurement-definition');
  if(route.includes('gpu-')) {
    assert.ok(row.readouts.selectedCount<row.readouts.totalObjects,'Secondary links are out of the primary rack menu');
    assert.ok(row.readouts.objectLabels.slice(1).every(label=>/^Rack R[0-9]+-[0-9]+$/.test(label)),'Rack names exclude live percentages');
    assert.equal(row.readouts.values[0][1],row.readouts.model.find(m=>m.kind==='compute-efficiency').value.toFixed(2)+'%');
    const layoutBefore=await snapshot();
    await invoke('layout','physical');const physical=await snapshot();assert.deepEqual(physical.model,layoutBefore.model);assert.equal(physical.selected,layoutBefore.selected);
    assert.equal(await evaluate(`document.querySelector('[data-presentation-layout=physical]').getAttribute('aria-pressed')`),'true');
    await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    row.physicalBounds=await evaluate(`(()=>{const c=document.getElementById('overlay-canvas');return {width:c.clientWidth,height:c.clientHeight,targets:c.__simulatteObjectTargets().filter(row=>row.id.startsWith('rack:'))};})()`);
    assert.ok(row.physicalBounds.targets.every(target=>(target.bounds||target.points).every(p=>p.x>=0&&p.x<=row.physicalBounds.width&&p.y>=0&&p.y<=row.physicalBounds.height)),'All physical racks fit the canvas');
    const physicalShot=await client.send('Page.captureScreenshot',{format:'png'});row.physicalScreenshot=route.replaceAll('/','-')+'-physical.png';await fs.writeFile(path.join(out,row.physicalScreenshot),Buffer.from(physicalShot.data,'base64'));
    await invoke('layout','network');assert.deepEqual((await snapshot()).model,layoutBefore.model);
    const orbitBefore=await snapshot();
    const drag=await evaluate(`(()=>{const r=document.getElementById('overlay-canvas').getBoundingClientRect();return{x:r.right-100,y:r.top+70};})()`);
    await client.send('Input.dispatchMouseEvent',{type:'mousePressed',...drag,button:'left',clickCount:1});
    await client.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:drag.x-45,y:drag.y+25,button:'left',buttons:1});
    await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:drag.x-45,y:drag.y+25,button:'left',clickCount:1});
    const orbited=await snapshot();assert.notEqual(orbited.view.rotY,orbitBefore.view.rotY,'Drag rotates the network');assert.deepEqual(orbited.model,orbitBefore.model);
    await invoke('reset-view');
    row.steps.push('3D orbit changes rotation without changing the model');
  }
  if(route.includes('sun-walker')) {
    for(const [label,kind] of [['Sun so far','direct-sun-share'],['Shade so far','shade-share'],['Walk completed','progress']])
      assert.equal(row.readouts.values.find(([key])=>key===label)[1],await evaluate(`SimulatteExperiencePresentation.formatMeasure(${JSON.stringify(row.readouts.model.find(m=>m.kind===kind))})`));
  }
  row.largeText=await largeTextCheck('.simulation-viewbar button, .simulation-viewbar summary, .measurement-definition');
  assert.ok(row.largeText.every(r=>r.left>=0 && r.right<=r.viewport),'Large text keeps public controls within the viewport');
  const overviewShot=await client.send('Page.captureScreenshot',{format:'png'});
  row.overviewScreenshot=route.replaceAll('/','-')+'-overview.png';await fs.writeFile(path.join(out,row.overviewScreenshot),Buffer.from(overviewShot.data,'base64'));
  const selectionCamera=await snapshot();
  // Direct geometry selection is required. No selector fallback may make this pass.
  const target = await evaluate(`(() => {
    const canvas=[...document.querySelectorAll('canvas')].find(c=>c.__simulatteObjectTargets);
    const rect=canvas.getBoundingClientRect();
    const rows=canvas.__simulatteObjectTargets();
    const owner=__simulattePluginPlatformV4.contributions.find(c=>SimulatteActiveSession.snapshot().id.startsWith(c.pluginId));
    for(const row of rows.filter(r=>r.id.startsWith(${JSON.stringify(prefix)}) && owner.objects.find(o=>o.id===r.id)?.actions.some(a=>a.available))) {
      const points=row.points.filter(Boolean);
      const candidates=points.length>1 ? points.slice(1).map((p,i)=>({x:(p.x+points[i].x)/2,y:(p.y+points[i].y)/2})).concat(points) : points;
      for(const point of candidates) {
        if(point.x<=20 || point.y<=20 || point.x>=rect.width-20 || point.y>=rect.height-60)continue;
        const x=point.x+rect.left,y=point.y+rect.top;
        if(document.elementFromPoint(x,y)!==canvas)continue;
        const hits=SimulatteObjectInteraction.hitObjects(point,rows,owner.objects);
        const tied=hits.filter(hit=>hit.priority===hits[0]?.priority && Math.abs(hit.distance-hits[0].distance)<2 && hit.shape==='path');
        if(hits[0]?.id===row.id && tied.length<=1)return {id:row.id,x,y};
      }
    }
    return null;
  })()`);
  assert.ok(target, 'An unobstructed primary object target is mandatory: '+prefix);
  row.pointerTarget=target;
  await evaluate(`(()=>{globalThis.__auditPointerEvents=[];const c=[...document.querySelectorAll('canvas')].find(c=>c.__simulatteObjectTargets);for(const type of ['pointerdown','pointerup','pointercancel'])c.addEventListener(type,e=>__auditPointerEvents.push({type:e.type,x:e.clientX,y:e.clientY,pointerType:e.pointerType}),{capture:true});})()`);
  if(mobile){
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:target.x,y:target.y}]});
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x:target.x,y:target.y, button: 'left', clickCount: 1 });
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x:target.x,y:target.y, button: 'left', clickCount: 1 });
  }
  row.pointerEvents=await evaluate(`__auditPointerEvents`);
  await wait(`document.querySelector('[aria-label="Inspect object"]').value===${JSON.stringify(target.id)}`);
  row.pointerSelected = (await snapshot()).selected;
  assert.equal(row.pointerSelected,target.id,'Direct input must select the intended entity');
  let id=target.id;
  if(route.includes('sun-walker')){
    await new Promise(resolve=>setTimeout(resolve,150));
    const point=await evaluate(`(()=>{const c=document.getElementById('autonomy-canvas'),rect=c.getBoundingClientRect(),p=c.__simulatteObjectTargets().find(r=>r.id===${JSON.stringify(id)}).points[0];return {x:p.x+rect.left,y:p.y+rect.top};})()`);
    assert.ok(Math.hypot(point.x-target.x,point.y-target.y)<2,'Selection must preserve the projected walker position');
  }
  await wait(`document.querySelector('.sim-object-inspector > div').hidden===false`);
  const before = await snapshot(); row.selected = before;
  if(selectionCamera.view){const {insets:beforeInsets,...beforeCamera}=before.view,{insets:initialInsets,...initialCamera}=selectionCamera.view;assert.deepEqual(beforeCamera,initialCamera,'Selection preserves camera framing');}
  // Exercise native keyboard selection, then return to the pointer-selected object.
  await evaluate(`document.querySelector('[aria-label="Inspect object"]').focus()`);
  for(const key of ['Home','ArrowDown','Escape','Tab']) {
    await client.send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key});
    await client.send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key});
  }
  assert.ok((await snapshot()).selected,'Native keyboard selection chooses an object');
  await invoke('select-object',id);
  row.steps.push('native keyboard selector operates independently of direct pointing');
  if (route.includes('gpu-')) {
    await click('[data-object-action="straggler"]');
    const after = await snapshot();
    assert.equal(after.inspections.find(r=>r.targetIds.length===1&&r.targetIds[0]===id).fields.find(f=>f.id==='slowdown').value,95);
    await invoke('resume');
    await wait(`__simulattePluginPlatformV4.contributions.find(c=>c.pluginId==='gpu-supercluster').inspections.some(r=>r.fields.some(f=>f.id==='waiting-for' && String(f.value).includes(${JSON.stringify(id.replace('rack:',''))})) && r.fields.some(f=>f.id==='wait-ms' && f.value>0))`);
    await invoke('pause');row.dependencies=await snapshot();
    const blocked = row.dependencies.inspections.filter(r=>r.targetIds.length===1 && r.fields.some(f=>f.id==='waiting-for' && String(f.value).includes(id.replace('rack:','')))).map(r=>r.targetIds[0].replace('rack:',''));
    const selectedFields = row.dependencies.inspections.find(r=>r.targetIds.length===1 && r.targetIds[0]===id).fields;
    assert.ok(blocked.length>0);
    assert.equal(selectedFields.find(f=>f.id==='blocking').value,blocked.join(', '),'Slow rack inspector identifies actual dependents');
    row.steps.push('dependent racks wait for the selected slowed rack and accumulate synchronization wait');
    await click('[data-object-action="straggler"]');await invoke('resume');
    await wait(`__simulattePluginPlatformV4.contributions.find(c=>c.pluginId==='gpu-supercluster').inspections.some(r=>r.targetIds.length===1 && r.targetIds[0]===${JSON.stringify(id)} && r.fields.some(f=>f.id==='task' && f.value==='Collective transfer'))`);
    await invoke('pause');row.restoredDependencies=await snapshot();
    assert.equal(row.restoredDependencies.inspections.find(r=>r.targetIds.length===1 && r.targetIds[0]===id).fields.find(f=>f.id==='blocking').value,'None');
    row.steps.push('restoring the selected rack releases compute dependencies and begins collective transfer');
    row.action = after; row.steps.push('live rack slowdown changed the model');
  } else {
    if (route.includes('sun-walker') || route.includes('orbital')) {
      await click('[data-object-action="preview"]');
      assert.deepEqual((await snapshot()).model, before.model, 'Preview must retain the displayed run');
      row.preview=await evaluate(`(() => {const c=[...document.querySelectorAll('canvas')].find(c=>c.__simulattePreview);return c.__simulattePreview();})()`);
      assert.ok(row.preview.presentation.layers[0].geometry.coordinates.length>1,'Alternative has spatial geometry');
      await wait(`(() => {const canvas=[...document.querySelectorAll('canvas')].find(c=>c.__simulattePreview);const receipts=canvas.__simulatteRenderReceipt?.().pluginCompositor || __simulattePluginPlatformV4.compositor || [];return receipts.some(r=>(r.representedLayerIds||r.receipt?.representedLayerIds||[]).includes(${JSON.stringify(row.preview.presentation.layers[0].id)}));})()`);
      assert.ok(!(await snapshot()).error,'Spatial preview must have no rendering failure');

      assert.ok(row.preview.inspections[0].fields.some(f=>f.id.endsWith('difference') && typeof f.value==='number'),'Calculated differences are visible');
      const previewShot=await client.send('Page.captureScreenshot',{format:'png'});
      row.previewScreenshot=route.replaceAll('/','-')+'.png';
      await fs.writeFile(path.join(out,row.previewScreenshot),Buffer.from(previewShot.data,'base64'));
      row.steps.push('spatial model preview retained displayed state and exposes calculated differences');
    }
    await click('[data-object-action="apply"]');
    if(row.preview)await wait(`document.querySelector('[aria-label="Inspect object"]').value===${JSON.stringify(row.preview.objects[0].actions[0].afterApplyTargetId)}`);
    const after = await snapshot();
    if (!route.includes('interstellar')) assert.notDeepEqual(after.controls,before.controls,'Accepted controls must change');
    assert.equal(after.session.execution,'running');
    if(row.preview){
      id=row.preview.objects[0].actions[0].afterApplyTargetId;
      if(route.includes('sun-walker')) assert.ok(after.model.id.includes(row.preview.simulationId),'Accepted run is the identified preview');
    }
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
  if(route.includes('sun-walker')) {
    assert.equal(await evaluate(`document.getElementById('autonomy-canvas').__simulatteRenderReceipt().camera.mode`),'top','Zoom retains the selected top view');
    row.steps.push('top-view zoom preserves the viewing angle');
  }
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
  assert.ok(await evaluate(`__auditMetricCells.every((cell,index)=>document.getElementById('experience-summary-stats').children[index]===cell)`),'Measurement updates preserve readout DOM identity');
  if(route.includes('gpu-'))assert.ok(await evaluate(`__auditObjectOptions.every((option,index)=>document.querySelector('[aria-label="Inspect object"]').options[index]===option)`),'GPU playback preserves native option identity');
  row.paused=paused;row.steps.push('camera focus, resume and pause preserved selection, focus and scroll');
  if(mobile){
    await client.send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});
    await new Promise(resolve=>setTimeout(resolve,150));
    assert.equal((await snapshot()).selected,id);
    await client.send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile:true});
    row.steps.push('orientation retained selection');
  }
  const soakStarted=Date.now();let cycles=0;
  while(Date.now()-soakStarted<soakSeconds*1000){
    if((await snapshot()).session.execution==='complete')await invoke('replay');else await invoke('resume');
    await new Promise(resolve=>setTimeout(resolve,2000));await invoke('pause');
    const sustained=await snapshot();
    assert.equal(sustained.selected,id);assert.deepEqual(sustained.controls,row.action.controls);
    assert.ok(!sustained.error);assert.notEqual(sustained.session.execution,'failed');cycles++;
  }
  row.sustained={elapsedMs:Date.now()-soakStarted,cycles};
  const screenshot=await client.send('Page.captureScreenshot',{format:'png'});
  const filename=route.replaceAll('/','-')+'.png';if(!row.previewScreenshot)await fs.writeFile(path.join(out,filename),Buffer.from(screenshot.data,'base64'));row.screenshot=filename;row.screenshotPhase=row.previewScreenshot?'prepared alternative':'accepted paused run';
  row.pixels=await pixelEvidence(screenshot,{sparse:route.includes('interstellar')});
  await click('#decisions-button');
  await evaluate(`document.getElementById('sim-mission-dock').parentElement.open=true`);
  await click('#replay-button');const replay=await snapshot();assert.equal(replay.session.execution,'running');assert.equal(replay.selected,id);
  assert.deepEqual(replay.controls,row.action.controls,'Replay must retain accepted parameters');
  await click('#decisions-close');
  await invoke('pause');
  const background=await snapshot();
  const originalTarget=(await client.send('Target.getTargetInfo')).targetInfo.targetId;
  const backgroundTarget=await client.send('Target.createTarget',{url:'about:blank',background:false});
  await client.send('Target.activateTarget',{targetId:backgroundTarget.targetId});
  await new Promise(resolve=>setTimeout(resolve,500));
  await client.send('Target.activateTarget',{targetId:originalTarget});
  await client.send('Target.closeTarget',{targetId:backgroundTarget.targetId});
  await client.send('Page.bringToFront');
  assert.deepEqual((await snapshot()).model,background.model,'Paused model survives background/resume');
  row.steps.push('repeated interaction and paused background/resume retain accepted state');
  row.steps.push('replayed accepted run from Advanced'); row.replay=replay; row.status='pass';
}
async function motorcycleJourney(){
  const row={route:'motorcycle',steps:[]};report.routes.push(row);
  await client.send('Page.navigate',{url:baseUrl+'motorcycle'});
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
  assert.equal(await evaluate(`document.getElementById('motorcycle-camera-menu').open`),false);
  await evaluate(`document.querySelector('#motorcycle-camera-menu > summary').click()`);
  assert.ok(await evaluate(`document.querySelector('[data-camera-mode="area:Greenpoint"]').getBoundingClientRect().width>0`));
  await evaluate(`document.querySelector('[data-camera-mode="area:Greenpoint"]').click()`);
  await wait(`!document.getElementById('motorcycle-camera-menu').open && SimulatteMotorcycleSession.snapshot().pending.length===0`);
  assert.equal((await read()).time,paused.time);
  row.toolbar=await evaluate(`(() => {const bar=document.querySelector('.city-toolbar').getBoundingClientRect(),meter=document.querySelector('.observer-readout').getBoundingClientRect();return {bottom:bar.bottom,meterTop:meter.top};})()`);
  assert.ok(row.toolbar.bottom<=(mobile?220:180) && row.toolbar.meterTop>=row.toolbar.bottom,'Compact controls leave the meter and scene clear: '+JSON.stringify(row.toolbar));
  row.largeText=await largeTextCheck('.city-toolbar button:not([hidden]), .city-toolbar summary');
  assert.ok(row.largeText.every(r=>r.left>=0 && r.right<=r.viewport),'Large text keeps Motorcycle controls within the viewport');
  row.steps.push('camera presets open on demand and preserve traffic time');
  const target=await evaluate(`(() => {const canvas=document.getElementById('city'),rect=canvas.getBoundingClientRect();return SimulatteMotorcycleController.interactionTargets().map(p=>({...p,x:p.x+rect.left,y:p.y+rect.top})).find(p=>document.elementFromPoint(p.x,p.y)===canvas);})()`);
  assert.ok(target,'A directly visible motorcycle is required');
  const id=target.id;
  if(mobile){
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:target.x,y:target.y}]});
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{
    await client.send('Input.dispatchMouseEvent',{type:'mousePressed',x:target.x,y:target.y,button:'left',clickCount:1});
    await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:target.x,y:target.y,button:'left',clickCount:1});
  }
  await wait(`SimulatteMotorcycleController.snapshot().selected===${JSON.stringify(id)} && !document.getElementById('source-actions').hidden`);
  row.pointerSelected=id;
  await evaluate(`document.getElementById('follow-selected').click()`);
  await wait(`SimulatteMotorcycleSession.snapshot().pending.length===0`);
  await evaluate(`document.getElementById('ride-selected').click()`);
  await wait(`SimulatteMotorcycleSession.snapshot().pending.length===0`);
  assert.equal((await read()).time,paused.time);assert.equal((await read()).selected,id);
  await wait(`SimulatteMotorcycleSession.snapshot().measurement==='fresh' && document.getElementById('inspection-time').textContent.includes('combined paths') && !document.getElementById('inspection-time').textContent.includes('Stale')`);
  row.sourceInspection=await evaluate(`({text:document.getElementById('inspection-time').textContent,sample:structuredClone(motorcycleMeasurementReceipt)})`);
  const sourceReading=row.sourceInspection.sample.observer.contributors.find(row=>row.id===id);
  assert.ok(Number.isFinite(sourceReading.outward) && Number.isFinite(sourceReading.pathTotal));
  assert.ok(row.sourceInspection.text.includes(sourceReading.outward.toFixed(1)+' dBA'));
  const onboard=(await read()).observer;
  const other=(await read()).motorcycles.find(source=>source.id!==id).id;
  await call('select-object',{sourceId:other});
  await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
  assert.equal((await read()).selected,other);
  assert.deepEqual((await read()).observer,onboard,'Selecting another bike must not change the onboard microphone');
  await call('select-object',{sourceId:id});
  row.steps.push('selected motorcycle; follow and onboard preserve traffic time and tracked identity');
  const placement=await evaluate(`SimulatteMotorcycleController.placementPoint(SimulatteMotorcycleController.sourcePosition(${JSON.stringify(id)}))`);
  await evaluate(`document.querySelector('[data-add-treatment="directional"]').click()`);
  await call('select-object',{point:placement,surface:'sidewalk'});
  await wait(`SimulatteMotorcycleSession.snapshot().pending.length===0 && SimulatteMotorcycleController.snapshot().treatments.length>0`);
  const treatment=(await read()).treatments.at(-1);
  assert.ok(treatment,'Directional treatment is required for the observer consequence check');
  await call('technique','live');
  await wait(`motorcycleMeasurementReceipt?.observer.treatments.some(t=>t.id===${JSON.stringify(treatment.id)} && t.active)`);
  const targetId=await evaluate(`motorcycleMeasurementReceipt.observer.treatments.find(t=>t.id===${JSON.stringify(treatment.id)}).targetId`);
  const aim=await evaluate(`SimulatteMotorcycleController.sourcePosition(${JSON.stringify(targetId)})`);
  const beforePointSelection=(await read()).observer;
  await call('select-object',{point:{x:treatment.x+(aim.x-treatment.x)*.2,y:treatment.y+(aim.y-treatment.y)*.2,z:1.7},surface:'sidewalk'});
  const observerBeforeFocus=(await read()).observer;assert.deepEqual(observerBeforeFocus,beforePointSelection,'Selection alone cannot move the microphone');await call('focus-observer');
  assert.notDeepEqual((await read()).observer,observerBeforeFocus,'Focus explicitly moves the microphone');
  await wait(`SimulatteMotorcycleSession.snapshot().measurement==='fresh' && motorcycleMeasurementReceipt?.observer.treatments.some(t=>t.id===${JSON.stringify(treatment.id)} && t.active && t.received>-80)`);
  const measured=await evaluate(`structuredClone(motorcycleMeasurementReceipt)`);
  row.observerBreakdown=await evaluate(`document.getElementById('inspection-time').textContent`);
  if(measured.observer.panelReturns===null)assert.ok(row.observerBreakdown.includes('panel returns none'),'Absent panel sound is not a numeric floor');
  await call('select-object',{treatmentId:treatment.id});await call('treatment',{action:'toggle',id:treatment.id});
  await wait(`SimulatteMotorcycleSession.snapshot().measurement==='fresh' && motorcycleMeasurementReceipt?.observer.treatments.some(t=>t.id===${JSON.stringify(treatment.id)} && !t.active)`);
  const disabled=await evaluate(`structuredClone(motorcycleMeasurementReceipt)`);
  assert.deepEqual(disabled.observer.point,measured.observer.point);
  assert.equal(disabled.identity.time,measured.identity.time);
  assert.equal(disabled.observer.direct,measured.observer.direct,'Original sound remains unchanged');
  assert.equal(disabled.observer.returned,measured.observer.returned,'Returned sound remains unchanged');
  assert.ok(disabled.observer.total<measured.observer.total,'Removing a powered contribution reduces calculated sound at the same observer');
  assert.ok(Number.isFinite(measured.observer.powered));
  assert.ok(measured.observer.treatmentChangeDb>disabled.observer.treatmentChangeDb);
  row.treatmentConsequence={enabled:measured,disabled};
  row.steps.push('identified observer loses the selected powered contribution while original and returned sound remain unchanged');
  await call('undo-treatment');await wait(`motorcycleMeasurementReceipt?.observer.total===${measured.observer.total}`);
  assert.equal((await read()).time,paused.time,'Undo does not restart traffic');
  assert.equal(await evaluate(`document.getElementById('fictional-events').checked`),false);
  assert.equal(await evaluate(`SimulatteMotorcycleSession.invoke('mist-spray',{sourceId:${JSON.stringify(id)}}).then(()=>false,error=>error.message.includes('Enable'))`),true,'Fictional stall requires explicit opt-in');
  const prior=(await read()).observer;
  await call('camera','map');
  row.staleObserverText=await evaluate(`SimulatteMotorcycleSession.invoke('select-object',${JSON.stringify({point:{x:prior.x+8,y:prior.y+8,z:1.7},surface:'sidewalk'})}).then(()=>SimulatteMotorcycleSession.invoke('focus-observer')).then(()=>document.getElementById('observer-time').textContent)`);
  assert.ok(row.staleObserverText.includes('Stale sample; updating'),'Old observer measurement is visibly stale immediately after moving');
  assert.equal((await read()).time,paused.time);
  assert.notDeepEqual((await read()).observer,prior);
  row.steps.push('moved observer without resetting traffic');
  await call('select-object',{receiverId:'receiver-1'});
  await wait(`document.getElementById('inspection-title').textContent==='Observer 1' && document.getElementById('inspection-time').textContent.startsWith('Sample at')`);
  row.markerInspection=await evaluate(`({text:document.getElementById('inspection-time').textContent,detail:document.getElementById('inspection-detail').textContent,receipt:structuredClone(motorcycleMapMeasurementReceipt)})`);
  const marker=row.markerInspection.receipt.markers.find(row=>row.id==='receiver-1');
  assert.ok(row.markerInspection.text.includes(`(${marker.point.x.toFixed(0)}, ${marker.point.y.toFixed(0)})`));
  assert.ok(row.markerInspection.detail.includes('facades') && row.markerInspection.detail.includes('added directional sound'));
  row.staleMarkerText=await evaluate(`SimulatteMotorcycleSession.invoke('technique','untreated').then(()=>SimulatteMotorcycleSession.invoke('select-object',{receiverId:'receiver-1'})).then(()=>document.getElementById('inspection-time').textContent)`);
  assert.ok(row.staleMarkerText.includes('Stale sample; updating'),'Marker must not present the preceding treatment configuration as current');
  await wait(`document.getElementById('inspection-time').textContent.startsWith('Sample at')`);
  row.markerUpdated=await evaluate(`structuredClone(motorcycleMapMeasurementReceipt)`);
  assert.notEqual(row.markerUpdated.identity.configurationKey,row.markerInspection.receipt.identity.configurationKey);
  assert.equal(row.markerUpdated.identity.time,paused.time);
  assert.deepEqual(row.markerUpdated.markers.find(row=>row.id==='receiver-1').point,marker.point);
  row.steps.push('saved marker preserves sampled position and labels stale treatment measurements until replacement arrives');
  await call('technique','live');
  await call('select-object',{point:{x:prior.x+8,y:prior.y+8,z:1.7},surface:'sidewalk'});
  await call('resume');await wait(`SimulatteMotorcycleController.snapshot().time>${paused.time+.1}`);
  await call('pause');
  const soakStarted=Date.now();let cycles=0;
  while(Date.now()-soakStarted<soakSeconds*1000){
    await call('resume');await new Promise(resolve=>setTimeout(resolve,2000));await call('pause');
    assert.equal((await read()).selected,id);assert.equal((await read()).scenarioSeed,paused.scenarioSeed);cycles++;
  }
  row.sustained={elapsedMs:Date.now()-soakStarted,cycles};row.beforeReplay=await read();
  const screenshot=await client.send('Page.captureScreenshot',{format:'png'});
  row.pixels=await pixelEvidence(screenshot);
  await fs.writeFile(path.join(out,'motorcycle.png'),Buffer.from(screenshot.data,'base64'));row.screenshot='motorcycle.png';
  await call('replay');row.replay=await read();assert.ok(paused.scenarioSeed);assert.equal(row.replay.scenarioSeed,paused.scenarioSeed);assert.ok(row.replay.time<1);
  row.steps.push('paused, resumed and replayed identified traffic');
  await evaluate(`SimulatteMotorcycleSession.invoke('configure',{...MotorcycleReflection.defaults,motorcycles:3,cars:1,pedestrians:0}).then(()=>true)`);
  await call('pause');await call('fictional-events',true);
  const fictionalId=(await read()).motorcycles[0].id;
  await call('mist-spray',{sourceId:fictionalId});
  const burst=(await read()).mistBursts[0];await call('seek',burst.contact+4);
  assert.equal((await read()).motorcycles.find(source=>source.id===fictionalId).position.stalled,true);
  const eventState=await read();await call('fictional-events',false);
  assert.deepEqual((await read()).mistBursts,eventState.mistBursts,'Disabling future events must retain recorded history');
  assert.deepEqual((await read()).motorcycles,eventState.motorcycles);
  row.fictionalComparison=await evaluate(`SimulatteMotorcycleSession.invoke('compare-snapshot').then(record=>({bursts:record.scene.mistBursts,time:record.time,interval:record.interval}))`);
  assert.deepEqual(row.fictionalComparison.bursts,[],'Acoustic comparison must exclude fictional stalls');
  assert.deepEqual((await read()).mistBursts,eventState.mistBursts);
  assert.deepEqual((await read()).motorcycles,eventState.motorcycles,'Comparison must not rewrite displayed traffic');
  row.clearedEvents=await evaluate(`SimulatteMotorcycleSession.invoke('clear-fictional-events').then(()=>SimulatteMotorcycleController.snapshot())`);
  assert.equal(row.clearedEvents.mistBursts.length,0);assert.equal(row.clearedEvents.time,0);
  row.steps.push('fictional stall stops a vehicle; disabling retains history; acoustic comparison excludes it; explicit clearing restarts');row.status='pass';
}

async function formsJourney() {
  const row={route:'create-and-data',steps:[]};report.routes.push(row);
  await client.send('Page.navigate',{url:baseUrl+'blank/'});
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
  await client.send('Page.navigate',{url:baseUrl+'#data'});
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
  if (!publicOnly) await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    if (['/world','/country','/solar-system','/star-chart','/subsea','/grid','/orbital','/interstellar'].some(prefix=>location.pathname.startsWith(prefix)) || location.hash === '#data') {
      const restore = () => {
        if (!document.documentElement?.hasAttribute('data-world-launch')) return;
        document.documentElement.removeAttribute('data-world-launch'); observer.disconnect();
      };
      const observer = new MutationObserver(restore); observer.observe(document, { childList: true, subtree: true, attributes: true }); restore();
    }
  ` });
  if(hardware)await client.send('Page.navigate',{url:baseUrl});
  if(hardware){
    const adapter=await evaluate(`(async()=>{const a=await navigator.gpu.requestAdapter();return a?{...a.info.toJSON?.(),vendor:a.info.vendor,architecture:a.info.architecture,device:a.info.device,description:a.info.description}:null})()`);
    assert.ok(adapter && !/swiftshader|llvmpipe|software/i.test(JSON.stringify(adapter)) && (adapter.vendor||adapter.device),'Hardware adapter required: '+JSON.stringify(adapter));report.adapter=adapter;
  }
  if(!selected){
    await client.send('Page.navigate', { url: baseUrl });
    await wait(`document.body?.dataset.journeyPhase==='ready'`);
    const links=await evaluate(`Array.from(document.querySelectorAll('a')).filter(a=>a.getBoundingClientRect().width>0).map(a=>new URL(a.href).pathname).sort()`);
    assert.deepEqual(links,['/datacenter','/motorcycle','/sunwalker']);
    const shot=await client.send('Page.captureScreenshot',{format:'png'});
    await fs.writeFile(path.join(out,'landing.png'),Buffer.from(shot.data,'base64'));
    report.landing={status:'pass',links,screenshot:'landing.png'};
  }
  if(selected==='forms'){try{await formsJourney();console.log('PASS Create and Your Data');}catch(error){const row=report.routes.at(-1);row.status='failed';row.error=error.message;console.log('FAIL forms',error.message);}}
  if(!selected||selected==='motorcycle'){try{await motorcycleJourney();console.log('PASS motorcycle');}catch(error){const row=report.routes.at(-1);row.status='failed';row.error=error.message;console.log('FAIL motorcycle',error.message);}}
  for(const [route,prefix] of routes.filter(([route])=>(!publicOnly || /gpu-|sun-walker/.test(route)) && (!selected||route.includes(selected)))){
    try{await journey(route,prefix);console.log('PASS',route);}
    catch(error){const row=report.routes.at(-1);row.status='failed';row.error=error.message;row.failureState=await evaluate(`({error:globalThis.__simulatteLastFailError,text:document.body.innerText.slice(0,600)+document.body.innerText.slice(-600)})`).catch(()=>null);console.log('FAIL',route,error.message);}
    await fs.writeFile(path.join(out,selected?`report-${selected}.json`:'report.json'),JSON.stringify(report,null,2)+'\n');
  }
}finally{await fs.writeFile(path.join(out,selected?`report-${selected}.json`:'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();virtualDisplay.kill();}
assert.deepEqual(await hashSources(),sourceHashes,'Source changed during browser audit');
if(report.routes.some(row=>row.status!=='pass'))process.exitCode=1;
