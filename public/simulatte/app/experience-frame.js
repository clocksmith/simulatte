(function attachExperienceFrame(root){
  'use strict';
  const q=(selector,host=document)=>host.querySelector(selector);
  const ui=()=>{if(!root.SimulatteWorldUI)throw Error('World UI must load before the simulation frame');return root.SimulatteWorldUI;};
  const advancedSheets=new WeakMap();
  function button(label,action){return ui().SimButton({label,variant:'secondary',onAction:action}).element;}
  function cameraMenu(group){const content=document.createElement('div');content.append(group);return ui().SimMenu({label:'Camera',content}).element;}
  function speedControl(select){return select;}
  function advanced(contents){
    const sheet=document.createElement('section'),heading=document.createElement('header'),title=document.createElement('h2');
    title.textContent='Controls and evidence';title.className='wui-title';heading.className='wui-sheet-heading';
    const close=ui().SimButton({label:'×',ariaLabel:'Close menu',variant:'icon'}).element;
    heading.append(title,close);sheet.append(heading,...contents.filter(Boolean));document.body.append(sheet);
    const trigger=ui().SimButton({label:'•••',ariaLabel:'Menu: controls and evidence',variant:'icon'}).element;
    advancedSheets.set(trigger,ui().SimSheet({element:sheet,trigger,closeButton:close}));return trigger;
  }
  function mount({host,stage,title,camera,reset,play,restart,replay,speed,advanced:trigger,sheetElement,closeButton,backdrop,context=[],status,legacy=[]}){
    if(!host||!stage||!camera||!reset||!play)throw Error('experience_frame_nodes_missing');
    const controls=ui(),doc=host.ownerDocument;
    doc.body.dataset.experienceUi='shared';doc.body.dataset.worldUi='true';doc.body.classList.add('sim-app','wui-root');
    const header=doc.createElement('header');header.className='experience-frame__header';
    const home=doc.createElement('a');home.href='/';home.textContent='Simulations';controls.SimButton({element:home,variant:'quiet'});
    const heading=typeof title==='string'?doc.createElement('h1'):title;if(typeof title==='string')heading.textContent=title;heading.classList.add('wui-title');
    const statusNode=status||doc.createElement('span');statusNode.classList.add('wui-status');if(!status)statusNode.textContent='Preparing';
    controls.SimButton({element:trigger,label:'•••',ariaLabel:'Menu: controls and evidence',variant:'icon'});
    header.append(home,heading,statusNode,trigger);
    let sheet=advancedSheets.get(trigger);
    if(!sheet){
      if(!sheetElement)throw Error('A simulation must supply its settings sheet');
      if(closeButton)controls.SimButton({element:closeButton,label:'×',ariaLabel:'Close menu',variant:'icon'});
      sheet=controls.SimSheet({element:sheetElement,trigger,closeButton,backdrop,externalTrigger:true});
      const titleRow=sheetElement.querySelector('header,.advanced-sheet-header,.dialog-heading');
      titleRow?.classList.add('wui-sheet-heading');titleRow?.querySelector('h2,strong')?.classList.add('wui-title');
    }
    const appearance=controls.SimButton({label:'Appearance',variant:'quiet',onAction:()=>{root.SimulatteTheme.cyclePreference();root.dispatchEvent(new Event('experience-appearance'));}}).element;
    const secondary=doc.createElement('section');secondary.className='experience-frame__secondary';
    const reproduction=doc.createElement('div');reproduction.className='wui-control-row';
    if(restart){controls.SimButton({element:restart,label:'Restart',variant:'secondary'});restart.dataset.frameControl='restart';reproduction.append(restart);}
    if(replay){controls.SimButton({element:replay,label:'Replay',variant:'secondary'});replay.dataset.frameControl='replay';reproduction.append(replay);}
    secondary.append(reproduction,appearance);sheet.element.firstElementChild?.after(secondary);
    trigger.dataset.frameControl='advanced';
    const cameraUi=controls.SimMenu({element:camera,label:'Camera'});cameraUi.trigger.textContent='Camera';cameraUi.trigger.dataset.frameControl='camera';
    cameraUi.element.classList.add('experience-camera-menu');cameraUi.content.querySelectorAll('fieldset,.camera-modes').forEach(el=>el.classList.add('wui-choice-group'));
    controls.SimButton({element:reset,label:'Reset view',variant:'quiet'});reset.dataset.frameControl='reset';
    if(play.tagName==='BUTTON')controls.SimButton({element:play,variant:'quiet'});else play.querySelectorAll('button').forEach(element=>controls.SimButton({element,variant:'quiet'}));
    play.dataset.frameControl='play';play.classList.add('experience-frame__play-source');
    const speedMenu=controls.menuFromSelect(speed,'Speed');speedMenu.trigger.dataset.frameControl='speed';
    const toolbar=controls.SimDock({children:[play,speedMenu.element],label:'Playback'});toolbar.classList.add('experience-frame__play-dock');
    const viewDock=controls.SimDock({children:[cameraUi.element,reset],label:'View'});viewDock.classList.add('experience-frame__view-dock');
    const notes=doc.createElement('section');notes.className='experience-frame__context';notes.setAttribute('aria-label','Measurements and object actions');
    for(const el of context)if(el)notes.append(el);
    const storage=doc.createElement('div');storage.hidden=true;storage.className='experience-frame__legacy';storage.append(speed);
    for(const el of legacy)if(el&&!header.contains(el)&&!toolbar.contains(el)&&!stage.contains(el)&&!notes.contains(el))storage.append(el);
    const old=[...host.children];host.classList.add('experience-frame');stage.classList.add('experience-frame__stage');
    host.replaceChildren(header,stage,notes,storage);stage.append(toolbar,viewDock);
    for(const el of old)if(!host.contains(el))storage.append(el);
    // DOM listeners and field identities stay with their domain owners. The
    // component library exclusively owns control presentation and menu behavior.
    const disposeControls=controls.adoptTree(doc.body);
    const nativeSheets=[...doc.querySelectorAll('dialog')].map(element=>controls.getSheet(element)||controls.SimSheet({element,label:element.getAttribute('aria-label')||'Details',externalTrigger:true}));
    const mobile=matchMedia('(max-width:700px)');
    function arrange(){
      const active=doc.activeElement;
      if(mobile.matches){toolbar.append(cameraUi.element);cameraUi.content.append(reset);secondary.append(speedMenu.element);}
      else{viewDock.prepend(cameraUi.element);viewDock.append(reset);play.after(speedMenu.element);}
      if(active?.isConnected)active.focus({preventScroll:true});
    }
    mobile.addEventListener('change',arrange);arrange();
    let disposed=false,animation,lastSync=0;
    function refresh(){
      if(performance.now()-lastSync>150){speedMenu.sync();statusNode.dataset.live=String(statusNode.textContent==='Running');lastSync=performance.now();}
      const inspector=stage.querySelector('[data-wui=inspector]'),canvas=stage.querySelector('canvas');
      if(inspector){
        const api=controls.getInspector(inspector);
        if(api?.selector&&api.selector.parentElement===inspector){
          const label=doc.createElement('label');label.className='wui-control-label';label.textContent='Inspect an object';label.append(api.selector);secondary.append(label);
          api.selector.addEventListener('change',()=>{sheet.close();requestAnimationFrame(()=>(inspector.querySelector('[data-object-action]')||inspector).focus({preventScroll:true}));});
        }
        if(!inspector.hidden&&api?.position)api.position(stage,canvas?.__simulatteObjectTargets?.().find(t=>t.id===api.selector?.value));
      }
      if(!disposed)animation=requestAnimationFrame(refresh);
    }
    animation=requestAnimationFrame(refresh);
    root.addEventListener('pagehide',()=>{disposed=true;cancelAnimationFrame(animation);mobile.removeEventListener('change',arrange);disposeControls();cameraUi.dispose();speedMenu.dispose();sheet.dispose();nativeSheets.forEach(s=>{if(s!==sheet)s.dispose();});},{once:true});
    return Object.freeze({host,stage,notes,header,toolbar,storage,secondary,sheet,camera:cameraUi,status:statusNode});
  }
  function zoom(stage,act){
    const controls=ui(),group=controls.SimDock({label:'Zoom'}),error=document.createElement('span');error.setAttribute('role','status');
    let available=false,pending=false,canZoom=()=>true;
    const update=()=>{out.disabled=!available||pending||!canZoom(1.12);inside.disabled=!available||pending||!canZoom(1/1.12);};
    const apply=async factor=>{if(!available||pending)return;pending=true;update();try{await act(factor);error.textContent='';}catch(failure){error.textContent=failure.message;throw failure;}finally{pending=false;update();}};
    const out=controls.SimButton({label:'−',ariaLabel:'Zoom out',variant:'icon',onAction:()=>apply(1.12)}).element;
    const inside=controls.SimButton({label:'+',ariaLabel:'Zoom in',variant:'icon',onAction:()=>apply(1/1.12)}).element;
    group.append(out,inside,error);stage.querySelector('.experience-camera-menu .wui-menu-content').append(group);update();
    return Object.freeze({setAvailable:(value,predicate=()=>true)=>{available=Boolean(value);canZoom=predicate;update();}});
  }
  root.SimulatteExperienceFrame=Object.freeze({mount,button,cameraMenu,speedControl,advanced,zoom,q});
})(globalThis);
