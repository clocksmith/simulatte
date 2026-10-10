(function(root){
  function create({view,getScene,getTime,command,isMeasurementCurrent}){
    const $=id=>document.getElementById(id),T=root.MotorcycleTreatments,events=new AbortController();let selected=null,placing=null,lastPaint=0,latest=[],lastObserver=null;
    const on=(node,event,fn)=>node.addEventListener(event,fn,{signal:events.signal});
    const addButtons=[...document.querySelectorAll('[data-add-treatment]')],prompt=$('placement-prompt');
    function setPlacement(kind,message){
      placing=kind;prompt.hidden=!kind;
      $('placement-message').textContent=message||(kind==='mist'?'Tap the map to place a water mister. Spray to trigger a simulated engine stall.':kind?'Tap a sidewalk or roof to add '+T.kinds[kind].name.toLowerCase()+'.':'');
      for(const button of addButtons)button.setAttribute('aria-pressed',String(button.dataset.addTreatment===kind));
      $('city').classList.toggle('is-placing',!!kind);
    }
    const actions=document.createElement('div');actions.id='treatment-actions';actions.hidden=true;
    const spray=document.createElement('button');spray.id='mist-spray';spray.textContent='Spray water';
    const enabled=document.createElement('button');enabled.textContent='Disable';const remove=document.createElement('button');remove.textContent='Remove';
    const frequencies=document.createElement('label');frequencies.textContent='Frequency ';const frequency=document.createElement('select');frequency.setAttribute('aria-label','Directional sound frequency');
    for(const hz of [125,500,2000]){const option=document.createElement('option');option.value=hz;option.textContent=hz+' Hz';frequency.append(option);}frequencies.append(frequency);frequencies.hidden=true;const comparison=document.createElement('div');comparison.setAttribute('aria-label','Matched observer comparison');comparison.hidden=true;actions.append(frequencies,spray,enabled,remove,comparison);$('treatment-controls-slot').append(actions);
    function clear(){selected=null;actions.hidden=true;frequencies.hidden=true;}
    function inspect(id){selected=id;$('inspection').hidden=false;$('source-actions').hidden=true;$('receiver-actions').hidden=true;actions.hidden=false;lastPaint=0;paint();}
    function paint(){
      const scene=getScene(),node=scene?.treatments?.find(row=>row.id===selected);if(!node)return;
      const state=T.states(scene,getTime()).find(row=>row.id===selected),sample=latest.find(row=>row.id===selected);
      $('focus-observer').hidden=true;$('inspection-title').textContent=T.kinds[node.kind].name;
      $('inspection-main').textContent=node.enabled===false||(node.kind==='mist'&&!scene.fictionalEventsEnabled)?'Disabled':scene.treatmentsEnabled===false?'Comparison: off':node.kind==='mist'?(state.target?'Ready to spray':'Waiting for a bike'):state.target?state.frequency.toFixed(0)+' Hz':'Waiting for traffic';
      $('inspection-detail').textContent=node.kind==='mist'?'Scripted engine stall and restart. Excluded from acoustic baseline comparisons.':(state.target?'Tracks '+state.target.source.id+' / '+state.target.distance.toFixed(1)+' m':'No motorcycle within 100 m')+(sample?.outputLimited?' / output limited':'');
      $('inspection-time').textContent=node.kind==='mist'?'Fictional interaction; excluded from sound comparisons.':node.kind==='cancellation'?'Delayed tonal model; sound can increase away from its target.':'Powered sound; levels combine as energy, not added dBA.';
      if(lastObserver && node.kind!=='mist' && sample?.comparison){
        const {withDb,withoutDb,changeDb}=sample.comparison,point=lastObserver.observer.point;
        const signed=(changeDb>=0?'+':'')+changeDb.toFixed(2);
        $('inspection-main').textContent=`${isMeasurementCurrent()?'This treatment':'Stale sample'}: ${signed} dB here`;
        $('inspection-detail').textContent=`With ${withDb.toFixed(2)} dBA · Without ${withoutDb.toFixed(2)} dBA. ${changeDb>0?'Increases sound at this observer.':changeDb<0?'Reduces sound at this observer.':'No change at this observer.'}`;
        $('inspection-time').textContent+=` Same observer (${point.x.toFixed(1)}, ${point.y.toFixed(1)}, ${point.z.toFixed(1)} m), time ${lastObserver.time.toFixed(2)} s, traffic and other treatments.`;
      }
      comparison.hidden=true;
      const matched=lastObserver?.observer?.matchedComparison;
      if(matched?.treatmentId===selected){
        comparison.hidden=false;comparison.replaceChildren();
        const heading=document.createElement('p');heading.textContent=`${isMeasurementCurrent()?'Current observation':'Stale observation'} · treatment removed versus included · ${matched.time.toFixed(2)} s`;comparison.append(heading);
        const table=document.createElement('table'),header=document.createElement('tr');
        for(const text of ['Observer','Without','With','Change']){const th=document.createElement('th');th.textContent=text;header.append(th);}table.append(header);
        for(const row of matched.rows){const tr=document.createElement('tr');for(const value of [row.label,row.baseline.toFixed(1)+' dBA',row.intervention.toFixed(1)+' dBA',(row.differenceDb>=0?'+':'')+row.differenceDb.toFixed(2)+' dB']){const td=document.createElement('td');td.textContent=value;tr.append(td);}table.append(tr);}
        comparison.append(table);
        const detail=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Sound contributions';detail.append(summary);
        for(const row of matched.rows){const text=document.createElement('p'),c=row.components.intervention;const db=value=>value===null?'none':value.toFixed(1)+' dBA';text.textContent=`${row.label}: outward ${db(c.outward)} · reflected ${db(c.reflected)} · returned ${db(c.returned)} · powered ${db(c.powered)}`;detail.append(text);}
        comparison.append(detail);
      }
      if(lastObserver?.observer?.comparisonRefusal){comparison.hidden=false;comparison.replaceChildren();const refusal=document.createElement('p');refusal.textContent=lastObserver.observer.comparisonRefusal;comparison.append(refusal);}
      spray.hidden=node.kind!=='mist';spray.disabled=!state.enabled||!state.target||node.enabled===false||scene.mistBursts?.some(b=>b.sourceId===state.target?.source.id&&getTime()>=b.start&&getTime()<b.restart);
      frequencies.hidden=node.kind!=='directional';if(document.activeElement!==frequency)frequency.value=String(node.frequency||500);enabled.textContent=node.enabled===false?'Enable':'Disable';
    }
    function reset(scene){
      clear();setPlacement(null);latest=[];lastObserver=null;$('technique').value=scene.treatmentMode;
    }
    function pick(value){
      if(placing){
        const scene=getScene();
        if(!value.point||(scene.acousticContext.occupied(value.point)&&value.surface!=='rooftop')){setPlacement(placing,'Choose an open sidewalk or rooftop.');return true;}
        if(scene.treatments.length>=8){setPlacement(placing,'Eight obstacles placed. Cancel and remove one to add another.');return true;}
        const kind=placing; setPlacement(null);
        command('treatment',{action:'add',kind,point:value.point,surface:value.surface,enableFictionalEvent:kind==='mist'}).then(result=>{if(result?.id&&getScene()===scene&&scene.treatments.some(row=>row.id===result.id))inspect(result.id);});return true;
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
    function apply({action,id}) {
      if((action==='remove'&&id===selected)||(selected&&!getScene().treatments.some(row=>row.id===selected))){clear();$('inspection').hidden=true;}
      paint();
    }
    on(spray,'click',()=>command('mist-spray',{nodeId:selected}));
    on(enabled,'click',()=>command('treatment',{action:'toggle',id:selected}));
    on(remove,'click',()=>command('treatment',{action:'remove',id:selected}));
    on(frequency,'change',()=>command('treatment',{action:'frequency',id:selected,value:frequency.value}));
    on($('inspection-close'),'click',clear);
    return {selectedId:()=>selected,apply,reset,pick,observe(data){latest=data.observer?.treatments||[];lastObserver=data;},update(now){if(now-lastPaint>250){lastPaint=now;paint();}view.setTreatmentSelection(selected);},dispose(){setPlacement(null);events.abort();actions.remove();}};
  }
  root.MotorcycleTreatmentControls={create};
})(globalThis);
