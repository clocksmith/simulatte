(function attachTrafficFigures(root){
  'use strict';
  function person(part,mats,seated=false){
    const shape=(kind,position,scale,mat)=>{const mesh=part(kind,kind==='sphere'?{diameter:1,segments:16}:{height:1,radius:.5,tessellation:12},position,mat);mesh.scaling.set(...scale);return mesh;};
    const hips=seated?1.02:.91;
    shape('capsule',[0,hips+.32,seated?.08:0],[.39,.65,.26],mats.person).rotation.x=seated?.27:0;
    shape('sphere',[0,hips,0],[.35,.23,.26],mats.trousers||mats.rubber);
    shape('capsule',[0,hips+.71,seated?.17:0],[.12,.15,.12],mats.skin);
    const head=shape('sphere',[0,hips+.88,seated?.18:0],[.28,.34,.27],seated?mats.helmet||mats.motorcycle:mats.skin);
    if(seated){shape('sphere',[0,hips+.89,.29],[.25,.12,.06],mats.glass);}
    else {shape('sphere',[0,hips+1.01,-.025],[.28,.16,.27],mats.hair||mats.rubber);shape('sphere',[0,hips+.88,.14],[.055,.075,.065],mats.skin);}
    const limbs=[];
    for(const side of [-1,1]){
      const legRoot=shape('capsule',[side*.11,hips-.22,seated?.20:0],[.13,.46,.14],mats.trousers||mats.rubber);
      const shin=shape('capsule',[side*.11,seated?.54:.26,seated?.20:0],[.11,.43,.12],mats.trousers||mats.rubber);
      if(seated){legRoot.rotation.x=-.9;shin.rotation.x=.3;}
      const shoe=shape('sphere',[side*.11,seated?.34:.07,seated?.30:.065],[.145,.13,.29],mats.rubber);
      const arm=shape('capsule',[side*.25,hips+.37,seated?.26:0],[.105,.39,.11],mats.person);
      const forearm=shape('capsule',[side*.27,hips+.11,seated?.43:.035],[.085,.32,.095],mats.person);
      const hand=shape('sphere',[side*.27,hips-.03,seated?.57:.04],[.09,.12,.085],mats.skin);
      if(seated){arm.rotation.x=-.6;forearm.rotation.x=-1.0;}
      else limbs.push({side,legRoot,shin,shoe,arm,forearm,hand,base:[legRoot.position.y,shin.position.y,shoe.position.y]});
    }
    return {head,limbs};
  }
  function walk(limbs,distance,speed){
    const moving=Math.min(1,Math.max(0,speed)),phase=distance*4.8;
    for(const limb of limbs){
      const swing=Math.sin(phase+(limb.side<0?0:Math.PI))*.36*moving;
      limb.legRoot.rotation.x=swing;limb.shin.rotation.x=-Math.max(0,swing)*.65;
      limb.shoe.position.z=Math.sin(swing)*.5+.065;
      limb.shoe.position.y=limb.base[2]+Math.max(0,-Math.sin(phase+(limb.side<0?0:Math.PI)))*.055*moving;
      limb.arm.rotation.x=-swing*.75;limb.forearm.rotation.x=-swing*.55;
      limb.hand.position.z=-Math.sin(swing)*.32+.04;
    }
  }
  root.MotorcycleTrafficFigures=Object.freeze({person,walk});
})(globalThis);
