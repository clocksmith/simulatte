(function(root){
 'use strict';
 const {createElement:h,useEffect,useRef}=root.React;
 function StudyGuide({solution,stageIndex,onSelect}){
  const current=solution.stages[stageIndex],list=useRef(null);
  useEffect(()=>{list.current?.querySelector('[aria-current="step"]')?.scrollIntoView({block:'nearest',inline:'nearest'});},[solution.id,stageIndex]);
  return h('div',{className:'sw-guide-body'},
   h('nav',{'aria-label':'Solution stages',ref:list,className:'sw-guide-stages'},solution.stages.map((stage,i)=>h('button',{key:stage.id,type:'button','aria-current':i===stageIndex?'step':undefined,'aria-label':`Stage ${i+1}: ${stage.title}`,title:stage.question,onClick:()=>onSelect(i)},
    h('span',{className:'sw-guide-number'},i+1),h('span',{className:'sw-guide-name'},stage.title)))),
   h('p',{className:'sw-guide-explanation'},current?current.reason:'Starting architecture before the first stage.'));
 }
 root.SimulatteStudyGuide=StudyGuide;
})(globalThis);
