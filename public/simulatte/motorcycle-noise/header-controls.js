(function(){
  'use strict';
  const touchHint=document.getElementById('map-touch-hint');
  if(touchHint&&matchMedia('(pointer: coarse)').matches){
    touchHint.classList.add('is-visible');
    const dismissHint=()=>{
      touchHint.classList.remove('is-visible');
      setTimeout(()=>{touchHint.hidden=true;},250);
    };
    setTimeout(dismissHint,4500);
    document.getElementById('city').addEventListener('pointerdown',dismissHint,{once:true});
  }else if(touchHint)touchHint.hidden=true;
  const button=document.getElementById('header-advanced');
  const dialog=document.getElementById('advanced-sheet');
  const details=document.getElementById('advanced-settings');
  const closeButton=document.getElementById('advanced-close');
  if(!button||!dialog||!details||!closeButton)throw new Error('Missing advanced sheet controls');
  let previousFocus=null;
  function close(){
    if(dialog.open)dialog.close();
  }
  function open(){
    if(dialog.open)return;
    previousFocus=document.activeElement;
    details.open=true;
    dialog.showModal();
    button.setAttribute('aria-expanded','true');
    closeButton.focus({preventScroll:true});
  }
  button.addEventListener('click',()=>dialog.open?close():open());
  closeButton.addEventListener('click',close);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('close',()=>{
    details.open=false;
    button.setAttribute('aria-expanded','false');
    if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});
  });
  dialog.addEventListener('click',event=>{
    if(event.target===dialog){
      const rect=dialog.getBoundingClientRect();
      if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close();
    }
    if(event.target.closest('[data-place],#add-receiver'))close();
  });
  dialog.addEventListener('change',event=>{
    if(event.target.id==='place-marker'&&event.target.value)close();
  });
  const legacy=document.getElementById('advanced-entry');
  legacy?.addEventListener('click',event=>{event.preventDefault();open();});
  function decorate(node){
    if(node.nodeType!==1)return;
    for(const element of [node,...node.querySelectorAll('button,select,input[type="number"]')]){
      if(element.matches('button'))element.classList.add('sim-action');
      if(element.matches('select,input[type="number"]'))element.classList.add('sim-field');
    }
  }
  decorate(document.querySelector('main'));
  const audioMount=document.getElementById('sound-controls');
  audioMount.addEventListener('change',event=>{
    if(event.target.id==='traffic-sound'&&event.target.checked)audioMount.dataset.audioUsed='true';
  });
  const observer=new MutationObserver(records=>{
    for(const record of records)for(const node of record.addedNodes)decorate(node);
  });
  for(const id of ['sound-controls','placement-controls','treatment-controls-slot']){
    const mount=document.getElementById(id);
    if(mount)observer.observe(mount,{childList:true,subtree:true});
  }
  addEventListener('pagehide',()=>observer.disconnect(),{once:true});
})();
