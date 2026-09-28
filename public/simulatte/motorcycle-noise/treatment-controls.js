(function(root){
  function create({view,getScene,getTime,command}){
    const $=id=>document.getElementById(id),T=root.MotorcycleTreatments,events=new AbortController();let selected=null,placing=null,lastPaint=0,nextId=1,latest=[];
    const on=(node,event,fn)=>node.addEventListener(event,fn,{signal:events.signal});
    const control=document.createElement('label');control.className='compact';control.textContent='Place ';
    const add=document.createElement('select');add.id='place-marker';add.setAttribute('aria-label','Place observation or treatment marker');
    for(const[value,text]of [['','Choose marker'],['observer','Observation point'],['mist','Water mist'],['directional','Directional sound'],['cancellation','Tonal cancellation']]){const option=document.createElement('option');option.value=value;option.textContent=text;add.append(option);}control.append(add);document.getElementById('placement-controls').append(control);
    const actions=document.createElement('div');actions.id='treatment-actions';actions.hidden=true;
    const spray=document.createElement('button');spray.id='mist-spray';spray.textContent='Spray nearest bike';
    const enabled=document.createElement('button');enabled.textContent='Disable';const remove=document.createElement('button');remove.textContent='Remove';
    const frequencies=document.createElement('label');frequencies.textContent='Frequency ';const frequency=document.createElement('select');frequency.setAttribute('aria-label','Directional sound frequency');
    for(const hz of [125,500,2000]){const option=document.createElement('option');option.value=hz;option.textContent=hz+' Hz';frequency.append(option);}frequencies.append(frequency);frequencies.hidden=true;document.getElementById('placement-controls').append(frequencies);actions.append(spray,enabled,remove);$('treatment-controls-slot').append(actions);
    function clear(){selected=null;actions.hidden=true;frequencies.hidden=true;}
    function inspect(id){selected=id;$('inspection').hidden=false;$('source-actions').hidden=true;$('receiver-actions').hidden=true;actions.hidden=false;lastPaint=0;paint();}
    function paint(){
      const scene=getScene(),node=scene?.treatments?.find(row=>row.id===selected);if(!node)return;
      const state=T.states(scene,getTime()).find(row=>row.id===selected),sample=latest.find(row=>row.id===selected);
      $('inspection-title').textContent=T.kinds[node.kind].name;
      $('inspection-main').textContent=node.enabled===false?'Disabled':scene.treatmentsEnabled===false?'Comparison: off':node.kind==='mist'?(state.target?'Ready to spray':'Waiting for a bike'):state.target?state.frequency.toFixed(0)+' Hz':'Waiting for traffic';
      $('inspection-detail').textContent=node.kind==='mist'?'Select Spray nearest bike to aim a visible plume at the passing motorcycle.':(state.target?'Tracks '+state.target.source.id+' / '+state.target.distance.toFixed(1)+' m':'No motorcycle within 100 m')+(sample?.outputLimited?' / output limited':'');
      $('inspection-time').textContent=node.kind==='mist'?'Fictional interaction: contact stalls the engine briefly, then it restarts.':node.kind==='cancellation'?'Delayed, output-limited tonal model. Off-target reinforcement is possible.':'Powered emitter at 60 dB / 1 m; additional sound, not passive reflection.';
      spray.hidden=node.kind!=='mist';spray.disabled=!state.target||node.enabled===false||scene.mistBursts?.some(b=>b.sourceId===state.target?.source.id&&getTime()>=b.start&&getTime()<b.restart);
      frequencies.hidden=node.kind!=='directional';frequency.value=String(node.frequency||500);enabled.textContent=node.enabled===false?'Enable':'Disable';
    }
    function reset(scene){
      selected=null;actions.hidden=true;frequencies.hidden=true;latest=[];
      if(!scene.treatments){const point=view.getObserver();scene.treatments=['mist','directional','cancellation'].map((kind,i)=>({id:'treatment-'+nextId++,kind,...view.snapSidewalk({x:point.x+(i-1)*12,y:point.y+5,z:1.7}),frequency:500,enabled:true}));}
      scene.treatmentMode=$('technique').value;scene.treatmentsEnabled=['live','cancellation'].includes(scene.treatmentMode);
    }
    function pick(value){
      if(value.treatmentId){placing=null;add.value='';inspect(value.treatmentId);return true;}
      if(placing&&value.point){const scene=getScene();if(scene.acousticContext.occupied(value.point)&&value.surface!=='rooftop')return true;if(scene.treatments.length>=8){$('live-summary').textContent='Remove a treatment before adding another.';return true;}
        const node={id:'treatment-'+nextId++,kind:placing,...value.point,frequency:500,enabled:true};scene.treatments.push(node);placing=null;add.value='';inspect(node.id);return true;}
      clear();return false;
    }
    on(add,'change',()=>{placing=add.value||null;if(placing==='observer'){placing=null;$('add-receiver').click();add.value='';}else if(placing){if($('add-receiver').getAttribute('aria-pressed')==='true')$('add-receiver').click();$('live-summary').textContent='Click a sidewalk or rooftop to place '+T.kinds[placing].name.toLowerCase()+'.';}});
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
    return {apply,reset,pick,observe(data){latest=data.observer?.treatments||[];},update(now){if(now-lastPaint>250){lastPaint=now;paint();}view.setTreatmentSelection(selected);},dispose(){events.abort();control.remove();frequencies.remove();actions.remove();}};
  }
  root.MotorcycleTreatmentControls={create};
})(globalThis);
