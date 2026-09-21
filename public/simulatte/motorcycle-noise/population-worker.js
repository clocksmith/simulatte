'use strict';
importScripts('./city-paths.js?v=park-vtwin-v3','./traffic-motion.js?v=park-vtwin-v3','./reflection-model.js?v=park-vtwin-v3');
self.onmessage=({data})=>{
  try {
    const scene=self.MotorcycleReflection.create(data.map,data.config);
    self.postMessage({scene},scene.sources.map(source=>source.motion.states.buffer));
  } catch(error) { self.postMessage({error:error.message}); }
};
