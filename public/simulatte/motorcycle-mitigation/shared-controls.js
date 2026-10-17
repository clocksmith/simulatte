/* This standalone scene keeps its simulation owner and adopts World controls. */
(function(){
  const ui=globalThis.SimulatteWorldUI;
  for(const element of document.querySelectorAll('.transport'))ui.SimDock({element,label:'Playback'});
  const inspector=document.querySelector('.inspector');if(inspector)ui.SimInspector({element:inspector,placement:'inline'});
  const metrics=[...document.querySelectorAll('.readout-card')].map(element=>({value:element.querySelector('strong'),label:element.querySelector('.eyebrow'),metric:ui.SimMetric({element,labelElement:element.querySelector('.eyebrow'),valueElement:element.querySelector('strong'),preserveContent:true})}));
  const timer=setInterval(()=>{for(const {metric,value,label}of metrics)metric.update({subject:label.textContent,value:value.textContent,unit:'',timeBasis:document.getElementById('sim-time-display').textContent,freshness:'current',validity:'modeled',level:'supporting'});},200);
  const dispose=ui.adoptTree(document.body);
  const sheets=[...document.querySelectorAll('dialog')].map(element=>ui.SimSheet({element,externalTrigger:true}));
  addEventListener('pagehide',()=>{clearInterval(timer);dispose();sheets.forEach(sheet=>sheet.dispose());},{once:true});
})();
