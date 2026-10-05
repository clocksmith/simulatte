(function(root) {
  'use strict';
  function create({host, session}) {
    const events=new AbortController();
    const panel=document.createElement('section');panel.className='sun-walk-controls';panel.setAttribute('aria-label','Plan your walk');
    panel.innerHTML=`<form class="sun-walk-endpoints">
      <label>From (A)<select name="originPlace" aria-label="Starting point"></select></label>
      <label>To (B)<select name="destinationPlace" aria-label="Destination"></select></label>
      <button class="sim-action" type="submit">Update walk</button>
    </form><label class="sun-walk-preference"><span>Time versus shade <output data-walk-preference-label>Balanced</output></span>
      <input type="range" min="0" max="100" step="1" value="50" aria-label="Time versus shade">
      <span><span>Shortest walk</span><span>Prefer shade</span></span>
    </label><div class="sun-walk-routes" role="group" aria-label="Route comparison">
      <div class="sun-walk-route"><strong>Shortest walk</strong><span data-route-stats="fastest"></span></div>
      <div class="sun-walk-route"><strong>Your route</strong><span data-route-stats="chosen"></span></div>
    </div><p class="sun-walk-note" data-route-tradeoff></p><p class="sun-walk-note">Predicted whole-route exposure · modeled buildings and declared canopy</p><p data-walk-message role="status" hidden></p>`;
    host.before(panel);
    const form=panel.querySelector('form'),message=panel.querySelector('[data-walk-message]');
    const preference=panel.querySelector('input[type=range]');
    let controls=[],dirty=false,preferenceDirty=false,busy=false;
    const on=(node,type,fn)=>node.addEventListener(type,fn,{signal:events.signal});
    function say(text){message.hidden=!text;message.textContent=text;}
    function setBusy(value){busy=value;for(const e of panel.querySelectorAll('button,select,input'))e.disabled=value;panel.setAttribute('aria-busy',String(value));}
    async function apply(weight) {
      if(busy)return;
      const values=Object.fromEntries(controls.map(row=>[row.id,row.value]));
      values.originPlace=form.elements.originPlace.value;values.destinationPlace=form.elements.destinationPlace.value;
      if(values.originPlace===values.destinationPlace){say('Choose different starting and ending places.');return;}
      const endpointsChanged=controls.some(row=>['originPlace','destinationPlace'].includes(row.id)&&row.value!==values[row.id]);
      values.directSunWeight=weight??Math.min(100,Number(preference.value)/Math.max(1,100-Number(preference.value)));
      setBusy(true);say('Calculating routes…');
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      try {await session.invoke('apply-controls',values);dirty=false;preferenceDirty=false;if(endpointsChanged)await session.invoke('camera','overview');say('');}
      catch(error){say(error.message);}
      finally{setBusy(false);}
    }
    on(form,'change',()=>{dirty=true;});on(form,'submit',event=>{event.preventDefault();void apply();});
    function showPreference(){const p=Number(preference.value);panel.querySelector('[data-walk-preference-label]').textContent=p===0?'Shortest walk':p===100?'Strongest shade preference':p===50?'Balanced':p<50?'Prefer time':'Prefer shade';}
    on(preference,'input',()=>{preferenceDirty=true;showPreference();});
    on(preference,'change',()=>void apply());
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
      for(const prefix of ['chosen','fastest']){
        const minutes=Number(value(prefix+'-time'))/60,shade=Number(value(prefix+'-shade-percent')),sun=Number(value(prefix+'-sun-percent')),unknown=Number(value(prefix+'-unknown')),night=Number(value(prefix+'-night'));
        panel.querySelector(`[data-route-stats="${prefix}"]`).textContent=`${minutes.toFixed(1)} min · ${Math.round(shade)}% shade · ${Math.round(sun)}% sun${unknown>0?` · ${Math.round(unknown/60/minutes*100)}% unknown`:''}${night>0?` · ${Math.round(night/60/minutes*100)}% night`:''}`;
      }
      const weight=controls.find(row=>row.id==='directSunWeight').value;
      if(!preferenceDirty){preference.value=weight>=100?100:Math.round(100*weight/(1+weight));showPreference();}
      const extra=(Number(value('chosen-time'))-Number(value('fastest-time')))/60;
      const saved=(Number(value('fastest-sun'))-Number(value('chosen-sun')))/60;
      panel.querySelector('[data-route-tradeoff]').textContent=value('same-route')?'Same route at this preference.':`${extra.toFixed(1)} min longer · ${Math.abs(saved).toFixed(1)} min ${saved>=0?'less':'more'} in direct sun`;
    }
    return {update,dispose(){events.abort();panel.remove();}};
  }
  root.SimulatteSunWalkerControls={create};
})(globalThis);
