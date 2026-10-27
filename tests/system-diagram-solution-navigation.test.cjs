'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Stepper=require('../public/simulatte/system-diagram/interview-stepper.js'),D=require('../public/simulatte/system-diagram/diagram.js');
const Editor=require('../public/simulatte/system-diagram/editor-model.js'),config=require('../public/data/system-diagram/config.json');
const library=require('../public/simulatte/system-diagram/class-library.js').loadSync(path.resolve(__dirname,'../public/data/system-diagram'));
// Control adapter exercises navigation/actions against actual documents. It cannot prove browser layout.
function dom(){
 const doc={};
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.events={};this.dataset={};this.value='';this.hidden=false;this.open=false;this.ownerDocument=doc;}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;}
  setAttribute(k,v){this[k]=String(v);}
  addEventListener(k,fn){this.events[k]=fn;}
  showModal(){this.open=true;}
  close(){this.open=false;}
  remove(){}
  get textContent(){return this.text||'';}
  set textContent(v){this.text=v;}
 }
 doc.createElement=tag=>new Element(tag);doc.addEventListener=()=>{};doc.body=doc.createElement('body');
 const all=(el=doc.body)=>[el,...el.children.flatMap(child=>all(child))];
 return {doc,all,Option:function(text,value){const e=new Element('option');e.textContent=text;e.value=value;return e;}};
}
async function setup(run){
 const oldFetch=global.fetch,oldOption=global.Option,ui=dom();let intercept=null;
 global.Option=ui.Option;
 global.fetch=async file=>intercept?.(file) || {ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(__dirname,'../public',file),'utf8'))};
 const model=Editor.create({diagram:D.emptyDiagram(config),library,config});let simulated=0;
 const stepper=Stepper.create({host:ui.doc.body,model,library,config,canvas:{render(){},flush(){},fit(){}},onStepChange(){},onMessage(){},onSimulate(){simulated++;}});
 try{await stepper.ready;await run({ui,model,stepper,simulated:()=>simulated,intercept:fn=>intercept=fn});}
 finally{stepper.dispose();global.fetch=oldFetch;global.Option=oldOption;}
}
test('solution is opt-in, stages preserve edits, final navigation does not duplicate execution and return restores personal architecture',()=>setup(async({ui,model,stepper,simulated})=>{
 stepper.setScenario('reddit-comments');assert.equal(model.diagram.nodes.length,0);
 model.apply({type:'addNode',classId:'worker',x:10,y:20});const personal=structuredClone(model.diagram);
 await stepper.showSolution();assert.equal(model.diagram.schema,D.SCHEMA);assert.ok(model.diagram.nodes.some(n=>n.id==='comments-store'));
 model.apply({type:'setNodeLabel',id:'api',label:'My API change'});
 await stepper.goToStep(1);assert.ok(model.diagram.nodes.some(n=>n.id==='votes'));
 await stepper.goToStep(0);assert.equal(model.diagram.nodes.find(n=>n.id==='api').label,'My API change');
 await stepper.goToStep(stepper.getScenario().solutions[0].stages.length-1);assert.equal(model.diagram.schema,D.SCHEMA);
 assert.equal(ui.all().some(e=>e.textContent==='Simulate'),false);const next=ui.all().find(e=>e['aria-label']==='Next interview stage');assert.ok(next.disabled);assert.equal(simulated(),0);
 stepper.leaveReference();assert.deepEqual(model.diagram,personal);
}));
test('edits made during a pending stage load cannot be overwritten by its stage result',()=>setup(async({model,stepper,intercept})=>{
 stepper.setScenario('reddit-comments');await stepper.showSolution();
 const pending=stepper.goToStep(1);model.apply({type:'setNodeLabel',id:'api',label:'Newer edit'});
 await assert.rejects(pending,/Kept your newer diagram edits/);assert.equal(model.diagram.nodes.find(n=>n.id==='api').label,'Newer edit');
}));
test('switching problems invalidates an in-flight solution load',()=>setup(async({model,stepper,intercept})=>{
 stepper.setScenario('reddit-comments');
 const pending=stepper.showSolution();stepper.setScenario('google-crawler');await pending;
 assert.equal(stepper.getScenario().id,'google-crawler');assert.equal(model.diagram.nodes.length,0);
}));
test('multiple approaches keep independent edits and saved public study sessions retain branch identity',()=>setup(async({model,stepper})=>{
 stepper.setScenario('social-feed');await stepper.showSolution('progressive-design');await stepper.goToStep(1);const id=model.diagram.nodes[0].id;model.apply({type:'setNodeLabel',id,label:'My progressive branch'});await stepper.showSolution('fanout-on-read');await stepper.goToStep(1);assert.notEqual(model.diagram.nodes.find(n=>n.id===id).label,'My progressive branch');model.apply({type:'setNodeLabel',id,label:'My read-time branch'});await stepper.showSolution('progressive-design');await stepper.goToStep(1);assert.equal(model.diagram.nodes.find(n=>n.id===id).label,'My progressive branch');const session=stepper.publicState(),diagram=structuredClone(model.diagram);stepper.reset();model.replace(diagram);stepper.restorePublicState(session);assert.equal(stepper.getSelection().solutionId,'progressive-design');await stepper.showSolution('fanout-on-read');await stepper.goToStep(1);assert.equal(model.diagram.nodes.find(n=>n.id===id).label,'My read-time branch');
}));
test('locking unregisters private problems, current diagrams, editable histories, references and branch snapshots',()=>setup(async({model,stepper})=>{
 const data={schema:'simulatte.lucydProblems.v2',problems:[{id:'private-fixture',title:'Private fixture',description:'A sensitive practice prompt.',provenance:{kind:'authored-practice'},followups:[],solutions:[{id:'reference',title:'Private answer',boundary:'Synthetic fixture',stages:[{id:'stage',title:'Private stage',explanation:'Private explanation',diagram:require('../public/data/system-diagram/solutions/reddit-comments/step-2.json')}]}]}]};stepper.registerPrivate(data);stepper.setScenario('private:private-fixture');await stepper.showSolution('reference');const id=model.diagram.nodes[0].id;model.apply({type:'setNodeLabel',id,label:'Sensitive annotation'});assert.ok(stepper.privateState().branches.length);stepper.unregisterPrivate();assert.equal(stepper.getSelection(),null);assert.equal(model.diagram.nodes.length,0);assert.equal(model.canUndo(),false);assert.deepEqual(stepper.privateState().branches,[]);assert.deepEqual(stepper.privateState().own,[]);assert.throws(()=>stepper.setScenario('private:private-fixture'),/Unknown problem/);assert.ok(!JSON.stringify(stepper.publicState()).includes('Sensitive annotation'));
}));
test('older public numeric stage snapshots migrate to their retained authored stage rather than the new design stage',()=>setup(async({model,stepper})=>{
 const problem=require('../public/data/system-diagram/problems.json').problems.find(p=>p.id==='reddit-comments'),solution=problem.solutions[0],target=solution.stages.find(st=>st.legacyIndex===0),edited=structuredClone(target.diagram);edited.nodes.find(n=>n.id==='api').label='Retained legacy public edit';const personal=D.emptyDiagram(config);
 model.replace(edited);stepper.restorePublicState({schema:'simulatte.lucydStudySession.v1',curriculumVersion:2,problemKey:problem.id,index:0,walkthrough:{solutionId:solution.id,index:0},reference:personal,own:[],branches:[[`${problem.id}:${solution.id}:0`,edited]],choices:[]});const expected=stepper.getScenario().solutions.find(s=>s.id===solution.id).stages.findIndex(stage=>stage.id===target.id);assert.equal(stepper.getStepIndex(),expected);assert.equal(stepper.getSelection().stageId,target.id);await stepper.goToStep((expected+1)%stepper.getScenario().solutions[0].stages.length);await stepper.goToStep(expected);assert.equal(model.diagram.nodes.find(n=>n.id==='api').label,'Retained legacy public edit');assert.equal(stepper.publicState().walkthrough.stageId,target.id);
}));
test('older private numeric snapshots retain edited architecture identity across the inserted design stage',()=>setup(async({model,stepper})=>{
 const problem=structuredClone(require('../public/data/system-diagram/problems.json').problems.find(p=>p.id==='reddit-comments'));problem.id='legacy-private';const solution=problem.solutions[0],target=solution.stages.find(st=>st.legacyIndex===0),edited=structuredClone(target.diagram);edited.nodes.find(n=>n.id==='api').label='Retained legacy private edit';stepper.registerPrivate({schema:'simulatte.lucydProblems.v3',problems:[problem]});model.replace(edited);stepper.restorePrivateState({curriculumVersion:2,problemKey:'private:legacy-private',index:0,walkthrough:{solutionId:solution.id,index:0},reference:D.emptyDiagram(config),own:[],branches:[[`private:legacy-private:${solution.id}:0`,edited]]});const expected=stepper.getScenario().solutions.find(s=>s.id===solution.id).stages.findIndex(stage=>stage.id===target.id);assert.equal(stepper.getStepIndex(),expected);assert.equal(stepper.getSelection().stageId,target.id);await stepper.goToStep((expected+1)%stepper.getScenario().solutions[0].stages.length);await stepper.goToStep(expected);assert.equal(model.diagram.nodes.find(n=>n.id==='api').label,'Retained legacy private edit');stepper.unregisterPrivate();assert.ok(!JSON.stringify(stepper.publicState()).includes('Retained legacy private edit'));
}));
