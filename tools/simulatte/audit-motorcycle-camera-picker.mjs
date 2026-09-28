import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {openBrowserAudit} from './browser-session.mjs';
import {sourceReceipt} from './runtime-audit-sources.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const out=process.env.SIMULATTE_CAMERA_OUT||root+'artifacts/camera-picker/'+new Date().toISOString().replace(/[:.]/g,'-');
await fs.mkdir(out,{recursive:true});
const browser=await openBrowserAudit({publicRoot:root+'public',viewport:{width:1440,height:1000}});
const c=browser.client,baseUrl=process.env.SIMULATTE_CAMERA_ORIGIN||browser.host.baseUrl;
const report={schema:'simulatte.cameraPickerAudit.v1',baseUrl,sources:await sourceReceipt(root),cases:[],errors:[]};
const ev=async expression=>{
  const result=await c.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
  return result.result.value;
};
const wait=async expression=>{
  const deadline=Date.now()+90000;
  while(Date.now()<deadline){if(await ev(expression))return;await new Promise(resolve=>setTimeout(resolve,100));}
  throw Error('Timed out: '+expression);
};
async function click(selector,touch){
  const rect=await ev(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`);
  assert.ok(rect.width>0&&rect.height>0,'control is visible');
  const x=rect.x+rect.width/2,y=rect.y+rect.height/2;
  if(touch){
    await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{
    await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
    await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});
  }
}
const snapshot=()=>ev(`({selected:document.getElementById('camera-mode').value,label:document.getElementById('camera-current').textContent,observer:SimulatteMotorcycleController.snapshot().observer,operation:SimulatteMotorcycleSession.snapshot().lastOperation,open:document.getElementById('camera-picker').open})`);
try{
  await c.send('Page.enable');await c.send('Runtime.enable');
  c.on('Runtime.exceptionThrown',event=>report.errors.push(event.exceptionDetails));
  report.browser=await c.send('Browser.getVersion');
  for(const width of [1440,390]){
    const touch=width===390,row={width,steps:[]};report.cases.push(row);
    await c.send('Emulation.setDeviceMetricsOverride',{width,height:touch?844:1000,mobile:touch,deviceScaleFactor:1});
    await c.send('Emulation.setTouchEmulationEnabled',{enabled:touch});
    await c.send('Page.navigate',{url:new URL('motorcycle',baseUrl).href});
    await wait(`document.body?.dataset.state==='running'`);
    await wait(`/^\\d+(?:\\.\\d+)? dBA$/.test(document.getElementById('observer-level').textContent)`);
    await ev(`window.levelChanges=[];window.levelWatcher=new MutationObserver(()=>levelChanges.push(document.getElementById('observer-level').textContent));levelWatcher.observe(document.getElementById('observer-level'),{childList:true,characterData:true,subtree:true});`);
    await ev(`window.cameraClicks=[];document.getElementById('camera-options').addEventListener('click',e=>{if(e.target.dataset.cameraMode)cameraClicks.push({mode:e.target.dataset.cameraMode,trusted:e.isTrusted});});`);
    let previous=await snapshot();
    for(const mode of ['rooftop','area:Greenpoint','rooftop','map','rooftop','sidewalk','rooftop','rider','rooftop','free','rooftop','rooftop']){
      await click('#camera-picker summary',touch);
      await wait(`document.getElementById('camera-picker').open`);
      await click(`[data-camera-mode="${mode}"]`,touch);
      await wait(`SimulatteMotorcycleSession.snapshot().lastOperation?.token>${previous.operation?.token||0} && SimulatteMotorcycleSession.snapshot().lastOperation?.status==='success'`);
      await wait(`SimulatteMotorcycleController.snapshot().observer.mode===${JSON.stringify(mode.startsWith('area:')?'map':mode)}`);
      await new Promise(resolve=>setTimeout(resolve,350));
      const next=await snapshot();
      assert.equal(next.selected,mode);assert.equal(next.open,false);
      if(mode==='rooftop'){assert.equal(next.label,'Rooftop');assert.ok(next.observer.z>10);}
      row.steps.push(next);previous=next;
    }
    row.clicks=await ev('cameraClicks');assert.equal(row.clicks.length,row.steps.length);assert.ok(row.clicks.every(event=>event.trusted));
    row.readings=await ev('levelWatcher.disconnect();levelChanges');
    assert.ok(row.readings.length>0,'new measurements continue arriving');
    assert.ok(row.readings.every(text=>/^\d+(?:\.\d+)? dBA$/.test(text)),'the last number stays visible while the viewpoint updates');
    assert.equal(await ev('document.documentElement.scrollWidth>innerWidth'),false);
    const shot=await c.send('Page.captureScreenshot',{format:'png'});await fs.writeFile(out+'/rooftop-'+width+'.png',Buffer.from(shot.data,'base64'));
  }
  assert.deepEqual(report.errors,[]);report.pass=true;
}catch(error){report.pass=false;report.failure=error.stack;process.exitCode=1;}
finally{await fs.writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({out,pass:report.pass,failure:report.failure}));
