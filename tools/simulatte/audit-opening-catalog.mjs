import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {openBrowserAudit} from './browser-session.mjs';
import {sourceReceipt} from './runtime-audit-sources.mjs';
const require=createRequire(import.meta.url),root=fileURLToPath(new URL('../../',import.meta.url));
const catalog=require('../../public/simulation-routes.js').pages;
const selected=process.argv.includes('--profile')?process.argv[process.argv.indexOf('--profile')+1]:null;
const pages=catalog.filter(page=>!selected||page.profile===selected||page.path===`/${selected}`);
if(!pages.length)throw Error('Unknown catalog experience: '+selected);
const out=root+'artifacts/catalog-interactions'+(selected?'/'+selected:'');await fs.mkdir(out,{recursive:true});
const report={schema:'simulatte.catalogInteractionAudit.v1',sources:await sourceReceipt(root),cases:[],errors:[],
  boundary:'Desktop and emulated mobile in Chrome with explicit software WebGPU. Human observation and physical-device review remain separate.'};
function compactRow(row){
  for(const state of [row.opening,row.paused,row.focused,row.restarted,row.advanced,row.replaying])if(state?.targets){
    state.targetCount=state.targets.length;state.sampleTargetIds=state.targets.slice(0,8).map(target=>target.id);delete state.targets;
  }
}
if(process.argv.includes('--compact-existing')){
  const existing=JSON.parse(await fs.readFile(out+'/browser.json','utf8'));
  assert.equal(existing.schema,report.schema);existing.cases.forEach(compactRow);
  await fs.writeFile(out+'/browser.json',JSON.stringify(existing,null,2));process.exit(0);
}
const b=await openBrowserAudit({publicRoot:root+'public',viewport:{width:1440,height:1000},headed:!!process.env.DISPLAY,
  webgpu:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader','--disable-vulkan-surface']}),c=b.client;
await c.send('Page.enable');await c.send('Runtime.enable');
c.on('Runtime.exceptionThrown',event=>report.errors.push(event.exceptionDetails));
const ev=async expression=>{const result=await c.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let kind='profile';
async function snap(){return ev(`(async()=>{const $=id=>document.getElementById(id),solar=globalThis.SimulatteSolarDrive,
  field=globalThis.__fieldExperimentState,moto=globalThis.SimulatteMotorcycleController;
  if(!document.body)return null;
  const visible=e=>!!e?.checkVisibility({visibilityProperty:true});
  if('${kind}'==='field')return field&&{...field,progress:field.step,error:globalThis.__fieldExperimentError};
  if('${kind}'==='solar')return solar&&{...solar.snapshot(),progress:solar.getState().step,complete:solar.getState().status==='complete',error:document.body.dataset.runtimeError};
  if('${kind}'==='motorcycle')return moto&&document.body.dataset.state==='running'||'${kind}'==='motorcycle'&&document.body.dataset.state==='paused'
    ?{...moto.snapshot(),progress:moto.snapshot().time,running:!moto.snapshot().paused,complete:moto.snapshot().time>=180}:null;
  const targets=[...document.querySelectorAll('canvas')].flatMap(canvas=>canvas.__simulatteObjectTargets?.()||[]);
  const camera=globalThis.SimulatteActiveSession?.snapshot().operations.some(row=>row.id==='camera-state') ? await SimulatteActiveSession.invoke('camera-state') : null;
  return {camera,phase:document.body.dataset.journeyPhase,profile:$('application-profile')?.value,progress:Number($('playback-timeline')?.value),
    running:document.body.dataset.journeyPhase==='running',complete:document.body.dataset.journeyPhase==='completed',
    ready:!!globalThis.SimulatteActiveSession&&targets.length>0,targets,
    advanced:$('decisions-button')?.getAttribute('aria-expanded'),overflow:document.documentElement.scrollWidth>innerWidth+1,
    error:globalThis.__simulatteLastFailError?.message,measurements:$('show-measurements')?.checked};})()`);}
async function until(predicate){const end=Date.now()+90000;let state;do{state=await snap();if(state?.error||state?.phase==='failed')throw Error(state.error||'Failed');if(state&&predicate(state))return state;await delay(150);}while(Date.now()<end);throw Error('State timed out: '+JSON.stringify(state));}
async function command(name){
  const controls={field:{pause:'pause',resume:'pause',restart:'restart',replay:'replay',reset:'reset-view',focus:'focus-selection'},
    solar:{pause:'run',resume:'run',restart:'reset',replay:'replay',reset:'reset-camera',focus:'focus-selection'},
    motorcycle:{pause:'pause',resume:'pause',restart:'reset',replay:'replay-traffic',reset:'reset-view',focus:'follow-selected'}};
  if(kind==='profile')return ev(`SimulatteActiveSession.invoke('${name==='reset'?'reset-view':name}')`);
  return ev(`document.getElementById('${controls[kind][name]}').click()`);
}
function framing(state){const value=state.camera||state.targets.map(row=>({id:row.id,points:row.points,bounds:row.bounds})).sort((a,b)=>a.id.localeCompare(b.id));return JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='number'?Math.round(v*1e3)/1e3:v));}
async function selectObject(){
  if(kind==='solar')return ev(`document.querySelector('.component-row[data-component=flywheel]').click()`);
  if(kind==='field')return ev(`document.getElementById('scene').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))`);
  if(kind==='motorcycle')return ev(`SimulatteMotorcycleSession.invoke('select-object',{sourceId:SimulatteMotorcycleController.snapshot().motorcycles[0].id})`);
  const state=await snap(),id=state.targets[Math.min(1,state.targets.length-1)].id;
  await ev(`SimulatteActiveSession.invoke('select-object',${JSON.stringify(id)})`);return id;
}
try{
  report.browser=await c.send('Browser.getVersion');
  for(const page of pages)for(const [width,height] of [[1440,1000],[390,844]]){
    kind=page.experimentId?'field':page.path==='/motorcycle'?'motorcycle':page.entry?.includes('/solar-drive/')?'solar':'profile';
    const row={profile:page.profile||page.experimentId||(kind==='solar'?'solar-drive':page.path.slice(1)),route:page.path,width,height,kind};report.cases.push(row);
    const errorStart=report.errors.length;
    try{
      await c.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
      await c.send('Page.navigate',{url:b.host.baseUrl+page.path.slice(1)});
      row.opening=await until(s=>(kind!=='profile'||s.profile===page.profile&&s.ready)&&(s.running||s.complete));
      if(kind==='profile'){assert.equal(row.opening.advanced,'false');assert.equal(row.opening.overflow,false);}
      if(row.opening.running)await command('pause');
      row.paused=await until(s=>!s.running);await delay(350);
      assert.equal((await snap()).progress,row.paused.progress,'Pause must freeze simulation time');
      if(kind==='solar'){for(let i=0;i<100&&!await ev('SimulatteSolarDrive.isViewSettled()');i++)await delay(50);}
      await delay(200);
      const before=await snap(),id=await selectObject();await delay(350);const after=await snap();
      assert.deepEqual(framing(after),framing(before),'Selection must preserve camera framing');
      assert.equal(after.progress,before.progress,'Selection must preserve logical time');
      row.selection={before:framing(before),after:framing(after)};
      if(kind==='profile')await ev(`SimulatteActiveSession.invoke('focus-object',${JSON.stringify(id)})`);else await command('focus');
      await delay(700);row.focused=await snap();assert.equal(row.focused.progress,before.progress);
      const switchId=kind==='profile'?'show-measurements':kind==='solar'?'flows':kind==='field'&&page.experimentId==='living-tissue'?'signal':kind==='motorcycle'?'live-overlay':null;
      if(switchId){
        const toggle=await ev(`(()=>{const e=document.getElementById('${switchId}');const label=e.textContent||e.closest('label')?.textContent;const before=e.getAttribute('role')==='switch'&&e.tagName==='BUTTON'?e.getAttribute('aria-checked'):e.checked;e.click();return {label,before,after:e.tagName==='BUTTON'?e.getAttribute('aria-checked'):e.checked,role:e.getAttribute('role'),nextLabel:e.textContent||e.closest('label')?.textContent};})()`);
        assert.equal(toggle.role,'switch');assert.notEqual(toggle.before,toggle.after);assert.equal(toggle.label,toggle.nextLabel);assert.equal((await snap()).progress,before.progress);row.displaySwitch=toggle;
      }
      const speedId=kind==='profile'?'playback-speed':kind==='solar'?'playback':kind==='field'?'speed':'playback';
      await ev(`(()=>{const e=document.getElementById('${speedId}');e.value=e.options[e.options.length-1].value;e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      assert.equal((await snap()).progress,before.progress,'Speed changes cannot advance a paused model');
      await command('reset');await delay(500);const reset=await snap();assert.equal(reset.progress,before.progress);
      const restartCamera=framing(reset);await command('restart');row.restarted=await until(s=>!s.running);
      assert.deepEqual(framing(row.restarted),restartCamera,'Restart must preserve the camera');
      assert.ok(row.restarted.progress<=before.progress,'Restart must return to the starting state');
      await command('resume');row.advanced=await until(s=>s.progress>row.restarted.progress||s.complete);
      if(row.advanced.running)await command('pause');
      await command('replay');row.replaying=await until(s=>s.running||s.complete);
      assert.ok(row.replaying.running||row.replaying.complete,'Replay visibly executes the recorded run');
      if(row.replaying.running)await command('pause');
      assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth+1'),true,'No horizontal overflow');
      const shot=await c.send('Page.captureScreenshot',{format:'png'});await fs.writeFile(out+`/${row.profile}-${width}.png`,Buffer.from(shot.data,'base64'));
      row.pass=report.errors.length===errorStart;
      if(!row.pass)row.failure='Browser exceptions: '+JSON.stringify(report.errors.slice(errorStart));
    }catch(error){row.failure=error.stack;}
    compactRow(row);
    console.log(JSON.stringify({profile:row.profile,width,pass:row.pass,failure:row.failure}));
    await fs.writeFile(out+'/browser.json',JSON.stringify(report,null,2));
  }
}finally{await b.close();
  const after=await sourceReceipt(root),hashes=receipt=>Object.fromEntries(Object.entries(receipt.modifiedSources).map(([file,row])=>[file,row.sha256||'deleted']));
  report.sourceFreeze={passed:report.sources.head===after.head&&JSON.stringify(hashes(report.sources))===JSON.stringify(hashes(after)),finishedAt:after.capturedAt};
  await fs.writeFile(out+'/browser.json',JSON.stringify(report,null,2));
}
if(!report.sourceFreeze.passed||report.cases.some(row=>!row.pass))process.exitCode=1;
