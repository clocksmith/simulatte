(function(root){
  function create({B,scene,canvas,getCamera,onTap,onHome}){
    const events=new AbortController(),options={signal:events.signal},wrapper=canvas.parentElement;
    let previous=null,single=null,multiple=false;
    const on=(node,name,fn,extra={})=>node.addEventListener(name,fn,{...options,...extra});
    const local=touch=>{const rect=canvas.getBoundingClientRect();return {x:touch.clientX-rect.left,y:touch.clientY-rect.top};};
    const pair=touches=>{const a=local(touches[0]),b=local(touches[1]);return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))};};
    function stopInertia(camera){for(const key of ['inertialAlphaOffset','inertialBetaOffset','inertialRadiusOffset','inertialPanningX','inertialPanningY'])if(key in camera)camera[key]=0;}
    function zoom(factor){const camera=getCamera();if(!Number.isFinite(camera.radius))return;stopInertia(camera);camera.radius=Math.max(camera.lowerRadiusLimit||25,Math.min(camera.upperRadiusLimit||5000,camera.radius*factor));camera.getViewMatrix(true);}
    function ground(point,camera){
      const ray=scene.createPickingRay(point.x,point.y,B.Matrix.Identity(),camera);
      if(Math.abs(ray.direction.y)<.05)return null;
      const distance=(camera.target.y-ray.origin.y)/ray.direction.y;
      return distance>0?ray.origin.add(ray.direction.scale(distance)):null;
    }
    function move(from,to){
      const camera=getCamera();stopInertia(camera);
      if(Number.isFinite(camera.radius)){
        const before=ground(from,camera);zoom(from.distance/to.distance);const after=ground(to,camera);
        if(before&&after){const offset=before.subtract(after);offset.y=0;if(offset.length()<camera.radius*2)camera.target.addInPlace(offset);}
      }else if(camera.rotation){camera.rotation.y-=(to.x-from.x)*.004;camera.rotation.x=Math.max(-1.35,Math.min(1.35,camera.rotation.x-(to.y-from.y)*.004));}
    }
    // Keep native one-finger document scrolling. Touch camera gestures are
    // handled here, not by Babylon's pointer-capture camera input.
    canvas.style.touchAction='pan-y';
    for(const name of ['pointerdown','pointermove','pointerup','pointercancel'])on(canvas,name,event=>{if(event.pointerType==='touch')event.stopImmediatePropagation();},{capture:true});
    on(canvas,'touchstart',event=>{
      if(event.touches.length>=2){multiple=true;single=null;previous=pair(event.touches);if(event.cancelable)event.preventDefault();}
      else{multiple=false;previous=null;single={...local(event.touches[0]),moved:false};}
    },{passive:false});
    on(canvas,'touchmove',event=>{
      if(event.touches.length>=2){multiple=true;single=null;if(event.cancelable)event.preventDefault();const current=pair(event.touches);if(previous)move(previous,current);previous=current;}
      else if(single){const point=local(event.touches[0]);if(Math.hypot(point.x-single.x,point.y-single.y)>8)single.moved=true;}
    },{passive:false});
    on(canvas,'touchend',event=>{
      if(!event.touches.length){if(single&&!single.moved&&!multiple){if(event.cancelable)event.preventDefault();onTap(scene.pick(single.x,single.y));}single=null;previous=null;multiple=false;}
      else if(event.touches.length<2){previous=null;single=null;}
    },{passive:false});
    on(canvas,'touchcancel',()=>{single=null;previous=null;multiple=false;},{passive:true});
    on(canvas,'wheel',event=>{
      event.stopImmediatePropagation();
      if(event.ctrlKey||event.metaKey){event.preventDefault();zoom(Math.exp(Math.max(-.25,Math.min(.25,event.deltaY*.002))));}
    },{capture:true,passive:false});
    const navigation=document.createElement('div');navigation.className='map-navigation';navigation.setAttribute('role','group');navigation.setAttribute('aria-label','Map camera controls');
    function button(text,label,action){const element=document.createElement('button');element.type='button';element.textContent=text;element.setAttribute('aria-label',label);element.title=label;on(element,'click',action);navigation.append(element);}
    button('+','Zoom in',()=>zoom(.8));button('-','Zoom out',()=>zoom(1.25));button('Home','Return to aerial park view',()=>{onHome();const mode=document.getElementById('camera-mode');if(mode)mode.value='map';const area=document.getElementById('area-focus');if(area)area.value='McCarren Park';});wrapper.append(navigation);
    const hint=document.createElement('span');hint.className='map-touch-hint';hint.textContent='Two fingers to pan and pinch';wrapper.append(hint);
    return {dispose(){events.abort();navigation.remove();hint.remove();}};
  }
  root.MotorcycleMapGestures={create};
})(window);
