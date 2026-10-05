(function(root,factory){
  const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
  root.SimulattePluginActorMotion=api;
})(globalThis,function(){
  function create(){
    let scene=null,identity=null,updatedAt=0,duration=0,starts=new Map();
    function sample(now){
      if(!scene||!starts.size)return scene;
      const t=Math.max(0,Math.min(1,(now-updatedAt)/duration));
      const points=new Map();
      const actors=scene.actors.map(actor=>{
        const from=starts.get(actor.id);if(!from)return actor;
        const to=actor.points[0],point={x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t,z:(from.z||0)+((to.z||0)-(from.z||0))*t};
        point.motionPhase=(from.motionPhase||0)+Math.hypot(to.x-from.x,to.y-from.y)*t*2.5;
        points.set(actor.sourceId,point);return {...actor,points:[point],heading:Math.atan2(to.y-from.y,to.x-from.x)};
      });
      const cameraTargets=scene.cameraTargets.map(target=>{
        const point=points.get(target.sourceId);
        return point?{...target,target:[point.x,point.z,-point.y]}:target;
      });
      return {...scene,actors,cameraTargets};
    }
    function update(next,motion,now){
      if(motion?.id===identity&&motion?.running){scene=next;return;}
      const previous=sample(now),nextStarts=new Map();
      // Only adjacent accepted simulation states may interpolate. Seeks, resets,
      // pauses, and route replacements snap to their exact governed positions.
      if(motion?.running&&identity&&motion.previousId===identity){
        for(const actor of next.actors){
          const from=previous?.actors.find(row=>row.id===actor.id)?.points;
          if(from?.length!==1||actor.points.length!==1)continue;
          if(Math.hypot(actor.points[0].x-from[0].x,actor.points[0].y-from[0].y)>50)continue;
          nextStarts.set(actor.id,from[0]);
        }
      }
      duration=Math.min(240,Math.max(50,now-updatedAt));updatedAt=now;
      scene=next;identity=motion?.id||null;starts=nextStarts;
    }
    return {update,sample};
  }
  return {create};
});
