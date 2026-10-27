(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./diagram.js') : root.SimulatteSystemDiagramDocument);
  if (node) module.exports = api; else root.SimulatteSystemDiagramPlayback = api;
})(globalThis, function (D) {
  'use strict';
  function operationOf(request){
    const fields=request.input?.fields||{},command=Object.values(fields).find(value=>value&&typeof value==='object'&&(typeof value.action==='string'||typeof value.op==='string'));
    return command?.action||command?.op||request.input?.op||request.payloadType;
  }
  function requestRoute(request,view,compiled){
    const attempts=(view.attempts||[]).filter(a=>a.requestId===request.id).sort((a,b)=>a.startedAt-b.startedAt||a.id.localeCompare(b.id)),first=attempts.find(a=>a.callerNodeId===request.sourceId)||attempts[0];
    const name=id=>compiled?.nodes.find(n=>n.id===id)?.label||id;
    return {from:name(request.sourceId),to:first?name(first.nodeId):'No delivery recorded'};
  }
  function structuredResults(request,view){
    const fields=request.input?.fields||{},command=Object.values(fields).find(value=>value&&typeof value==='object'&&(value.commandId!==undefined||value.action!==undefined||value.op!==undefined));
    const index=Number.isInteger(fields.operation?.index)?fields.operation.index:/:([0-9]+)$/.test(request.input?.idem||'')?Number(request.input.idem.match(/:([0-9]+)$/)[1]):null;
    const rows=Object.entries(view.nodes?.[request.sourceId]?.records||{}).flatMap(([collection,rows])=>rows.map(value=>({collection,value})));
    return rows.filter(({value})=>value.requestId===request.id||(command?.commandId!==undefined&&(value.command?.commandId===command.commandId||value.commandId===command.commandId))||(index!==null&&value.index===index&&('result' in value||'fields' in value||'value' in value)));
  }
  // Readable failure targets: compiled edge IDs are opaque hashes inside expanded subsystems.
  function deepFreeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);Object.values(value).forEach(deepFreeze);}return value;}
  function faultTargets(compiled){
    const name=id=>compiled.nodes.find(n=>n.id===id)?.label||id;
    const edgeName=e=>`${name(e.from)} → ${name(e.to)}`,repeated=new Set(compiled.edges.map(edgeName).filter((text,i,all)=>all.indexOf(text)!==i));
    return [...compiled.nodes.map(n=>({kind:'node',id:n.id,label:n.label,kernel:n.kernel})),
      ...compiled.edges.map(e=>({kind:'edge',id:e.id,label:`${edgeName(e)}${repeated.has(edgeName(e))?` (${e.fromPort} → ${e.toPort})`:''}${e.label?` · ${e.label}`:''}`})),
      ...compiled.groups.filter(g=>['zone','region'].includes(g.kind)).map(g=>({kind:'group',id:g.id,label:g.label}))];
  }
  function createController({getDiagram, createRunner, config, onView = ()=>{}, onState = ()=>{}, canSimulate = ()=>true}) {
    let runner = null, generation = 0, running = false, busy = false, speed = config.playback.defaultSpeed, saved = null;
    // A checkpoint belongs to one accepted run; clearing, restarting or editing invalidates it.
    const current = () => Boolean(runner && saved && saved.generation === generation);
    const state = () => ({running, busy, speed, executable:canSimulate()!==false, time:runner?.time() || 0, horizon:runner?.horizon || getDiagram().run.horizonSec, done:Boolean(runner && runner.time() >= runner.horizon), accepted:Boolean(runner), checkpointSec:current() ? saved.checkpoint.time : null});
    const notify = () => onState(state());
    function pause() { running = false; notify(); }
    function paint() { const view = runner?.view() || null; onView(view, runner?.compiled || null); notify(); if (view?.error) { pause(); throw Error(view.error); } }
    async function clear() {
      generation++; running = false; busy = false; saved = null; const prior = runner; runner = null; onView(null,null); notify();
      if (prior) await prior.dispose();
    }
    async function accept() {
      if(canSimulate()===false)throw Error('This is a requirements/design stage. Advance to an executable stage before simulating.');
      if (runner) return true;
      const token = ++generation, snapshot = D.clone(getDiagram()); busy = true; notify();
      try {
        const accepted = await createRunner(snapshot);
        if (token !== generation) { await accepted.dispose(); return false; }
        runner = accepted; paint(); return true;
      } finally { if (token === generation) { busy = false; notify(); } }
    }
    async function play() { if (busy) return; if (runner && runner.time() >= runner.horizon) await clear(); if (await accept()) { running = true; notify(); } }
    async function restart() { await clear(); await accept(); }
    async function step() { pause(); if (busy || !await accept()) return; runner.advanceTo(Math.min(runner.horizon,runner.time()+config.engine.authoritativeCadenceSec)); paint(); }
    function tick(elapsedSec) {
      if (!running || !runner || busy) return;
      if (!Number.isFinite(elapsedSec) || elapsedSec < 0) throw Error('Playback needs a finite non-negative elapsed duration');
      runner.advanceTo(Math.min(runner.horizon,runner.time()+Math.min(config.playback.maxSimSecondsPerFrame,elapsedSec*speed*config.playback.normalSimSecondsPerSecond)));
      if (runner.time() >= runner.horizon) running = false;
      paint();
    }
    return {play,pause,restart,step,tick,clear,state,view:()=>runner?.view() || null,inspect:id=>runner?.inspect(id) || null,
      setSpeed(value) { if(!config.playback.speeds.includes(value))throw Error('Unsupported playback speed');speed=value;notify(); },
      async inject(control) { if(busy)throw Error('Wait for simulation initialization');if(!await accept())throw Error('Simulation changed before injection');const row=runner.inject(control);paint();return row; },
      exportReplay() { if(!runner)throw Error('Simulate an architecture first');return runner.exportReplay(); },
      async verify() { if(!runner)throw Error('Simulate an architecture first');pause();return runner.verify(); },
      controls() { return runner ? runner.controls() : []; },
      async advanceTo(target) {
        if(busy)throw Error('Wait for simulation initialization');pause();if(!await accept())throw Error('Simulation changed before advancing');
        if(!Number.isFinite(target)||target<runner.time()||target>runner.horizon)throw Error(`Advance to a time from ${runner.time().toFixed(2)} to ${runner.horizon} s`);
        runner.advanceTo(target);paint();return runner.time();
      },
      async checkpoint() {
        if(busy||!runner)throw Error('Simulate an architecture first');pause();
        const token=generation,checkpoint=await runner.checkpoint();
        if(token!==generation)throw Error('Simulation changed before the checkpoint completed');
        saved={generation:token,checkpoint};notify();return checkpoint.time;
      },
      async restore() {
        if(busy||!current())throw Error('Take a checkpoint of the current run first');pause();
        const token=generation;await runner.restore(saved.checkpoint);
        if(token!==generation)throw Error('Simulation changed before the checkpoint was restored');
        paint();return runner.time();
      },
    };
  }
  function create({host, model, canvas, library, config, message, canSimulate}) {
    const root = globalThis, doc = host.ownerDocument;
    let controls, controller, compiledGraph = null, lastRecordsTime = -Infinity;
    const make = (tag,text='')=>{const element=doc.createElement(tag);element.textContent=text;return element;};
    const records=make('dialog');records.className='lucyd-dialog simulation-records';records.setAttribute('aria-label','Simulation requests');
    const recordSummary=make('p'),recordList=make('div'),recordDetail=make('div');recordList.className='simulation-records-list';
    const close=root.SimulatteWorldUI.SimButton({document:doc,label:'Close',onAction:()=>records.close()}).element;
    const recordHeading=make('div');recordHeading.className='panel-heading';recordHeading.append(make('h2','Simulation requests'),close);records.append(recordHeading,recordSummary,recordDetail,recordList);host.append(records);
    let requestId=null;
    function renderRecords(view) {
      if(!view){requestId=null;recordSummary.textContent='Simulate an architecture to observe requests.';recordList.replaceChildren();recordDetail.replaceChildren();return;}
      if(!records.open)return;
      recordSummary.textContent=`${view.global.completed} completed · ${view.global.failed} failed · ${view.global.inFlight} in flight`;
      recordList.replaceChildren();
      for(const request of view.requests.slice(-25)){
        const route=requestRoute(request,view,compiledGraph),label=`${request.id} · ${operationOf(request)} · ${request.status}${request.err ? ` (${request.err})` : ''}`;
        const action=root.SimulatteWorldUI.SimButton({document:doc,label,variant:'quiet',onAction:()=>{requestId=request.id;renderRecords(controller.view());records.scrollTop=0;}}).element;
        action.classList.add('simulation-request-row');action.dataset.requestId=request.id;const name=make('span',label),path=make('span',`From ${route.from} → ${route.to}`);name.className='simulation-request-operation';path.className='simulation-request-route';action.replaceChildren(name,path);action.setAttribute('aria-label',label+`. From ${route.from} to ${route.to}`);recordList.append(action);
      }
      recordDetail.replaceChildren();
      if(requestId){const trace=controller.inspect(requestId);if(trace){
        recordDetail.append(make('h3',`Request ${requestId} · ${operationOf(trace.request)}`));
        function data(title,value){const disclosure=make('details'),pre=make('pre',JSON.stringify(value,null,2));pre.className='simulation-request-data';disclosure.append(make('summary',title),pre);recordDetail.append(disclosure);}
        data('Input',trace.request.input);const results=structuredResults(trace.request,view);if(results.length)data('Structured results',results);else recordDetail.append(make('p','No structured response record was retained for this request.'));
        const attempts=make('details');attempts.append(make('summary','Delivery attempts'));const name=id=>compiledGraph?.nodes.find(n=>n.id===id)?.label||id;
        for(const attempt of trace.attempts)attempts.append(make('p',`${attempt.startedAt.toFixed(2)}s · ${name(attempt.callerNodeId)} → ${name(attempt.nodeId)} · ${attempt.status}${attempt.err?': '+attempt.err:''}`));recordDetail.append(attempts);
        if(trace.effects.length)data('Effects',trace.effects);root.SimulatteWorldUI.adoptTree(recordDetail);
      }}
    }

    function renderNodeRecords(projection) {
      const selected=model.selection.nodes[0],info=selected && projection?.nodes[selected],inspector=doc.getElementById('properties');
      if(!inspector)return;
      if(!info){inspector.querySelector('.simulation-node-records')?.remove();return;}
      let details=inspector.querySelector('.simulation-node-records');
      if(!details){details=make('details');details.className='simulation-node-records';details.append(make('summary','Observed simulation state'),make('div'));inspector.append(details);root.SimulatteWorldUI.adoptTree(details);}
      const body=details.lastElementChild;body.replaceChildren();
      for(const [label,value] of Object.entries(info.detail || {}))body.append(make('p',`${label}: ${value}`));
      const members=compiledGraph?.composition?.mapping.filter(row=>row.kind==='nodes' && row.path[0]===selected) || [];
      const sources=members.length ? members.map(row=>({label:row.path.slice(1).join(' / '),state:controller.view()?.nodes[row.id]})) : [{label:'',state:info}];
      for(const source of sources)for(const [name,rows] of Object.entries(source.state?.records || {})){
        body.append(make('h4',`${source.label ? source.label+' · ' : ''}${name}: ${rows.length}`));
        for(const [index,row]of rows.slice(0,20).entries()){const record=make('details');record.append(make('summary','Record '+(index+1)),make('pre',JSON.stringify(row,null,2)));body.append(record);}
      }
    }
    const publish = view => {
      const composition = acceptedComposition;
      const projection = view && composition ? root.SimulatteSystemDiagramSubsystemEditor.projectState(view,composition) : view;
      canvas.setState(projection);
      host.dataset.simulationTime = String(view?.t || 0);
      host.dataset.simulationCompleted = String(view?.global.completed || 0);
      host.dataset.simulationFailed = String(view?.global.failed || 0);
      const selected = model.selection.nodes[0], info = selected && projection?.nodes[selected];
      const output = doc.getElementById('node-state');
      if(output)output.textContent=info?`${info.health} · ${info.queue} queued`:'';
      // Edits clear the accepted run; an open Failures dialog re-renders for the edited document instead of closing.
      if(!view){records.close();if(faultDialog?.open)faultForm();else faultBody?.replaceChildren();}
      if(!view || view.t-lastRecordsTime>=.2 || !controller.state().running){lastRecordsTime=view?.t || 0;renderNodeRecords(projection);renderRecords(view);}
    };
    let acceptedComposition = null, faultDialog = null, faultBody = null;
    let baseline = null, comparison = null, runActionKey = '', checkpointAction = null, restoreAction = null, baselineAction = null, compareAction = null;
    controller = createController({getDiagram:()=>model.diagram, config, canSimulate,
      createRunner:diagram=>{if(canSimulate?.()===false)throw Error('This is a requirements/design stage. Advance to an executable stage before simulating.');return root.SimulatteSystemDiagramRunner.create({diagram,library,config,kernels:root.SimulatteSystemDiagramKernels});},
      onView:(view,compiled)=>{compiledGraph=compiled;acceptedComposition=compiled?.composition || null;publish(view);},
      onState:state=>{controls?.update(state);syncRunActions(state);},
    });
    const act = action => async (...args) => { try { await action(...args); } catch(error) { controller.pause();message(error.message,true); } };
    controls = root.SimulatteSystemDiagramRunControls.create({host, config, idleLabel:'Simulate',
      onPlay:act(controller.play),onPause:controller.pause,onStep:act(controller.step),onRestart:act(controller.restart),onReplay:act(async()=>{await controller.restart();await controller.play();}),onSpeed:controller.setSpeed,
      onVerify:act(async()=>{const proof=await controller.verify();message(`Replay ${proof.status}` ,proof.status!=='match');}),
    });
    controls.update(controller.state());
    const requests=root.SimulatteWorldUI.SimButton({document:doc,label:'Requests',variant:'quiet',onAction:()=>{controller.pause();renderRecords(controller.view());records.showModal();renderRecords(controller.view());}}).element;
    controls.addAction(requests);
    faultDialog=make('dialog');faultDialog.className='lucyd-dialog';faultDialog.setAttribute('aria-label','Inject a failure');faultBody=make('div');
    const faultClose=root.SimulatteWorldUI.SimButton({document:doc,label:'Close',onAction:()=>faultDialog.close()}).element;
    faultDialog.append(make('h2','Inject a failure'),faultBody,faultClose);host.append(faultDialog);
    const inspectorApi=root.SimulatteSystemDiagramInspector,button=(label,onAction,variant)=>root.SimulatteWorldUI.SimButton({document:doc,label,variant,onAction}).element;
    function faultParams(typeId,host,prefix){
      host.replaceChildren();const readers=[],spec=library.faultTypes.find(f=>f.id===typeId);
      for(const [key,def]of Object.entries(spec?.params||{})){
        const label=make('label',def.label||key),input=make(def.type==='enum'?'select':'input');input.className='wui-field';input.id=`${prefix}-param-${key}`;input.setAttribute('aria-label',def.label||key);
        if(def.type==='enum'){for(const v of def.options){const o=make('option',v);o.value=v;input.append(o);}input.value=def.default;}
        else if(def.type==='boolean'){input.type='checkbox';input.checked=def.default;}
        else{input.type='number';input.min=def.min;input.max=def.max;input.step=def.type==='integer'?'1':'any';input.value=def.default;}
        readers.push(()=>{const parsed=inspectorApi.parseParam(def,def.type==='boolean'?input.checked:input.value);if(!parsed.ok)throw Error(`${key}: ${parsed.error}`);return [key,parsed.value];});label.append(input);host.append(label);
      }
      return ()=>Object.fromEntries(readers.map(read=>read()));
    }
    function faultPicker(targets,name,prefix){
      const target=make('select'),type=make('select'),params=make('div');target.className=type.className='wui-field';target.id=`${prefix}-target`;type.id=`${prefix}-type`;target.setAttribute('aria-label',`${name} target`);type.setAttribute('aria-label',`${name} type`);
      for(const row of targets){const o=make('option',`${row.kind==='edge'?'connection':row.kind}: ${row.label}`);o.value=`${row.kind}:${row.id}`;target.append(o);}
      const selected=()=>targets.find(row=>`${row.kind}:${row.id}`===target.value);let read=()=>({});
      const parameters=()=>{read=faultParams(type.value,params,prefix);};
      const types=()=>{const t=selected();type.replaceChildren();for(const f of library.faultTypes.filter(f=>f.targets.includes(t.kind)&&(!t.kernel||library.kernels[t.kernel].faults.includes(f.id)))){const o=make('option',f.label);o.value=f.id;type.append(o);}parameters();};
      target.addEventListener('change',types);type.addEventListener('change',parameters);if(targets.length)types();
      return {elements:[target,type,params],selected,type,read:()=>read()};
    }
    // Scheduled faults belong to the document (pending architecture); subsystem internals are scheduled inside their definition.
    function scheduleTargets(){
      const diagram=model.diagram,nodes=diagram.nodes.filter(n=>!D.isConcept(n.classId)).map(n=>{try{return {id:n.id,label:n.label,kernel:D.resolveNodeParams(n,diagram,library,config).klass.kernel};}catch{return null;}}).filter(n=>n&&n.kernel!=='subsystem');
      return faultTargets({nodes,edges:diagram.edges.map(e=>({id:e.id,from:e.from.nodeId,to:e.to.nodeId,fromPort:e.from.portId,toPort:e.to.portId,label:e.label})),groups:diagram.groups});
    }
    function faultForm(){
      faultBody.replaceChildren();
      const now=make('section'),feedback=make('p');feedback.setAttribute('role','status');now.append(make('h3','Now'));
      if(compiledGraph?.nodes.length){
        const live=faultPicker(faultTargets(compiledGraph),'Failure','failure');
        async function send(kind){try{const t=live.selected(),record=await controller.inject({kind,target:{kind:t.kind,id:t.id},...(kind==='fault'?{type:live.type.value,params:live.read()}:{})});feedback.textContent=`${kind==='fault'?'Injected':'Repaired'} at ${record.atSec.toFixed(2)} s · recorded for replay`;}catch(e){feedback.textContent=e.message;}}
        now.append(...live.elements,button('Inject fault',()=>send('fault')),button('Repair target',()=>send('repair')),feedback);
      }else now.append(make('p','Simulate the architecture to inject a failure into the running system.'));
      const later=make('section'),horizon=model.diagram.run.horizonSec,scheduleFeedback=make('p'),targets=scheduleTargets();scheduleFeedback.setAttribute('role','status');
      later.append(make('h3',`Scheduled (${model.diagram.faults.length})`));
      const list=make('ul');list.className='simulation-fault-schedule';
      for(const fault of model.diagram.faults){const item=make('li',inspectorApi.faultSummary(fault,model.diagram,library)+' ');item.append(button('Remove',()=>{const result=model.apply({type:'removeFault',id:fault.id});if(!result.ok)scheduleFeedback.textContent=result.error;else faultForm();},'quiet'));list.append(item);}
      if(model.diagram.faults.length)later.append(list);
      if(targets.length){
        const planned=faultPicker(targets,'Scheduled failure','fault'),at=make('input'),until=make('input');at.id='fault-at';until.id='fault-until';
        for(const [input,label] of [[at,'Start · s'],[until,'End · s']]){input.type='number';input.min='0';input.max=String(horizon);input.step='any';input.className='wui-field';input.setAttribute('aria-label',label);}
        at.value='0';until.placeholder='permanent';
        const schedule=()=>{try{
          const t=planned.selected(),a=inspectorApi.parseParam({type:'number',min:0,max:horizon,unit:'s'},at.value);if(!a.ok)throw Error(`Start: ${a.error}`);
          let untilSec=null;if(until.value.trim()){const u=inspectorApi.parseParam({type:'number',min:0,max:Number.MAX_SAFE_INTEGER,unit:'s'},until.value);if(!u.ok||u.value<=a.value)throw Error('End must be after start, or blank for permanent');untilSec=u.value;}
          const result=model.apply({type:'addFault',fault:{atSec:a.value,untilSec,target:{kind:t.kind,id:t.id},type:planned.type.value,params:planned.read()}});
          if(!result.ok)throw Error(result.error);faultForm();
        }catch(e){scheduleFeedback.textContent=e.message;}};
        const times=make('div'),startLabel=make('label','Start · s'),endLabel=make('label','End · s');times.className='simulation-fault-times';startLabel.append(at);endLabel.append(until);times.append(startLabel,endLabel);
        later.append(...planned.elements,times,button('Schedule fault',schedule),scheduleFeedback);
      }else later.append(make('p','Add a top-level component or connection to schedule a failure.'));
      faultBody.append(now,later);root.SimulatteWorldUI.adoptTree(faultBody);
    }
    const failures=root.SimulatteWorldUI.SimButton({document:doc,label:'Failures',variant:'quiet',onAction:act(async()=>{if(!model.diagram.nodes.length)throw Error('Add executable components first');if(!controller.view()&&canSimulate?.()!==false)await controller.step();controller.pause();faultForm();faultDialog.showModal();})}).element;
    failures.dataset.runCommand='failures';requests.dataset.runCommand='requests';
    controls.addAction(failures);

    // Checkpoints restore the accepted run; a baseline plus an edited repair run as a paired comparison.
    const menuAction=(label,command,onAction)=>{const b=root.SimulatteWorldUI.SimButton({document:doc,label,variant:'quiet',onAction:act(onAction)});b.element.setAttribute('role','menuitem');b.element.dataset.runCommand=command;controls.addAction(b.element);return b;};
    menuAction('Run settings','settings',()=>{controller.pause();settingsForm();settingsDialog.showModal();});
    menuAction('Advance to time','advance',()=>{controller.pause();advanceForm();advanceDialog.showModal();});
    const plural=(count,word)=>`${count} ${word}${count===1?'':'s'}`;
    checkpointAction=menuAction('Checkpoint','checkpoint',async()=>{const t=await controller.checkpoint();message(`Checkpoint saved at ${t.toFixed(2)} s`);});
    restoreAction=menuAction('Restore checkpoint','restore',async()=>{const t=await controller.restore();message(`Restored checkpoint at ${t.toFixed(2)} s`);});
    baselineAction=menuAction('Capture baseline','baseline',()=>{
      const diagram=D.validate(D.clone(model.diagram),library,config),recorded=controller.controls().map(({id,...row})=>row);
      baseline=deepFreeze({diagram,controls:recorded});comparison=null;syncRunActions(controller.state());
      message(`Baseline captured: seed ${diagram.seed}, ${diagram.run.horizonSec} s, ${plural(diagram.faults.length,'scheduled fault')}, ${plural(recorded.length,'recorded control')}`);
    });
    compareAction=menuAction('Compare repair','compare',async()=>{
      if(!baseline)throw Error('Capture a baseline before comparing a repair');
      if(canSimulate?.()===false)throw Error('This is a requirements/design stage. Advance to an executable stage before simulating.');
      controller.pause();message('Running baseline and repair with identical demand…');
      const journeys=await loadJourneys();
      comparison=await journeys.compare({baseline:D.clone(baseline.diagram),repaired:D.clone(model.diagram),library,config,kernels:root.SimulatteSystemDiagramKernels,createRunner:options=>root.SimulatteSystemDiagramRunner.create(options),controls:D.clone(baseline.controls)});
      renderComparison(journeys.summarize(comparison));comparisonDialog.showModal();
      message(`Compared with identical seed, scheduled faults and ${plural(comparison.baseline.arrivals.length,'source arrival')}`);
    });
    function syncRunActions(state){
      if(!compareAction)return;
      const key=`${state.busy}|${state.accepted}|${state.checkpointSec}|${Boolean(baseline)}|${state.executable}`;if(key===runActionKey)return;runActionKey=key;
      checkpointAction.setState({disabled:Boolean(state.busy||!state.accepted)});
      restoreAction.setState({disabled:Boolean(state.busy||state.checkpointSec===null)});
      restoreAction.element.textContent=state.checkpointSec===null?'Restore checkpoint':`Restore checkpoint · ${state.checkpointSec.toFixed(1)} s`;
      baselineAction.element.textContent=baseline?'Replace baseline':'Capture baseline';
      baselineAction.setState({disabled:Boolean(state.busy||state.executable===false)});
      compareAction.setState({disabled:Boolean(state.busy||!baseline||state.executable===false)});
    }
    async function loadJourneys(){
      if(!root.SimulatteSystemDiagramJourneys){
        const src=doc.querySelector('script[src*="playback.js"]')?.src,url=src?new URL('page-journeys.js',src):null;
        if(url)url.search=new URL(src).search;
        await import(url?url.href:'./page-journeys.js');
      }
      if(!root.SimulatteSystemDiagramJourneys)throw Error('Repair comparison module is unavailable');
      return root.SimulatteSystemDiagramJourneys;
    }
    const comparisonDialog=make('dialog'),comparisonBody=make('div'),comparisonHeading=make('div');
    comparisonDialog.className='lucyd-dialog simulation-comparison';comparisonDialog.setAttribute('aria-label','Baseline and repair comparison');comparisonBody.id='comparison-result';comparisonHeading.className='panel-heading';
    comparisonHeading.append(make('h2','Baseline and repair'),root.SimulatteWorldUI.SimButton({document:doc,label:'Close',onAction:()=>comparisonDialog.close()}).element);
    comparisonDialog.append(comparisonHeading,comparisonBody);host.append(comparisonDialog);
    function renderComparison(rows){
      const format=value=>value===null?'n/a':Number.isInteger(value)?String(value):value.toFixed(2),table=make('table'),head=make('tr');
      for(const text of ['','Baseline','Repair'])head.append(make('th',text));table.append(head);
      for(const row of rows){const tr=make('tr');tr.dataset.metric=row.key;tr.append(make('th',row.label),make('td',format(row.baseline)),make('td',format(row.repair)));table.append(tr);}
      const same=make('p',`Same demand in both runs: seed ${comparison.seed}, ${comparison.untilSec} s, ${plural(comparison.faults.length,'scheduled fault')}, ${plural(comparison.controls.length,'recorded control')}, ${plural(comparison.baseline.arrivals.length,'identical source arrival')}.`);
      const boundary=make('p',comparison.boundary);boundary.className='sd-insp-note';
      comparisonBody.replaceChildren(same,table,boundary);
    }
    function smallDialog(title){const dialog=make('dialog'),body=make('div'),heading=make('div');dialog.className='lucyd-dialog';dialog.setAttribute('aria-label',title);heading.className='panel-heading';heading.append(make('h2',title),button('Close',()=>dialog.close()));dialog.append(heading,body);host.append(dialog);return [dialog,body];}
    const [settingsDialog,settingsBody]=smallDialog('Run settings'),[advanceDialog,advanceBody]=smallDialog('Advance to time');
    // Advance pauses the accepted run at an exact logical time, finer than one Step round, so checkpoints can hold in-flight work.
    function advanceForm(){
      const state=controller.state(),wrap=make('label','Time · s'),input=make('input'),feedback=make('p');feedback.setAttribute('role','status');
      input.type='number';input.step='any';input.min=String(state.time);input.max=String(state.horizon);input.value=String(state.time);input.id='run-advance-to';input.className='wui-field';wrap.append(input);
      const advance=async()=>{try{const t=await controller.advanceTo(Number(input.value));feedback.textContent=`Paused at ${t.toFixed(2)} s`;input.min=String(t);}catch(e){feedback.textContent=e.message;}};
      advanceBody.replaceChildren(wrap,button('Advance',advance),feedback);root.SimulatteWorldUI.adoptTree(advanceBody);
    }
    // Seed and horizon define the synthetic workload; changing them is an architecture edit that clears the accepted run.
    function settingsForm(){
      const fields=[['seed','Seed',{type:'integer',min:0,max:4294967295},model.diagram.seed],['horizonSec','Horizon · s',{type:'number',min:1,max:config.bounds.maxHorizonSec,unit:'s'},model.diagram.run.horizonSec]];
      const feedback=make('p');feedback.setAttribute('role','status');
      const inputs=fields.map(([key,label,spec,value])=>{const wrap=make('label',label),input=make('input');input.type='number';input.step=spec.type==='integer'?'1':'any';input.min=String(spec.min);input.max=String(spec.max);input.value=String(value);input.className='wui-field';input.id=`run-${key}`;input.setAttribute('aria-label',label);wrap.append(input);return {key,spec,input,wrap};});
      const applySettings=()=>{try{
        const patch=Object.fromEntries(inputs.map(({key,spec,input})=>{const parsed=inspectorApi.parseParam(spec,input.value);if(!parsed.ok)throw Error(`${key==='seed'?'Seed':'Horizon'}: ${parsed.error}`);return [key,parsed.value];}));
        const result=model.apply({type:'setMeta',patch});if(!result.ok)throw Error(result.error);
        feedback.textContent=`Applied: seed ${model.diagram.seed}, horizon ${model.diagram.run.horizonSec} s`;
      }catch(e){feedback.textContent=e.message;}};
      settingsBody.replaceChildren(...inputs.map(row=>row.wrap),button('Apply run settings',applySettings),feedback);root.SimulatteWorldUI.adoptTree(settingsBody);
    }
    syncRunActions(controller.state());
    const unsubscribe=model.subscribe(event=>{
      if(!['selection','view','layout','label'].includes(event.kind))act(controller.clear)();
      else if(event.kind==='selection')publish(controller.view());
    });
    let frame = null, last = null;
    function animate(now) {
      if(last!==null){try{controller.tick(Math.max(0,(now-last)/1000));}catch(error){controller.pause();message(error.message,true);}}
      last=now;frame=root.requestAnimationFrame(animate);
    }
    frame=root.requestAnimationFrame(animate);
    const keydown=event=>{if(!doc.querySelector('dialog[open]'))controls.handleKey(event);};
    doc.addEventListener('keydown',keydown);
    const hide=()=>{act(controller.clear)();};root.addEventListener('pagehide',hide);
    return {play:act(controller.play),pause:controller.pause,view:controller.view,controller,clear:controller.clear,baseline:()=>baseline&&D.clone(baseline),comparison:()=>comparison&&D.clone(comparison),refresh:()=>{lastRecordsTime=-Infinity;publish(controller.view());controls.update(controller.state());},
      dispose(){root.cancelAnimationFrame(frame);unsubscribe();doc.removeEventListener('keydown',keydown);root.removeEventListener('pagehide',hide);controls.dispose();records.remove();faultDialog.remove();comparisonDialog.remove();settingsDialog.remove();advanceDialog.remove();return controller.clear();}};
  }
  return Object.freeze({create,createController,faultTargets,operationOf,requestRoute,structuredResults});
});
