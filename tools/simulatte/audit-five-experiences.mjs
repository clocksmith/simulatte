import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {openBrowserAudit} from './browser-session.mjs';
import {sourceReceipt} from './runtime-audit-sources.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=root+'artifacts/five-experiences/after';
await fs.mkdir(output,{recursive:true});
const report={source:await sourceReceipt(root),boundary:'Automated desktop and touch-emulated mobile interactions; no unaided human or physical-device qualification.',cases:[]};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
 const mobile=viewport.width<700;
 const browser=await openBrowserAudit({publicRoot:root+'public',viewport,webgpu:true});
 const client=browser.client;
 const evaluate=async expression=>{const result=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
 const until=async(expression,timeout=90000)=>{const deadline=Date.now()+timeout;while(!await evaluate(expression)){if(Date.now()>deadline)throw Error('Timed out: '+expression);await delay(200);}};
 async function click(selector){
  const point=await evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node||node.disabled)throw Error('Control unavailable: '+${JSON.stringify(selector)});node.scrollIntoView({block:'center',inline:'nearest'});const r=node.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  if(mobile){await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else{await client.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});}
 }
 try{
  await client.send('Page.enable');await client.send('Runtime.enable');
  await client.send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile});
  await client.send('Emulation.setTouchEmulationEnabled',{enabled:mobile});
  for(const route of ['motorcycle','sunwalker','datacenter','interstellar','orbital']){
   const row={route,viewport,checks:{}};report.cases.push(row);
   try{
    await client.send('Page.navigate',{url:browser.host.baseUrl+route});
    await until(`Boolean(globalThis.SimulatteMotorcycleSession?.snapshot().execution==='running'||['running','completed'].includes(document.body?.dataset.journeyPhase))`);
    await delay(500);
    row.checks.started=true;
    if(route==='motorcycle'){
     await click('#pause');
     const before=await evaluate('SimulatteMotorcycleSession.snapshot()');
     await click('#reset-view');await delay(250);
     const after=await evaluate('SimulatteMotorcycleSession.snapshot()');
     assert.equal(after.execution,before.execution);row.checks.resetViewPreservesPause=true;
     assert.equal(await evaluate("document.querySelector('#advanced-sheet').open"),false);row.checks.resetViewOutsideAdvanced=true;
     await until('Boolean(globalThis.motorcycleMeasurementReceipt?.observer)',30000);
     row.measurement=await evaluate('motorcycleMeasurementReceipt');
    }else{
     await until("Boolean(document.querySelector('.sim-object-inspector > div') && !document.querySelector('.sim-object-inspector > div').hidden)");
     row.checks.openingObjectExplainsItself=true;
     await evaluate("SimulatteActiveSession.invoke('pause')");
     if(route==='datacenter'){
      assert.equal(await evaluate("document.querySelector('.sim-object-actions button').dataset.objectAction"),'straggler');row.checks.domainActionFirst=true;
      const snapshot=await evaluate('SimulatteActiveSession.snapshot()');
      await click('[data-object-action="straggler"]');
      await until("document.querySelector('[data-object-action=straggler]').textContent==='Restore rack'");
      await evaluate("SimulatteActiveSession.invoke('resume')");
      await until("__simulattePluginPlatformV4.contributions[0].objects.some(o=>o.relatedIds.length && o.id.startsWith('rack:'))");
      await evaluate("SimulatteActiveSession.invoke('pause')");
      assert.match(await evaluate("document.querySelector('.sim-object-inspector').innerText"),/Extra waiting:.*Baseline:/s);
      row.checks.executedBaselineExplained=true;
      const rack=await evaluate("document.querySelector('.sim-object-inspector select').value");
      await click('.sim-object-related summary');
      const camera=await evaluate('JSON.stringify(__simulattePluginPlatformV4.view)');
      await click('[data-related-object]');
      assert.equal(await evaluate('JSON.stringify(__simulattePluginPlatformV4.view)'),camera);row.checks.connectedSelectionPreservesCamera=true;
      await evaluate(`SimulatteActiveSession.invoke('select-object',${JSON.stringify(rack)})`);
      await click('[data-object-action="straggler"]');
      await until("document.querySelector('[data-object-action=straggler]').textContent==='Slow rack'");
      assert.match(await evaluate("document.querySelector('.sim-object-inspector').innerText"),/Rack speed restored/);
      assert.equal(await evaluate('SimulatteActiveSession.snapshot().generation'),snapshot.generation);row.checks.liveRestorePreservesRun=true;
     }else if(route==='orbital'){
      assert.equal(await evaluate("document.querySelector('.sim-object-actions button').dataset.objectAction"),'preview');row.checks.domainActionFirst=true;
      const before=await evaluate('JSON.stringify(__simulattePluginPlatformV4.contributions[0].state)');
      await click('[data-object-action="preview"]');
      await until("document.querySelector('.sim-object-inspector select').value==='preview-transfer-trajectory'");
      assert.equal(await evaluate('JSON.stringify(__simulattePluginPlatformV4.contributions[0].state)'),before);row.checks.previewPreservesAcceptedRun=true;
      assert.match(await evaluate("document.querySelector('.sim-object-inspector').innerText"),/Baseline: accepted [0-9]+-day flight/);row.checks.tradeoffExplained=true;
      await click('[data-object-action="dismiss-preview"]');
      await evaluate("SimulatteActiveSession.invoke('select-object',__simulattePluginPlatformV4.contributions[0].objects.find(o=>o.initiallySelected).id)");
      await click('[data-object-action="preview-efficient"]');
      await until("document.querySelector('.sim-object-inspector select').value==='preview-transfer-trajectory'");
      assert.equal(await evaluate('JSON.stringify(__simulattePluginPlatformV4.contributions[0].state)'),before);row.checks.secondObjectiveAvailable=true;
     }else if(route==='interstellar'){
      assert.match(await evaluate("document.querySelector('.sim-object-inspector').innerText"),/transmitting.*traveling.*baseline result/s);row.checks.timeBreakdownExplicit=true;
      await click('[data-object-action="reply"]');
      await until("['latency','round-trip-latency'].every(kind=>__simulattePluginPlatformV4.contributions[0].state.measures.some(m=>m.kind===kind))");
      assert.match(await evaluate("document.querySelector('.sim-object-inspector').innerText"),/full reply returns after/);
      const intervals=await evaluate("__simulattePluginPlatformV4.contributions[0].state.measures.filter(m=>['latency','round-trip-latency'].includes(m.kind)).map(m=>m.measurement.interval.end)");
      assert.equal(intervals.length,2);assert.ok(intervals[1]>intervals[0]);row.checks.fullReplyAfterRequest=true;
     }else if(route==='sunwalker'){
      assert.equal(await evaluate("document.querySelector('.sun-walk-endpoint-menu').open"),false);row.checks.endpointsProgressive=true;
      await evaluate("(()=>{const slider=document.querySelector('.sun-walk-preference input');slider.value=75;slider.dispatchEvent(new Event('input',{bubbles:true}));slider.dispatchEvent(new Event('change',{bubbles:true}));})()");
      await until("document.querySelector('[data-walk-message]').textContent.includes('Walk restarted')");
      assert.match(await evaluate("document.querySelector('[data-preference-cost]').textContent"),/3.00 extra minutes/);row.checks.preferenceMeaningExplained=true;
      row.tradeoff=await evaluate("document.querySelector('[data-route-tradeoff]').textContent");
      assert.match(row.tradeoff,/min|Same path/);row.checks.actualTradeoffVisible=true;
     }
     const story=await client.send('Page.captureScreenshot',{format:'png'});
     row.storyScreenshot=`${mobile?'mobile':'desktop'}-${route}-interaction.png`;
     await fs.writeFile(output+'/'+row.storyScreenshot,Buffer.from(story.data,'base64'));
     await click('.sim-object-heading [aria-label="Close inspector"]');await delay(300);
     assert.equal(await evaluate("document.querySelector('.sim-object-inspector > div').hidden"),true);row.checks.closedInspectorStaysClosed=true;
    }
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth+1'),true);row.checks.noPageOverflow=true;
    row.text=await evaluate('document.body.innerText.slice(0,8000)');
    const shot=await client.send('Page.captureScreenshot',{format:'png'});
    row.screenshot=`${mobile?'mobile':'desktop'}-${route}.png`;
    await fs.writeFile(output+'/'+row.screenshot,Buffer.from(shot.data,'base64'));
    row.pass=true;
   }catch(error){row.pass=false;row.error=error.message;}
   console.log(JSON.stringify({route,viewport,pass:row.pass,checks:row.checks,error:row.error}));
  }
 }finally{await browser.close();}
}
report.pass=report.cases.length===10&&report.cases.every(row=>row.pass);
await fs.writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');
if(!report.pass)process.exitCode=1;
