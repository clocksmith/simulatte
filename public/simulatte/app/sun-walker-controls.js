(function(root) {
  'use strict';
  function create({host, session}) {
    const events=new AbortController();
    const panel=document.createElement('section');panel.className='sun-walk-controls';panel.setAttribute('aria-label','Plan your walk');
    panel.innerHTML=`<form class="sun-walk-endpoints">
      <label>From (A)<select name="originPlace" aria-label="Starting point"></select></label>
      <label>To (B)<select name="destinationPlace" aria-label="Destination"></select></label>
      <button class="sim-action" type="submit">Update walk</button>
    </form><div class="sun-walk-routes" role="group" aria-label="Choose a route">
      <button class="sim-action" type="button" data-walk-weight="100"><strong>More shade</strong><span data-route-stats="shade-choice"></span></button>
      <button class="sim-action" type="button" data-walk-weight="0"><strong>Shortest walk</strong><span data-route-stats="fastest"></span></button>
    </div><div class="sun-walk-views" role="group" aria-label="Follow the walker">
      <span>View</span><button class="sim-action" type="button" data-walk-camera="overview">Whole route</button>
      <button class="sim-action" type="button" data-walk-camera="follow">Top-down follow</button>
      <button class="sim-action" type="button" data-walk-camera="pov">First person</button>
    </div><p class="sun-walk-note">Predicted whole-route exposure · modeled buildings and declared canopy</p><p data-walk-message role="status" hidden></p>`;
    host.before(panel);
    const form=panel.querySelector('form'),message=panel.querySelector('[data-walk-message]');
    let controls=[],dirty=false,busy=false;
    const on=(node,type,fn)=>node.addEventListener(type,fn,{signal:events.signal});
    function say(text){message.hidden=!text;message.textContent=text;}
    function setBusy(value){busy=value;for(const e of panel.querySelectorAll('button,select'))e.disabled=value;panel.setAttribute('aria-busy',String(value));}
    async function apply(weight) {
      if(busy)return;
      const values=Object.fromEntries(controls.map(row=>[row.id,row.value]));
      values.originPlace=form.elements.originPlace.value;values.destinationPlace=form.elements.destinationPlace.value;
      if(values.originPlace===values.destinationPlace){say('Choose different starting and ending places.');return;}
      const endpointsChanged=controls.some(row=>['originPlace','destinationPlace'].includes(row.id)&&row.value!==values[row.id]);
      if(weight!==undefined)values.directSunWeight=weight;
      setBusy(true);say('Calculating routes…');
      try {await session.invoke('apply-controls',values);dirty=false;if(endpointsChanged)await session.invoke('camera','overview');say('');}
      catch(error){say(error.message);}
      finally{setBusy(false);}
    }
    on(form,'change',()=>{dirty=true;});on(form,'submit',event=>{event.preventDefault();void apply();});
    for(const button of panel.querySelectorAll('[data-walk-weight]'))on(button,'click',()=>void apply(Number(button.dataset.walkWeight)));
    for(const button of panel.querySelectorAll('[data-walk-camera]'))on(button,'click',()=>{
      void session.invoke('camera',button.dataset.walkCamera).then(()=>updateCamera()).catch(error=>say(error.message));
    });
    function updateCamera(){
      const mode=document.getElementById('autonomy-canvas').dataset.cameraMode;
      for(const button of panel.querySelectorAll('[data-walk-camera]'))button.setAttribute('aria-pressed',String(mode===button.dataset.walkCamera));
    }
    function update(contribution){
      controls=contribution.controls.controls;
      for(const id of ['originPlace','destinationPlace']){
        const control=controls.find(row=>row.id===id);if(!control)continue;
        const select=form.elements[id];
        if(!select.options.length)for(const option of control.options){const node=document.createElement('option');node.value=option.value;node.textContent=option.label;select.append(node);}
        if(!dirty)select.value=control.value;
      }
      const fields=contribution.inspections.find(row=>row.id==='sun-route-comparison')?.fields||[];
      const value=id=>fields.find(row=>row.id===id)?.value;
      for(const prefix of ['shade-choice','fastest']){
        const minutes=Number(value(prefix+'-time'))/60,shade=Number(value(prefix+'-shade-percent')),sun=Number(value(prefix+'-sun-percent')),unknown=Number(value(prefix+'-unknown')),night=Number(value(prefix+'-night'));
        panel.querySelector(`[data-route-stats="${prefix}"]`).textContent=`${minutes.toFixed(1)} min · ${Math.round(shade)}% shade · ${Math.round(sun)}% sun${unknown>0?` · ${Math.round(unknown/60/minutes*100)}% unknown`:''}${night>0?` · ${Math.round(night/60/minutes*100)}% night`:''}`;
      }
      const weight=controls.find(row=>row.id==='directSunWeight').value;
      for(const button of panel.querySelectorAll('[data-walk-weight]'))button.setAttribute('aria-pressed',String(Number(button.dataset.walkWeight)===weight));
      updateCamera();
    }
    return {update,dispose(){events.abort();panel.remove();}};
  }
  root.SimulatteSunWalkerControls={create};
})(globalThis);
