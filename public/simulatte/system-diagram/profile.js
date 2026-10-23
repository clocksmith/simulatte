(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SimulatteSystemDiagramProfile=api;})(globalThis,function(){
  'use strict';
  const CAPABILITIES=Object.freeze(['diagram-authoring','class-instance-overrides','named-ports','registered-kernels','seeded-replay','checkpoints','causal-inspection']);
  function validate(p,route){
    const fields=['schema','id','version','name','route','entry','model','configPath','defaultSeed','capabilities','limitations'];
    if(!p||Object.keys(p).length!==fields.length||fields.some(k=>!Object.hasOwn(p,k)))throw Error('Missing or undeclared System Diagram profile fields');
    if(p.schema!=='simulatte.systemDiagramProfile.v3'||p.id!==route.profile||p.route!==route.path||p.entry!==route.entry||p.name!==route.displayName||p.model!=='system-diagram/v1'||p.configPath!=='/data/system-diagram/config.json')throw Error('Profile does not match the canonical System Diagram route/model');
    if(!Number.isInteger(p.defaultSeed)||p.defaultSeed<0||p.defaultSeed>4294967295||typeof p.version!=='string'||!Array.isArray(p.capabilities)||!p.capabilities.every(v=>CAPABILITIES.includes(v))||typeof p.limitations!=='string')throw Error('Invalid System Diagram profile');
    return structuredClone(p);
  }
  return Object.freeze({validate,CAPABILITIES});
});
