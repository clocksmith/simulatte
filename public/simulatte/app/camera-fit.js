(function(root, factory) {
  const api=factory(typeof module==='object'&&module.exports?require('./tier-plugin-presentation.js'):root.SimulatteTierPluginPresentation);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.SimulatteCameraFit=api;
})(globalThis,function(presentation){
  function fit({coordinates,coordinateSystem,width,height,rotX=0,rotY=0,viewMode='overview',insets={},padding=32}){
    if(!coordinates?.length||![width,height].every(v=>Number.isFinite(v)&&v>0))return null;
    const projectionMode=coordinateSystem==='icrs-cartesian-pc'&&viewMode==='compare'?'torus':'sphere';
    const points=coordinates.map(p=>presentation.projectPoint(p,coordinateSystem,{panX:0,panY:0,zoom:1,rotX,rotY,projectionMode}));
    if(!points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)))return null;
    const left=(insets.left||0)+padding,right=width-(insets.right||0)-padding;
    const top=(insets.top||0)+padding,bottom=height-(insets.bottom||0)-padding;
    const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x));
    const minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
    const zoom=Math.max(.001,Math.min(coordinateSystem==='icrs-cartesian-pc'?4000:250,Math.max(1,right-left)/Math.max(.001,maxX-minX),Math.max(1,bottom-top)/Math.max(.001,maxY-minY)));
    return Object.freeze({zoom,panX:(left+right)/2-(minX+maxX)/2*zoom,panY:(top+bottom)/2-(minY+maxY)/2*zoom,projectionMode});
  }
  return Object.freeze({fit});
});
