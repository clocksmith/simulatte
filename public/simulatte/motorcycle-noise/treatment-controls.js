(function(root){
  function create({view,getScene,getTime,command}){
    const $=id=>document.getElementById(id),T=root.MotorcycleTreatments,events=new AbortController();let selected=null,placing=null,lastPaint=0,nextId=1,latest=[],lastObserver=null;
    const on=(node,event,fn)=>node.addEventListener(event,fn,{signal:events.signal});
    const addButtons=[...document.querySelectorAll('[data-add-treatment]')],prompt=$('placement-prompt');
    function setPlacement(kind,message){
      placing=kind;prompt.hidden=!kind;
      $('placement-message').textContent=message||(kind?'Tap a sidewalk or roof to add '+T.kinds[kind].name.toLowerCase()+'.':'');
      for(const button of addButtons)button.setAttribute('aria-pressed',String(button.dataset.addTreatment===kind));
      $('city').classList.toggle('is-placing',!!kind);
    }
    const actions=document.createElement('div');actions.id='treatment-actions';actions.hidden=true;
    const spray=document.createElement('button');spray.id='mist-spray';spray.textContent='Spray nearest bike';
    const enabled=document.createElement('button');enabled.textContent='Disable';const remove=document.createElement('button');remove.textContent='Remove';
    const frequencies=document.createElement('label');frequencies.textContent='Frequency ';const frequency=document.createElement('select');frequency.setAttribute('aria-label','Directional sound frequency');
    for(const hz of [125,500,2000]){const option=document.createElement('option');option.value=hz;option.textContent=hz+' Hz';frequency.append(option);}frequencies.append(frequency);frequencies.hidden=true;actions.append(frequencies,spray,enabled,remove);$('treatment-controls-slot').append(actions);
    function clear(){selected=null;actions.hidden=true;frequencies.hidden=true;}
    function inspect(id){selected=id;$('inspection').hidden=false;$('source-actions').hidden=true;$('receiver-actions').hidden=true;actions.hidden=false;lastPaint=0;paint();}
    function paint(){
      const scene=getScene(),node=scene?.treatments?.find(row=>row.id===selected);if(!node)return;
      const state=T.states(scene,getTime()).find(row=>row.id===selected),sample=latest.find(row=>row.id===selected);
      $('inspection-title').textContent=T.kinds[node.kind].name;
      $('inspection-main').textContent=node.enabled===false?'Disabled':scene.treatmentsEnabled===false?'Comparison: off':node.kind==='mist'?(state.target?'Ready to spray':'Waiting for a bike'):state.target?state.frequency.toFixed(0)+' Hz':'Waiting for traffic';
      $('inspection-detail').textContent=node.kind==='mist'?'Select Spray nearest bike to aim a visible plume at the passing motorcycle.':(state.target?'Tracks '+state.target.source.id+' / '+state.target.distance.toFixed(1)+' m':'No motorcycle within 100 m')+(sample?.outputLimited?' / output limited':'');
      if(lastObserver && node.kind==='directional'){
        const point=lastObserver.observer.point;
        $('inspection-detail').textContent+=` / Sample at (${point.x.toFixed(0)}, ${point.y.toFixed(0)}), ${lastObserver.time.toFixed(2)} s: original ${lastObserver.observer.direct.toFixed(1)}, returned ${lastObserver.observer.returned.toFixed(1)} dBA; this emitter ${sample?.active ? sample.received.toFixed(1)+' dBA' : 'off'}`;
      }
      $('inspection-time').textContent=node.kind==='mist'?'Fictional interaction: contact stalls the engine briefly, then it restarts.':node.kind==='cancellation'?'Delayed, output-limited tonal model. Off-target reinforcement is possible.':'Powered emitter at 60 dB / 1 m; additional sound, not passive reflection.';
      spray.hidden=node.kind!=='mist';spray.disabled=!state.target||node.enabled===false||scene.mistBursts?.some(b=>b.sourceId===state.target?.source.id&&getTime()>=b.start&&getTime()<b.restart);
      frequencies.hidden=node.kind!=='directional';frequency.value=String(node.frequency||500);enabled.textContent=node.enabled===false?'Enable':'Disable';
    }
    function reset(scene){
      clear();setPlacement(null);latest=[];lastObserver=null;
      nextId=Math.max(nextId,1,...(scene.treatments||[]).map(row=>Number(row.id.replace('treatment-',''))+1).filter(Number.isFinite));
      if(!scene.treatments){const point=view.getObserver();scene.treatments=['mist','directional','cancellation'].map((kind,i)=>({id:'treatment-'+nextId++,kind,...view.snapSidewalk({x:point.x+(i-1)*12,y:point.y+5,z:1.7}),frequency:500,enabled:true}));}
      scene.treatmentMode=$('technique').value;scene.treatmentsEnabled=['live','cancellation'].includes(scene.treatmentMode);
    }
    function pick(value){
      if(placing){
        const scene=getScene();
        if(!value.point||(scene.acousticContext.occupied(value.point)&&value.surface!=='rooftop')){setPlacement(placing,'Choose an open sidewalk or rooftop.');return true;}
        if(scene.treatments.length>=8){setPlacement(placing,'Eight obstacles placed. Cancel and remove one to add another.');return true;}
        const node={id:'treatment-'+nextId++,kind:placing,...value.point,frequency:500,enabled:true};scene.treatments.push(node);
        if(scene.treatmentsEnabled===false){$('technique').value='live';$('technique').dispatchEvent(new Event('change',{bubbles:true}));}
        setPlacement(null);inspect(node.id);return true;
      }
      if(value.treatmentId){inspect(value.treatmentId);return true;}
      clear();return false;
    }
    for(const button of addButtons)on(button,'click',()=>{
      const kind=button.dataset.addTreatment;
      if(placing===kind){setPlacement(null);return;}
      if($('add-receiver').getAttribute('aria-pressed')==='true')$('add-receiver').click();
      document.dispatchEvent(new Event('cancel-equipment-placement'));
      $('inspection-close').click();
      setPlacement(kind);$('city').focus({preventScroll:true});
    });
    on($('placement-cancel'),'click',()=>{const kind=placing;setPlacement(null);addButtons.find(button=>button.dataset.addTreatment===kind)?.focus();});
    on(document,'keydown',event=>{if(event.key==='Escape'&&placing){setPlacement(null);event.preventDefault();}});
    for(const button of document.querySelectorAll('[data-place],#add-receiver'))on(button,'click',()=>setPlacement(null));
    function apply({action,value}){
      const scene=getScene(),node=scene.treatments.find(row=>row.id===selected);if(!node)return;
      if(action==='toggle')node.enabled=node.enabled===false;
      if(action==='frequency')node.frequency=Number(value);
      if(action==='remove'){scene.treatments=scene.treatments.filter(row=>row.id!==selected);clear();$('inspection').hidden=true;}
      paint();
    }
    on(spray,'click',()=>command('mist-spray',{nodeId:selected}));
    on(enabled,'click',()=>command('treatment',{action:'toggle'}));
    on(remove,'click',()=>command('treatment',{action:'remove'}));
    on(frequency,'change',()=>command('treatment',{action:'frequency',value:frequency.value}));
    on($('inspection-close'),'click',clear);
    return {apply,reset,pick,observe(data){latest=data.observer?.treatments||[];lastObserver=data;},update(now){if(now-lastPaint>250){lastPaint=now;paint();}view.setTreatmentSelection(selected);},dispose(){setPlacement(null);events.abort();actions.remove();}};
  }
  root.MotorcycleTreatmentControls={create};
})(globalThis);
