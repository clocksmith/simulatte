// Learner answers and self-assessment belong to the workspace, never the authored solution.
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.SimulatteStudyPractice=api;})(globalThis,function(root){
 'use strict';
 const key=(solution,stage)=>solution.id+'/'+stage.id;
 function entry(workspace,solution,stage){return workspace.practice?.[key(solution,stage)]||{answer:'',revealed:false,rating:null};}
 function update(workspace,solution,stage,patch,now=Date.now()){
  const old=entry(workspace,solution,stage),next={...old,...patch,referenceId:workspace.document.problem.referenceId,solutionId:solution.id,stageIndex:solution.stages.findIndex(s=>s.id===stage.id),title:stage.title,question:stage.question};
  if(patch.rating){if(!['shaky','solid'].includes(patch.rating))throw Error('Unknown self-assessment');next.reviewedAt=now;}
  return {...workspace,practice:{...workspace.practice,[key(solution,stage)]:next}};
 }
 function due(workspaces,now=Date.now()){
  return workspaces.flatMap(w=>Object.values(w.practice||{}).filter(p=>p.rating==='shaky'||(p.rating==='solid'&&now-(p.reviewedAt||0)>=7*86400000))).sort((a,b)=>(a.rating==='shaky'?0:1)-(b.rating==='shaky'?0:1)||(a.reviewedAt||0)-(b.reviewedAt||0));
 }
 function hidden(workspace,solution,stage,enabled){return !!(enabled&&stage&&!entry(workspace,solution,stage).revealed);}
 function Panel({workspace,solution,stageIndex,onPatch,onCompare,onOpen,reviewItems}){
  const h=root.React.createElement,stage=solution.stages[stageIndex];if(!stage)return h('p',null,'Choose a stage to practice.');
  const record=entry(workspace,solution,stage),trace='Trace one request through this diagram. For each hop, name the component, the state it owns, and what a crash could lose, duplicate or delay.';
  return h('div',{className:'sw-panel'},h('h2',null,'Practice this stage'),h('p',null,record.drill==='trace'?trace:stage.question),
   h('label',null,'Drill ',h('select',{'aria-label':'Practice drill',value:record.drill||'question',onChange:e=>onPatch({drill:e.target.value,revealed:false})},h('option',{value:'question'},'Stage question'),h('option',{value:'trace'},'Trace a failure'))),
   h('textarea',{'aria-label':'My stage answer',value:record.answer||'',placeholder:'Predict what happens and explain why. Rough answers are useful.',style:{width:'100%',minHeight:150},onChange:e=>onPatch({answer:e.target.value})}),
   h('div',{className:'sw-row'},h('button',{className:'sw-button',onClick:()=>onPatch({revealed:true})},'Reveal explanation and checks'),h('button',{className:'sw-button',onClick:()=>onPatch({answer:'',revealed:false,rating:null})},'Try again without explanation')),
   h('p',{className:'sw-note'},'Compare your answer with the stage invariants and linked checks. These ratings are your self-assessment; no test or model has graded your answer.'),
   h('div',{className:'sw-row'},h('button',{className:'sw-button','aria-pressed':record.rating==='shaky',onClick:()=>onPatch({rating:'shaky'})},'Shaky · review again'),h('button',{className:'sw-button','aria-pressed':record.rating==='solid',onClick:()=>onPatch({rating:'solid'})},'Solid')),
   h('h3',null,'Compare approaches'),h('p',null,'Name what each approach stores and which failures it handles. Stage numbers describe different progressions; they are not equivalent checkpoints.'),
   workspace.document.solutions.filter(s=>s.id!==solution.id).map(s=>h('button',{key:s.id,className:'sw-button block',onClick:()=>onCompare(s.id)},'Open '+s.title+' alongside')),
   h('h3',null,'Weak spots and scheduled review'),reviewItems.length?h('ul',null,reviewItems.map((item,i)=>h('li',{key:i},h('button',{className:'sw-button',onClick:()=>onOpen(item)},`${item.referenceId} · ${item.title} (${item.rating})`)))):h('p',null,'Mark a stage shaky to revisit it here. Solid stages return after seven days.'));
 }
 return Object.freeze({key,entry,update,due,hidden,Panel});
});
