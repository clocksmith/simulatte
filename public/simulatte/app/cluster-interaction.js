(function(root) {
  function create({canvas,visualizer,onIntervene,onError}) {
    let contribution=null,selected=null,down=null,busy=false;
    const controller=new AbortController(), signal=controller.signal;
    const panel=document.createElement('section');panel.className='cluster-interaction';panel.setAttribute('aria-label','Selected rack');
    panel.innerHTML='<div><label>Rack <select aria-label="Inspect rack"></select></label><strong class="cluster-task"></strong></div><p class="cluster-wait"></p><div><span class="cluster-progress"></span><button type="button" class="sim-action">Introduce straggler</button></div>';
    canvas.parentElement.append(panel);
    const select=panel.querySelector('select'),task=panel.querySelector('.cluster-task'),wait=panel.querySelector('.cluster-wait'),progress=panel.querySelector('.cluster-progress'),button=panel.querySelector('button');
    const insets=()=>{visualizer.sceneInsets={bottom:panel.getBoundingClientRect().height+16};if(visualizer.fittedTarget)visualizer.fitPluginPresentationTarget(...visualizer.fittedTarget);};
    const observer=new ResizeObserver(insets);observer.observe(panel);
    function fields(){return Object.fromEntries((contribution?.inspections.find(row=>row.id===`gpu-supercluster:inspection:${selected}`)?.fields||[]).map(row=>[row.id,row.value]));}
    function reflect(){
      const values=fields();select.value=selected;visualizer.selectedRack=selected;
      task.textContent={forward:'Computing forward pass',backward:'Computing gradients',waiting:'Waiting at synchronization barrier',allreduce:'Exchanging gradients'}[values.task]||'Preparing training';
      wait.textContent=values.task==='waiting'?`Waiting for ${values['waiting-for']}`:values.task==='allreduce'?'All racks ready · collective transfer in progress':`Compute ${values.work||0}% · synchronization wait ${values['wait-ms']||0} ms`;
      const waiting=(contribution?.inspections||[]).filter(row=>row.fields.some(field=>field.id==='task'&&field.value==='waiting'));
      const blocked=waiting.filter(row=>row.fields.some(field=>field.id==='waiting-for'&&field.value.split(', ').includes(selected))).length;
      if(blocked)wait.textContent=`${blocked} racks waiting for ${selected} · compute ${values.work}%`;
      const iterations=contribution?.state.measures.find(row=>row.kind==='training-iterations')?.value||0;
      progress.textContent=`${iterations} iterations · ${waiting.length?`${waiting.length} racks waiting`:`${contribution?.state.simulationTimeMs||0} ms modeled`}`;
      if(contribution?.state.status==='settled'){task.textContent='Session complete';wait.textContent=`Last task: ${values.task} · ${values['wait-ms']||0} ms synchronization wait`;}
      button.textContent=values.slowdown?'Remove straggler':'Introduce straggler';
      button.disabled=busy||contribution?.state.status!=='running';
      panel.dataset.rack=selected||'';panel.dataset.task=values.task||'';
    }
    select.addEventListener('change',()=>{selected=select.value;reflect();},{signal});
    button.addEventListener('click',async()=>{busy=true;reflect();try{await onIntervene({rackId:selected,slowdown:fields().slowdown?0:95});}catch(error){onError(error);}finally{busy=false;reflect();}},{signal});
    canvas.addEventListener('pointerdown',event=>{down={x:event.clientX,y:event.clientY};},{signal});
    canvas.addEventListener('pointerup',event=>{
      if(!down||Math.hypot(event.clientX-down.x,event.clientY-down.y)>5)return;
      down=null;
      const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
      const picks=(contribution?.presentation.layers||[]).filter(row=>row.id.startsWith('rack:')).map(row=>{
        const point=root.SimulatteTierPluginPresentation.projectPoint(row.geometry.coordinates[0],'datacenter-cartesian-meters',visualizer);
        return {id:row.id.slice(5),distance:Math.hypot(point.x-x,point.y-y)};
      }).sort((a,b)=>a.distance-b.distance);
      if(picks[0]?.distance<30){selected=picks[0].id;reflect();}
    },{signal});
    return {
      update(next){contribution=next;const racks=next.presentation.layers.filter(row=>row.id.startsWith('rack:'));
        if(!selected||!racks.some(row=>row.id===`rack:${selected}`)){
          selected=racks[0]?.id.slice(5);select.replaceChildren(...racks.map(row=>{const option=document.createElement('option');option.value=row.id.slice(5);option.textContent=option.value;return option;}));
        }reflect();},
      dispose(){controller.abort();observer.disconnect();panel.remove();visualizer.sceneInsets={};}
    };
  }
  root.SimulatteClusterInteraction={create};
})(globalThis);
