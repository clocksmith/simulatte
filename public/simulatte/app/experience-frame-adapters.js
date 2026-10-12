(function attachExperienceFrameAdapters(root){
  'use strict';
  function start(){
    const ui=root.SimulatteExperienceFrame,q=ui.q,body=document.body;
    if(body.dataset.experienceUi)return;
    const path=location.pathname.replace(/\/$/,'');
    const page=root.SimulattePublicRoutes?.forPath(path);
    const solar=Boolean(q('#viewport #scene')),field=Boolean(q('.experiments #baseline')),motorcycle=body.classList.contains('motorcycle-app');
    if(!solar&&!field&&!motorcycle&&!page)return;
    const keyboardZoom=(canvas,factor)=>{canvas.focus({preventScroll:true});canvas.dispatchEvent(new KeyboardEvent('keydown',{key:factor<1?'+':'-',bubbles:true,cancelable:true}));};
    let frame,refresh=()=>{};
    if(solar){
      const host=q('.visual-column'),stage=q('#viewport'),cameraButtons=document.createElement('div');cameraButtons.className='camera-modes';cameraButtons.setAttribute('role','radiogroup');cameraButtons.dataset.controlChoice='';cameraButtons.setAttribute('aria-label','Camera view');
      for(const mode of ['overview','top']){const b=ui.button(mode==='top'?'Top':'Overview',()=>root.SimulatteSolarDrive?.setCameraView(mode));b.dataset.cameraView=mode;b.setAttribute('aria-checked',String(mode==='overview'));cameraButtons.append(b);}
      root.SimulatteControlComponents.decorateGroup(cameraButtons);
      const inspector=q('.inspector');const advanced=ui.advanced([...inspector.querySelectorAll('.controls-section'),q('.model-notes'),q('.analysis-row'),q('#open-program'),q('#export')]);
      const title=document.createElement('h1');title.textContent='Solar Drive';
      frame=ui.mount({host,stage,title,camera:ui.cameraMenu(cameraButtons),reset:q('#reset-camera'),play:q('#run'),restart:q('#reset'),replay:q('#replay'),speed:ui.speedControl(q('#playback')),advanced,
        context:[q('.experience-switch'),q('#ride-summary'),q('.ride-action'),q('.readouts'),inspector,q('#assembly-tools'),q('.view-options'),q('.simulation-clock'),q('#playback-health')],legacy:[q('.scene-heading'),q('.transport')]});
      if(q('.masthead'))q('.masthead').hidden=true;
      if(q('.brand-bar'))q('.brand-bar').hidden=true;
      if(q('.brandbar'))q('.brandbar').hidden=true;
      ui.zoom(stage,factor=>keyboardZoom(q('#scene'),factor));
      refresh=()=>{const owner=root.SimulatteSolarDrive;if(owner){const state=owner.controlState();frame.status.textContent=state.failed?'Needs attention':state.complete?'Complete':state.running?'Running':'Paused';}for(const b of cameraButtons.children){b.disabled=!owner;b.setAttribute('aria-checked',String(owner?.cameraView()===b.dataset.cameraView));}};
    }else if(field){
      const host=q('main'),stage=q('.experiments'),views=q('#camera-views'),title=q('#title'),oldHeader=title.parentElement;
      const advancedDetails=q('main>details'),advanced=ui.advanced([advancedDetails]);advancedDetails.open=true;
      frame=ui.mount({host,stage,title,camera:ui.cameraMenu(views),reset:q('#reset-view'),play:q('#pause'),restart:q('#restart'),replay:q('#replay'),speed:ui.speedControl(q('#speed')),advanced,
        context:[q('#question'),q('#signal')?.closest('label'),q('#legend'),q('#measures'),q('main>aside'),q('#clock'),q('#playback-rate')?.parentElement,q('#status')],legacy:[q('.primary-toolbar')]});
      oldHeader.hidden=true;
      const branches=document.createElement('div');branches.className='camera-modes';branches.setAttribute('role','radiogroup');branches.dataset.controlChoice='';branches.setAttribute('aria-label','Comparison branch');
      for(const [id,label]of [['intervention','Selected experiment'],['baseline','Untouched baseline']]){const b=ui.button(label,()=>{stage.dataset.branch=id;for(const n of branches.children)n.setAttribute('aria-checked',String(n.dataset.branch===id));});b.dataset.branch=id;b.setAttribute('aria-checked',String(id==='intervention'));branches.append(b);}
      root.SimulatteControlComponents.decorateGroup(branches);frame.notes.prepend(branches);ui.zoom(stage,factor=>root.SimulatteFieldView?.zoom(factor));
      refresh=()=>{const state=root.__fieldExperimentState;frame.status.textContent=!state?'Loading':state.executionState==='failed'?'Needs attention':state.complete?'Complete':state.running?'Running':'Paused';const ready=Boolean(state);for(const b of views.querySelectorAll('button'))b.disabled=!ready||state.executionState==='failed';q('#pause').disabled=!ready&& !root.__fieldExperimentError;};
    }else if(motorcycle){
      const host=q('section.map'),stage=q('.canvas'),camera=q('#motorcycle-camera-menu'),oldToolbar=q('.city-toolbar');
      const layers=q('#live-overlay').closest('label');
      frame=ui.mount({host,stage,title:'Motorcycle Noise',camera,reset:q('#reset-view'),play:q('#pause'),restart:q('#reset'),replay:q('#replay-traffic'),speed:ui.speedControl(q('#playback')),advanced:q('#header-advanced'),
        context:[q('#motorcycle-location-menu'),q('#sound-controls'),q('#motorcycle-treatment-menu'),q('.observer-readout'),q('#inspection'),q('.map-legend'),q('#experience-status'),layers,q('#placement-prompt'),q('#camera-tracking')],legacy:[oldToolbar]});
      q('#advanced-sheet').classList.add('experience-advanced');
      const nav=q('#map-navigation');if(nav){nav.style.position='static';frame.notes.append(nav);}
      q('#map-touch-hint').hidden=true;
      refresh=()=>{const state=root.motorcycleRuntimeReceipt;frame.status.textContent=({running:'Running',paused:'Paused',failed:'Needs attention',recovering:'Recovering',loading:'Preparing'})[state?.state]||'Loading';};
      ui.zoom(stage,factor=>q(factor<1?'#map-zoom-in':'#map-zoom-out').click());
    }else{
      const host=q('.simulation-stage'),stage=q('.canvas-shell'),menu=q('#camera-menu'),controls=q('.camera-modes');
      for(const id of ['camera-bird','camera-top','camera-follow','camera-pov','camera-free','camera-compare'])controls.append(q('#'+id));
      const play=document.createElement('div');play.append(q('#start-button'),q('#pause-button'),q('#resume-button'));play.className='experience-frame__play-source';
      const invoke=id=>{const session=root.SimulatteActiveSession;if(session)return session.invoke(id).catch(e=>{error.textContent=e.message;});};
      const error=document.createElement('p');error.setAttribute('role','status');
      const restart=ui.button('Restart',()=>invoke('restart')),replay=ui.button('Replay',()=>invoke('replay'));
      frame=ui.mount({host,stage,title:page.displayName,camera:menu,reset:q('#camera-reset'),play,restart,replay,speed:ui.speedControl(q('#playback-speed')),advanced:q('#decisions-button'),
        context:[q('#experience-readouts'),q('#show-measurements').closest('label'),error],legacy:[q('.simulation-toolbar'),q('.simulation-viewbar')]});
      q('#decisions-drawer').classList.add('experience-advanced');if(q('#runtime-details'))frame.notes.append(q('#runtime-toggle'),q('#runtime-details'));
      ui.zoom(stage,factor=>keyboardZoom(q('#overlay-canvas').hidden?q('#autonomy-canvas'):q('#overlay-canvas'),factor));
      refresh=()=>{const s=root.SimulatteActiveSession?.snapshot();frame.status.textContent=s?.visibleStatus||'Loading';const ready=s&&s.preparation==='ready';for(const [b,id]of [[restart,'restart'],[replay,'replay']])b.disabled=!ready||!s.operations.some(op=>op.id===id&&op.available);const current=root.SimulattePublicRoutes.forPath(location.pathname);if(current&&frame.header.querySelector('h1').textContent!==current.displayName)frame.header.querySelector('h1').textContent=current.displayName;};
    }
    refresh();const timer=setInterval(refresh,200);
    root.addEventListener('pagehide',()=>{clearInterval(timer);},{once:true});
    root.__simulatteExperienceFrame={schema:'simulatte.experienceFrame.v1',stage:frame.stage,toolbar:frame.toolbar};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(globalThis);
