(function(root){
  function create({B,scene,canvas,getCamera,onTap,onHome,onInteract=()=>{}}){
    const events=new AbortController(),options={signal:events.signal},wrapper=canvas.parentElement;
    let previous=null,single=null,multiple=false;
    const on=(node,name,fn,extra={})=>node.addEventListener(name,fn,{...options,...extra});
    const local=touch=>{const rect=canvas.getBoundingClientRect();return {x:touch.clientX-rect.left,y:touch.clientY-rect.top};};
    const pair=touches=>{const a=local(touches[0]),b=local(touches[1]);return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))};};
    function stopInertia(camera){for(const key of ['inertialAlphaOffset','inertialBetaOffset','inertialRadiusOffset','inertialPanningX','inertialPanningY'])if(key in camera)camera[key]=0;}
    function zoom(factor){
      onInteract();const camera=getCamera();stopInertia(camera);
      if(Number.isFinite(camera.radius))camera.radius=Math.max(camera.lowerRadiusLimit||25,Math.min(camera.upperRadiusLimit||5000,camera.radius*factor));
      else{const direction=camera.getDirection(B.Axis.Z);camera.position.addInPlace(direction.scale((1-factor)*Math.max(8,camera.position.y)));camera.position.y=Math.max(1.7,camera.position.y);}
      camera.getViewMatrix(true);
    }
    function pan(horizontal,forward){
      onInteract();const camera=getCamera();stopInertia(camera);
      const right=camera.getDirection(B.Axis.X),ahead=camera.getDirection(B.Axis.Z);
      right.y=0;ahead.y=0;right.normalize();ahead.normalize();
      const step=Number.isFinite(camera.radius)?Math.max(3,camera.radius*.06):Math.max(2,camera.position.y*.12);
      const offset=right.scale(horizontal*step).add(ahead.scale(forward*step));
      if(Number.isFinite(camera.radius))camera.target.addInPlace(offset);else camera.position.addInPlace(offset);
      camera.getViewMatrix(true);
    }
    function ground(point,camera){
      const ray=scene.createPickingRay(point.x,point.y,B.Matrix.Identity(),camera);
      if(Math.abs(ray.direction.y)<.05)return null;
      const distance=(camera.target.y-ray.origin.y)/ray.direction.y;
      return distance>0?ray.origin.add(ray.direction.scale(distance)):null;
    }
    function move(from,to){
      onInteract();
      const camera=getCamera();stopInertia(camera);
      if(Number.isFinite(camera.radius)){
        const before=ground(from,camera);zoom(from.distance/to.distance);const after=ground(to,camera);
        if(before&&after){const offset=before.subtract(after);offset.y=0;if(offset.length()<camera.radius*2)camera.target.addInPlace(offset);}
      }else{zoom(from.distance/to.distance);pan((from.x-to.x)*.035,(to.y-from.y)*.035);}
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
      event.preventDefault();zoom(Math.exp(Math.max(-.25,Math.min(.25,event.deltaY*(event.deltaMode===1?.04:.002)))));
    },{capture:true,passive:false});
    const directions={up:[0,1],down:[0,-1],left:[-1,0],right:[1,0]};
    for(const button of document.querySelectorAll('[data-pan]'))on(button,'click',()=>pan(...directions[button.dataset.pan]));
    // Capture before Babylon's keyboard camera input so each key moves once.
    on(canvas,'keydown',event=>{const direction=event.key.replace('Arrow','').toLowerCase();if(directions[direction]){event.preventDefault();event.stopImmediatePropagation();pan(...directions[direction]);}},{capture:true});
    on(document.getElementById('map-zoom-in'),'click',()=>zoom(.8));
    on(document.getElementById('map-zoom-out'),'click',()=>zoom(1.25));
    return {dispose(){events.abort();}};
  }
  root.MotorcycleMapGestures={create};
})(window);
