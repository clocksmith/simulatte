import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {openBrowserAudit} from './browser-session.mjs';
import {sourceReceipt} from './runtime-audit-sources.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=process.env.SIMULATTE_FRAME_OUT||path.join(root,'artifacts/experience-frame');
await fs.mkdir(output,{recursive:true});
const catalog=await import('../../public/simulation-routes.js').then(m=>m.default);
const requestedRoutes=(process.env.SIMULATTE_FRAME_ROUTES||'').split(',').filter(Boolean);
const pages=catalog.pages.filter(page=>!requestedRoutes.length||requestedRoutes.includes(page.path));
assert.ok(pages.length,'No matching catalog routes');
const reportPath=path.join(output,process.env.SIMULATTE_FRAME_REPORT||'report.json');
let report={routes:pages.map(page=>page.path),frames:{},source:await sourceReceipt(root),boundary:'Chrome with WebGPU; desktop and touch-emulated mobile. No measured weather, hardware performance, or physical-device claim.',cases:[]};
if(process.env.SIMULATTE_FRAME_RESUME==='1'){
 const previous=JSON.parse(await fs.readFile(reportPath,'utf8'));
 assert.equal(previous.sourceAfter.head,report.source.head,'Resume source commit changed');
 assert.deepEqual(previous.sourceAfter.modifiedSources,report.source.modifiedSources,'Resume public sources changed');
 report={...previous,cases:previous.cases.filter(row=>row.status==='pass'),resumedAt:report.source.capturedAt};
}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const viewports=process.env.SIMULATTE_FRAME_DESKTOP==='1'?[{width:1440,height:1000}]:[{width:1440,height:1000},{width:390,height:844}];
for(const viewport of viewports){
 if(pages.every(page=>report.cases.some(row=>row.route===page.path&&row.viewport.width===viewport.width&&row.status==='pass')))continue;
 const browser=await openBrowserAudit({url:process.env.SIMULATTE_FRAME_ORIGIN,publicRoot:path.join(root,'public'),viewport,webgpu:true});
 const c=browser.client;
 const evaluate=async expression=>{const r=await c.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error((r.exceptionDetails.exception?.description||r.exceptionDetails.text)+' in '+expression);return r.result.value;};
 const until=async expression=>{const end=Date.now()+30000;while(!await evaluate(expression)){if(Date.now()>end)throw Error('Timed out: '+expression);await delay(250);}};
 try{
  await c.send('Page.enable');await c.send('Runtime.enable');
  await c.send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile:viewport.width<900});await c.send('Emulation.setTouchEmulationEnabled',{enabled:viewport.width<900});
  for(const page of pages){
   const route=page.path;if(report.cases.some(row=>row.route===route&&row.viewport.width===viewport.width&&row.status==='pass'))continue;
   const row={route,viewport,status:'running'};report.cases.push(row);
   try{
    const previousOrigin=await evaluate('performance.timeOrigin');
    await c.send('Page.navigate',{url:(process.env.SIMULATTE_FRAME_ORIGIN||browser.host.baseUrl)+route.replace(/^\//,'')});
    await until(`performance.timeOrigin!==${previousOrigin}`);
    await until("Boolean(document.querySelector('.experience-frame__stage,.gpu-scene__stage'))");
    await until("Boolean(globalThis.SimulatteMotorcycleSession?.snapshot().rendering==='ready'||globalThis.SimulatteSolarDrive?.getReceipt().evidence.renderer?.completedFrames>0||globalThis.__fieldExperimentState?.step>=0||['running','completed','paused'].includes(document.body?.dataset.journeyPhase))");
    await evaluate(`globalThis.SimulatteTheme?.setPreference('${viewport.width<700?'light':'dark'}')`);
    await evaluate('document.fonts.ready');
    await delay(250);
    // Contract: shared control ownership/geometry, reachable scene and one settings
    // sheet. Domain composition may differ; camera and reset semantics must not.
    row.frame=await evaluate(`(()=>{const nodes=[...document.querySelectorAll('button,summary,select,input,textarea')].filter(e=>e.checkVisibility());return {unowned:nodes.filter(e=>!e.dataset.wui).map(e=>e.id||e.outerHTML.slice(0,100)),badButtons:nodes.filter(e=>e.matches('button,summary')).filter(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.height<44||r.width<44||s.borderRadius!=='4px'||!s.fontFamily.includes('Space Grotesk')}).map(e=>({id:e.id,text:e.textContent,rect:e.getBoundingClientRect().toJSON()})),overflow:document.documentElement.scrollWidth>innerWidth+1,stage:(document.querySelector('.experience-frame__stage,.gpu-scene__stage')).getBoundingClientRect().toJSON()};})()`);
    assert.equal(await evaluate('innerWidth'),viewport.width,'Content expands the mobile layout viewport');
    assert.deepEqual(row.frame.unowned,[],'Controls bypass shared components');assert.deepEqual(row.frame.badButtons,[],'Shared button geometry differs');assert.equal(row.frame.overflow,false,'Horizontal overflow');assert.ok(row.frame.stage.height>=300,'Scene collapsed');assert.ok(row.frame.stage.top<160,'Controls push scene below the opening viewport');
    const trigger='[data-frame-control=advanced],#decisions-button';
    assert.equal(await evaluate(`document.querySelector('${trigger}').textContent`),'•••','Runtime overwrote menu icon');
    assert.equal(await evaluate(`(()=>{const frame=document.querySelector('.experience-frame,.gpu-scene'),root=getComputedStyle(document.body),color=getComputedStyle(frame).backgroundColor;return color==='rgba(0, 0, 0, 0)'||color===root.backgroundColor;})()`),true,'Frame retained a conflicting theme surface');
    if(viewport.width>700)assert.equal(await evaluate(`(()=>{const b=document.querySelector('[data-frame-control=reset],#camera-reset'),r=b.getBoundingClientRect(),p=b.closest('.wui-dock').getBoundingClientRect();return r.left>=p.left&&r.right<=p.right&&r.top>=p.top&&r.bottom<=p.bottom;})()`),true,'Reset escapes camera dock');

    await evaluate(`(()=>{const b=document.querySelector('${trigger}');b.focus();b.click()})()`);
    assert.equal(await evaluate("Boolean([...document.querySelectorAll('[data-wui=sheet]')].find(e=>!e.hidden&&!e.inert))"),true,'Settings did not open');
    await delay(50);
    assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-wui=sheet] button,[data-wui=sheet] summary,[data-wui=sheet] input,[data-wui=sheet] select,[data-wui=sheet] textarea')].filter(e=>e.checkVisibility()&&!e.dataset.wui).map(e=>e.id||e.tagName)"),[],'Settings bypass shared controls');

    await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    assert.equal(await evaluate(`document.activeElement.matches('${trigger}')`),true,'Settings focus did not return');
    const camera='.experience-camera-menu .wui-menu-trigger,#camera-menu .wui-menu-trigger';
    await evaluate(`document.querySelector('${camera}').click()`);
    row.views=await evaluate("[...document.querySelectorAll('.experience-camera-menu button,#camera-menu button')].filter(b=>b.checkVisibility()&&b.hasAttribute('aria-checked')).map(b=>({label:b.textContent.trim(),disabled:b.disabled,role:b.getAttribute('role'),checked:b.getAttribute('aria-checked')}))");
    assert.ok(row.views.length>0,'No camera views');assert.ok(row.views.every(v=>['radio','menuitemradio'].includes(v.role)),'Camera choices need radio semantics');
    await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    assert.equal(await evaluate(`document.activeElement.matches('${camera}')`),true,'Camera focus did not return');
    await evaluate("document.querySelector('[data-frame-control=reset],#camera-reset').click()");
    await delay(300);
    row.afterReset=await evaluate("({failed:Boolean(document.body.dataset.runtimeError||globalThis.__fieldExperimentError),camera:globalThis.SimulatteSolarDrive?.cameraView()})");assert.equal(row.afterReset.failed,false);
    if(route.includes('solar-drive')){
      const wasRunning=await evaluate('SimulatteSolarDrive.controlState().running');
      if(wasRunning)await evaluate("document.querySelector('[data-frame-control=play]').click()");
      const before=await evaluate('JSON.stringify(SimulatteSolarDrive.getState())');
      await evaluate("document.querySelector('[data-camera-view=top]').click()");await until('SimulatteSolarDrive.isViewSettled()');
      row.topView=await evaluate('SimulatteSolarDrive.snapshot().camera');assert.ok(row.topView.pitch>1.55,'Top must be overhead');
      assert.equal(await evaluate('JSON.stringify(SimulatteSolarDrive.getState())'),before,'Camera changes simulation state');
      const point=await evaluate("(()=>{const r=document.querySelector('#scene').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
      await c.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
      await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
      assert.equal(await evaluate('SimulatteSolarDrive.cameraView()'),'top','Selection changes camera preset');
      await evaluate('SimulatteSolarDrive.focus()');await until('SimulatteSolarDrive.isViewSettled()');
      assert.equal(await evaluate('SimulatteSolarDrive.cameraView()'),'overview','Focus leaves an incorrect preset selected');
      assert.ok(await evaluate('Math.abs(SimulatteSolarDrive.snapshot().camera.pitch-.32)<.001'));
      await evaluate("document.querySelector('#scene').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))");
      assert.equal(await evaluate('SimulatteSolarDrive.cameraView()'),'manual','Keyboard camera navigation retains a preset');
      row.cameraState={selectionPreserved:true,focusAccepted:'overview',keyboardAccepted:'manual'};
      assert.equal(await evaluate('JSON.stringify(SimulatteSolarDrive.getState())'),before,'Inspection changes numerical state');
      await evaluate("document.querySelector('[data-frame-control=reset]').click()");await until('SimulatteSolarDrive.isViewSettled()');
      assert.equal(await evaluate('SimulatteSolarDrive.cameraView()'),'overview');
      if(wasRunning)await evaluate("document.querySelector('[data-frame-control=play]').click()");
    }
    if(page.experimentId){
      await evaluate("if(__fieldExperimentState.running)document.querySelector('[data-frame-control=play]').click()");
      const before=await evaluate('JSON.stringify(__fieldExperimentSnapshot().stateHash)');
      await evaluate("document.querySelector('[data-branch=baseline]').click()");
      assert.equal(await evaluate("document.querySelector('.experiments').dataset.branch"),'baseline');
      assert.equal(await evaluate("document.querySelector('#baseline').getBoundingClientRect().width===document.querySelector('#scene').getBoundingClientRect().width"),true,'Comparison branch viewport differs');
      assert.equal(await evaluate("document.querySelector('#baseline').checkVisibility({visibilityProperty:true})&&!document.querySelector('#scene').checkVisibility({visibilityProperty:true})"),true,'Baseline branch is not visible');
      await evaluate("document.querySelector('[data-branch=intervention]').click()");
      assert.equal(await evaluate("document.querySelector('#scene').checkVisibility({visibilityProperty:true})&&!document.querySelector('#baseline').checkVisibility({visibilityProperty:true})"),true,'Intervention branch is not visible');
      assert.equal(await evaluate('JSON.stringify(__fieldExperimentSnapshot().stateHash)'),before,'Display switch changes numerical branches');row.branchSwitch=true;
    }
    if(['motorcycle','sunwalker','datacenter','simulatte/solar-drive/index.html','living-tissue','river-formation','crystal-foundry'].some(id=>route==='/' + id)){
      row.capture=path.join(output,route.replace(/[^a-z0-9]+/gi,'-')+'-'+viewport.width+'.png');
      const png=await c.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});const bytes=Buffer.from(png.data,'base64');await fs.writeFile(row.capture,bytes);row.captureSha256=createHash('sha256').update(bytes).digest('hex');
    }
    if(viewport.width<900&&route!=='/datacenter'){
      const point=await evaluate(`(()=>{const canvases=[...document.querySelectorAll('.experience-frame__stage canvas,.gpu-scene__stage canvas')].filter(c=>c.checkVisibility());for(const canvas of canvases){const r=canvas.getBoundingClientRect();for(let y=Math.min(innerHeight-100,r.bottom-40);y>Math.max(r.top+40,240);y-=30)for(const x of [(r.left+r.right)/2,r.left+40])if(document.elementFromPoint(x,y)===canvas)return {x,y};}return null;})()`);
      assert.ok(point,'No unobstructed canvas for touch scrolling');
      await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
      for(let step=1;step<=8;step++){await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x,y:point.y-step*25}]});await delay(30);}
      await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(400);
      assert.ok(await evaluate('scrollY>0'),'Touch scroll over canvas is blocked');row.touchScroll=true;await evaluate('scrollTo(0,0)');
    }
    const scroll=await evaluate("(()=>{const y=scrollY;window.scrollTo(0,document.documentElement.scrollHeight);const moved=scrollY>y;window.scrollTo(0,0);return moved;})()");if(route!=='/datacenter')assert.equal(scroll,true,'Page cannot scroll to domain controls');
    row.status='pass';console.log(JSON.stringify({route,width:viewport.width,status:row.status}));
   }catch(error){row.status='fail';row.error=error.message;console.log(JSON.stringify({route,width:viewport.width,status:row.status,error:row.error}));}
  }
 }finally{await browser.close();browser.child.stdout?.destroy();browser.child.stderr?.destroy();}
}
assert.equal(report.cases.length,pages.length*viewports.length,'Catalog coverage incomplete');
report.sourceAfter=await sourceReceipt(root);assert.deepEqual(report.sourceAfter.modifiedSources,report.source.modifiedSources,'Public sources changed during audit');report.status=report.cases.every(r=>r.status==='pass')?'pass':'fail';
await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,cases:report.cases.map(r=>({route:r.route,viewport:r.viewport.width,status:r.status,error:r.error})),output}));if(report.status!=='pass')process.exitCode=1;
