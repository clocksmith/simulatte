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
    ],
    "displayName": "Motorcycle Noise",
    "description": "Observe moving traffic and sound propagation.",
    "readiness": "available",
    "featured": true,
    "previewAsset": "/simulation-previews/motorcycle.png",
    "limitations": "",
    "evidence": [
      "public/simulation-previews/capture-receipt.json"
    ]
  },
  {
    "path": "/sunwalker",
    "tier": "city",
    "profile": "sun-walker-v1",
    "legacy": [
      "/city/sun-walker-v1",
      "/simulatte/city/sun-walker-v1"
    ],
    "displayName": "Sun Walker",
    "description": "Compare walking routes through changing sun and shade.",
    "readiness": "available",
    "featured": true,
    "previewAsset": "/simulation-previews/sunwalker.png",
    "limitations": "",
    "evidence": [
      "artifacts/2026-10-04-catalog/opening/browser.json"
    ]
  },
  {
    "path": "/datacenter",
    "tier": "datacenter",
    "profile": "gpu-supercluster-v1",
    "legacy": [
      "/datacenter/gpu-supercluster-v1",
      "/simulatte/datacenter/gpu-supercluster-v1"
    ],
    "displayName": "GPU Cluster",
    "description": "Explore racks computing, communicating, and waiting.",
    "readiness": "available",
    "featured": true,
    "previewAsset": "/simulation-previews/gpu.png",
    "limitations": "",
    "evidence": [
      "artifacts/2026-10-04-catalog/opening/browser.json",
      "artifacts/2026-10-04-catalog/gpu-replay-verified/report.json"
    ]
  },
  {
    "path": "/interstellar",
    "tier": "star-chart",
    "profile": "interstellar-relay-network-v1",
    "legacy": [
      "/star-chart/interstellar-relay-network-v1",
      "/simulatte/star-chart/interstellar-relay-network-v1"
    ],
    "displayName": "Interstellar Relay",
    "description": "Explore relay coverage and communication delays.",
    "readiness": "available",
    "featured": false,
    "previewAsset": null,
    "limitations": "Relay infrastructure is hypothetical; reliability is a seeded model.",
    "evidence": [
      "artifacts/2026-10-04-catalog/opening/browser.json",
      "artifacts/2026-10-04-catalog/qualification-verified/browser.json"
    ]
  },
  {
    "path": "/orbital",
    "tier": "solar-system",
    "profile": "orbital-transfer-planner-v1",
    "legacy": [
      "/solar-system/orbital-transfer-planner-v1",
      "/simulatte/solar-system/orbital-transfer-planner-v1"
    ],
    "displayName": "Orbital Transfer",
    "description": "Compare transfer windows, travel time, and propellant.",
    "readiness": "available",
    "featured": false,
    "previewAsset": null,
    "limitations": "Transfer screening omits navigation covariance and maneuver execution error.",
    "evidence": [
      "artifacts/2026-10-04-catalog/opening/browser.json",
      "artifacts/2026-10-04-catalog/qualification-verified/browser.json"
    ]
  },
  {
    "path": "/grid",
    "tier": "country",
    "profile": "grid-resilience-us-v1",
    "legacy": [
      "/country/grid-resilience-us-v1",
      "/simulatte/country/grid-resilience-us-v1"
    ],
    "displayName": "Grid Resilience",
    "description": "Compare regional power supply, demand, and restoration.",
    "readiness": "available",
    "featured": false,
    "previewAsset": null,
    "limitations": "Dispatch and restoration are modeled; results are not a live grid forecast.",
    "evidence": [
      "artifacts/2026-10-04-catalog/opening/browser.json",
      "artifacts/2026-10-04-catalog/qualification-verified/browser.json"
    ]
  },
  {
    "path": "/subsea",
    "tier": "world",
    "profile": "subsea-network-global-v1",
    "legacy": [
      "/world/subsea-network-global-v1",
      "/simulatte/world/subsea-network-global-v1"
    ],
    "displayName": "Subsea Network",
    "description": "Explore cable capacity, routing, and network disruptions.",
    "readiness": "available",
    "featured": false,
    "previewAsset": null,
    "limitations": "Cable capacity, failures, and repairs are modeled; live operator data is not shown.",
    "evidence": [
      "artifacts/2026-10-04-catalog/opening/browser.json",
      "artifacts/2026-10-04-catalog/qualification-verified/browser.json"
    ]
  },
  {
    "path": "/city/cable-trader-pickup-v1",
    "tier": "city",
    "profile": "cable-trader-pickup-v1",
    "legacy": [],
    "displayName": "Cable Trader",
    "description": "Explore cable exchanges between neighborhood hubs.",
    "readiness": "experimental",
    "featured": false,
    "previewAsset": null,
    "limitations": "Supply, demand, and exchanges are simulated, not actual local inventory.",
    "evidence": [
      "artifacts/2026-10-04-catalog/opening/browser.json"
    ]
  },
  {
    "path": "/city/neighborhood-bulk-pool-v1",
    "tier": "city",
    "profile": "neighborhood-bulk-pool-v1",
    "legacy": [],
    "displayName": "Neighborhood Bulk Pool",
    "description": "Coordinate local bulk purchases and pickups.",
    "readiness": "experimental",
    "featured": false,
    "previewAsset": null,
    "limitations": "Purchases and pickup coordination are simulated, not live offers.",
    "evidence": [
      "artifacts/2026-10-04-catalog/opening/browser.json"
    ]
  },
  {
    "path": "/city/nyc-development-atlas-v1",
    "tier": "city",
    "profile": "nyc-development-atlas-v1",
    "legacy": [],
    "displayName": "NYC Development Atlas",
    "description": "Inspect city development and governed source records.",
    "readiness": "experimental",
    "featured": false,
    "previewAsset": null,
    "limitations": "Source records provide context; results do not establish development feasibility.",
    "evidence": [
      "artifacts/2026-10-04-catalog/opening/browser.json"
    ]
  },
  {
    "path": "/country/food-recall-us-v1",
    "tier": "country",
    "profile": "food-recall-us-v1",
    "legacy": [],
    "displayName": "Food Recall",
    "description": "Trace distribution and compare recall responses.",
    "readiness": "experimental",
    "featured": false,
    "previewAsset": null,
    "limitations": "Recall scenarios are simulated, not active food-safety notices.",
    "evidence": [
      "artifacts/2026-10-04-catalog/opening/browser.json"
    ]
  },
  {
    "path": "/world/maritime-trade-global-v1",
    "tier": "world",
    "profile": "maritime-trade-global-v1",
    "legacy": [],
    "displayName": "Maritime Trade",
    "description": "Compare shipping routes and trade disruptions.",
    "readiness": "experimental",
    "featured": false,
    "previewAsset": null,
    "limitations": "Trade and disruptions are modeled, not live shipping operations.",
    "evidence": [
      "artifacts/2026-10-04-catalog/opening/browser.json"
    ]
  },
  {
    "path": "/solar-system/asteroid-defense-v1",
    "tier": "solar-system",
    "profile": "asteroid-defense-v1",
    "legacy": [],
    "displayName": "Asteroid Defense",
    "description": "Compare interception strategies and modeled outcomes.",
    "readiness": "experimental",
    "featured": false,
    "previewAsset": null,
    "limitations": "Interception outcomes are screening models, not operational defense predictions.",
    "evidence": [
      "artifacts/2026-10-04-catalog/opening/browser.json"
    ]
  },
  {
    "path": "/simulatte/solar-drive/index.html",
    "entry": "/simulatte/solar-drive/index.html",
    "legacy": [],
    "displayName": "Solar Drive",
    "description": "Inspect a solar vehicle’s component and energy model.",
    "readiness": "experimental",
    "featured": false,
    "previewAsset": null,
    "limitations": "Starts with component inspection; run the idealized energy model explicitly. This is not a built-vehicle measurement.",
    "evidence": [
      "artifacts/2026-10-04-catalog/qualification-verified/browser.json"
    ]
  }
].map(page=>Object.freeze({...page,legacy:Object.freeze(page.legacy),evidence:Object.freeze(page.evidence)})));
  const normalize=path=>String(path||'/').replace(/\/+$/,'')||'/';
  function forPath(path){const name=normalize(path);return pages.find(page=>page.path===name||page.legacy.includes(name))||null;}
  function forSelection(tier,profile){return pages.find(page=>page.tier===tier&&page.profile===profile)||null;}
  function redirectFor(path){const page=forPath(path);return page&&path!==page.path?page.path:null;}
  return Object.freeze({pages,featured: Object.freeze(pages.filter(page => page.featured)),forPath,forSelection,redirectFor});
});
