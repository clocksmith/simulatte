(function attachGpuScene(root) {
  'use strict';
  function mount() {
    const doc=root.document, ui=root.SimulatteWorldUI, q=s=>doc.querySelector(s);
    if(!ui)throw Error('GPU scene requires shared World UI');
    const host=q('.simulation-stage'),stage=q('.canvas-shell'),canvas=q('#overlay-canvas'),drawer=q('#decisions-drawer');
    doc.body.dataset.experienceUi='gpu-scene';doc.body.dataset.worldUi='true';doc.body.classList.add('wui-root');
    const node=(tag,cls,text)=>{const el=doc.createElement(tag);el.className=cls||'';if(text)el.textContent=text;return el;};
    const error=node('p','wui-error');error.setAttribute('role','status');
    const command=async(id,value)=>{try{if(!root.SimulatteActiveSession)throw Error('Simulation is preparing');const result=await root.SimulatteActiveSession.invoke(id,value);error.textContent='';return result;}catch(e){error.textContent=e.message;throw e;}};
    const header=node('header','gpu-scene__header'),home=node('a','gpu-scene__home','Simulations'),title=node('h1','wui-title','GPU Cluster'),status=node('span','wui-status','Preparing');home.href='/';
    ui.SimButton({element:home,variant:'quiet'});
    const overflow=ui.SimButton({element:q('#decisions-button'),label:'•••',ariaLabel:'Menu: controls and evidence',variant:'icon'}).element;
    header.append(home,title,status,overflow);
    const playback=node('div','gpu-scene__playback');
    for(const id of ['start-button','pause-button','resume-button'])playback.append(ui.SimButton({element:q('#'+id),variant:'quiet'}).element);
    const speedSelect=q('#playback-speed'),speedMenu=ui.menuFromSelect(speedSelect,'Speed'),clock=node('output','wui-clock','00:00');clock.setAttribute('aria-label','Simulation time');
    const playDock=ui.SimDock({children:[playback,speedMenu.element,clock],label:'Playback'});playDock.classList.add('gpu-scene__play-dock');
    const camera=ui.SimMenu({element:q('#camera-menu'),label:'Camera'});
    for(const group of camera.content.querySelectorAll('.camera-modes'))group.classList.add('wui-choice-group');
    const reset=ui.SimButton({element:q('#camera-reset'),label:'Reset view',variant:'quiet'}).element;
    const cameraDock=ui.SimDock({children:[camera.element,reset],label:'View'});cameraDock.classList.add('gpu-scene__camera-dock');
    const selectedAction=ui.SimButton({label:'Inspect',variant:'quiet',onAction:()=>{const control=q('[data-wui="inspector"] [data-object-action]');if(control)control.click();else sheet.open();}}).element;
    const mobileControls=node('div','gpu-scene__mobile-controls');mobileControls.append(selectedAction);playDock.append(mobileControls);
    const mobileQuery=matchMedia('(max-width:700px)');
    const metrics=node('section','wui-metrics');metrics.setAttribute('aria-label','Executed measurements');
    const metricSlots=new Map();
    const storage=node('div');storage.hidden=true;
    const old=[...host.children];host.classList.add('gpu-scene');stage.classList.add('gpu-scene__stage');
    stage.dataset.inspectorFields='task,work,waiting-for,blocking';
    stage.presentInspection=input=>{
      const object=input.objects.find(o=>o.id===input.selectedId);
      return {...input,fields:input.fields.map(f=>f.id==='blocking'?{...f,label:'Blocking',value:object?.relatedIds?.length||0,unit:'racks'}:f.id==='work'?{...f,label:'Progress',unit:'%'}:f.id==='waiting-for'?{...f,label:'Waiting on'}:f)};
    };
    host.replaceChildren(header,stage,metrics,error,storage);
    for(const el of old)if(!host.contains(el))storage.append(el);
    stage.append(playDock,cameraDock);storage.append(speedSelect);
    const close=ui.SimButton({element:q('#decisions-close'),variant:'icon',ariaLabel:'Close menu',label:'×'}).element;
    drawer.querySelector('header').classList.add('wui-sheet-heading');
    drawer.querySelector('strong').classList.add('wui-title');drawer.querySelector('strong').textContent='Controls and evidence';
    const sheet=ui.SimSheet({element:drawer,trigger:overflow,closeButton:close,backdrop:q('#decisions-backdrop'),externalTrigger:true});
    const restart=ui.SimButton({label:'Restart',variant:'secondary',onAction:()=>command('restart')}).element;
    const replay=ui.SimButton({label:'Replay',variant:'secondary',onAction:()=>command('replay')}).element;
    restart.dataset.sceneCommand='restart';replay.dataset.sceneCommand='replay';
    const actions=node('div','wui-control-row');actions.append(restart,replay);
    const selectLabel=node('label','wui-control-label','Inspect a rack');
    const appearance=ui.SimButton({label:'Appearance',variant:'quiet',onAction:()=>root.SimulatteTheme.cyclePreference()}).element;
    const secondary=node('section','gpu-scene__secondary');secondary.append(actions,selectLabel,appearance);drawer.querySelector('header').after(secondary);
    const arrangeCamera=()=>{const active=doc.activeElement;if(mobileQuery.matches){mobileControls.prepend(camera.element);camera.content.append(reset);secondary.append(speedMenu.element);}else{cameraDock.prepend(camera.element);cameraDock.append(reset);playback.after(speedMenu.element);}if(active?.isConnected)active.focus({preventScroll:true});};
    mobileQuery.addEventListener('change',arrangeCamera);arrangeCamera();
    const context=q('#experience-readouts-context');drawer.append(ui.SimDisclosure({title:'Measurements and model limits',children:[context,q('#show-measurements').closest('label')]}));
    const configuration=q('#plugin-inspector');q('#scene-actions').before(ui.SimDisclosure({title:'Configuration and evidence',children:[configuration]}));
    const runtime=q('#runtime-details');runtime.hidden=false;runtime.className='wui-sheet-section';q('#runtime-details-close').hidden=true;drawer.append(ui.SimDisclosure({title:'Runtime details',children:[runtime]}));storage.append(q('#runtime-toggle'));
    const disposeControls=ui.adoptTree(drawer),disposeCamera=ui.adoptTree(camera.content);
    let inspector,opened=false,interacted=false,disposed=false;
    stage.addEventListener('pointerdown',()=>{interacted=true;},{once:true});
    function refresh(){
      if(disposed)return;
      const element=stage.querySelector('[data-wui="inspector"]');
      if(element&&!inspector){
        inspector=ui.getInspector(element);inspector.selector.setAttribute('aria-label','Inspect a rack');selectLabel.append(inspector.selector);
        inspector.selector.addEventListener('change',()=>{sheet.close();requestAnimationFrame(()=>{(element.querySelector('[data-object-action]')||element).focus({preventScroll:true});});});
        element.querySelector('[aria-label="Close inspector"]').addEventListener('click',()=>canvas.focus({preventScroll:true}));
      }
      const session=root.SimulatteActiveSession?.snapshot();
      if(!opened&&inspector&&session?.preparation==='ready'){opened=true;if(!interacted)void command('select-object',null);}
      status.textContent=session?.visibleStatus||'Preparing';status.dataset.live=String(session?.execution==='running');
      for(const [button,id]of [[restart,'restart'],[replay,'replay']])button.disabled=!session?.operations.some(op=>op.id===id&&op.available);
      const contribution=root.__simulattePluginPlatformV4?.contributions.find(c=>c.pluginId==='gpu-supercluster');
      const time=contribution?.state?.simulationTimeMs;
      if(Number.isFinite(time)){const seconds=Math.floor(time/1000);clock.textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;clock.title=`${time.toFixed(2)} ms of simulation time`;}
      for(const row of q('#experience-summary-stats').children){
        const subject=row.dataset.measureLabel;if(!subject)continue;
        let metric=metricSlots.get(subject);if(!metric){metric=ui.SimMetric();metricSlots.set(subject,metric);metrics.append(metric.element);}
        const raw=row.lastElementChild.textContent,match=/^([\d.,−-]+)\s*(.*)$/.exec(raw);
        metric.update({subject,value:match?match[1]:raw,unit:match?match[2]:'',timeBasis:Number.isFinite(time)?`0–${time.toFixed(1)} ms`:'Interval pending',freshness:session?.execution==='failed'?'stale':Number.isFinite(time)?'current':'pending',validity:Number.isFinite(time)?'modeled':'unavailable',level:subject==='Productive compute share'?'governing':'supporting'});
        metric.element.title=row.dataset.definition;
      }
      const action=element?.querySelector('[data-object-action]');selectedAction.textContent=action?.textContent||'Inspect';selectedAction.disabled=Boolean(action?.disabled);speedMenu.sync();
    }
    function position(){if(inspector&&!inspector.element.hidden)inspector.position(stage,canvas.__simulatteObjectTargets?.().find(t=>t.id===inspector.selector.value));}
    let animation;function frame(){position();if(!disposed)animation=requestAnimationFrame(frame);}
    const timer=setInterval(refresh,150);refresh();animation=requestAnimationFrame(frame);
    root.addEventListener('pagehide',()=>{disposed=true;clearInterval(timer);cancelAnimationFrame(animation);mobileQuery.removeEventListener('change',arrangeCamera);disposeControls();disposeCamera();camera.dispose();speedMenu.dispose();sheet.dispose();},{once:true});
  }
  root.SimulatteGpuScene=Object.freeze({mount});
})(globalThis);
