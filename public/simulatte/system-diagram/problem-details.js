(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SimulatteLucydProblemDetails=api;})(globalThis,function(){
  'use strict';
  const SCHEMA='simulatte.problemDetails.v1';
  const TYPES=Object.freeze({'systems-coding':'Systems coding',coding:'Coding','full-stack-design':'Full-stack design','system-design':'System design','architecture-review':'Architecture review'});
  const empty=exerciseType=>({schema:SCHEMA,exerciseType,interfaces:[],requirements:[],hints:[],references:[]});
  const plain=value=>value.replace(/\*\*|`|\$/g,'').replace(/\\log/g,'log').trim();
  function migrate(description,exerciseType='system-design'){
    const details=empty(exerciseType),followups=[];
    const [original,extra='']=description.split(/\n\s*Additional practice prompt[^\n]*\n/);
    const withoutCode=original.replace(/^[ \t]*```(\w*)\n([\s\S]*?)^[ \t]*```/gm,(_,language,code)=>{
      const lines=code.trimEnd().split('\n'),indent=Math.min(...lines.filter(l=>l.trim()).map(l=>l.match(/^\s*/)[0].length));
      details.interfaces.push({language:language||'text',code:lines.map(l=>l.slice(indent)).join('\n')});return '';
    });
    let statement=[],section='statement';
    for(const raw of withoutCode.split('\n')){
      let line=raw.trim();if(!line||line==='---')continue;
      const heading=/^\*\s+\*\*([^*]+):\*\*\s*(.*)$/.exec(line);
      if(heading){section=/^(Prompt|Task|Problem)$/.test(heading[1])?'statement':/Solution Architecture/.test(heading[1])?'hints':'requirements';line=heading[2];}
      if(!line)continue;
      line=plain(line.replace(/^(?:[-*]|\d+\.)\s+/,''));
      if(section==='statement')statement.push(line);
      else if(section==='hints')details.hints.push(line);
      else details.requirements.push(line);
    }
    for(const line of extra.split('\n')){const match=/^([^:\n]+):\s+(.+)/.exec(line);if(match)followups.push({id:'discussion-'+(followups.length+1),title:plain(match[1]),prompt:plain(match[2])});}
    return {description:statement.join(' '),details,followups};
  }
  function validate(value){
    const keys=['schema','exerciseType','interfaces','requirements','hints','references'];
    if(value?.schema!==SCHEMA||Object.keys(value).some(k=>!keys.includes(k))||!Object.hasOwn(TYPES,value.exerciseType))throw Error('Invalid structured Lucyd problem details');
    const text=(s,max)=>typeof s==='string'&&s.trim()&&s.length<=max;
    for(const key of ['interfaces','requirements','hints','references'])if(!Array.isArray(value[key])||value[key].length>50)throw Error('Invalid Lucyd details '+key);
    for(const key of ['requirements','hints'])for(const s of value[key])if(!text(s,4000))throw Error('Invalid Lucyd '+key+' text');
    for(const i of value.interfaces)if(Object.keys(i).some(k=>!['language','code'].includes(k))||!text(i.language,40)||!text(i.code,20000))throw Error('Invalid Lucyd interface');
    const ids=new Set();
    for(const r of value.references){
      let secure=false;try{const u=new URL(r.url);secure=u.protocol==='https:'&&!u.username&&!u.password;}catch{}
      if(Object.keys(r).some(k=>!['id','title','url','scope','note'].includes(k))||!text(r.id,120)||ids.has(r.id)||!text(r.title,300)||!text(r.url,2000)||!secure||!['background','interview-format'].includes(r.scope)||!text(r.note,1000))throw Error('Invalid or ambiguous Lucyd reference');
      ids.add(r.id);
    }
    return value;
  }
  function render(document,problem){
    const data=problem.details||migrate(problem.description).details;
    const make=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
    const root=make('section');root.className='lucyd-problem-brief';
    if(problem.referenceId){const identity=make('a',problem.referenceId+' · '+problem.title);identity.href='?problem='+encodeURIComponent(problem.referenceId);identity.setAttribute('aria-label','Open problem '+problem.referenceId);root.append(identity);}
    root.append(make('p',TYPES[data.exerciseType]),make('h3','Problem'),make('p',problem.details?problem.description:migrate(problem.description).description));
    for(const i of data.interfaces){const pre=make('pre'),code=make('code',i.code);pre.append(code);root.append(make('h3','Given interface · '+i.language),pre);}
    if(data.requirements.length){const list=make('ul');for(const r of data.requirements)list.append(make('li',r));root.append(make('h3','Requirements'),list);}
    if(data.hints.length){const hints=make('details'),list=make('ul');for(const h of data.hints)list.append(make('li',h));hints.append(make('summary','Hints and implementation ideas'),list);root.append(hints);}
    const sources=make('section');sources.className='lucyd-problem-sources';sources.append(make('h3','Sources and attribution'));
    const source=problem.provenance?.source,kind=problem.provenance?.kind;
    const link=(url,title)=>{const a=make('a',title);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;};
    if(kind==='company-published'||kind==='candidate-reported'){
      sources.append(make('p',kind==='company-published'?'Company-published exercise':'Candidate-reported question; not confirmed by the company'));
    }else sources.append(make('p',kind==='custom'?'Your own task':'Authored practice. Exact interview-question provenance is unverified.'));
    if(source){const p=make('p');p.append(link(source.url,source.title||'Source'),make('span',kind==='authored-practice'?' · Background reference, not evidence this question was asked.':''));sources.append(p);}
    if(problem.provenance?.note)sources.append(make('p',problem.provenance.note));
    for(const r of data.references){const p=make('p');p.append(link(r.url,r.title),make('span',' · '+(r.scope==='background'?'Background reference':'Interview-format reference')));sources.append(p,make('p',r.note));}
    root.append(sources);return root;
  }
  return Object.freeze({SCHEMA,TYPES,empty,migrate,validate,render});
});
