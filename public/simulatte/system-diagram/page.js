(async function(){
  'use strict';
  const ui=globalThis.SimulatteWorldUI, documents=globalThis.SimulatteSystemDiagramDocument, libraryApi=globalThis.SimulatteSystemDiagramLibrary;
  const runners=globalThis.SimulatteSystemDiagramRunner,kernels=globalThis.SimulatteSystemDiagramKernels;
  const $=id=>document.getElementById(id),clone=value=>structuredClone(value);
  const route=globalThis.SimulattePublicRoutes.forPath(location.pathname),routeState=globalThis.SimulatteRouter.parsePath(location.pathname,location.search);
  async function json(path){const r=await fetch(path);if(!r.ok)throw Error(`Required asset unavailable: ${path}`);return r.json();}
  const profile=globalThis.SimulatteSystemDiagramProfile.validate(await json(route.profilePath),route),config=await json(profile.configPath);
  const library=await libraryApi.load(config.classLibraryPath,json);
  if(routeState.simulation?.scenarioId||routeState.simulation?.mission||Object.keys(routeState.simulation?.parameters||{}).length)throw Error('Use an exported document for authored architecture; URL accepts seed only');
  const seed=routeState.simulation?.seed==null?profile.defaultSeed:Number(routeState.simulation.seed);
  if(!Number.isInteger(seed)||seed<0||seed>4294967295)throw Error('Seed must be an unsigned 32-bit integer');
  for(const e of config.examples){const o=document.createElement('option');o.value=e.id;o.textContent=e.label;$('preset').append(o);}
  const blankOption=document.createElement('option');blankOption.value='blank';blankOption.textContent='Empty canvas';$('preset').append(blankOption);$('preset').value=config.defaultExampleId;
  const initial=await json(config.examples.find(e=>e.id===config.defaultExampleId).path);initial.seed=seed;
  const model=globalThis.SimulatteSystemDiagramEditorModel.create({diagram:initial,library,config});
  let runner=null,accepted=null,acceptedIdentity=null,running=false,busy=false,savedCheckpoint=null,loadedReplay=null,selectedRequest=null,multiSelect=false,scope='instance',operation=0;
  const requestButtons=new Map(),buttons={};let requestPage=0;const REQUESTS_PER_PAGE=50;
  function message(text,error=false){$('editor-status').textContent=text;$('editor-status').dataset.error=String(error);}
  async function perform(action){if(busy){message('Wait for the current operation.',true);return;}busy=true;try{await action();}catch(e){running=false;message(e.message,true);}finally{busy=false;document.body.dataset.operationSequence=String(++operation);render();}}
  function button(host,label,action,variant='secondary',ariaLabel=label){const b=ui.SimButton({label,ariaLabel,variant,onAction:()=>perform(action),onError:e=>message(e.message,true)});(typeof host==='string'?$(host):host).append(b.element);return b;}
  function apply(command){
    command=clone(command);
    if(command.type==='deriveClass'){command.nodeId=command.id;delete command.id;}
    if(command.type==='updateUserClass'&&command.patch?.defaults){const old=model.diagram.classes.find(c=>c.id===command.id)?.defaults||{};command.patch.defaults={...Object.fromEntries(Object.keys(old).filter(k=>!Object.hasOwn(command.patch.defaults,k)).map(k=>[k,null])),...command.patch.defaults};}
    if(command.selection&&!command.ids){command.ids=Object.values(command.selection).flat();delete command.selection;}
    if(command.replace&&['setNodeParams','setEdgeParams'].includes(command.type)){
      const current=(command.type==='setNodeParams'?model.diagram.nodes:model.diagram.edges).find(n=>n.id===command.id)?.params||{};
      command.params={...Object.fromEntries(Object.keys(current).filter(k=>!Object.hasOwn(command.params,k)).map(k=>[k,null])),...command.params};delete command.replace;
    }
    const result=model.apply(command);if(!result.ok)throw Error(result.error);const warnings=model.issues();message(warnings.length?warnings.map(w=>w.message).join(' · '):'Document updated. Semantic edits stay pending until Accept & run.',warnings.some(w=>w.kind==='payload-mismatch'));return result;}
  const canvas=globalThis.SimulatteSystemDiagramCanvas.create({host:$('diagram'),model,library,config,onMessage:message,onView:v=>{$('zoom-status').textContent=`${Math.round(v.zoom*100)}%`;}});
  function dirty(){return !runner||model.executionIdentity()!==acceptedIdentity;}
  function select(){return model.selection;}
  function selectedId(){const s=select();return s.nodes[0]||s.edges[0]||s.groups[0]||s.notes[0]||null;}
  function erase(){apply({type:'deleteItems',selection:select()});}
  function duplicate(){apply({type:'duplicate',selection:select()});}
  function cluster(){
    const ids=select().nodes;if(ids.length<2)throw Error('Select at least two nodes. Use Select multiple on touch.');
    const ns=model.diagram.nodes.filter(n=>ids.includes(n.id));if(ns.some(n=>['source','cron'].includes(documents.resolveClass(n.classId,model.diagram,library,config).kernel)))throw Error('Sources do not consume shared worker slots');
    const x=Math.min(...ns.map(n=>n.x))-24,y=Math.min(...ns.map(n=>n.y))-40,w=Math.max(...ns.map(n=>n.x))-x+config.editor.nodeWidth+24,h=Math.max(...ns.map(n=>n.y))-y+120;
    const result=apply({type:'addGroup',label:'Resource cluster',kind:'resource',capacity:2,x,y,w,h,nodeIds:ids});
    if(result.id)model.select({groups:[result.id]});
  }
  buttons.undo=button('edit-actions','Undo',()=>{model.undo();message('Undid document edit.');});buttons.redo=button('edit-actions','Redo',()=>{model.redo();message('Redid document edit.');});
  const multiple=button('edit-actions','Select multiple',()=>{multiSelect=!multiSelect;canvas.setMultiSelect(multiSelect);multiple.setState({selected:multiSelect});multiple.element.setAttribute('aria-pressed',String(multiSelect));message(multiSelect?'Tap nodes to add or remove selection.':'Single selection enabled.');});multiple.element.setAttribute('aria-pressed','false');
  button('edit-actions','Duplicate',duplicate);button('edit-actions','Delete',erase);button('edit-actions','Cluster',cluster);
  button('view-actions','−',()=>canvas.zoomBy(.8),'quiet','Zoom out');button('view-actions','+',()=>canvas.zoomBy(1.25),'quiet','Zoom in');button('view-actions','Fit',()=>canvas.fit(),'quiet');
  async function start(){
    const candidate=clone(model.diagram),warnings=documents.issues(candidate,library,config);
    if(!candidate.nodes.length)throw Error('Add and connect executable components before Run');
    const mismatch=warnings.find(w=>w.kind==='payload-mismatch');if(mismatch)throw Error(`Resolve incompatible payloads before Run: ${mismatch.message}`);
    const next=await runners.create({diagram:candidate,library,config,kernels,profileId:profile.id});
    const previous=runner;runner=next;accepted=candidate;acceptedIdentity=semantic(candidate);running=true;savedCheckpoint=null;selectedRequest=null;
    await previous?.dispose();message('Accepted the current architecture and started a seeded synthetic run.');
  }
  function semantic(diagram){const m=globalThis.SimulatteSystemDiagramEditorModel.create({diagram,library,config});return m.executionIdentity();}
  buttons.run=button('playback','Run',start,'primary');buttons.pause=button('playback','Resume',()=>{if(!runner)throw Error('Run an architecture first');running=!running;});
  button('playback','Step 1 s',async()=>{if(!runner)await start();running=false;runner.advanceTo(Math.min(runner.horizon,runner.time()+1));});
  button('playback','Reset',async()=>{if(!runner)return;running=false;const next=await runners.create({diagram:accepted,library,config,kernels,profileId:profile.id});await runner.dispose();runner=next;savedCheckpoint=null;message('Reset accepted execution. Pending edits remain separate.');});
  button('playback','Replay',async()=>{if(!runner)throw Error('Run an architecture first');running=false;const proof=await runner.verify();if(proof.status!=='match')throw Error('Replay diverged');message(`Exact replay matched ${proof.rounds??proof.events??0} rounds/events.`);});
  button('playback','Checkpoint',async()=>{if(!runner)throw Error('Run an architecture first');running=false;savedCheckpoint=await runner.checkpoint();message('Checkpoint saved with pending events, controls, resources and RNG state.');});
  button('playback','Restore',async()=>{if(!runner||!savedCheckpoint)throw Error('Save a checkpoint first');running=false;await runner.restore(savedCheckpoint);message('Restored the accepted run checkpoint.');});
  async function sessionExport(){return {schema:'simulatte.systemDiagramEditorSession.v1',diagram:clone(model.diagram),accepted:clone(accepted),checkpoint:runner?await runner.checkpoint():null};}
  function validateSession(v){
    if(v?.schema===documents.SCHEMA)return {diagram:documents.validate(v,library,config),accepted:null,checkpoint:null};
    if(!v||v.schema!=='simulatte.systemDiagramEditorSession.v1'||Object.keys(v).sort().join(',')!=='accepted,checkpoint,diagram,schema')throw Error('Unsupported or undeclared editor session fields');
    return {...clone(v),diagram:documents.validate(v.diagram,library,config),accepted:v.accepted?documents.validate(v.accepted,library,config):null};
  }
  function loadPending(v){const value=validateSession(v);const loaded=model.replace(value.diagram);if(!loaded.ok)throw Error(loaded.error);running=false;loadedReplay=value;canvas.render();message('Loaded as pending. Run accepts it; Restore loaded replay explicitly restores saved execution.');}
  button('document-actions','Save',async()=>{localStorage.setItem(config.editor.autosaveKey,JSON.stringify(await sessionExport()));message('Saved this document and accepted replay in this browser.');});
  button('document-actions','Load',()=>{const text=localStorage.getItem(config.editor.autosaveKey);if(text)loadPending(JSON.parse(text));else $('load-file').click();});
  button('document-actions','Export',async()=>{const text=JSON.stringify(await sessionExport(),null,2);$('document').value=text;const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='system-diagram.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),0);message('Exported classes, instances, named ports and accepted replay.');});
  button('import-export','Show JSON',async()=>{$('document').value=JSON.stringify(await sessionExport(),null,2);message('Pending document and accepted execution are stored separately.');});
  button('import-export','Import JSON',()=>loadPending(JSON.parse($('document').value)));button('import-export','Open file',()=>$('load-file').click());
  button('import-export','Restore loaded replay',async()=>{
    if(!loadedReplay?.accepted||!loadedReplay.checkpoint)throw Error('Load a session containing an accepted run checkpoint first');
    const value=clone(loadedReplay),next=await runners.create({diagram:value.accepted,library,config,kernels,profileId:profile.id});
    try{await next.restore(value.checkpoint);}catch(e){await next.dispose();throw e;}
    const previous=runner;runner=next;accepted=value.accepted;acceptedIdentity=semantic(accepted);savedCheckpoint=value.checkpoint;running=false;loadedReplay=null;await previous?.dispose();message('Restored accepted replay; pending edits remain unchanged.');
  });
  $('load-file').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;if(f.size>5e6){message('File exceeds 5 MB',true);return;}try{const text=await f.text();await perform(()=>loadPending(JSON.parse(text)));}catch(err){message(err.message,true);}e.target.value='';});
  $('preset').addEventListener('change',()=>perform(async()=>{const value=$('preset').value,doc=value==='blank'?documents.emptyDiagram(config):await json(config.examples.find(e=>e.id===value).path);const loaded=model.replace(doc);if(!loaded.ok)throw Error(loaded.error);running=false;canvas.render();canvas.fit({readable:true});message('Starter loaded as pending with a new edit history. Save or export before replacing a document.');}));
  document.addEventListener('keydown',e=>{if(e.target.closest('input,select,textarea')||!(e.ctrlKey||e.metaKey))return;if(e.key.toLowerCase()==='z'){e.preventDefault();perform(()=>{if(e.shiftKey)model.redo();else model.undo();});}if(e.key.toLowerCase()==='s'){e.preventDefault();perform(async()=>{localStorage.setItem(config.editor.autosaveKey,JSON.stringify(await sessionExport()));message('Saved locally.');});}});
  function el(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;}
  function field(host,label,value,{id,choices,type='text',spec}={}){
    const wrap=el('label','',label),input=el(choices?'select':'input','wui-field');input.id=id||'field-'+label.replace(/[^a-z0-9]/gi,'-');
    if(choices)for(const c of choices){const o=el('option','',typeof c==='string'?c:c.label);o.value=typeof c==='string'?c:c.id;input.append(o);}else{input.type=type;if(type==='number'){input.step=spec?.type==='integer'?'1':'any';if(spec?.min!==undefined)input.min=spec.min;if(spec?.max!==undefined)input.max=spec.max;}}
    input.value=value??'';wrap.append(input);host.append(wrap);return input;
  }
  let paletteKey='';
  function palette(){
    const search=$('palette-search').value.toLowerCase(),doc=model.diagram,all=[...library.classOrder,...doc.classes.map(c=>c.id)],available=all.filter(id=>{const c=documents.resolveClass(id,doc,library,config);if(!kernels.has(c.kernel))return false;try{kernels.get(c.kernel).validateParams?.(c.defaults);return true;}catch{return false;}});
    $('capability-count').textContent=`${available.length} executable classes · ${all.length-available.length} metadata only`;
    const key=JSON.stringify([search,doc.classes]);if(key===paletteKey)return;paletteKey=key;$('palette').replaceChildren();
    for(const id of available){const c=documents.resolveClass(id,doc,library,config);if(!`${c.label} ${c.category}`.toLowerCase().includes(search))continue;
      const b=ui.SimButton({label:c.label,variant:'quiet',onAction:()=>{},ariaLabel:`Add ${c.label}`}).element;b.classList.add('palette-item');b.dataset.classId=id;b.dataset.type=c.kernel;b.replaceChildren(el('span','component-icon',c.label.split(/\s/).map(w=>w[0]).join('').slice(0,2)),el('span','',c.label));
      let start=null,ghost=null,moved=false;
      b.addEventListener('pointerdown',e=>{if(e.button!==0)return;start={x:e.clientX,y:e.clientY};moved=false;b.setPointerCapture(e.pointerId);});
      b.addEventListener('pointermove',e=>{if(!start)return;if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>7)moved=true;if(!moved)return;if(!ghost){ghost=el('div','drop-preview',c.label);document.body.append(ghost);}ghost.style.left=`${e.clientX+12}px`;ghost.style.top=`${e.clientY-16}px`;});
      b.addEventListener('pointerup',e=>{if(!start)return;const r=$('diagram').getBoundingClientRect();if(!moved)canvas.dropClassAt(id,r.left+r.width/2,r.top+r.height/2);else if(e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom)canvas.dropClassAt(id,e.clientX,e.clientY);else message('Drop inside the canvas.');start=null;ghost?.remove();ghost=null;});
      b.addEventListener('pointercancel',()=>{start=null;ghost?.remove();ghost=null;});
      b.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();const r=$('diagram').getBoundingClientRect();canvas.dropClassAt(id,r.left+r.width/2,r.top+r.height/2);}});$('palette').append(b);
    }
  }
  $('palette-search').addEventListener('input',palette);
  function paramsForm(host,specs,values,{inherited=null,sources=null,disabled=false}={}){
    const result={};for(const [key,spec]of Object.entries(specs)){
      const choices=spec.type==='enum'?[...(inherited?[{id:'__inherit',label:`Inherit · ${inherited[key]}`}]:[]),...spec.options]:spec.type==='boolean'?[...(inherited?[{id:'__inherit',label:`Inherit · ${inherited[key]}`}]:[]),{id:'true',label:'Yes'},{id:'false',label:'No'}]:null;
      const raw=Object.hasOwn(values,key)?values[key]:inherited?'__inherit':spec.default;
      const input=field(host,`${spec.label}${spec.unit?' · '+spec.unit:''}`,raw==='__inherit'&&!choices?'':String(raw),{id:'property-'+key,choices,type:['number','integer'].includes(spec.type)?'number':'text',spec});
      if(inherited&&!choices)input.placeholder=`Inherit · ${inherited[key]}`;input.disabled=disabled;result[key]=input;
      const origin=el('span','override-tag',sources?.[key]==='instance'?'Instance override':sources?.[key]?`From ${sources[key]}`:'');input.parentElement.append(origin);
    }return result;
  }
  function readParams(fields,specs,inherit=false){const values={};for(const [key,input]of Object.entries(fields)){if(inherit&&(input.value===''||input.value==='__inherit'))continue;const spec=specs[key];values[key]=spec.type==='boolean'?input.value==='true':['number','integer'].includes(spec.type)?Number(input.value):input.value;}return values;}
  function properties(){
    const doc=model.diagram,s=select(),id=selectedId(),host=$('properties');host.replaceChildren();
    if(s.nodes.length>1){$('selection-kind').textContent=`${s.nodes.length} nodes`;host.append(el('p','properties-note','Create a shared resource cluster, duplicate or delete the selection.'));const a=el('div','properties-actions');host.append(a);button(a,'Create cluster',cluster);return;}
    const node=doc.nodes.find(n=>n.id===id),edge=doc.edges.find(e=>e.id===id),group=doc.groups.find(g=>g.id===id);
    if(node){
      const resolved=documents.resolveNodeParams(node,doc,library,config),cls=resolved.klass,kernel=library.kernels[cls.kernel],user=doc.classes.find(c=>c.id===node.classId);
      $('selection-kind').textContent=cls.kernel;const actual=el('p','properties-note');actual.id='node-state';host.append(actual,el('div','wui-status',node.id));
      const name=field(host,'Instance name',node.label,{id:'instance-name'});name.addEventListener('change',()=>perform(()=>apply({type:'setNodeLabel',id,label:name.value})));
      const choose=field(host,'Node class',node.classId,{id:'instance-class',choices:[...library.classOrder,...doc.classes.map(c=>c.id)].map(cid=>({id:cid,label:documents.resolveClass(cid,doc,library,config).label}))});choose.addEventListener('change',()=>perform(()=>apply({type:'setNodeClass',id,classId:choose.value})));
      const tabs=el('div','scope-switch');host.append(tabs);for(const [v,label]of[['instance','Instance overrides'],['class','Class defaults']]){const b=button(tabs,label,()=>{scope=v;properties();renderState();},'quiet');b.setState({selected:scope===v});b.element.setAttribute('aria-pressed',String(scope===v));}
      host.append(el('p','properties-note',scope==='instance'?'Empty fields inherit defaults. Overrides apply only to this node.':user?'User class changes affect inheriting instances; explicit instance overrides remain.':'Built-in defaults are governed data. Derive a reusable class to customize them.'));
      let className;if(scope==='class'&&user)className=field(host,'Class name',user.label,{id:'class-name'});
      const classParent=user?documents.resolveClass(user.extends,doc,library,config).defaults:null;
      const fields=paramsForm(host,kernel.params,scope==='instance'?node.params:user?user.defaults:cls.defaults,{inherited:scope==='instance'?cls.defaults:classParent,sources:scope==='instance'?resolved.sources:cls.sources,disabled:scope==='class'&&!user});
      const actions=el('div','properties-actions');host.append(actions);
      if(scope==='instance'){
        button(actions,'Apply overrides',()=>apply({type:'setNodeParams',id,params:readParams(fields,kernel.params,true),replace:true}),'primary');
        button(actions,'Clear overrides',()=>apply({type:'setNodeParams',id,params:{},replace:true}));
      }else if(user)button(actions,'Apply class defaults',()=>apply({type:'updateUserClass',id:user.id,patch:{label:className.value,defaults:readParams(fields,kernel.params,true)}}),'primary');
      button(actions,'Create reusable class',()=>{const r=apply({type:'deriveClass',id,label:cls.label+' custom'});scope='class';if(r.id)model.select({nodes:[id]});properties();});
      host.append(el('p','properties-note','Ports: '+kernel.ports.map(p=>`${p.id} (${p.direction}: ${(p.accepts||p.emits).join(', ')})`).join(' · ')));
      const groupSelect=field(host,'Group membership',node.groupId||'',{id:'instance-group',choices:[{id:'',label:'No group'},...doc.groups.map(g=>({id:g.id,label:g.label+' · '+g.kind}))]});groupSelect.addEventListener('change',()=>perform(()=>apply({type:'setNodeGroup',id,groupId:groupSelect.value||null})));
      const live=el('div','properties-actions');host.append(live);button(live,'Fail node',()=>{if(!runner||!accepted.nodes.some(n=>n.id===id))throw Error('Run this node before injecting a fault');running=false;runner.inject({kind:'fault',target:{kind:'node',id},type:'crash',params:{}});message('Recorded a synthetic node crash.');},'danger');button(live,'Repair node',()=>{if(!runner)throw Error('Run first');runner.inject({kind:'repair',target:{kind:'node',id}});message('Recorded synthetic repair.');});
    }else if(edge){
      $('selection-kind').textContent='Named-port connection';host.append(el('div','wui-status',edge.id));
      const endpoints={};for(const side of['from','to']){
        const direction=side==='from'?'out':'in',choices=[];for(const n of doc.nodes){const c=documents.resolveClass(n.classId,doc,library,config);for(const p of library.kernels[c.kernel].ports.filter(p=>p.direction===direction))choices.push({id:n.id+'|'+p.id,label:`${n.label||n.id} · ${p.id}`});}
        endpoints[side]=field(host,side==='from'?'Output port':'Input port',edge[side].nodeId+'|'+edge[side].portId,{id:'link-'+side,choices});
      }
      const resolved=documents.resolveEdgeParams(edge,library),fields=paramsForm(host,library.edgeParams,resolved.values);
      const actions=el('div','properties-actions');host.append(actions);button(actions,'Apply connection',()=>{const from=endpoints.from.value.split('|'),to=endpoints.to.value.split('|');apply({type:'reconnect',id,from:{nodeId:from[0],portId:from[1]},to:{nodeId:to[0],portId:to[1]},params:readParams(fields,library.edgeParams)});},'primary');
      const warnings=model.issues().filter(w=>w.edgeId===id);host.append(el('p','properties-note',warnings.length?warnings.map(w=>w.message).join(' · '):'Draw or reconnect named ports. Rates are model inputs, not measurements.'));
    }else if(group){
      $('selection-kind').textContent=group.kind==='resource'?'Shared resource cluster':group.kind+' group';
      const name=field(host,'Group name',group.label,{id:'cluster-name'}),kind=field(host,'Group semantics',group.kind,{id:'cluster-kind',choices:['resource','boundary','zone','region']});
      const slots=field(host,'Shared concurrent slots',group.capacity??2,{id:'cluster-capacity',type:'number',spec:{type:'integer',min:1,max:64}});slots.disabled=group.kind!=='resource';kind.addEventListener('change',()=>{slots.disabled=kind.value!=='resource';});
      host.append(el('p','properties-note','Resource clusters share worker slots. Boundary groups are visual. Zones and regions model explicit correlated outage targets; they do not share capacity.'));
      const a=el('div','properties-actions');host.append(a);button(a,'Apply group',()=>apply({type:'updateGroup',id,patch:{label:name.value,kind:kind.value,...(kind.value==='resource'?{capacity:Number(slots.value)}:{capacity:undefined})}}),'primary');
      if(['zone','region'].includes(group.kind)){button(a,'Fail domain',()=>{if(!runner)throw Error('Run first');runner.inject({kind:'fault',target:{kind:'group',id},type:'outage',params:{}});},'danger');button(a,'Repair domain',()=>{if(!runner)throw Error('Run first');runner.inject({kind:'repair',target:{kind:'group',id}});});}
    }else{
      $('selection-kind').textContent='Diagram';host.append(el('p','properties-note','Drag components and connect their named ports. Select a node for reusable class defaults and explicit instance overrides.'));
      const name=field(host,'Diagram name',doc.name,{id:'diagram-name'}),seedInput=field(host,'Replay seed',doc.seed,{id:'workload-seed',type:'number',spec:{type:'integer'}}),horizon=field(host,'Horizon · seconds',doc.run.horizonSec,{id:'workload-horizon',type:'number'});
      const a=el('div','properties-actions');host.append(a);button(a,'Apply diagram',()=>apply({type:'setMeta',patch:{name:name.value,seed:Number(seedInput.value),horizonSec:Number(horizon.value)}}),'primary');
      host.append(el('p','properties-note',config.claimBoundary));
    }
    if(id){const a=el('div','properties-actions');host.append(a);button(a,'Delete selected',erase,'danger');}
    ui.adoptTree(host);
  }
  const previousPage=button('request-pages','Previous requests',()=>{requestPage=Math.max(0,requestPage-1);});
  const nextPage=button('request-pages','Next requests',()=>{requestPage++;});
  const requestCount=el('span','wui-caption');$('request-pages').append(requestCount);
  const inspector=ui.SimInspector({host:$('inspector'),placement:'inline',onSelect:id=>{selectedRequest=id;renderState();},onAction:()=>{},prominentFields:['status','blocker','attempts','effects']});
  function view(){return runner?.view()||null;}
  function renderState(){
    const v=view(),m=v?.global||{};const actual=$('node-state'),n=v?.nodes?.[select().nodes[0]];
    if(actual)actual.textContent=n?`Accepted run: ${n.health} · ${n.busy} busy · ${n.queue} queued · ${n.heldMiB??'unreported'} MiB retained`:'Not present in an accepted run.';
    const values=[['Completed / offered',`${m.completed||0} / ${m.offered||0}`],['Failed',m.failed||0],['In-flight requests / jobs',`${m.inFlight||0} / ${m.activeJobs||0}`],['Deadline misses',m.deadlineMisses||0],['Retained MiB',m.memoryMiB??0],['Committed effects',m.effects||0]];
    $('metrics').replaceChildren(...values.map(([subject,value])=>ui.SimMetric({data:{subject,value,unit:'',timeBasis:`${(v?.t||0).toFixed(2)} s`,freshness:'fresh',validity:'synthetic-model',level:'supporting'}}).element));
    $('status').textContent=v?`${v.t.toFixed(2)} / ${v.horizonSec} s · ${running?'running':'paused'} · seed ${accepted.seed}${dirty()?' · pending semantic edits excluded':''}${v.error?' · '+v.error:''}`:'Paused. Run accepts the current architecture explicitly.';
    const requests=v?.requests||[];requestPage=Math.min(requestPage,Math.max(0,Math.ceil(requests.length/REQUESTS_PER_PAGE)-1));const pageRequests=requests.slice(requestPage*REQUESTS_PER_PAGE,(requestPage+1)*REQUESTS_PER_PAGE);
    previousPage.setState({disabled:requestPage===0});nextPage.setState({disabled:(requestPage+1)*REQUESTS_PER_PAGE>=requests.length});requestCount.textContent=requests.length?`${requestPage*REQUESTS_PER_PAGE+1}–${requestPage*REQUESTS_PER_PAGE+pageRequests.length} of ${requests.length}`:'No requests yet';
    if(!selectedRequest&&requests.length)selectedRequest=requests[0].id;
    const visible=new Set(pageRequests.map(r=>r.id));for(const[id,b]of requestButtons)if(!visible.has(id)){b.element.remove();requestButtons.delete(id);}
    for(const r of pageRequests){let b=requestButtons.get(r.id);if(!b){b=ui.SimButton({label:r.id,variant:'quiet',onAction:()=>{selectedRequest=r.id;renderState();}});requestButtons.set(r.id,b);$('requests').append(b.element);}b.element.textContent=`${r.id} · ${r.status}${r.backgroundPending?` · ${r.backgroundPending} background`:``}`;b.setState({selected:r.id===selectedRequest});}
    const info=runner&&selectedRequest?runner.inspect(selectedRequest):null;
    inspector.render({selectedId:info?selectedRequest:null,prompt:'Run the architecture, then inspect a request.',objects:pageRequests.map(r=>({id:r.id,label:r.id,condition:r.status})),label:selectedRequest||'Request inspection',description:'Request, attempt and effect records come from the model.',fields:info?[
      {id:'status',label:'Status',value:info.request.status},{id:'blocker',label:'Blocked by',value:info.blocker?JSON.stringify(info.blocker):'None'},{id:'attempts',label:'Attempts',value:info.attempts.length},{id:'effects',label:'Committed effects',value:info.effects.length}
    ]:[],actions:[]});
    $('history').replaceChildren(...(info?.history||[]).map(e=>el('li','',`${Number(e.time??e.t).toFixed(3)} s · ${e.kind} · ${e.nodeId||''}${(e.detail||e.message)?' · '+(typeof(e.detail||e.message)==='string'?(e.detail||e.message):JSON.stringify(e.detail||e.message)):''}${e.causes?.length?' ← '+e.causes.join(', '):''}`)));
    canvas.setState?.(v,{pending:dirty()&&!!runner});
  }
  function render(){palette();buttons.undo.setState({disabled:!model.canUndo()});buttons.redo.setState({disabled:!model.canRedo()});buttons.pause.element.textContent=running?'Pause':'Resume';buttons.pause.setState({disabled:!runner});buttons.run.element.textContent=runner?(dirty()?'Accept & run':'Restart'):'Run';$('revision').textContent=runner?(dirty()?'Accepted run · edits pending':'Accepted architecture'):'Not running';$('revision').dataset.pending=String(!!runner&&dirty());document.body.dataset.pending=String(dirty());document.body.dataset.running=String(running);document.body.dataset.graphNodes=String(model.diagram.nodes.length);renderState();}
  model.subscribe(event=>{if(event.kind!=='view'){properties();render();}if(!['selection','view'].includes(event.kind)){const issues=model.issues();if(issues.length)message(issues.map(i=>i.message).join(' · '),issues.some(i=>i.kind==='payload-mismatch'));}});
  ui.adoptTree(document.body);properties();render();canvas.fit({readable:true});$('assumptions').replaceChildren(el('li','',config.claimBoundary));
  globalThis.SimulatteSystemDiagramEditor=Object.freeze({document:()=>clone(model.diagram),accepted:()=>clone(accepted),snapshot:()=>clone(view()),selection:()=>clone(select()),viewport:()=>canvas.getView(),program:()=>runner?.program()||null});
  document.body.dataset.simulationProfile=profile.id;document.body.dataset.editorReady='true';message('Draw the architecture, configure class defaults and instance overrides, then Run.');
  setInterval(()=>{if(!running||busy||!runner)return;try{runner.advanceTo(Math.min(runner.horizon,runner.time()+.25));const v=view();if(v.done||v.error||runner.time()>=runner.horizon)running=false;render();}catch(e){running=false;message(e.message,true);render();}},180);
})().catch(e=>{const s=document.getElementById('status');s.textContent=`Unable to open editor: ${e.message}`;s.setAttribute('role','alert');});
