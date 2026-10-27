'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.LUCYD_PLAYWRIGHT_MODULE||'@playwright/test');
const root=path.resolve(__dirname,'../..');
const output=path.resolve(process.env.LUCYD_AUDIT_OUTPUT||path.join(root,'artifacts/lucyd-load-race/local'));
const editorReady=page=>page.waitForFunction(()=>document.body.dataset.editorReady==='true');
const content=diagram=>{const {view,...rest}=diagram;return rest;};

async function gateCatalogue(page){
  let release,arrived;
  const gate=new Promise(resolve=>release=resolve),seen=new Promise(resolve=>arrived=resolve);
  await page.route('**/data/system-diagram/problems.json',async route=>{
    arrived();await gate;await route.continue();
  });
  return {seen,release};
}

async function pendingState(page){
  // Drain two browser frames while the actual response remains held by the route gate.
  return page.evaluate(async()=>{
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return {calls:structuredClone(window.raceCalls),stored:localStorage.getItem('simulatte.systemDiagram.draft.v1'),
      selection:SimulatteSystemDiagramEditor.interviewStepper.getSelection()};
  });
}

(async()=>{
  let browser,server;
  const report={cases:[],errors:[]};
  fs.mkdirSync(output,{recursive:true});
  try{
    const {createStaticSiteServer}=await import('./static-site-server.mjs');
    const {sourceReceipt}=await import('./runtime-audit-sources.mjs');
    report.source=await sourceReceipt(root);
    server=createStaticSiteServer({publicRoot:path.join(root,'public')});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const url=`http://127.0.0.1:${server.address().port}/system-diagram`;
    report.url=url;
    browser=await chromium.launch({headless:true});report.browser=browser.version();
    const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
    page.on('pageerror',error=>report.errors.push(error.message));
    await page.goto(url);await editorReady(page);
    const seed=await page.evaluate(async()=>{
      const e=SimulatteSystemDiagramEditor,s=e.interviewStepper;await s.ready;
      s.setScenario('social-feed');
      e.model.apply({type:'addConcept',label:'Public personal diagram retained',x:50,y:50});
      const personal=structuredClone(e.document());
      const approach=s.getScenario().solutions[1].id;
      await s.showSolution(approach);await s.goToStep(3);
      const node=e.document().nodes[0];e.model.apply({type:'setNodeLabel',id:node.id,label:'Public saved stage retained'});
      await e.saveLocal();
      return {personal,selection:s.getSelection(),nodeId:node.id,stored:localStorage.getItem('simulatte.systemDiagram.draft.v1')};
    });

    let gate=await gateCatalogue(page);
    await page.reload({waitUntil:'domcontentloaded'});await gate.seen;await editorReady(page);
    await page.evaluate(()=>{
      window.raceCalls={load:{settled:false}};
      window.raceLoad=SimulatteSystemDiagramEditor.loadLocal().then(value=>{
        raceCalls.load={settled:true,value,selection:SimulatteSystemDiagramEditor.interviewStepper.getSelection()};return value;
      });
    });
    let held=await pendingState(page);
    assert.equal(held.calls.load.settled,false);assert.equal(held.stored,seed.stored);assert.equal(held.selection,null);
    gate.release();assert.equal(await page.evaluate(()=>window.raceLoad),true);
    let restored=await page.evaluate(()=>({selection:SimulatteSystemDiagramEditor.interviewStepper.getSelection(),diagram:SimulatteSystemDiagramEditor.document(),returned:raceCalls.load.selection}));
    assert.deepEqual(restored.selection,seed.selection);assert.deepEqual(restored.returned,seed.selection);
    assert.equal(restored.diagram.nodes.find(n=>n.id===seed.nodeId).label,'Public saved stage retained');
    await page.screenshot({path:path.join(output,'restored-public-stage.png')});
    await page.evaluate(()=>SimulatteSystemDiagramEditor.interviewStepper.leaveReference());
    assert.deepEqual(await page.evaluate(()=>SimulatteSystemDiagramEditor.document()),seed.personal);
    report.cases.push({name:'load waits for held catalogue',passed:true,preserved:['problem','approach','stageId','edited stage','personal reference'],returnedSelection:restored.returned});
    await page.unroute('**/data/system-diagram/problems.json');

    // An independent public draft must remain savable while the unrelated chooser
    // catalogue is held. It has no saved study context requiring restoration.
    await page.evaluate(value=>localStorage.setItem('simulatte.systemDiagram.draft.v1',value),seed.stored);
    gate=await gateCatalogue(page);
    await page.reload({waitUntil:'domcontentloaded'});await gate.seen;await editorReady(page);
    await page.evaluate(personal=>{
      const e=SimulatteSystemDiagramEditor;e.model.replace(personal);
      window.raceCalls={save:{settled:false}};
      window.raceSave=e.saveLocal().then(value=>{raceCalls.save={settled:true,value};return value;});
    },seed.personal);
    held=await pendingState(page);assert.equal(held.calls.save.settled,true);assert.equal(held.calls.save.value,true);
    assert.deepEqual(content(JSON.parse(held.stored).diagram),content(seed.personal));
    gate.release();assert.equal(await page.evaluate(()=>window.raceSave),true);
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('simulatte.systemDiagram.draft.v1')));
    assert.deepEqual(content(saved.diagram),content(seed.personal));
    report.cases.push({name:'independent draft saves while catalogue is held',passed:true,preserved:['edited personal draft'],unrelatedCatalogueDoesNotBlockSave:true});
    await page.unroute('**/data/system-diagram/problems.json');

    // Commands queued against the same readiness promise must not save between the
    // loaded diagram and its deferred problem/stage restoration.
    await page.evaluate(value=>localStorage.setItem('simulatte.systemDiagram.draft.v1',value),seed.stored);
    gate=await gateCatalogue(page);
    await page.reload({waitUntil:'domcontentloaded'});await gate.seen;await editorReady(page);
    await page.evaluate(()=>{
      const e=SimulatteSystemDiagramEditor;window.raceCalls={load:{settled:false},save:{settled:false}};
      window.raceBoth=Promise.all([
        e.loadLocal().then(value=>{raceCalls.load={settled:true,value};return value;}),
        e.saveLocal().then(value=>{raceCalls.save={settled:true,value};return value;})
      ]);
    });
    held=await pendingState(page);assert.equal(held.calls.load.settled,false);assert.equal(held.calls.save.settled,false);assert.equal(held.stored,seed.stored);
    gate.release();assert.deepEqual(await page.evaluate(()=>window.raceBoth),[true,true]);
    const queued=await page.evaluate(()=>JSON.parse(localStorage.getItem('simulatte.systemDiagram.draft.v1')));
    const queuedCase={name:'load then save queued before catalogue',passed:queued.studyState?.problemKey===seed.selection.problemId&&queued.studyState?.walkthrough?.stageId===seed.selection.stageId,
      savedProblem:queued.studyState?.problemKey,savedStage:queued.studyState?.walkthrough?.stageId};
    report.cases.push(queuedCase);
    assert.equal(queuedCase.passed,true,'queued Save must retain loaded problem/stage context');
    await page.unroute('**/data/system-diagram/problems.json');

    await page.route('**/data/system-diagram/problems.json',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
    await page.reload({waitUntil:'domcontentloaded'});await editorReady(page);
    const unavailable=await page.evaluate(async personal=>{
      const e=SimulatteSystemDiagramEditor;
      const catalogueError=await e.interviewStepper.ready.then(()=>null,error=>error.message);
      e.model.replace(personal);
      return {catalogueError,saved:await e.saveLocal(),record:JSON.parse(localStorage.getItem('simulatte.systemDiagram.draft.v1'))};
    },seed.personal);
    assert.match(unavailable.catalogueError,/Problem collection is unavailable/);assert.equal(unavailable.saved,true);
    assert.deepEqual(content(unavailable.record.diagram),content(seed.personal));
    report.cases.push({name:'independent draft saves with unavailable catalogue',passed:true,catalogueFailure:unavailable.catalogueError,preserved:['edited personal draft']});
    assert.deepEqual(report.errors,[]);
  }finally{
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
    await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));
    console.log(JSON.stringify({output,cases:report.cases,errors:report.errors},null,2));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
