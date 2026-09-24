(function(root){
  function create({view,getScene,getTime,getSelected,getComparison,selectSource,initialObservation=null}){
    const $=id=>document.getElementById(id),M=root.MotorcycleReflection;
    let world=null,worker=null,pending=false,nextAt=0,epoch=0,placing=false,selectedMarker=null,inspectedSource=null,lastReading=null,lastPaint=0,markers=[],nextId=1,requestId=0,lastRequestKey='',history=[];
    let inspectedLocation=null;
    let observerWorker=null,observerPending=false,observerNextAt=0,observerRequest=0,observerKey='',lastObserver=null;
    const events=new AbortController(),on=(element,type,handler)=>element.addEventListener(type,handler,{signal:events.signal});
    const setText=(id,text)=>$(id).textContent=text;
    const treatments=root.MotorcycleTreatmentControls.create({view,getScene,getTime});
    function renderMarkers(){view.setReceiverMarkers(markers,selectedMarker);}
    function inspectMarker(id){
      inspectedLocation=null;selectedMarker=id;inspectedSource=null;placing=false;$('add-receiver').setAttribute('aria-pressed','false');
      $('inspection').hidden=false;$('source-actions').hidden=true;$('receiver-actions').hidden=false;
      const marker=markers.find(item=>item.id===id);if(marker){view.placeObserver(marker,marker.z>4?'rooftop':'sidewalk');$('camera-mode').value=marker.z>4?'rooftop':'sidewalk';}
      renderMarkers();paint();nextAt=0;
    }
    function inspectSource(id){inspectedLocation=null;selectedMarker=null;inspectedSource=id;selectSource(id);$('inspection').hidden=false;$('source-actions').hidden=false;$('receiver-actions').hidden=true;renderMarkers();paint();}
    function paint(){
      const scene=getScene();if(!scene)return;
      const counts={motorcycle:0,car:0,pedestrian:0};let moving=0;
      for(const source of scene.sources){counts[source.kind]++;if(source.kind==='motorcycle'&&M.position(source,getTime()).speed>.2)moving++;}
      setText('traffic-summary',`${counts.motorcycle} autonomous motorcycles / ${moving} moving / ${counts.car} cars / ${counts.pedestrian} pedestrians`);
      if(selectedMarker){
        const marker=markers.find(item=>item.id===selectedMarker),reading=lastReading?.markers.find(item=>item.id===selectedMarker);if(!marker)return;
        setText('inspection-title',marker.name);setText('inspection-main',reading?`${reading.total.toFixed(1)} dBA`:'Calculating');
        setText('inspection-detail',reading?`Original ${reading.direct.toFixed(1)} / returned ${reading.returned.toFixed(1)} dBA`:'Live path-energy estimate');
        setText('inspection-time',reading?`Estimated at ${lastReading.time.toFixed(2)} s / ${marker.z.toFixed(1)} m high`:`Observer ${marker.z.toFixed(1)} m high`);
      }else if(inspectedLocation){
        const reading=lastObserver?.observer;
        setText('inspection-title','Observation point');setText('inspection-main',reading?reading.total.toFixed(1)+' dBA':'Measuring');
        setText('inspection-detail',reading?reading.contributors.slice(0,3).map(row=>row.id.replace('motorcycle-','Motorcycle ')+' '+row.level.toFixed(0)+' dBA').join(' / '):'Waiting for sound at this viewpoint');
        setText('inspection-time','Viewpoint microphone / '+inspectedLocation.z.toFixed(1)+' m high');
      }else if(inspectedSource){
        const source=scene.sources.find(item=>item.id===inspectedSource);if(!source)return;$('ride-selected').hidden=source.kind!=='motorcycle';
        const p=M.position(source,getTime());setText('inspection-title',source.kind==='motorcycle'?`Autonomous motorcycle ${source.id.split('-').pop()}`:source.id);
        setText('inspection-main',`${(p.speed*3.6).toFixed(1)} km/h`);setText('inspection-detail',`${Math.round(p.rpm)} RPM / ${M.sourceLevel(source,getTime()).toFixed(1)} dB at 1 m`);
        setText('inspection-time',`${source.cylinders} cylinders / ${Math.round(p.rpm*source.cylinders/120)} Hz mean firing rate`);
      }
    }
    function showObserver(data){
      const reading=data.observer;if(!reading)return;treatments.observe(data);
      if(history.length&&data.time<history[history.length-1].time)history=[];
      history.push({time:data.time,level:reading.total,point:reading.point});if(history.length>80)history.shift();
      setText('observer-level',`${reading.total.toFixed(1)} dBA`);
      setText('observer-position',`${reading.point.mode||'Observer'} / ${reading.point.z.toFixed(1)} m high`);
      lastObserver=data;if(inspectedLocation)paint();
      setText('observer-time',`Traffic ${reading.traffic.toFixed(1)} / background ${data.background.toFixed(1)} dBA`);
      root.MotorcycleTrafficAudio?.observe(data);
      const canvas=$('observer-history'),ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.strokeStyle='#8da595';ctx.lineWidth=.5;for(const level of [40,80,120]){const y=canvas.height-(level-20)/120*canvas.height;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();}
      ctx.strokeStyle='#c6e5aa';ctx.lineWidth=2;ctx.beginPath();history.forEach((row,i)=>{const x=i/79*canvas.width,y=canvas.height-Math.max(0,Math.min(1,(row.level-20)/120))*canvas.height;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();
    }
    function init(scene){
      worker?.terminate();observerWorker?.terminate();observerPending=false;observerNextAt=0;observerKey='';lastObserver=null;world=scene;pending=false;lastRequestKey='';nextAt=0;lastReading=null;history=[];epoch++;const generation=epoch;
      treatments.reset(scene);
      if(initialObservation){({markers,nextId,selectedMarker,inspectedSource,inspectedLocation}=initialObservation);initialObservation=null;}
      else{markers=[{id:'receiver-1',name:'Observer 1',...view.getObserver()}];nextId=2;selectedMarker=null;inspectedSource=null;inspectedLocation=null;}
      $('inspection').hidden=!(selectedMarker||inspectedSource||inspectedLocation);renderMarkers();
      observerWorker=new Worker('./observer-noise-worker.js?v=city-controls-v7');
      observerWorker.postMessage({type:'init',scene});
      observerWorker.onmessage=({data})=>{
        if(generation!==epoch||data.id!==observerRequest)return;
        observerPending=false;
        if(data.type==='error'){setText('observer-level','Microphone unavailable');setText('observer-time',data.message);return;}
        if(data.type==='observer')showObserver(data);
      };
      observerWorker.onerror=event=>{if(generation!==epoch)return;observerPending=false;setText('observer-level','Microphone unavailable');setText('observer-time',event.message||'Audio measurement worker failed');};
      worker=new Worker('./live-noise-worker.js?v=city-controls-v7');worker.postMessage({type:'init',scene});
      worker.onmessage=({data})=>{
        if(generation!==epoch||data.id!==requestId)return;
        pending=false;
        if(data.type==='error'){setText('live-summary',`Sound map unavailable: ${data.message}`);nextAt=Infinity;return;}
        if(data.type!=='sample')return;lastReading=data;
        if($('live-overlay').checked&&!getComparison())view.showMeasurements(data,'total');
        const levels=data.points.map(point=>point.total).filter(Number.isFinite);
        setText('live-summary',levels.length?`${Math.min(...levels).toFixed(0)}-${Math.max(...levels).toFixed(0)} dBA / modeled street levels`:'No outdoor samples in view');
        setText('map-sample-time',`Map sampled at ${data.time.toFixed(2)} s`);paint();
      };
      worker.onerror=event=>{if(generation!==epoch)return;pending=false;nextAt=Infinity;setText('live-summary',`Sound map unavailable: ${event.message||'worker error'}`);};
    }
    function update(now){
      const scene=getScene();if(!scene)return;if(world!==scene)init(scene);treatments.update(now);if(now-lastPaint>=300){lastPaint=now;paint();}
      if(lastObserver){
        const age=Math.max(0,getTime()-lastObserver.time);
        setText('observer-position',lastObserver.observer.point.mode+' / '+lastObserver.observer.point.z.toFixed(1)+' m high / sampled '+lastObserver.time.toFixed(1)+' s'+(age>.7?' ('+age.toFixed(1)+' s behind)':''));
      }
      if(!observerPending&&now>=observerNextAt&&!document.hidden){
        const observer=view.getObserver(),sampleTime=getTime(),key=JSON.stringify([sampleTime,observer,scene.config,scene.panel,scene.treatments,scene.treatmentsEnabled,scene.treatmentMode]);
        if(key!==observerKey){
          observerKey=key;observerPending=true;observerNextAt=now+200;
          observerWorker.postMessage({type:'sample',id:++observerRequest,time:sampleTime,observer,config:scene.config,panel:scene.panel,treatments:scene.treatments,treatmentsEnabled:scene.treatmentsEnabled,treatmentMode:scene.treatmentMode});
        }
      }
      if(pending||now<nextAt||document.hidden)return;
      const focus=view.getFocus(),observer=view.getObserver(),time=getTime(),key=JSON.stringify([time,focus,observer,markers,scene.config,scene.panel,scene.treatments,scene.treatmentsEnabled,scene.treatmentMode]);
      if(key===lastRequestKey)return;lastRequestKey=key;pending=true;nextAt=now+700;
      worker.postMessage({type:'sample',id:++requestId,time,focus,observer,markers,config:scene.config,panel:scene.panel,receiver:scene.receiver,speaker:scene.speaker,reference:scene.reference,treatments:scene.treatments,treatmentsEnabled:scene.treatmentsEnabled,treatmentMode:scene.treatmentMode});
    }
    function pick(value){
      if(treatments.pick(value)){inspectedLocation=null;selectedMarker=null;inspectedSource=null;renderMarkers();return true;}
      if(value.receiverId){inspectMarker(value.receiverId);return true;}
      if(value.sourceId){inspectSource(value.sourceId);return true;}
      if(value.point&&document.querySelector('[data-place][aria-pressed="true"]'))return false;
      if(placing&&value.point){
        if(markers.length>=8){setText('live-summary','Eight markers placed; remove one to add another');return true;}
        const id=nextId++,marker={id:`receiver-${id}`,name:`Observer ${id}`,...value.point};markers.push(marker);inspectMarker(marker.id);return true;
      }
      if(value.point){inspectedLocation=value.point;selectedMarker=null;inspectedSource=null;view.placeObserver(value.point,value.surface||'sidewalk');$('camera-mode').value=value.surface||'sidewalk';$('inspection').hidden=false;$('source-actions').hidden=true;$('receiver-actions').hidden=true;renderMarkers();paint();nextAt=0;observerNextAt=0;return true;}
      return false;
    }
    on($('area-focus'),'change',event=>{if(event.target.value==='McCarren Park'){view.homePark();$('camera-mode').value='map';}else{if(event.target.value)view.focus(event.target.value);$('camera-mode').value='map';}nextAt=0;observerNextAt=0;});
    on($('camera-mode'),'change',event=>{
      if(event.target.value==='map'){view.homePark();nextAt=0;observerNextAt=0;return;}
      if(event.target.value.startsWith('area:')){view.focus(event.target.value.slice(5));nextAt=0;observerNextAt=0;return;}
      if(event.target.value==='rider'&&!inspectedSource){const id=view.nearestMotorcycle();if(id)selectSource(id);}
      view.setCameraMode(event.target.value);nextAt=0;observerNextAt=0;
    });
    on($('add-receiver'),'click',()=>{placing=!placing;$('add-receiver').setAttribute('aria-pressed',String(placing));setText('live-summary',placing?'Click a sidewalk or roof to place an observation marker':'Live sound estimate');});
    on($('inspection-close'),'click',()=>{inspectedLocation=null;selectedMarker=null;inspectedSource=null;$('inspection').hidden=true;renderMarkers();});
    on($('receiver-remove'),'click',()=>{markers=markers.filter(item=>item.id!==selectedMarker);selectedMarker=null;$('inspection').hidden=true;renderMarkers();nextAt=0;});
    on($('ride-selected'),'click',()=>{$('camera-mode').value='rider';view.setCameraMode('rider');nextAt=0;});
    on($('follow-selected'),'click',()=>{$('camera-mode').value='map';view.focusSource(inspectedSource||getSelected());nextAt=0;});
    on($('live-overlay'),'change',()=>view.showMeasurements($('live-overlay').checked?lastReading:null,'total'));
    return {captureObservation(){if(!world)return null;return structuredClone({markers,nextId,selectedMarker,inspectedSource,inspectedLocation});},update,pick,resetClock(){pending=false;observerPending=false;requestId++;observerRequest++;nextAt=0;observerNextAt=0;lastRequestKey='';observerKey='';lastReading=null;lastObserver=null;history=[];view.showMeasurements(null);},dispose(){treatments.dispose();epoch++;events.abort();worker?.terminate();observerWorker?.terminate();view.setReceiverMarkers([],null);}};
  }
  root.MotorcycleExplorer={create};
})(globalThis);
