// Explicit same-origin embedding only. No network/model provider exists in the static study page.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SimulatteStudyLiveInput=api;})(globalThis,function(){
 'use strict';
 function enabled(win){return win.parent!==win&&new URLSearchParams(win.location.search).get('liveInput')==='parent';}
 function allowed(event,win){return enabled(win)&&event.source===win.parent&&event.origin===win.location.origin;}
 function merge(current,incoming,Store){
  // Keep learner overlays, files and notes when the same live document receives a new proposal.
  if(!current||current.document.problem.referenceId!==incoming.document.problem.referenceId)return incoming;
  return {...current,document:incoming.document,view:{...current.view,solutionId:incoming.view.solutionId,stageIndex:0}};
 }
 return Object.freeze({enabled,allowed,merge});
});
