(function attachGeneratedPluginRegistry(root, factory) {
  const factories = typeof module === 'object' && module.exports
    ? {
    'cable-trader': require('../../../shared/plugins/cable-trader/index.js'),
    'food-recall-us': require('../../../shared/plugins/food-recall-us/index.js'),
    'safety-explorer': require('../../../shared/plugins/safety-explorer/index.js'),
    'sun-walker': require('../../../shared/plugins/sun-walker/index.js'),
      }
    : {
    'cable-trader': root.SimulattePluginCableTrader,
    'food-recall-us': root.SimulattePluginFoodRecallUs,
    'safety-explorer': root.SimulattePluginSafetyExplorer,
    'sun-walker': root.SimulattePluginSunWalker,
      };
  const api = factory(factories);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteGeneratedPluginRegistry = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createGeneratedPluginRegistry(factories) {
  const rows = [
  {
    "manifest": {
      "configSchema": "./config.schema.json",
      "consumes": [
        {
          "id": "fulfillment.delivery.v1",
          "required": false
        }
      ],
      "datasets": [],
      "defaultConfig": "./default-config.json",
      "entry": {
        "globalFactory": "SimulattePluginCableTrader",
        "integrity": "sha384-1a09d0a3791501c40ac9bc5c745820936f5733a794445cfdef72b206c133a8f360f8465cce6274d8d6ec3d4a110671eb",
        "path": "./index.js"
      },
      "extensionPoints": [
        "request",
        "event",
        "settlement",
        "ui",
        "presentation"
      ],
      "id": "cable-trader",
      "permissions": [
        "capabilities.invoke.v1",
        "events.propose.v1",
        "random.stream.v1",
        "receipts.append.v1",
        "routing.contribute.v1",
        "state.reduce.v1",
        "ui.inspector.v1",
        "world.query.v1"
      ],
      "provides": [
        "inventory.exchange.v1",
        "settlement.credit.v1",
        "field.logistics-service.v1"
      ],
      "receiptSchemas": [
        "simulatte.plugin.cableTraderNetworkReceipt.v1"
      ],
      "resources": [
        {
          "integrity": "sha384-085ba7a059504b8130be369289a492bd5afeb33ed8e9defe15c4df42a796d011c394d5d2eeffabba7b90362939069db7",
          "path": "./config.schema.json"
        },
        {
          "integrity": "sha384-f614b805288d97105a5ec668e2b7b6f1edfb046a3c89001be0af814fc2875f694ddfadb77b33837de18509480cd51614",
          "path": "./default-config.json"
        },
        {
          "integrity": "sha384-a096540bc1ea2eff20592af247cc642d24a327cb6b4e979f05eacde0c28f55c7b992e2ab56b3cb95829fd6666f2a6913",
          "path": "./network-simulation.js"
        }
      ],
      "schema": "simulatte.pluginManifest.v1",
      "sdkVersion": 2,
      "version": "2.0.0"
    },
    "configs": {
      "cable-trader-network-v2": {
        "cableTypes": [
          {
            "demandWeight": 18,
            "id": "usb-c-to-a",
            "label": "USB-C to USB-A",
            "labels": [
              "usb c to a",
              "usb-c to usb-a",
              "usb c cable"
            ]
          },
          {
            "demandWeight": 18,
            "id": "usb-c-to-c",
            "label": "USB-C to USB-C",
            "labels": [
              "usb c to c",
              "usb-c to usb-c"
            ]
          },
          {
            "demandWeight": 10,
            "id": "usb-c-to-lightning",
            "label": "USB-C to Lightning",
            "labels": [
              "usb c to lightning",
              "iphone cable",
              "lightning cable"
            ]
          },
          {
            "demandWeight": 12,
            "id": "ethernet-rj45",
            "label": "Ethernet / RJ45",
            "labels": [
              "ethernet",
              "rj45",
              "network cable"
            ]
          },
          {
            "demandWeight": 12,
            "id": "hdmi",
            "label": "HDMI",
            "labels": [
              "hdmi",
              "display cable"
            ]
          },
          {
            "demandWeight": 8,
            "id": "displayport",
            "label": "DisplayPort",
            "labels": [
              "displayport",
              "display port"
            ]
          },
          {
            "demandWeight": 4,
            "id": "mini-displayport",
            "label": "Mini DisplayPort",
            "labels": [
              "mini displayport",
              "thunderbolt 2 cable"
            ]
          },
          {
            "demandWeight": 5,
            "id": "micro-usb",
            "label": "Micro-USB",
            "labels": [
              "micro usb",
              "micro-usb"
            ]
          },
          {
            "demandWeight": 7,
            "id": "three-five-mm-audio",
            "label": "3.5 mm audio",
            "labels": [
              "3.5 mm",
              "aux cable",
              "audio cable"
            ]
          },
          {
            "demandWeight": 6,
            "id": "iec-c13-power",
            "label": "IEC C13 power",
            "labels": [
              "iec c13",
              "computer power cable",
              "monitor power cable"
            ]
          }
        ],
        "hubs": [
          {
            "id": "union-square-cable-hub",
            "label": "Union Square",
            "nodeId": "bike-node-0d9391b2bfa3"
          },
          {
            "id": "east-village-cable-hub",
            "label": "East Village",
            "nodeId": "bike-node-ffea919f743c"
          },
          {
            "id": "greenpoint-cable-hub",
            "label": "Greenpoint",
            "nodeId": "bike-node-7a95737b9c7d"
          },
          {
            "id": "williamsburg-cable-hub",
            "label": "North Williamsburg",
            "nodeId": "bike-node-e25116ea05a4"
          }
        ],
        "id": "cable-trader-network-v2",
        "schema": "simulatte.plugin.cableTraderConfig.v2",
        "simulation": {
          "durationDays": 30,
          "initialInventoryPerHubType": 8,
          "journeyEventCount": 960,
          "needCount": 4096,
          "participantCount": 2048,
          "renderedActorCount": 2048,
          "returnCount": 4096,
          "seed": "cable-city-month-2026-07"
        }
      }
    }
  },
  {
    "manifest": {
      "configSchema": "./config.schema.json",
      "consumes": [
        {
          "id": "field.weather.v1",
          "required": false
        },
        {
          "id": "field.logistics-service.v1",
          "required": false
        }
      ],
      "datasets": [
        {
          "id": "us.food.facilities.synthetic.v1",
          "reference": {
            "id": "us.food.facilities.synthetic.v1",
            "path": "../../../data/food-recall-us/facilities-synthetic-v1.json",
            "schemaId": "simulatte.usFoodFacilityCatalog.v1",
            "sha256": "6c01b650c42f02956f5b3bbaed8218af7a8ac8c679e4354316c27c60143f5e4c"
          },
          "required": true
        },
        {
          "id": "us.food.freight-corridors.v1",
          "reference": {
            "id": "us.food.freight-corridors.v1",
            "path": "../../../data/food-recall-us/freight-corridors-v1.json",
            "schemaId": "simulatte.usFoodFreightCorridors.v1",
            "sha256": "12c63da2930d624bd38ad172f8cf0c5013c6dd2c5f2af86fbedf3ca9553eee18"
          },
          "required": true
        },
        {
          "id": "us.food.commodity-profiles.v1",
          "reference": {
            "id": "us.food.commodity-profiles.v1",
            "path": "../../../data/food-recall-us/commodity-profiles-v1.json",
            "schemaId": "simulatte.usFoodCommodityProfiles.v1",
            "sha256": "36c7812f124d6f95beb01d72a0a3289755b6a832165f62e149d4343fb55b4dd3"
          },
          "required": true
        },
        {
          "id": "us.food.hazard-model-registry.v1",
          "reference": {
            "id": "us.food.hazard-model-registry.v1",
            "path": "../../../data/food-recall-us/hazard-model-registry-v1.json",
            "schemaId": "simulatte.usFoodHazardRegistry.v1",
            "sha256": "be5cc9de33a64318a7650cdf6697d654de95760b26373ce8dc24282fb2f78af8"
          },
          "required": true
        },
        {
          "id": "us.food.consumer-zones.v1",
          "reference": {
            "id": "us.food.consumer-zones.v1",
            "path": "../../../data/food-recall-us/consumer-zones-v1.json",
            "schemaId": "simulatte.usFoodConsumerZones.v1",
            "sha256": "67437acbab680fba61490f5cae0e004d3096fe733c629eb1ad1a7f9b07a6c94c"
          },
          "required": true
        },
        {
          "id": "us.food.historical-recalls.v1",
          "reference": {
            "id": "us.food.historical-recalls.v1",
            "path": "../../../data/food-recall-us/historical-recalls-v1.json",
            "schemaId": "simulatte.usFoodHistoricalRecalls.v1",
            "sha256": "72dc09d545d4c68a471554181bdb740e55e19e810eb032b57eb9cd379d52fd21"
          },
          "required": false
        },
        {
          "id": "us.environment.snapshot.v1",
          "reference": {
            "id": "us.environment.snapshot.v1",
            "path": "../../../data/food-recall-us/environment-snapshot-v1.json",
            "schemaId": "simulatte.usEnvironmentSnapshot.v1",
            "sha256": "3d607232ffc3874bdb1b5ad430c36b75793ca9f76bc40a16e0cadeb669392661"
          },
          "required": false
        }
      ],
      "defaultConfig": "./default-config.json",
      "entry": {
        "globalFactory": "SimulattePluginFoodRecallUs",
        "integrity": "sha384-1621cc53081e3684b391bcf0421376a7f7a0041eb379ababe220e53c7588dd2d7debe6a97b2dfba78034af20781c7dbc",
        "path": "./index.js"
      },
      "extensionPoints": [
        "request",
        "event",
        "settlement",
        "ui",
        "presentation"
      ],
      "id": "food-recall-us",
      "permissions": [
        "capabilities.invoke.v1",
        "events.propose.v1",
        "receipts.append.v1",
        "state.reduce.v1",
        "ui.inspector.v1",
        "ui.geospatial.v1",
        "random.stream.v1",
        "simulation.schedule.v1",
        "compute.worker.v1",
        "environment.read.v1",
        "geography.project.v1"
      ],
      "provides": [
        "simulation.food-recall.v2",
        "traceability.lookup.v1",
        "field.food-contamination.v1"
      ],
      "receiptSchemas": [
        "simulatte.plugin.foodRecallScenarioReceipt.v2",
        "simulatte.plugin.foodRecallEventChainReceipt.v1",
        "simulatte.plugin.foodRecallInterventionReceipt.v1",
        "simulatte.plugin.foodRecallTracebackReceipt.v1",
        "simulatte.plugin.foodRecallOutcomeReceipt.v1"
      ],
      "resources": [
        {
          "integrity": "sha384-35a24dc37cc678cb3a1676dba9e6148651f4633a9d9ada45c4ef00bda469cdc3b2ca663e06fbddfbf2ac1017982653c9",
          "path": "./config.schema.json"
        },
        {
          "integrity": "sha384-1cb29046157dab2b4b1ac99efc76d27fe1d76822d8910fe8c85fc81102967cb9230f529a4a4b59ec9aea6bcaa6ff1f4c",
          "path": "./default-config.json"
        },
        {
          "integrity": "sha384-42311c00bf7a7a6480e9ce58fedceab2eddda8bd5eacb57945c765d057f5a8c3ddfb2a2f64a7937d90e4c382a12a793e",
          "path": "./food-engine.js"
        },
        {
          "integrity": "sha384-5139a2cb232543d039a068c786f7660439cf5a7f438892ca53f0bbb4264fd384ae6255ed20a6f12cad1f8224d97d08fe",
          "path": "./food-presentation.js"
        }
      ],
      "schema": "simulatte.pluginManifest.v1",
      "sdkVersion": 2,
      "version": "2.0.0"
    },
    "configs": {
      "food-recall-us-default-v2": {
        "defaultScenarioId": "scenario:leafy-green-baseline",
        "ensembleReplicates": 24,
        "id": "food-recall-us-default-v2",
        "scenarios": [
          {
            "commodityId": "product:fresh-romaine",
            "contamination": {
              "foodCategory": "leafy_greens",
              "hazardStratum": "general",
              "initialLog10CfuPerG": 1.5,
              "prevalence": 0.02,
              "seededLots": 1
            },
            "defaultIntervention": {
              "dayOffset": 12,
              "depth": "consumer",
              "scope": "lot",
              "type": "recall"
            },
            "description": "Synthetic California romaine lots distributed to multiple U.S. regions; single contaminated grower lot.",
            "detectionProfile": "baseline",
            "durationDays": 30,
            "hazardId": "ecoli-o157",
            "id": "scenario:leafy-green-baseline",
            "kind": "synthetic",
            "label": "Leafy green traceback",
            "originFacilityKind": "grower",
            "seed": "food-recall-leafy-green-001"
          },
          {
            "coldChainFailure": {
              "ambientTempC": 28,
              "corridorStage": "distributor",
              "repairHours": 18
            },
            "commodityId": "product:shell-eggs",
            "contamination": {
              "foodCategory": "shell_eggs",
              "hazardStratum": "general",
              "initialLog10CfuPerG": 0.8,
              "prevalence": 0.03,
              "seededLots": 1
            },
            "defaultIntervention": {
              "dayOffset": 16,
              "depth": "retail",
              "scope": "lot",
              "type": "recall"
            },
            "description": "Synthetic shell-egg processing and distribution delay with a reefer failure and targeted recall.",
            "detectionProfile": "baseline",
            "durationDays": 40,
            "hazardId": "salmonella",
            "id": "scenario:egg-cold-chain",
            "kind": "synthetic",
            "label": "Egg cold-chain disruption",
            "originFacilityKind": "grower",
            "seed": "food-recall-eggs-002"
          },
          {
            "commodityId": "product:rte-soft-cheese",
            "contamination": {
              "foodCategory": "ready_to_eat_dairy",
              "hazardStratum": "older-or-immunocompromised",
              "initialLog10CfuPerG": 0.3,
              "prevalence": 0.05,
              "seededLots": 1
            },
            "defaultIntervention": {
              "dayOffset": 28,
              "depth": "consumer",
              "scope": "lot",
              "type": "recall"
            },
            "description": "Long shelf-life RTE soft cheese exposure with a high-risk population stratum.",
            "detectionProfile": "delayed",
            "durationDays": 60,
            "hazardId": "listeria-monocytogenes",
            "id": "scenario:listeria-rte",
            "kind": "synthetic",
            "label": "Listeria in ready-to-eat food",
            "originFacilityKind": "processor",
            "seed": "food-recall-listeria-003"
          },
          {
            "commodityId": "product:packaged-cookie",
            "contamination": {
              "foodCategory": "packaged_bakery",
              "hazardStratum": "susceptible",
              "presenceMg": 4,
              "prevalence": 1,
              "seededLots": 1
            },
            "defaultIntervention": {
              "dayOffset": 10,
              "depth": "consumer",
              "scope": "lot",
              "type": "recall"
            },
            "description": "Lot-specific undeclared-peanut labeling failure in packaged bakery; no microbial kinetics.",
            "detectionProfile": "baseline",
            "durationDays": 45,
            "hazardId": "undeclared-peanut",
            "id": "scenario:allergen-label",
            "kind": "synthetic",
            "label": "Undeclared allergen",
            "originFacilityKind": "processor",
            "seed": "food-recall-allergen-004"
          }
        ]
      }
    }
  },
  {
    "manifest": {
      "configSchema": "./config.schema.json",
      "consumes": [],
      "datasets": [
        {
          "id": "nyc-crash-history-2025-07-to-2026-07-v1",
          "reference": {
            "id": "nyc-crash-history-2025-07-to-2026-07-v1",
            "path": "../../../data/simulatte/safety-history-index-v1.json",
            "schemaId": "simulatte.autonomySafetyHistoryIndex.v1",
            "sha256": "3b7aee9ec349c558f32778c3797f87a8c39d34dbb8f3d42cc1ed47079f5bc602"
          },
          "required": true
        }
      ],
      "defaultConfig": "./default-config.json",
      "entry": {
        "globalFactory": "SimulattePluginSafetyExplorer",
        "integrity": "sha384-6a31e6a21438cb44757065c7bc5c5ff5a95dc95761aab645383081177010b48e67f719f27532f471f3bc9df6fe85d32f",
        "path": "./index.js"
      },
      "extensionPoints": [
        "route",
        "ui",
        "presentation"
      ],
      "id": "safety-explorer",
      "permissions": [
        "events.propose.v1",
        "receipts.append.v1",
        "routing.contribute.v1",
        "state.reduce.v1",
        "ui.inspector.v1"
      ],
      "provides": [
        "routing.dimension.historical-observation.v1",
        "routing.dimension.historical-observation.v2",
        "field.mobility-risk.v1"
      ],
      "receiptSchemas": [
        "simulatte.plugin.safetyExplorerRouteAudit.v1"
      ],
      "resources": [
        {
          "integrity": "sha384-1c890e5a242e3d870a02a4cb027102d16a5f5d2e3df3650a6d0a439d8f307d1f09e62e218eafd6d33f4edb1011e65cf7",
          "path": "./config.schema.json"
        },
        {
          "integrity": "sha384-f4230093f9bc9b92e7145f1da988b87b8a20fd6247e0fe13a11c4b5293272447dbf485976e560f1bd285aa8e04e16c10",
          "path": "./default-config.json"
        }
      ],
      "schema": "simulatte.pluginManifest.v1",
      "sdkVersion": 1,
      "version": "1.0.0"
    },
    "configs": {
      "safety-explorer-default-v1": {
        "id": "safety-explorer-default-v1",
        "schema": "simulatte.plugin.safetyExplorerConfig.v1"
      }
    }
  },
  {
    "manifest": {
      "configSchema": "./config.schema.json",
      "consumes": [],
      "datasets": [
        {
          "id": "world.buildings.v1",
          "required": true
        }
      ],
      "defaultConfig": "./default-config.json",
      "entry": {
        "globalFactory": "SimulattePluginSunWalker",
        "integrity": "sha384-5293268556ed27afb86d948b20f2664bb42040651bcad9a73361c0922e5753b3288506403ee72de0f00679f023f67e57",
        "path": "./index.js"
      },
      "extensionPoints": [
        "request",
        "route",
        "settlement",
        "ui",
        "presentation"
      ],
      "id": "sun-walker",
      "permissions": [
        "clock.read.v1",
        "environment.read.v1",
        "events.propose.v1",
        "receipts.append.v1",
        "routing.contribute.v1",
        "state.reduce.v1",
        "ui.inspector.v1",
        "world.query.v1"
      ],
      "provides": [
        "routing.dimension.sun-exposure.v1",
        "routing.dimension.mean-radiant-temperature-dose.v1",
        "field.thermal-comfort.v1"
      ],
      "receiptSchemas": [
        "simulatte.plugin.sunWalkerSelectionReceipt.v1"
      ],
      "resources": [
        {
          "integrity": "sha384-952fcf2aeec13cbb18a950586a862cd9af374b4565bdce1952b3175274ae3753de1a4a3dfb9f74e42d56f5d8f51dbaa2",
          "path": "./config.schema.json"
        },
        {
          "integrity": "sha384-762a79ddc5fab5f85228022263473b6efe9391bb4dd4f1612720e42e5346c76090ebd30633116397f8aaa968205e257a",
          "path": "./default-config.json"
        },
        {
          "integrity": "sha384-e5026d70e0796b87fb3c0383866e56ccb1b9428396e7cde74496806062bdff060cd7294b20942228e66d586f7b8bf185",
          "path": "./sun-exposure.js"
        }
      ],
      "schema": "simulatte.pluginManifest.v1",
      "sdkVersion": 2,
      "version": "2.0.0"
    },
    "configs": {
      "sun-walker-default-v1": {
        "directSunWeight": 1,
        "id": "sun-walker-default-v1",
        "maximumAddedRatio": 0.25,
        "maximumAddedTimeSeconds": 600,
        "maximumAlternatives": 3,
        "sampleSpacingM": 18,
        "schema": "simulatte.plugin.sunWalkerConfig.v1",
        "unknownWeight": 2
      }
    }
  }
];
  const byId = new Map(rows.map((row) => [row.manifest.id, Object.freeze({ ...row, factory: factories[row.manifest.id] })]));
  return Object.freeze({
    schema: 'simulatte.pluginRegistry.v1',
    ids: Object.freeze([...byId.keys()].sort()),
    entry(id) { return byId.get(id) || null; },
  });
});
