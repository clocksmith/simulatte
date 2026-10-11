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
  for(const state of [row.opening,row.paused,row.focused,row.restarted,row.advanced,row.replaying,row.replayProgress,row.replayedActions])if(state?.targets){
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
  const canvas=[...document.querySelectorAll('canvas')].find(canvas=>visible(canvas)&&canvas.__simulatteObjectTargets);
  const targets=canvas?.__simulatteObjectTargets?.()||[];
  const rect=canvas?.getBoundingClientRect(),panel=document.querySelector('.sim-object-inspector');
  const insets=rect&&visible(panel)?SimulatteCameraFit.measureInsets(rect,[{edge:'bottom',rect:panel.getBoundingClientRect()}]):{};
  const camera=globalThis.SimulatteActiveSession?.snapshot().operations.some(row=>row.id==='camera-state') ? await SimulatteActiveSession.invoke('camera-state') : null;
  return {camera,phase:document.body.dataset.journeyPhase,profile:$('application-profile')?.value,progress:Number($('playback-timeline')?.value),
    running:document.body.dataset.journeyPhase==='running',complete:document.body.dataset.journeyPhase==='completed',
    ready:!!globalThis.SimulatteActiveSession&&targets.length>0,targets,view:rect&&{width:rect.width,height:rect.height,insets},
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
      await c.send('Emulation.setTouchEmulationEnabled',{enabled:width<700,maxTouchPoints:2});
      await c.send('Page.navigate',{url:b.host.baseUrl+page.path.slice(1)});
      await c.send('Page.bringToFront');
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
      await delay(1200);row.focused=await snap();assert.equal(row.focused.progress,before.progress);
      row.framing=await ev(`(()=>{
        const field=globalThis.__fieldExperimentState,solar=globalThis.SimulatteSolarDrive,moto=globalThis.SimulatteMotorcycleController;
        if('${kind}'==='field'){const v=field.view,h=v.selected;return {width:v.width,height:v.height,points:h?[{x:h.bounds?.left??h.x-(h.radius||4),y:h.bounds?.top??h.y-(h.radius||4)},{x:h.bounds?.right??h.x+(h.radius||4),y:h.bounds?.bottom??h.y+(h.radius||4)}]:[]};}
        if('${kind}'==='solar')return solar.snapshot().view;
        if('${kind}'==='motorcycle'){const c=document.getElementById('city'),t=moto.interactionTargets().find(t=>t.id===moto.snapshot().selected),r=c.getBoundingClientRect();const obstructions=[...document.querySelectorAll('.city-toolbar,.observer-readout,#inspection,#map-navigation')].filter(e=>e.checkVisibility()).map(e=>{const p=e.getBoundingClientRect();return {left:p.left-r.left,right:p.right-r.left,top:p.top-r.top,bottom:p.bottom-r.top};});return {width:r.width,height:r.height,obstructions,points:t?.points||[]};}
        const c=[...document.querySelectorAll('canvas')].find(c=>c.checkVisibility()&&c.__simulatteObjectTargets),t=c.__simulatteObjectTargets().find(t=>t.id===${JSON.stringify(id)}),r=c.getBoundingClientRect(),p=document.querySelector('.sim-object-inspector'),insets=p?.checkVisibility()?SimulatteCameraFit.measureInsets(r,[{edge:'bottom',rect:p.getBoundingClientRect()}]):{};
        return {width:r.width,height:r.height,insets,points:Array.isArray(t?.bounds)?t.bounds:t?.points.filter(Boolean)||[]};
      })()`);
      const fit=row.framing,points=fit.points.filter(Boolean);assert.ok(points.length,'Focused subject must be projected');
      const usable={left:fit.insets?.left||0,right:fit.width-(fit.insets?.right||0),top:fit.insets?.top||0,bottom:fit.height-(fit.insets?.bottom||0)};
      assert.ok(points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=usable.left-1&&p.x<=usable.right+1&&p.y>=usable.top-1&&p.y<=usable.bottom+1&&(p.z===undefined||p.z>=0&&p.z<=1)),'Focus must frame actual geometry without clipping or inspector obstruction');
      if(fit.obstructions) {
        const left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y)),bottom=Math.max(...points.map(p=>p.y));
        assert.ok(fit.obstructions.every(r=>right<r.left||left>r.right||bottom<r.top||top>r.bottom),'Focused geometry must not intersect a visible control or inspector');
      }
      assert.ok(Math.max(Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)),Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y)))>=8,'Focus must show geometry at a useful visible size');
      if(kind==='profile') {
        row.acceptedCamera=await ev(`(async()=>{const before=[...document.querySelectorAll('.camera-modes [aria-checked="true"]')].map(b=>b.id);let rejected=false;try{await SimulatteActiveSession.invoke('camera','invalid-audit-mode');}catch{rejected=true;}const after=[...document.querySelectorAll('.camera-modes [aria-checked="true"]')].map(b=>b.id);return {before,after,rejected};})()`);
        assert.equal(row.acceptedCamera.rejected,true);assert.deepEqual(row.acceptedCamera.before,row.acceptedCamera.after,'Rejected camera commands preserve accepted selection');
        assert.equal(row.acceptedCamera.before.length,1,'Programmatic Focus publishes exactly one accepted camera mode');
      }
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
      if(kind==='field'){await selectObject();await ev(`document.querySelector('#actions button:not(:disabled)').click()`);}
      if(kind==='profile'&&page.profile==='gpu-supercluster-v1')await ev(`document.querySelector('[data-object-action="straggler"]').click()`);
      await delay(200);
      const recorded=await snap();
      await ev(`(()=>{const e=document.getElementById('${speedId}');e.value=e.options[0].value;e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await command('replay');row.replaying=await until(s=>s.running||s.complete);
      const firstReplay=row.replaying.progress;
      assert.ok(firstReplay<recorded.progress||firstReplay===0,'Replay must visibly return to the beginning');
      row.replayProgress=await until(s=>s.progress>firstReplay);
      assert.ok(row.replayProgress.progress>firstReplay,'Replay must produce observed logical progression');
      if(kind==='field'){
        row.replayedActions=await until(s=>s.replay?.appliedActions===recorded.actions);
        assert.equal(row.replayedActions.actions,recorded.actions,'Replay preserves recorded interventions');
      }
      if((await snap()).running)await command('pause');
      if(kind==='field'){
        await ev(`(()=>{globalThis.__auditAccepted={hash:__fieldExperimentSnapshot().stateHash,pixels:document.getElementById('scene').toDataURL()};globalThis.__auditFillRect=CanvasRenderingContext2D.prototype.fillRect;CanvasRenderingContext2D.prototype.fillRect=function(){throw Error('audit rendering failure');};})()`);
        try {
          for(let i=0;i<40&&!await ev(`globalThis.__fieldExperimentState.executionState==='failed'`);i++)await delay(50);
          row.recovery=await ev(`({state:__fieldExperimentState.executionState,hash:__fieldExperimentSnapshot().stateHash===__auditAccepted.hash,pixels:document.getElementById('scene').toDataURL()===__auditAccepted.pixels,label:document.getElementById('pause').textContent})`);
          assert.deepEqual(row.recovery,{state:'failed',hash:true,pixels:true,label:'Retry accepted run'});
        }finally{await ev(`CanvasRenderingContext2D.prototype.fillRect=__auditFillRect`);}
        await command('resume');await until(s=>!s.running&&s.executionState!=='failed');
        assert.equal(await ev(`__fieldExperimentSnapshot().stateHash===__auditAccepted.hash`),true,'Recovery restores the accepted state');
        await ev('delete globalThis.__auditFillRect;delete globalThis.__auditAccepted');
      }
      if(width<700){
        await ev('scrollTo(0,0)');await delay(100);
        await ev(`(()=>{const c=[...document.querySelectorAll('canvas')].find(c=>c.checkVisibility()&&('${kind}'!=='profile'||c.__simulatteObjectTargets));if(c.getBoundingClientRect().top>innerHeight-80)c.scrollIntoView({block:'center'});})()`);await delay(100);
        const canvas=await ev(`(()=>{const c=[...document.querySelectorAll('canvas')].find(c=>c.checkVisibility()&&('${kind}'!=='profile'||c.__simulatteObjectTargets));const r=c.getBoundingClientRect();let point=null;
          for(let y=Math.max(180,r.top+15);y<=Math.min(innerHeight-180,r.bottom-15)&&!point;y+=24)for(const x of [r.left+20,(r.left+r.right)/2,r.right-20])if(document.elementFromPoint(x,y)===c){point={x,y};break;}
          return {...point,onCanvas:!!point,before:scrollY,direction:scrollY<document.scrollingElement.scrollHeight-innerHeight-50?-1:1};})()`);
        assert.equal(canvas.onCanvas,true,'Touch scrolling must start on the actual simulation canvas');
        await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:canvas.x,y:canvas.y}]});
        for(let step=1;step<=8;step++){
          await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:canvas.x,y:canvas.y+canvas.direction*step*18}]});await delay(30);
        }
        await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(400);
        row.scroll={...await ev('({y:scrollY,height:document.scrollingElement.scrollHeight,viewport:innerHeight})'),before:canvas.before,onCanvas:canvas.onCanvas};
        assert.ok(row.scroll.height<=row.scroll.viewport+1||(row.scroll.y-canvas.before)*-canvas.direction>0,'A vertical touch gesture on the canvas must scroll an overflowing document');
        await ev('scrollTo(0,0)');
      }
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
