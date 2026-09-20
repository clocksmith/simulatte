(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.SimulattePublicRoutes=api;
})(typeof globalThis!=='undefined'?globalThis:window,function(){
  const pages=Object.freeze([
  {
    "path": "/motorcycle",
    "entry": "/simulatte/motorcycle-noise/index.html",
    "legacy": [
      "/simulatte/motorcycle-noise",
      "/simulatte/motorcycle-noise/index.html",
      "/motorcycle-noise"
    ]
  },
  {
    "path": "/sunwalker",
    "tier": "city",
    "profile": "sun-walker-v1",
    "legacy": [
      "/city/sun-walker-v1",
      "/simulatte/city/sun-walker-v1"
    ]
  },
  {
    "path": "/datacenter",
    "tier": "datacenter",
    "profile": "gpu-supercluster-v1",
    "legacy": [
      "/datacenter/gpu-supercluster-v1",
      "/simulatte/datacenter/gpu-supercluster-v1"
    ]
  },
  {
    "path": "/interstellar",
    "tier": "star-chart",
    "profile": "interstellar-relay-network-v1",
    "legacy": [
      "/star-chart/interstellar-relay-network-v1",
      "/simulatte/star-chart/interstellar-relay-network-v1"
    ]
  },
  {
    "path": "/orbital",
    "tier": "solar-system",
    "profile": "orbital-transfer-planner-v1",
    "legacy": [
      "/solar-system/orbital-transfer-planner-v1",
      "/simulatte/solar-system/orbital-transfer-planner-v1"
    ]
  },
  {
    "path": "/grid",
    "tier": "country",
    "profile": "grid-resilience-us-v1",
    "legacy": [
      "/country/grid-resilience-us-v1",
      "/simulatte/country/grid-resilience-us-v1"
    ]
  },
  {
    "path": "/subsea",
    "tier": "world",
    "profile": "subsea-network-global-v1",
    "legacy": [
      "/world/subsea-network-global-v1",
      "/simulatte/world/subsea-network-global-v1"
    ]
  }
].map(page=>Object.freeze({...page,legacy:Object.freeze(page.legacy)})));
  const normalize=path=>String(path||'/').replace(/\/+$/,'')||'/';
  function forPath(path){const name=normalize(path);return pages.find(page=>page.path===name||page.legacy.includes(name))||null;}
  function forSelection(tier,profile){return pages.find(page=>page.tier===tier&&page.profile===profile)||null;}
  function redirectFor(path){const page=forPath(path);return page&&path!==page.path?page.path:null;}
  return Object.freeze({pages,forPath,forSelection,redirectFor});
});
