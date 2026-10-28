'use strict';
const {topics,defaults}=require('./study-explanation-topics.cjs');
const {overrides}=require('./study-explanation-overrides.cjs');
const words=text=>text.replace(/\[([^\]]+)\]\(https:\/\/[^)]+\)/g,'$1').trim().split(/\s+/).filter(Boolean).length;
const sentence=text=>String(text||'').trim().replace(/[.!?;:]?$/u,'.');
const lower=text=>text.charAt(0).toLowerCase()+text.slice(1);
function topicFor(problem,stage){
 const title=stage.title+' '+stage.reason,details=(stage.explanation||'')+' '+stage.invariants.join(' ');
 const scored=topics.map((t,i)=>({...t,order:i,score:(title.match(new RegExp(t.pattern,'gi'))||[]).length*3+(details.match(new RegExp(t.pattern,'gi'))||[]).length})).sort((a,b)=>b.score-a.score||a.order-b.order);
 const fallback=topics.find(t=>t.id===defaults[Number(problem.problem.referenceId.slice(1))-1]);
 return scored[0].score&&scored[0].id!=='api'?scored[0]:fallback;
}
function changeSentence(problem,solution,stage){
 const prior=stage.number===1?solution.initialGraph:solution.stages[stage.number-2].graph;
 const node=id=>stage.graph.nodes.find(n=>n.id===id)||prior.nodes.find(n=>n.id===id),name=id=>node(id)?.label||id;
 const op=stage.operations.find(o=>['expand','merge','replace'].includes(o.op))||stage.operations.filter(o=>o.op==='insert').at(-1)||stage.operations[0];
 if(op.op==='expand')return `Expanding “${name(op.nodeId)}” exposes ${op.nodes.map(n=>'“'+n.label+'”').join(', ')} inside its boundary, making their separate responsibilities visible while retaining the outer identity.`;
 if(op.op==='merge')return `Merging ${op.nodeIds.map(id=>'“'+name(id)+'”').join(' and ')} into “${op.node.label}” puts their decisions under one owner while preserving the declared connections to callers.`;
 if(op.op==='replace')return `The “${name(op.nodeId)}” role keeps its identity while its internal responsibility changes; compare the new behavior with the assumptions callers already depend on.`;
 if(op.op==='insert'){const def=problem.components.find(d=>d.id===op.node.definitionId);if(sentence(def.responsibility)===sentence(stage.reason))return '';return `“${op.node.label}” has a specific responsibility: ${lower(sentence(def.responsibility))}`;}
 return 'Follow the changed connection from its source to its destination, checking which component now owns the decision and which caller receives the outcome.';
}
function explain(problem,solution,stage){
 const authored=overrides[[problem.problem.referenceId,solution.id,stage.id].join('/')];
 if(authored){if(words(authored)<50||words(authored)>75)throw Error('Authored explanation length '+stage.id);return authored;}
 const topic=topicFor(problem,stage);if(!topic)throw Error('No explanation topic '+problem.problem.referenceId);
 const url='https://en.wikipedia.org/wiki/'+topic.slug.replaceAll('(','%28').replaceAll(')','%29');
 const subject=topic.explanation.match(/^(.{3,48}?)(?: is | are | lets | gives | means | keeps | occurs | records | prevents | spaces | coordinates | turns | preserves | must | organizes | postpones | bounds | defines | maintains | reads | expresses | updates | serves | chooses | brings | decides | compares | moves | identifies | describes | creates | performs | maps | states | describe | commits | assigns | holds | shows | separates | stores | divides | makes )/);
 const linked=subject?topic.explanation.replace(subject[1],`[${subject[1]}](${url})`):topic.explanation+` ([${topic.label}](${url})).`;
 const check=solution.acceptanceCases.find(c=>stage.checkIds.includes(c.id));
 const base=[...new Set([sentence(stage.reason),...stage.invariants.slice(0,1).map(sentence)])];
 const alternatives=[
  {text:stage.explanation?sentence(stage.explanation):'',score:40},
  {text:linked,score:30,background:true},
  {text:linked.split(/(?<=[.!?])\s+(?=[A-Z])/)[0],score:5,background:true},
  {text:check?'Consider this case: '+sentence(check.given):'',score:2},
  {text:check?'Consider this case: '+sentence(check.given)+' '+sentence(check.when):'',score:2},
  {text:changeSentence(problem,solution,stage),score:1},
  ...stage.invariants.slice(1,3).map(text=>({text:sentence(text),score:1}))
 ].filter(a=>a.text&&!base.some(b=>b.toLowerCase()===a.text.toLowerCase()));
 let best=null;
 for(let mask=0;mask<2**alternatives.length;mask++){
  const selected=alternatives.filter((_,i)=>mask&(1<<i));if(selected.filter(a=>a.background).length!==1)continue;const parts=base.concat(selected.map(a=>a.text));
  if(new Set(parts.map(p=>p.toLowerCase())).size!==parts.length)continue;
  const text=parts.join(' '),count=words(text);if(count<50||count>75)continue;
  const score=selected.reduce((n,a)=>n+a.score,0)-Math.abs(60-count)/10-selected.length*5;
  if(!best||score>best.score)best={text,count,score,topicId:topic.id};
 }
 if(!best)throw Error('Cannot explain stage in 50–75 words: '+problem.problem.referenceId+'/'+solution.id+'/'+stage.id+'; base='+words(base.join(' ')));
 if(!/\[[^\]]+\]\(https:\/\/en\.wikipedia\.org\/wiki\//.test(best.text))throw Error('Missing background link '+stage.id);
 return best.text.replace(/\s+/g,' ');
}
function enrich(problem){for(const solution of problem.solutions)for(const stage of solution.stages)stage.explanation=explain(problem,solution,stage);return problem;}
module.exports={enrich,explain,topicFor,words};
