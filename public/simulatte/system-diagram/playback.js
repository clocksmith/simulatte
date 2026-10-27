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
  function createController({getDiagram, createRunner, config, onView = ()=>{}, onState = ()=>{}, canSimulate = ()=>true}) {
    let runner = null, generation = 0, running = false, busy = false, speed = config.playback.defaultSpeed;
    const state = () => ({running, busy, speed, executable:canSimulate()!==false, time:runner?.time() || 0, horizon:runner?.horizon || getDiagram().run.horizonSec, done:Boolean(runner && runner.time() >= runner.horizon)});
    const notify = () => onState(state());
    function pause() { running = false; notify(); }
    function paint() { const view = runner?.view() || null; onView(view, runner?.compiled || null); notify(); if (view?.error) { pause(); throw Error(view.error); } }
    async function clear() {
      generation++; running = false; busy = false; const prior = runner; runner = null; onView(null,null); notify();
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
      if(!view){records.close();faultDialog?.close();faultBody?.replaceChildren();}
      if(!view || view.t-lastRecordsTime>=.2 || !controller.state().running){lastRecordsTime=view?.t || 0;renderNodeRecords(projection);renderRecords(view);}
    };
    let acceptedComposition = null, faultDialog = null, faultBody = null;
    controller = createController({getDiagram:()=>model.diagram, config, canSimulate,
      createRunner:diagram=>{if(canSimulate?.()===false)throw Error('This is a requirements/design stage. Advance to an executable stage before simulating.');return root.SimulatteSystemDiagramRunner.create({diagram,library,config,kernels:root.SimulatteSystemDiagramKernels});},
      onView:(view,compiled)=>{compiledGraph=compiled;acceptedComposition=compiled?.composition || null;publish(view);},
      onState:state=>controls?.update(state),
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
    function faultForm(){
      faultBody.replaceChildren();
      const target=make('select'),type=make('select'),params=make('div'),feedback=make('p');target.className=type.className='wui-field';target.setAttribute('aria-label','Failure target');type.setAttribute('aria-label','Failure type');feedback.setAttribute('role','status');
      const targets=[...compiledGraph.nodes.map(n=>({kind:'node',id:n.id,label:n.label,kernel:n.kernel})),...compiledGraph.edges.map(e=>({kind:'edge',id:e.id,label:e.id})),...compiledGraph.groups.filter(g=>['zone','region'].includes(g.kind)).map(g=>({kind:'group',id:g.id,label:g.label}))];
      for(const row of targets){const o=make('option',`${row.kind}: ${row.label}`);o.value=`${row.kind}:${row.id}`;target.append(o);}
      let readers=[];
      const selected=()=>targets.find(row=>`${row.kind}:${row.id}`===target.value);
      function parameters(){params.replaceChildren();readers=[];const spec=library.faultTypes.find(f=>f.id===type.value);for(const [key,def]of Object.entries(spec?.params||{})){
        const label=make('label',def.label||key),input=make(def.type==='enum'?'select':'input');input.className='wui-field';input.setAttribute('aria-label',def.label||key);
        if(def.type==='enum'){for(const v of def.options){const o=make('option',v);o.value=v;input.append(o);}input.value=def.default;}
        else if(def.type==='boolean'){input.type='checkbox';input.checked=def.default;}
        else{input.type='number';input.min=def.min;input.max=def.max;input.step=def.type==='integer'?'1':'any';input.value=def.default;}
        readers.push(()=>{const parsed=root.SimulatteSystemDiagramInspector.parseParam(def,def.type==='boolean'?input.checked:input.value);if(!parsed.ok)throw Error(`${key}: ${parsed.error}`);return [key,parsed.value];});label.append(input);params.append(label);
      }}
      function types(){const t=selected();type.replaceChildren();for(const f of library.faultTypes.filter(f=>f.targets.includes(t.kind)&&(!t.kernel||library.kernels[t.kernel].faults.includes(f.id)))){const o=make('option',f.label);o.value=f.id;type.append(o);}parameters();}
      target.addEventListener('change',types);type.addEventListener('change',parameters);types();
      async function send(kind){try{const t=selected(),record=await controller.inject({kind,target:{kind:t.kind,id:t.id},...(kind==='fault'?{type:type.value,params:Object.fromEntries(readers.map(read=>read()))}:{})});feedback.textContent=`${kind==='fault'?'Injected':'Repaired'} at ${record.atSec.toFixed(2)} s · recorded for replay`;}catch(e){feedback.textContent=e.message;}}
      const inject=root.SimulatteWorldUI.SimButton({document:doc,label:'Inject fault',onAction:()=>send('fault')}).element,repair=root.SimulatteWorldUI.SimButton({document:doc,label:'Repair target',onAction:()=>send('repair')}).element;
      faultBody.append(target,type,params,inject,repair,feedback);root.SimulatteWorldUI.adoptTree(faultBody);
    }
    const failures=root.SimulatteWorldUI.SimButton({document:doc,label:'Failures',variant:'quiet',onAction:act(async()=>{if(!controller.view())await controller.step();if(!compiledGraph?.nodes.length)throw Error('Add executable components first');controller.pause();faultForm();faultDialog.showModal();})}).element;
    controls.addAction(failures);
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
    return {play:act(controller.play),pause:controller.pause,view:controller.view,controller,clear:controller.clear,refresh:()=>{lastRecordsTime=-Infinity;publish(controller.view());controls.update(controller.state());},
      dispose(){root.cancelAnimationFrame(frame);unsubscribe();doc.removeEventListener('keydown',keydown);root.removeEventListener('pagehide',hide);controls.dispose();records.remove();faultDialog.remove();return controller.clear();}};
  }
  return Object.freeze({create,createController,operationOf,requestRoute,structuredResults});
});
