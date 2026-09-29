import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {openBrowserAudit} from './browser-session.mjs';
import {sourceReceipt} from './runtime-audit-sources.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const out=process.env.SIMULATTE_CONTROLS_OUT||'/tmp/simulatte-controls-proof';
const origin=process.env.SIMULATTE_CONTROLS_ORIGIN||'';
await fs.mkdir(out,{recursive:true});
const report={sources:await sourceReceipt(root),target:origin||'local public output',viewports:[]};
for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const browser=await openBrowserAudit({publicRoot:root+'public',url:origin,viewport}),c=browser.client;
  const row={viewport,errors:[]};report.viewports.push(row);
  const ev=async expression=>{const r=await c.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const wait=async expression=>{const until=Date.now()+90000;while(Date.now()<until){if(await ev(expression))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timeout: '+expression);};
  const settle=()=>ev(`Promise.all(document.getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))`);
  const pointClick=async({x,y})=>{
    if(viewport.width<600){await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
    else for(const type of ['mousePressed','mouseReleased'])await c.send('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,x,y});
  };
  const click=async selector=>{
    await settle();
    const p=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,visible:!!r.width&&!!r.height&&e.contains(document.elementFromPoint(x,y))};})()`);
    assert.ok(p.visible,'Control reachable: '+selector);await pointClick(p);
  };
  const snapshot=()=>ev('SimulatteMotorcycleController.snapshot()');
  const shot=async name=>{
    await settle();
    const r=await c.send('Page.captureScreenshot',{format:'png'});await fs.writeFile(`${out}/${viewport.width}-${name}.png`,Buffer.from(r.data,'base64'));
  };
  async function place(kind){
    const before=await snapshot();await click(`[data-add-treatment="${kind}"]`);
    assert.equal(await ev('document.getElementById("placement-prompt").hidden'),false);
    await shot(kind+'-placement');
    // Pick an actual visible sidewalk/roof through the renderer, then click it.
    const point=await ev(`(()=>{const s=BABYLON.EngineStore.LastCreatedScene,canvas=document.getElementById('city'),r=canvas.getBoundingClientRect();for(let y=350;y<innerHeight-150;y+=24)for(let x=30;x<innerWidth-30;x+=24){if(document.elementFromPoint(x,y)!==canvas)continue;const p=s.pick(x-r.x,y-r.y);if(p?.hit&&p.pickedPoint&&!p.pickedMesh.metadata?.sourceId&&!p.pickedMesh.metadata?.treatmentId&&!p.pickedMesh.metadata?.receiverId&&/ground|road|sidewalk|nyc-roofs/.test(p.pickedMesh.name)&&p.pickedMesh.name!=='water-ground')return {x,y,mesh:p.pickedMesh.name};}return null;})()`);
    assert.ok(point,'A visible placeable surface');await pointClick(point);
    await wait(`SimulatteMotorcycleController.snapshot().treatments.length===${before.treatments.length+1}`);
    const after=await snapshot(),node=after.treatments.at(-1);assert.equal(node.kind,kind);
    assert.equal(await ev('document.getElementById("placement-prompt").hidden'),true);
    assert.equal(await ev('document.getElementById("treatment-actions").hidden'),false);
    row[kind]={point,node};await shot(kind+'-selected');return node;
  }
  try{
    await c.send('Page.enable');await c.send('Runtime.enable');c.on('Runtime.exceptionThrown',e=>row.errors.push(e.exceptionDetails));
    await c.send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile:viewport.width<600});
    await c.send('Emulation.setTouchEmulationEnabled',{enabled:viewport.width<600});
    row.browser=await c.send('Browser.getVersion');row.url=new URL('motorcycle',browser.host.baseUrl).href;
    await c.send('Page.navigate',{url:row.url});await wait(`document.body?.dataset.state==='running'`);
    row.backend=await ev('document.getElementById("backend").textContent');
    await click('#pause');await wait('SimulatteMotorcycleController.snapshot().paused');
    await shot('initial');
    const before=await snapshot();await click('[data-add-treatment="mist"]');await click('#placement-cancel');
    assert.deepEqual((await snapshot()).treatments,before.treatments,'Cancel must not add an obstacle');
    await click('[data-add-treatment="directional"]');
    await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    assert.equal(await ev('document.getElementById("placement-prompt").hidden'),true);
    await place('mist');const node=await place('directional');
    await ev(`(()=>{const e=document.querySelector('#treatment-actions select');e.value='2000';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await wait(`SimulatteMotorcycleController.snapshot().treatments.find(n=>n.id===${JSON.stringify(node.id)}).frequency===2000`);
    await click('#treatment-actions button:nth-of-type(2)');
    await wait(`SimulatteMotorcycleController.snapshot().treatments.find(n=>n.id===${JSON.stringify(node.id)}).enabled===false`);
    await click('#treatment-actions button:nth-of-type(3)');
    await wait(`!SimulatteMotorcycleController.snapshot().treatments.some(n=>n.id===${JSON.stringify(node.id)})`);
    await click('#header-advanced');assert.equal(await ev('document.getElementById("advanced-sheet").open'),true);
    assert.deepEqual(await ev(`Array.from(document.querySelectorAll('.settings-group'),e=>({name:e.querySelector('summary').textContent,open:e.open}))`),[
      {name:'Playback and view',open:false},{name:'Traffic and sound',open:false},{name:'Acoustic comparison',open:false},{name:'Measurements and markers',open:false}
    ]);
    await shot('advanced');
    assert.equal(await ev(`document.getElementById('advanced-sheet').scrollWidth<=document.getElementById('advanced-sheet').clientWidth`),true,'No horizontal sheet overflow');
    await click('#scenario .settings-group:nth-child(2) > summary');
    await click('[data-place="panel"]');
    assert.equal(await ev('document.getElementById("advanced-sheet").open'),false);
    await click('[data-add-treatment="mist"]');
    assert.equal(await ev(`document.querySelector('[data-place="panel"]').getAttribute('aria-pressed')`),'false','Obstacle placement cancels surface placement');
    await click('#placement-cancel');
    await click('#header-advanced');
    await ev(`(()=>{const e=document.getElementById('technique');e.value='untreated';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await click('#advanced-close');
    await place('directional');
    assert.equal(await ev('document.getElementById("technique").value'),'live','New obstacles are active even after an untreated comparison');
    assert.deepEqual(row.errors,[]);row.pass=true;
  }catch(error){row.pass=false;row.failure=error.stack;process.exitCode=1;await shot('failure').catch(()=>{});}
  finally{await browser.close();await fs.writeFile(out+'/report.json',JSON.stringify(report,null,2));}
}
console.log(JSON.stringify({out,viewports:report.viewports.map(({viewport,pass,failure})=>({viewport,pass,failure}))}));
