'use strict';
importScripts('./signal.js','./city-paths.js?v=city-controls-v7','./traffic-motion.js?v=city-controls-v7','./reflection-model.js?v=city-controls-v7','./treatments.js?v=city-controls-v7','./city-sound.js?v=city-controls-v7');
let scene=null;
self.onmessage=({data})=>{
  if(data.type==='init'){scene=data.scene;return;}
  if(data.type!=='sample'||!scene)return;
  try{
    const started=performance.now();
    scene.config=data.config;scene.panel=data.panel;scene.treatments=data.treatments||[];scene.treatmentsEnabled=data.treatmentsEnabled;scene.treatmentMode=data.treatmentMode;scene.receiver=data.receiver;scene.speaker=data.speaker;scene.reference=data.reference;
    const sampler=self.MotorcycleCitySound.create(scene,data.time);
    const markers=data.markers.map(marker=>({id:marker.id,...sampler.measure(marker)}));
    const points=[],spacing=data.focus.span/6;
    for(let y=0;y<7;y++)for(let x=0;x<7;x++){
      const point={x:data.focus.x+(x-3)*spacing,y:data.focus.y+(y-3)*spacing,z:1.5};
      if(!sampler.geometry.occupied(point))points.push({point,...sampler.measure(point)});
    }
    self.postMessage({type:'sample',id:data.id,identity:data.identity,time:data.time,points,markers,workerMs:performance.now()-started,gridSpacing:spacing,model:'locally-stationary-coherent-paths-independent-sources',activeCancellationIncluded:!!scene.treatmentsEnabled});
  }catch(error){self.postMessage({type:'error',id:data.id,message:error.message});}
};
