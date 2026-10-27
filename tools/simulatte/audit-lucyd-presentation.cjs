'use strict';
// Receipts contain counts only. Screenshots show public reusable subsystems, never private exercises.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.LUCYD_PLAYWRIGHT_MODULE||'@playwright/test');
const base=process.env.LUCYD_LOCAL_URL||'http://127.0.0.1:4173';
const output=path.resolve(process.env.LUCYD_AUDIT_OUTPUT||'artifacts/lucyd-presentation');
async function openRail(page){if(await page.locator('body').getAttribute('data-palette-expanded')!=='true')await page.locator('#palette-toggle').click();}
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true}),report={boundary:'Local browser execution; hosted-origin behavior is simulated, not a deployment check.',cases:[]};
  try{
    for(const width of [1440,390]){
      const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(base+'/system-diagram');
      await page.waitForFunction(()=>document.body.dataset.editorReady==='true'&&document.body.dataset.localStudyCollection==='ready');
      await page.waitForFunction(()=>document.querySelectorAll('.palette-group[data-category="subsystems"] .palette-item').length===7);
      await openRail(page);
      await page.screenshot({path:path.join(output,`${width}-public-library.png`)});
      await page.locator('.palette-item[data-class-id="subsystem.chat-backend@1"]').click();
      assert.equal(await page.evaluate(()=>SimulatteSystemDiagramEditor.document().nodes.length),1);
      await openRail(page);
      await page.getByRole('button',{name:'Expand Reusable chat backend subsystem',exact:true}).click();
      assert.equal(await page.evaluate(()=>SimulatteSystemDiagramEditor.document().nodes.length),11);
      await page.getByRole('button',{name:'Cancel definition edits',exact:true}).click();
      assert.equal(await page.evaluate(()=>SimulatteSystemDiagramEditor.document().nodes.length),1);
      if (await page.locator('body').getAttribute('data-palette-expanded')==='true') await page.locator('#palette-toggle').click();
      const privateCount=await page.evaluate(()=>{
        const keys=[...document.querySelectorAll('select[aria-label="Interview problem"] option')].map(o=>o.value).filter(k=>k.startsWith('private:'));
        for(const key of keys){const s=SimulatteSystemDiagramEditor.interviewStepper;s.setScenario(key);const p=s.getScenario();if(!p.details||/\*\*|Additional practice prompt|```/.test(p.description))throw Error('Unstructured private problem remains');}
        return keys.length;
      });assert.equal(privateCount,15);
      await page.evaluate(()=>SimulatteSystemDiagramEditor.interviewStepper.setScenario('private:private-practice-4'));
      assert.equal(await page.locator('.lucyd-exercise-type').innerText(),'Systems coding');
      await page.getByRole('button',{name:'Problem details and source',exact:true}).click();
      const brief=page.locator('.lucyd-details .lucyd-problem-brief');
      assert.equal(await brief.locator('pre code').count(),1);assert.equal(await brief.locator('li').count(),4);
      assert.ok((await brief.innerText()).includes('provenance is unverified'));
      assert.equal(await brief.getByRole('link',{name:'Java LinkedHashMap',exact:true}).count(),1);
      assert.ok(!(await brief.innerText()).includes('[Databricks Staff IC6]'));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.keyboard.press('Escape');
      await page.evaluate(async()=>{await SimulatteSystemDiagramEditor.interviewStepper.showSolution();await SimulatteSystemDiagramEditor.saveLocal();});
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('simulatte.systemDiagram.privatePractice.v1')).schema),'simulatte.encryptedDocument.v1');
      await page.reload();await page.waitForFunction(()=>document.body.dataset.localStudyCollection==='ready');
      await page.evaluate(async()=>{SimulatteSystemDiagramEditor.interviewStepper.setScenario('private:private-practice-4');await SimulatteSystemDiagramEditor.loadLocal();});
      assert.equal(await page.evaluate(()=>SimulatteSystemDiagramEditor.interviewStepper.getSelection().problemId),'private-practice-4');
      assert.deepEqual(errors,[]);
      report.cases.push({width,availableProblems:46,structuredPrivateProblems:privateCount,subsystems:7,addExpandReturn:true,typedBrief:true,citations:true,encryptedSaveReload:true,errors});
      await page.close();
    }
    const page=await browser.newPage();let localRequests=0;
    await page.route('https://lucyd.example/**',async route=>{
      const url=new URL(route.request().url());if(url.pathname.startsWith('/__lucyd-local__'))localRequests++;
      const response=await fetch(base+url.pathname+url.search);
      await route.fulfill({status:response.status,contentType:response.headers.get('content-type')||'application/octet-stream',body:Buffer.from(await response.arrayBuffer())});
    });
    await page.goto('https://lucyd.example/system-diagram');await page.waitForFunction(()=>document.body.dataset.editorReady==='true');await page.evaluate(()=>SimulatteSystemDiagramEditor.interviewStepper.ready);
    assert.equal(await page.locator('select[aria-label="Interview problem"] option[value^="private:"]').count(),0);assert.equal(localRequests,0);assert.equal(await page.locator('#private-password').count(),1);
    report.hostedOrigin={simulated:true,privateProblems:0,localRequests,passwordRequired:true};
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
