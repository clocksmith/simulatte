#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {openBrowserAudit} from './browser-session.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const arg=(name,fallback)=>process.argv.find(value=>value.startsWith(name+'='))?.slice(name.length+1)??fallback;
const seconds=Number(arg('--seconds','120')),mobile=process.argv.includes('--mobile');
assert.ok(Number.isFinite(seconds)&&seconds>=0&&seconds<=600);
const out=path.resolve(root,arg('--out','artifacts/measurement-journeys'));
await fs.mkdir(out,{recursive:true});
const files=execFileSync('git',['ls-files','--','public'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(name=>/\.(js|json|html|css)$/.test(name));
const sourceHashes=Object.fromEntries(await Promise.all(files.map(async name=>[name,createHash('sha256').update(await fs.readFile(path.join(root,name))).digest('hex')])));
const report={schema:'simulatte.measurementJourneys.v1',sourceHashes,platform:process.platform,
  viewport:mobile?{width:390,height:844}:{width:1440,height:1000},physicalCoverage:'Local host GPU; mobile is an emulated viewport, not a physical phone.',
  screenshotCoverage:'Completed intervention inspector on each tested desktop or emulated-mobile route.',performanceClaim:false,seconds,routes:[]};
const browser=await openBrowserAudit({publicRoot:path.join(root,'public'),viewport:report.viewport,webgpu:true});
const {client,host}=browser;
const evaluate=async expression=>{
 const response=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
 if(response.exceptionDetails)throw Error(response.exceptionDetails.exception?.description||response.exceptionDetails.text);
 return response.result.value;
};
const wait=async(expression,timeout=90000)=>{
 const start=Date.now();
 while(Date.now()-start<timeout){const result=await evaluate(expression);if(result)return result;await new Promise(resolve=>setTimeout(resolve,100));}
 throw Error('Timed out: '+expression);
};
const key=async key=>{const codes={Tab:9,Enter:13,Escape:27,Home:36,ArrowDown:40,ArrowUp:38};
 for(const type of ['keyDown','keyUp'])await client.send('Input.dispatchKeyEvent',{type:type==='keyDown'&&key!=='Enter'?'rawKeyDown':type,key,code:key,windowsVirtualKeyCode:codes[key],...(type==='keyDown'&&key==='Enter'?{text:'\r'}:{})});};
async function tabTo(selector){
 for(let i=0;i<180;i++){
  if(await evaluate(`document.activeElement?.matches(${JSON.stringify(selector)})`))return;
  await key('Tab');
 }
 throw Error('Keyboard could not reach '+selector);
}
async function press(selector){await tabTo(selector);await key('Enter');}
const state=()=>evaluate(`(()=>{const s=globalThis.SimulatteActiveSession?.snapshot();const c=globalThis.__simulattePluginPlatformV4?.contributions?.find(c=>s?.id.startsWith(c.pluginId));return {session:s,model:c?.state,inspections:c?.inspections,selected:document.querySelector('[aria-label="Inspect object"]')?.value,render:[...document.querySelectorAll('canvas')].find(c=>c.__simulatteRenderReceipt)?.__simulatteRenderReceipt()};})()`);
try{
 await client.send('Runtime.enable');await client.send('Page.enable');
 await client.send('Emulation.setDeviceMetricsOverride',{...report.viewport,deviceScaleFactor:1,mobile});
 for(const route of ['sunwalker','datacenter','motorcycle'].filter(route=>!arg('--profile','')||route===arg('--profile',''))){
  const row={route,status:'running',keyboard:[],samples:[]};report.routes.push(row);console.log('START',route);
  try{
   await client.send('Page.navigate',{url:host.baseUrl+route});
   await wait(route==='motorcycle'?`globalThis.SimulatteMotorcycleSession?.snapshot().execution==='running'`:`globalThis.SimulatteActiveSession?.snapshot().execution==='running'`);
   row.adapter=await evaluate(`(async()=>{const a=await navigator.gpu.requestAdapter();return a?{vendor:a.info.vendor,architecture:a.info.architecture,device:a.info.device,description:a.info.description,isFallbackAdapter:a.info.isFallbackAdapter}:null;})()`);
   assert.ok(row.adapter&&!row.adapter.isFallbackAdapter&&!/swiftshader|llvmpipe|software/i.test(JSON.stringify(row.adapter))&&row.adapter.vendor,'Hardware adapter required');
   if(route==='motorcycle'){
    await press('#pause');await wait(`SimulatteMotorcycleController.snapshot().paused`);row.keyboard.push('Tab to Pause; Enter pauses traffic');
    const before=await evaluate(`SimulatteMotorcycleController.snapshot()`);
    await press('#motorcycle-camera-menu > summary');await key('Escape');
    assert.equal((await evaluate(`SimulatteMotorcycleController.snapshot()`)).time,before.time);
    await press('[data-add-treatment="directional"]');await tabTo('#city');await key('Enter');
    await wait(`SimulatteMotorcycleController.snapshot().treatments.length===1`);
    await wait(`globalThis.motorcycleMeasurementReceipt?.observer.treatments[0]?.comparison && SimulatteMotorcycleSession.snapshot().measurement==='fresh'`);
    await wait(`document.getElementById('inspection-main').textContent.startsWith('This treatment:')`);
    const comparison=await evaluate(`({reading:motorcycleMeasurementReceipt,view:document.getElementById('inspection-main').textContent})`);
    const delta=comparison.reading.observer.treatments[0].comparison.changeDb;
    assert.ok(comparison.view.includes(delta.toFixed(2)));row.treatmentComparison=comparison;
    await wait(`motorcycleMeasurementReceipt?.observer.matchedComparison?.rows.length>0`);
    row.matched=await evaluate(`motorcycleMeasurementReceipt.observer.matchedComparison`);
    assert.equal(row.matched.scope,'current-observation');assert.equal(row.matched.time,before.time);
    assert.ok(row.matched.rows.length<=5&&row.matched.rows.length>0);
    assert.equal(await evaluate(`document.querySelector('[aria-label="Matched observer comparison"]').hidden`),false);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    const shot=await client.send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(out,'motorcycle-comparison.png'),Buffer.from(shot.data,'base64'));
    assert.deepEqual((await evaluate(`SimulatteMotorcycleController.snapshot()`)).observer,before.observer,'Treatment placement preserves observer');
    assert.equal((await evaluate(`SimulatteMotorcycleController.snapshot()`)).time,before.time,'Treatment placement preserves time');
    row.keyboard.push('Enter places a treatment at map center; comparison retains observer and instant');
    await press('#undo-treatment');await wait(`SimulatteMotorcycleController.snapshot().treatments.length===0`);
    row.keyboard.push('Undo treatment');
    await press('#pause');await wait(`!SimulatteMotorcycleController.snapshot().paused`);row.keyboard.push('Camera controls preserve paused simulation; keyboard resumes');
    row.renderer=await wait(`globalThis.motorcycleRuntimeReceipt?.backend`);assert.equal(row.renderer,'WebGPU');
   }else{
    await press('#pause-button');await wait(`SimulatteActiveSession.snapshot().execution==='paused'`);
    row.keyboard.push('Tab to Pause; Enter pauses');
    await tabTo('[aria-label="Inspect object"]');
    for(const letter of (route==='sunwalker'?'Walker':'Rack R1-1')){
     await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:letter,text:letter,windowsVirtualKeyCode:letter.toUpperCase().charCodeAt(0)});
     await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:letter,windowsVirtualKeyCode:letter.toUpperCase().charCodeAt(0)});
    }
    await wait(`document.querySelector('[aria-label="Inspect object"]').value===${JSON.stringify(route==='sunwalker'?'sun-walker-actor':'rack:R1-1')}`);
    const selected=await state();row.selected=selected.selected;row.keyboard.push('Native keyboard object selection');
    if(route==='datacenter'){
     await press('[data-object-action="straggler"]');
     await wait(`__simulattePluginPlatformV4.contributions.find(c=>c.pluginId==='gpu-supercluster').inspections.some(i=>i.targetIds.length===1&&i.targetIds[0]===${JSON.stringify(selected.selected)}&&i.fields.some(f=>f.id==='slowdown'&&f.value===95))`);
     const interventionStart=(await state()).model.simulationTimeMs;
     await press('#resume-button');await wait(`__simulattePluginPlatformV4.contributions.find(c=>c.pluginId==='gpu-supercluster').inspections.some(i=>i.fields.some(f=>f.id==='extra-wait'&&f.value>0))`);
     await press('#pause-button');
     row.intervention=await state();
     const additional=row.intervention.inspections.flatMap(i=>i.fields).filter(f=>f.id==='extra-wait');
     assert.ok(additional.some(f=>f.value>0),'Slow rack must cause additional waiting');
     await press('[data-object-action="straggler"]');row.keyboard.push('Slow rack during execution; inspect additional waiting; restore selected rack');
     const shot=await client.send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(out,'gpu-comparison.png'),Buffer.from(shot.data,'base64'));
    }else{
     await press('[data-object-action="preview"]');const preview=await state();assert.deepEqual(preview.model,selected.model);
     row.keyboard.push('Preview alternative preserves accepted run');
    }
    await press('#resume-button');await wait(`SimulatteActiveSession.snapshot().execution==='running'`);
    row.renderer=(await state()).render;assert.equal(row.renderer.backend,route==='datacenter'?'canvas2d':'webgpu');
    row.renderCoverage=route==='datacenter'?'Configured Canvas2D scene; WebGPU adapter availability is not proof of per-canvas GPU execution.':'WebGPU scene on the recorded hardware adapter';
   }
   const started=Date.now();
   do{
    if(route==='motorcycle'){
     const sample=await evaluate(`({session:SimulatteMotorcycleSession.snapshot(),state:SimulatteMotorcycleController.snapshot(),measurement:globalThis.motorcycleMeasurementReceipt,runtime:globalThis.motorcycleRuntimeReceipt})`);
     row.samples.push({wallMs:Date.now()-started,time:sample.state.time,measurementTime:sample.measurement?.time,execution:sample.session.execution,backend:sample.runtime?.backend});
     assert.ok(Number.isFinite(sample.state.time));assert.notEqual(sample.session.preparation,'failed');
    }else{
     const sample=await state();assert.ok(sample.model);assert.notEqual(sample.session.lastOperation?.status,'failed');
     row.samples.push({wallMs:Date.now()-started,timeMs:sample.model.simulationTimeMs,status:sample.model.status,selected:sample.selected});
     if(route==='datacenter'){
      const rackRows=sample.inspections.filter(i=>i.fields.some(f=>f.id==='computing-ms'));
      let throughput=0;
      for(const rack of rackRows){const f=Object.fromEntries(rack.fields.map(f=>[f.id,f.value]));assert.ok(Math.abs(f['computing-ms']+f['communication-ms']+f['wait-ms']-sample.model.simulationTimeMs)<1e-6);throughput+=f['throughput-contribution'];}
      assert.ok(Math.abs(throughput-sample.model.measures.find(m=>m.kind==='executed-compute-tflops').value)<1e-6);
     }else{
      const measured=sample.model.measures.filter(m=>['direct-sun','shade','unknown','night'].includes(m.kind)).reduce((sum,m)=>sum+m.value,0);
      assert.ok(Math.abs(measured*1000-sample.model.simulationTimeMs)<2);
     }
     if(sample.model.status==='settled')await evaluate(`SimulatteActiveSession.invoke('replay')`);
    }
    if(Date.now()-started>=seconds*1000)break;
    await new Promise(resolve=>setTimeout(resolve,Math.min(10000,seconds*1000-(Date.now()-started))));
   }while(true);
   assert.ok(row.samples.length===1||row.samples.some(s=>(s.timeMs??s.time)!==(row.samples[0].timeMs??row.samples[0].time)),'Model must advance during the session');
   row.status='passed';console.log('PASS',route);
  }catch(error){row.status='failed';row.error=error.stack;row.page=await evaluate(`document.body.innerText.slice(-2500)`).catch(()=>null);console.log('FAIL',route,error.message);}
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
 }
 for(const [name,hash]of Object.entries(sourceHashes))assert.equal(createHash('sha256').update(await fs.readFile(path.join(root,name))).digest('hex'),hash,'Source changed during audit: '+name);
 report.exceptions=client.diagnosticEvents.filter(row=>row.method==='Runtime.exceptionThrown');
 if(report.exceptions.length)process.exitCode=1;
}finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
if(report.routes.some(row=>row.status!=='passed'))process.exitCode=1;
