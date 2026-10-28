'use strict';
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.LUCYD_PLAYWRIGHT_MODULE||'@playwright/test');
const ROOT=path.resolve(__dirname,'../..'),base=process.argv[2]||'http://127.0.0.1:4173/lucyd';
async function main(){const spatialHashes=require('./audit-study-spatial.cjs').inputHashes,crypto=require('node:crypto'),inputHashes=()=>spatialHashes().concat(['app.js','study-guide.js','inline-text.js','workspace-store.js','theme-preference.js','workspace.css','panels.js','index.html'].map(name=>{const p='public/simulatte/system-diagram/study/'+name;return {path:p,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,p))).digest('hex')};})),inputs=inputHashes();const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1600,height:1000}}),page=await context.newPage(),errors=[],rows=[];try{page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push('HTTP '+r.status()+' '+r.url());});
 await page.goto(base+'?problem=L004&approach=push&stage=1');await page.waitForFunction(()=>globalThis.SimulatteStudyInspector?.ready());
 const refs=await page.locator('select[aria-label="Problem"] option').evaluateAll(rows=>rows.map(r=>r.value));
 for(const id of refs){await page.selectOption('select[aria-label="Problem"]',id);await page.waitForFunction(id=>SimulatteStudyInspector.workspace()?.document.problem.referenceId===id,id);const solutions=await page.evaluate(()=>SimulatteStudyInspector.workspace().document.solutions.map(s=>({id:s.id,stages:s.stages.length})));
 for(const sol of solutions){await page.selectOption('select[aria-label="Approach"]',sol.id);await page.waitForFunction(id=>SimulatteStudyInspector.workspace()?.view.solutionId===id,sol.id);
 while(await page.locator('.sw-footer button[aria-label="Previous stage"]').isEnabled())await page.click('.sw-footer button[aria-label="Previous stage"]');
 for(let i=0;i<sol.stages;i++){if(i)await page.click('.sw-footer button[aria-label="Next stage"]');await page.waitForFunction(i=>SimulatteStudyInspector.workspace()?.view.stageIndex===i,i);
 await page.waitForTimeout(70);
 const result=await page.evaluate(()=>{const ws=SimulatteStudyInspector.workspace(),sol=ws.document.solutions.find(s=>s.id===ws.view.solutionId),graph=sol.stages[ws.view.stageIndex].graph,els=SimulatteStudyInspector.elements(),role=e=>e.customData?.study?.role;
 const view={shapes:new Map(els.filter(e=>['node','boundary'].includes(role(e))).map(e=>[e.customData.study.nodeId,{mode:role(e)==='boundary'?'boundary':'box',r:{x:e.x,y:e.y,w:e.width,h:e.height}}])),closed:new Set(),hidden:new Set()};
 const projected=SimulatteSpatialRouting.project(ws.document,graph,view),routes=els.filter(e=>role(e)==='edge').map(e=>{const label=els.find(t=>t.containerId===e.id&&t.type==='text');return {...projected.find(p=>p.id===e.customData.study.edgeId),points:e.points.map(p=>[e.x+p[0],e.y+p[1]]),label:{x:label.x,y:label.y,w:label.width,h:label.height}};});
 const check=SimulatteSpatialCheck.check(graph,view,routes),texts=els.filter(e=>e.type==='text'),overflow=[];
 const caption=document.querySelector('.sw-guide-explanation'),stage=sol.stages[ws.view.stageIndex],expected=SimulatteStudyText.parts(stage.explanation).map(p=>typeof p==='string'?p:p.label).join('').replace(/\s+/g,' ').trim(),visible=caption.textContent.replace(/\s+/g,' ').trim(),guideWords=visible.split(/\s+/).length,guideValid=visible===expected&&guideWords>=50&&guideWords<=75&&caption.querySelectorAll('a').length>0;for(const t of texts.filter(e=>role(e)==='node-label')){const box=els.find(b=>b.id===t.containerId);if(t.x<box.x-1||t.y<box.y-1||t.x+t.width>box.x+box.width+1||t.y+t.height>box.y+box.height+1)overflow.push(t.id);}
 return {ok:check.ok&&!overflow.length&&guideValid,guideWords,guideValid,errors:check.errors,overflow,crossings:check.crossings.length,nodeCount:view.shapes.size,zoom:SimulatteStudyInspector.appState().zoom.value,fonts:[...new Set(texts.map(t=>t.fontFamily))]};});
 rows.push({problem:id,solution:sol.id,stage:i+1,...result});if(!result.ok)console.log('FAIL',id,sol.id,i+1,JSON.stringify(result).slice(0,400));
 }
 console.log(id,sol.id,'rendered');}
 }
 await page.goto(base+'?problem=L004&approach=push&stage=9');await page.waitForFunction(()=>globalThis.SimulatteStudyInspector?.ready());await page.waitForTimeout(300);const shot=path.join(ROOT,'artifacts/composable-study/chat-readable.png');await page.screenshot({path:shot});
 if(JSON.stringify(inputs)!==JSON.stringify(inputHashes()))throw Error('Spatial inputs changed during browser audit; rerun');
 const report={schema:'simulatte.studySpatialBrowserAudit.v1',url:base,inputHashes:inputs,canvasVersion:require('../../public/simulatte/system-diagram/study/vendor/modern/versions.json').version,viewport:{width:1600,height:1000},layer:'Chromium restored Excalidraw element geometry and screenshot; not physical phone or human adjudication',ok:!errors.length&&rows.every(r=>r.ok),errors,stages:rows.length,rows,screenshot:path.relative(ROOT,shot)};const out=path.join(ROOT,'artifacts/composable-study/spatial-browser-audit.json');fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify({ok:report.ok,stages:rows.length,failed:rows.filter(r=>!r.ok).length,errors,out}));if(!report.ok)process.exitCode=1;
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
