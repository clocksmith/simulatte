(function attachExperienceFrame(root){
  'use strict';
  const q=(selector,host=document)=>host.querySelector(selector);
  function button(label,action){const b=document.createElement('button');b.type='button';b.textContent=label;if(action)b.addEventListener('click',action);return b;}
  function menu(label,content){const d=document.createElement('details'),s=document.createElement('summary');s.textContent=label;d.append(s,content);return d;}
  function mount({host,stage,title,camera,reset,play,restart,replay,speed,advanced,context=[],status,legacy=[]}){
    if(!host||!stage||!camera||!reset||!play)throw Error('experience_frame_nodes_missing');
    document.body.dataset.experienceUi='unified';document.body.classList.add('sim-app');
    const header=document.createElement('header');header.className='experience-frame__header';
    const home=document.createElement('a');home.href='/';home.textContent='Simulations';
    const heading=typeof title==='string'?document.createElement('h1'):title;if(typeof title==='string')heading.textContent=title;
    const appearance=button('Appearance',()=>{root.SimulatteTheme.cyclePreference();root.dispatchEvent(new Event('experience-appearance'));});appearance.setAttribute('aria-label','Change appearance');
    const statusNode=status||document.createElement('span');statusNode.classList.add('experience-frame__status');if(!status)statusNode.textContent='Loading';header.append(home,heading,appearance,statusNode);
    const toolbar=document.createElement('nav');toolbar.className='experience-frame__toolbar';toolbar.setAttribute('aria-label','Simulation controls');
    const slots={camera,reset,play,restart,replay,speed,advanced};
    for(const [name,node]of Object.entries(slots)){
      const slot=document.createElement('div');slot.className='experience-frame__'+name;slot.dataset.frameControl=name;
      if(node)slot.append(node);toolbar.append(slot);
    }
    camera.classList.add('experience-camera-menu');camera.querySelector('summary').textContent='Camera';
    for(const control of toolbar.querySelectorAll('button,summary,select'))Object.assign(control.style,{height:'44px',minHeight:'44px',fontFamily:'var(--sim-font)',fontSize:'var(--experience-control-font)',padding:'var(--experience-control-padding)',borderRadius:'6px'});
    reset.textContent='Reset view';reset.setAttribute('aria-label','Reset view');reset.title='Reset view';if(restart)restart.textContent='Restart';if(replay)replay.textContent='Replay';
    stage.classList.add('experience-frame__stage');stage.style.height='var(--experience-canvas-height)';stage.style.minHeight='0';stage.style.width='100%';stage.style.aspectRatio='auto';
    const notes=document.createElement('section');notes.className='experience-frame__context';notes.setAttribute('aria-label','Measurements and object actions');
    for(const node of context)if(node)notes.append(node);
    const storage=document.createElement('div');storage.hidden=true;storage.className='experience-frame__legacy';
    for(const node of legacy)if(node&&!header.contains(node)&&!toolbar.contains(node)&&!stage.contains(node)&&!notes.contains(node))storage.append(node);
    const oldChildren=[...host.children];host.classList.add('experience-frame');host.style.display='flex';host.style.flexDirection='column';
    host.replaceChildren(header,toolbar,stage,notes,storage);
    for(const node of oldChildren)if(!host.contains(node))storage.append(node);
    const inspectorObserver=new MutationObserver(()=>{
      for(const node of stage.querySelectorAll('.sim-object-inspector'))notes.append(node);
    });inspectorObserver.observe(stage,{childList:true,subtree:true});
    for(const node of stage.querySelectorAll('.sim-object-inspector'))notes.append(node);
    host.addEventListener('click',event=>{if(event.target.closest('#focus-selection,#focus-observer,[data-object-action=focus]'))stage.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});
    root.addEventListener('pagehide',()=>inspectorObserver.disconnect(),{once:true});
    camera.addEventListener('click',event=>{if(event.target.closest('button')&&!event.target.closest('[data-keep-camera-open]'))camera.open=false;});
    return Object.freeze({host,stage,notes,header,toolbar,storage,status:statusNode});
  }
  function advanced(contents){
    const dialog=document.createElement('dialog');dialog.className='experience-advanced';dialog.setAttribute('aria-label','Advanced');
    const heading=document.createElement('header'),title=document.createElement('h2');title.textContent='Advanced';const close=button('Close',()=>dialog.close());heading.append(title,close);dialog.append(heading,...contents.filter(Boolean));document.body.append(dialog);
    const trigger=button('Advanced',()=>dialog.showModal());trigger.setAttribute('aria-haspopup','dialog');dialog.addEventListener('close',()=>trigger.focus({preventScroll:true}));return trigger;
  }
  function cameraMenu(content){return menu('Camera',content);}
  function speedControl(select){const previous=select.closest('label');if(previous)previous.dataset.frameRelocated='true';const label=document.createElement('label');label.textContent='Speed';label.append(select);return label;}
  function zoom(stage,act){
    const controls=document.createElement('div');controls.className='experience-frame__zoom';controls.setAttribute('aria-label','Zoom');
    let available=false,pending=false,canZoom=()=>true;
    const error=document.createElement('span');error.setAttribute('role','status');
    const update=()=>{out.disabled=!available||pending||!canZoom(1.12);inside.disabled=!available||pending||!canZoom(1/1.12);};
    const apply=async factor=>{
      if(!available||pending)return;
      pending=true;update();
      try{await act(factor);error.textContent='';}catch(failure){error.textContent=failure.message;}
      finally{pending=false;update();}
    };
    const out=button('−',()=>void apply(1.12)),inside=button('+',()=>void apply(1/1.12));out.setAttribute('aria-label','Zoom out');inside.setAttribute('aria-label','Zoom in');controls.append(out,inside,error);stage.append(controls);update();
    return Object.freeze({setAvailable:(value,predicate=()=>true)=>{available=Boolean(value);canZoom=predicate;update();}});
  }
  root.SimulatteExperienceFrame=Object.freeze({mount,button,cameraMenu,speedControl,advanced,zoom,q});
})(globalThis);
