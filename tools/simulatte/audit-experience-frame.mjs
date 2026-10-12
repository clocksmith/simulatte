import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {openBrowserAudit} from './browser-session.mjs';
import {sourceReceipt} from './runtime-audit-sources.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=process.env.SIMULATTE_FRAME_OUT||path.join(root,'artifacts/experience-frame');
await fs.mkdir(output,{recursive:true});
const displayRoot=path.join(root,'artifacts/solar-drive/browser-deps/root');
const displayBinary=process.env.SIMULATTE_XVFB||(await fs.access('/usr/bin/Xvfb').then(()=>'/usr/bin/Xvfb',()=>path.join(displayRoot,'usr/bin/Xvfb')));
const display=spawn(displayBinary,['-displayfd','3','-screen','0','1600x1100x24','-nolisten','tcp'],{env:{...process.env,LD_LIBRARY_PATH:path.join(displayRoot,'usr/lib/x86_64-linux-gnu')+':'+(process.env.LD_LIBRARY_PATH||'')},stdio:['ignore','ignore','pipe','pipe']});
const displayId=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Display startup timed out')),15000);display.once('error',reject);display.stdio[3].once('data',d=>{clearTimeout(timer);resolve(':'+d.toString().trim());});});
const previousDisplay=process.env.DISPLAY;process.env.DISPLAY=displayId;
const catalog=await import('../../public/simulation-routes.js').then(m=>m.default);
const requestedRoutes=(process.env.SIMULATTE_FRAME_ROUTES||'').split(',').filter(Boolean);
const pages=catalog.pages.filter(page=>!requestedRoutes.length||requestedRoutes.includes(page.path));
assert.ok(pages.length,'No matching catalog routes');
const reportPath=path.join(output,process.env.SIMULATTE_FRAME_REPORT||'report.json');
let report={routes:pages.map(page=>page.path),frames:{},source:await sourceReceipt(root),boundary:'Headed Chrome using explicit software WebGPU; desktop and touch-emulated mobile. No measured weather, hardware performance, or physical-device claim.',cases:[]};
if(process.env.SIMULATTE_FRAME_RESUME==='1'){
 const previous=JSON.parse(await fs.readFile(reportPath,'utf8'));
 assert.equal(previous.sourceAfter.head,report.source.head,'Resume source commit changed');
 assert.deepEqual(previous.sourceAfter.modifiedSources,report.source.modifiedSources,'Resume public sources changed');
 report={...previous,cases:previous.cases.filter(row=>row.status==='pass'),resumedAt:report.source.capturedAt};
}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
try{
for(const viewport of [{width:1440,height:1000},{width:820,height:1000},{width:390,height:844}]){
 if(pages.every(page=>report.cases.some(row=>row.route===page.path&&row.viewport.width===viewport.width&&row.status==='pass')))continue;
 const browser=await openBrowserAudit({url:process.env.SIMULATTE_FRAME_ORIGIN,publicRoot:path.join(root,'public'),viewport,webgpu:true,headed:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader','--disable-vulkan-surface']});
 const c=browser.client;
 const evaluate=async expression=>{const r=await c.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const until=async expression=>{const end=Date.now()+90000;while(!await evaluate(expression)){if(Date.now()>end)throw Error('Timed out: '+expression);await delay(250);}};
 try{
  await c.send('Page.enable');await c.send('Runtime.enable');
  await c.send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile:viewport.width<900});await c.send('Emulation.setTouchEmulationEnabled',{enabled:viewport.width<900});
  for(const page of pages){
   const route=page.path;if(report.cases.some(row=>row.route===route&&row.viewport.width===viewport.width&&row.status==='pass'))continue;
   const row={route,viewport,status:'running'};report.cases.push(row);
   try{
    await c.send('Page.navigate',{url:browser.host.baseUrl+route.replace(/^\//,'')});
    await until("Boolean(document.querySelector('.experience-frame__stage'))");
    await until("Boolean(globalThis.SimulatteMotorcycleSession?.snapshot().rendering==='ready'||globalThis.SimulatteSolarDrive?.getReceipt().evidence.renderer?.completedFrames>0||globalThis.__fieldExperimentState?.step>=0||['running','completed','paused'].includes(document.body?.dataset.journeyPhase))");
    await delay(250);
    row.frame=await evaluate(`(()=>{const rect=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect(),st=getComputedStyle(e);return {x:r.x,y:r.y,width:r.width,height:r.height,font:st.fontFamily,fontSize:st.fontSize,radius:st.borderRadius,background:st.backgroundColor,border:st.border};};return {chrome:{background:getComputedStyle(document.querySelector('.experience-frame')).backgroundColor,font:getComputedStyle(document.querySelector('.experience-frame')).fontFamily},stage:rect('.experience-frame__stage'),header:rect('.experience-frame__header'),toolbar:rect('.experience-frame__toolbar'),controls:[...document.querySelectorAll('[data-frame-control]')].map(e=>e.dataset.frameControl),slots:Object.fromEntries([...document.querySelectorAll('[data-frame-control]')].map(e=>[e.dataset.frameControl,rect('[data-frame-control='+e.dataset.frameControl+']')])),reset:rect('[data-frame-control=reset] button'),camera:rect('[data-frame-control=camera] summary'),overflow:document.documentElement.scrollWidth>innerWidth+1};})()`);
    assert.deepEqual(row.frame.controls,['camera','reset','play','restart','replay','speed','advanced']);
    for(const [name,slot]of Object.entries(row.frame.slots)){assert.ok(slot.x>=row.frame.toolbar.x-1&&slot.x+slot.width<=row.frame.toolbar.x+row.frame.toolbar.width+1,`${route}: ${name} exceeds toolbar width`);assert.equal(slot.height,44,`${route}: ${name} height`);}
    if(viewport.width<900){const s=row.frame.slots;assert.equal(s.camera.y,s.reset.y);assert.equal(s.camera.y,s.advanced.y);assert.equal(s.play.y,s.restart.y);assert.equal(s.play.y,s.replay.y);assert.ok(s.speed.y>s.play.y);assert.ok(Math.abs(s.speed.width-row.frame.toolbar.width)<.1,'Speed must span the toolbar (subpixel grid rounding allowed)');}
    assert.equal(row.frame.overflow,false);assert.equal(row.frame.reset.height,44);assert.equal(row.frame.camera.height,44);
    const key=String(viewport.width),expected=report.frames[key];
    if(report.chrome?.[key])assert.deepEqual(row.frame.chrome,report.chrome[key],`${route}: surrounding chrome differs`);else{report.chrome ||= {};report.chrome[key]=row.frame.chrome;}
    if(report.slots?.[key])assert.deepEqual(row.frame.slots,report.slots[key],`${route}: toolbar slots differ`);else{report.slots ||= {};report.slots[key]=row.frame.slots;}
    if(report.controls?.[key]){assert.deepEqual(row.frame.reset,report.controls[key].reset,`${route}: Reset view differs`);assert.deepEqual(row.frame.camera,report.controls[key].camera,`${route}: Camera control differs`);}else{report.controls ||= {};report.controls[key]={reset:row.frame.reset,camera:row.frame.camera};}
    if(expected)assert.deepEqual(row.frame.stage,expected,`${route}: canvas frame differs`);else report.frames[key]=row.frame.stage;
    await evaluate("document.querySelector('[data-frame-control=camera] summary').click()");
    assert.equal(await evaluate("document.querySelector('.experience-camera-menu').open"),true);
    row.views=await evaluate("[...document.querySelectorAll('.experience-camera-menu button')].filter(b=>!b.hidden&&!b.closest('[hidden]')).map(b=>({label:b.textContent.trim(),disabled:b.disabled,role:b.getAttribute('role'),checked:b.getAttribute('aria-checked')}))");
    assert.ok(row.views.length>0,'No camera views');assert.ok(row.views.every(v=>v.role==='radio'),'Camera choices need radio semantics');
    await evaluate("document.querySelector('.experience-camera-menu').open=false;document.querySelector('[data-frame-control=reset] button').click()");
    await delay(300);
    row.afterReset=await evaluate("({failed:Boolean(document.body.dataset.runtimeError||globalThis.__fieldExperimentError),camera:globalThis.SimulatteSolarDrive?.cameraView()})");assert.equal(row.afterReset.failed,false);
    if(route.includes('solar-drive')){
      const wasRunning=await evaluate('SimulatteSolarDrive.controlState().running');
      if(wasRunning)await evaluate("document.querySelector('[data-frame-control=play] button').click()");
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
      await evaluate("document.querySelector('[data-frame-control=reset] button').click()");await until('SimulatteSolarDrive.isViewSettled()');
      assert.equal(await evaluate('SimulatteSolarDrive.cameraView()'),'overview');
      if(wasRunning)await evaluate("document.querySelector('[data-frame-control=play] button').click()");
    }
    if(page.experimentId){
      await evaluate("if(__fieldExperimentState.running)document.querySelector('[data-frame-control=play] button').click()");
      const before=await evaluate('JSON.stringify(__fieldExperimentSnapshot().stateHash)');
      await evaluate("document.querySelector('[data-branch=baseline]').click()");
      assert.equal(await evaluate("document.querySelector('.experiments').dataset.branch"),'baseline');
      await evaluate("document.querySelector('[data-branch=intervention]').click()");
      assert.equal(await evaluate('JSON.stringify(__fieldExperimentSnapshot().stateHash)'),before,'Display switch changes numerical branches');row.branchSwitch=true;
    }
    if(!requestedRoutes.length&&['motorcycle','sunwalker','datacenter','simulatte/solar-drive/index.html','living-tissue','river-formation','crystal-foundry'].some(id=>route==='/' + id)){
      row.capture=path.join(output,route.replace(/[^a-z0-9]+/gi,'-')+'-'+viewport.width+'.png');
      const png=await c.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});const bytes=Buffer.from(png.data,'base64');await fs.writeFile(row.capture,bytes);row.captureSha256=createHash('sha256').update(bytes).digest('hex');
    }
    if(viewport.width<900){
      const point=await evaluate(`(()=>{const canvases=[...document.querySelectorAll('.experience-frame__stage canvas')].filter(c=>c.checkVisibility());for(const canvas of canvases){const r=canvas.getBoundingClientRect();for(let y=Math.min(innerHeight-100,r.bottom-40);y>Math.max(r.top+40,240);y-=30)for(const x of [(r.left+r.right)/2,r.left+40])if(document.elementFromPoint(x,y)===canvas)return {x,y};}return null;})()`);
      assert.ok(point,'No unobstructed canvas for touch scrolling');
      await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
      for(let step=1;step<=8;step++){await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x,y:point.y-step*25}]});await delay(30);}
      await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(400);
      assert.ok(await evaluate('scrollY>0'),'Touch scroll over canvas is blocked');row.touchScroll=true;await evaluate('scrollTo(0,0)');
    }
    const scroll=await evaluate("(()=>{const y=scrollY;window.scrollTo(0,document.documentElement.scrollHeight);const moved=scrollY>y;window.scrollTo(0,0);return moved;})()");assert.equal(scroll,true,'Page cannot scroll to domain controls');
    row.status='pass';console.log(JSON.stringify({route,width:viewport.width,status:row.status}));
   }catch(error){row.status='fail';row.error=error.message;console.log(JSON.stringify({route,width:viewport.width,status:row.status,error:row.error}));}
  }
 }finally{await browser.close();}
}
assert.equal(report.cases.length,pages.length*3,'Catalog coverage incomplete');
report.sourceAfter=await sourceReceipt(root);assert.deepEqual(report.sourceAfter.modifiedSources,report.source.modifiedSources,'Public sources changed during audit');report.status=report.cases.every(r=>r.status==='pass')?'pass':'fail';
await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,cases:report.cases.map(r=>({route:r.route,viewport:r.viewport.width,status:r.status,error:r.error})),output}));if(report.status!=='pass')process.exitCode=1;
}finally{display.kill('SIGTERM');if(previousDisplay===undefined)delete process.env.DISPLAY;else process.env.DISPLAY=previousDisplay;}
