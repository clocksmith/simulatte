'use strict';
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.LUCYD_PLAYWRIGHT_MODULE||'@playwright/test');
if(!process.argv.includes('--url'))process.argv.push('--url','http://127.0.0.1:4173/lucyd');
const {boot,problems}=require('./audit-study-workspace.cjs');
async function main(){const b=await chromium.launch({headless:true}),ctx=await b.newContext({viewport:{width:1440,height:900}}),rows=[];try{
 const h=await boot(ctx,'?problem=L004&approach=push&stage=1'),p=h.page,view=()=>p.evaluate(()=>SimulatteStudyInspector.workspace().view),record=(name,pass,observed)=>rows.push({name,pass,observed});
 const hints=await p.locator('.sw-footer .sw-key-hint').allTextContents();record('visible shortcut hints',hints.join(' ')==='PgUp PgDn',hints);
 await h.focusCanvas();await h.key('PageDown');let v=await view();record('Page Down advances within the current approach',v.stageIndex===1&&v.solutionId==='push',v);
 await h.key('PageUp');v=await view();record('Page Up returns to the previous stage',v.stageIndex===0,v);
 await h.key('PageUp');record('first-stage boundary is clamped',(await view()).stageIndex===0,await view());
 await h.reveal('study:n:client');await h.select('study:n:client');await h.key('Enter');await p.waitForSelector('textarea.excalidraw-wysiwyg');await h.key('PageDown');record('text editing does not change stages',(await view()).stageIndex===0,await view());await h.key('Escape');
 await p.setInputFiles('input[type=file]',{name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{')});await p.waitForSelector('dialog[open]');await h.key('PageDown');record('modal dialog keeps stage navigation inactive',(await view()).stageIndex===0,await view());await p.click('dialog[open] button:has-text("Close")');
 await h.focusCanvas();const spot=await h.emptyPoint();await h.key('r');await p.mouse.move(...spot);await p.mouse.down();await p.mouse.move(spot[0]+40,spot[1]+30,{steps:4});await h.key('PageDown');record('active pointer gesture does not change stages',(await view()).stageIndex===0,await view());await p.mouse.up();await h.key('Escape');await h.key('v');
 await h.focusCanvas();for(let i=0;i<12;i++)await h.key('PageDown');v=await view();record('last-stage boundary is clamped and solution stays selected',v.stageIndex===8&&v.solutionId==='push',v);
 const flag=process.argv.indexOf('--out'),out=path.resolve(__dirname,'../..',flag>=0?process.argv[flag+1]:'artifacts/composable-study/stage-shortcuts.json'),report={schema:'simulatte.studyStageShortcutAudit.v1',url:p.url(),scope:'Native keyboard events and visible hints in desktop Chromium',passed:rows.every(r=>r.pass)&&!problems.length,rows,pageProblems:problems};fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
 }finally{await b.close();}}
main().catch(e=>{console.error(e);process.exitCode=1});
