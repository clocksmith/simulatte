(function(){
  'use strict';
  const toolbar=document.querySelector('.city-toolbar'),readout=document.querySelector('.observer-readout');
  const sizeObserver=new ResizeObserver(()=>{readout.style.top=(toolbar.getBoundingClientRect().bottom+8)+'px';});sizeObserver.observe(toolbar);
  addEventListener('pagehide',()=>sizeObserver.disconnect(),{once:true});
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
  const sheet=()=>{const value=globalThis.SimulatteWorldUI?.getSheet(dialog);if(!value)throw Error('Motorcycle settings require shared World UI');return value;};
  function close(){sheet().close();}
  function open(){details.open=true;sheet().open();}
  button.addEventListener('click',()=>dialog.open?close():open());
  closeButton.addEventListener('click',close);
  dialog.addEventListener('click',event=>{if(event.target.closest('[data-place],[data-add-treatment],#add-receiver'))close();});
  const legacy=document.getElementById('advanced-entry');
  legacy?.addEventListener('click',event=>{event.preventDefault();open();});
  const audioMount=document.getElementById('sound-controls');
  audioMount.addEventListener('change',event=>{
    if(event.target.id==='traffic-sound'&&event.target.checked)audioMount.dataset.audioUsed='true';
  });
})();
