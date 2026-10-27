(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./diagram.js') : root.SimulatteSystemDiagramDocument);
  if (node) module.exports = api; else root.SimulatteSystemDiagramPlayback = api;
})(globalThis, function (D) {
  'use strict';
  function createController({getDiagram, createRunner, config, onView = ()=>{}, onState = ()=>{}}) {
    let runner = null, generation = 0, running = false, busy = false, speed = config.playback.defaultSpeed;
    const state = () => ({running, busy, speed, time:runner?.time() || 0, horizon:runner?.horizon || getDiagram().run.horizonSec, done:Boolean(runner && runner.time() >= runner.horizon)});
    const notify = () => onState(state());
    function pause() { running = false; notify(); }
    function paint() { const view = runner?.view() || null; onView(view, runner?.compiled || null); notify(); if (view?.error) { pause(); throw Error(view.error); } }
    async function clear() {
      generation++; running = false; busy = false; const prior = runner; runner = null; onView(null,null); notify();
      if (prior) await prior.dispose();
    }
    async function accept() {
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
      async verify() { if(!runner)throw Error('Simulate an architecture first');pause();return runner.verify(); },
    };
  }
  function create({host, model, canvas, library, config, message}) {
    const root = globalThis, doc = host.ownerDocument;
    let controls, controller, compiledGraph = null, lastRecordsTime = -Infinity;
    const make = (tag,text='')=>{const element=doc.createElement(tag);element.textContent=text;return element;};
    const records=make('dialog');records.className='lucyd-dialog simulation-records';records.setAttribute('aria-label','Simulation requests');
    const recordSummary=make('p'),recordList=make('div'),recordDetail=make('div');recordList.className='simulation-records-list';
    const close=root.SimulatteWorldUI.SimButton({document:doc,label:'Close',onAction:()=>records.close()}).element;
    records.append(make('h2','Simulation requests'),recordSummary,recordList,recordDetail,close);host.append(records);
    let requestId=null;
    function renderRecords(view) {
      if(!view){requestId=null;recordSummary.textContent='Simulate an architecture to observe requests.';recordList.replaceChildren();recordDetail.replaceChildren();return;}
      if(!records.open)return;
      recordSummary.textContent=`${view.global.completed} completed · ${view.global.failed} failed · ${view.global.inFlight} in flight`;
      recordList.replaceChildren();
      for(const request of view.requests.slice(-25)){
        const label=`${request.id} · ${request.input.fields?.operation?.action || request.payloadType} · ${request.status}${request.err ? ` (${request.err})` : ''}`;
        const action=root.SimulatteWorldUI.SimButton({document:doc,label,variant:'quiet',onAction:()=>{requestId=request.id;renderRecords(controller.view());}}).element;
        recordList.append(action);
      }
      recordDetail.replaceChildren();
      if(requestId){const trace=controller.inspect(requestId);if(trace){recordDetail.append(make('h3',`Request ${requestId}`));for(const attempt of trace.attempts){const node=compiledGraph?.nodes.find(n=>n.id===attempt.nodeId);recordDetail.append(make('p',`${attempt.startedAt.toFixed(2)}s · ${node?.label || attempt.nodeId} · ${attempt.status}${attempt.err ? `: ${attempt.err}` : ''}`));}}}
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
        for(const row of rows.slice(0,20))body.append(make('p',Object.entries(row).map(([k,v])=>`${k}: ${Array.isArray(v) ? `${v.length} entries` : v && typeof v==='object' ? 'record' : v}`).join(' · ')));
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
      if(output && info)output.textContent=`${info.health} · ${info.queue} queued`;
      if(!view || view.t-lastRecordsTime>=.2 || !controller.state().running){lastRecordsTime=view?.t || 0;renderNodeRecords(projection);renderRecords(view);}
    };
    let acceptedComposition = null;
    controller = createController({getDiagram:()=>model.diagram, config,
      createRunner:diagram=>root.SimulatteSystemDiagramRunner.create({diagram,library,config,kernels:root.SimulatteSystemDiagramKernels}),
      onView:(view,compiled)=>{compiledGraph=compiled;acceptedComposition=compiled?.composition || null;publish(view);},
      onState:state=>controls?.update(state),
    });
    const act = action => async (...args) => { try { await action(...args); } catch(error) { controller.pause();message(error.message,true); } };
    controls = root.SimulatteSystemDiagramRunControls.create({host, config, idleLabel:'Simulate',
      onPlay:act(controller.play),onPause:controller.pause,onStep:act(controller.step),onRestart:act(controller.restart),onReplay:act(async()=>{await controller.restart();await controller.play();}),onSpeed:controller.setSpeed,
      onVerify:act(async()=>{const proof=await controller.verify();message(`Replay ${proof.status}` ,proof.status!=='match');}),
    });
    controls.update(controller.state());
    const requests=root.SimulatteWorldUI.SimButton({document:doc,label:'Requests',variant:'quiet',onAction:()=>{renderRecords(controller.view());records.showModal();renderRecords(controller.view());}}).element;
    controls.element.append(requests);
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
    return {play:act(controller.play),pause:controller.pause,view:controller.view,controller,refresh:()=>{lastRecordsTime=-Infinity;publish(controller.view());},
      dispose(){root.cancelAnimationFrame(frame);unsubscribe();doc.removeEventListener('keydown',keydown);root.removeEventListener('pagehide',hide);controls.dispose();records.remove();return controller.clear();}};
  }
  return Object.freeze({create,createController});
});
