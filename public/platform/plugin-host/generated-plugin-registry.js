(function attachGeneratedPluginRegistry(root, factory) {
  const factories = typeof module === 'object' && module.exports
    ? {
    'accessible-journey': require('../../../plugins/accessible-journey/index.js'),
    'amenity-router': require('../../../plugins/amenity-router/index.js'),
    'cable-trader': require('../../../plugins/cable-trader/index.js'),
    'counterfactual-lab': require('../../../plugins/counterfactual-lab/index.js'),
    'gig-wage-truth': require('../../../plugins/gig-wage-truth/index.js'),
    'historical-streets': require('../../../plugins/historical-streets/index.js'),
    'p2p-delivery': require('../../../plugins/p2p-delivery/index.js'),
    'safety-explorer': require('../../../plugins/safety-explorer/index.js'),
    'sun-walker': require('../../../plugins/sun-walker/index.js'),
      }
    : {
    'accessible-journey': root.SimulattePluginAccessibleJourney,
    'amenity-router': root.SimulattePluginAmenityRouter,
    'cable-trader': root.SimulattePluginCableTrader,
    'counterfactual-lab': root.SimulattePluginCounterfactualLab,
    'gig-wage-truth': root.SimulattePluginGigWageTruth,
    'historical-streets': root.SimulattePluginHistoricalStreets,
    'p2p-delivery': root.SimulattePluginP2pDelivery,
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
      "consumes": [],
      "datasets": [
        {
          "id": "nyc-pedestrian-ramp-accessibility-v1",
          "required": true
        }
      ],
      "defaultConfig": "./default-config.json",
      "entry": {
        "globalFactory": "SimulattePluginAccessibleJourney",
        "integrity": "sha384-472661db3f146ca574004614e21f65091de8db0cc471767fbafafefcb66ba934b380ee787932c0520aacd48917c53def",
        "path": "./index.js"
      },
      "extensionPoints": [
        "route",
        "settlement",
        "ui"
      ],
      "id": "accessible-journey",
      "permissions": [
        "events.propose.v1",
        "receipts.append.v1",
        "routing.contribute.v1",
        "state.reduce.v1",
        "ui.inspector.v1"
      ],
      "provides": [
        "routing.eligibility.accessibility.v1"
      ],
      "receiptSchemas": [
        "simulatte.plugin.accessibleJourneyReceipt.v1"
      ],
      "schema": "simulatte.pluginManifest.v1",
      "sdkVersion": 1,
      "version": "1.0.0"
    },
    "configs": {
      "accessible-journey-default-v1": {
        "id": "accessible-journey-default-v1",
        "schema": "simulatte.plugin.accessibleJourneyConfig.v1"
      }
    }
  },
  {
    "manifest": {
      "configSchema": "./config.schema.json",
      "consumes": [],
      "datasets": [
        {
          "id": "nyc-bicycle-parking-route-amenity-v1",
          "required": true
        }
      ],
      "defaultConfig": "./default-config.json",
      "entry": {
        "globalFactory": "SimulattePluginAmenityRouter",
        "integrity": "sha384-48c8ff709ad3c84ae5888f3e46369e505fdd68eabd75f0b81c2f90c46f20cb1625cbf58851b17dca6c0685045b3f1f53",
        "path": "./index.js"
      },
      "extensionPoints": [
        "route",
        "ui"
      ],
      "id": "amenity-router",
      "permissions": [
        "events.propose.v1",
        "receipts.append.v1",
        "routing.contribute.v1",
        "state.reduce.v1",
        "ui.inspector.v1"
      ],
      "provides": [
        "routing.eligibility.amenity.v1",
        "routing.dimension.amenity-distance.v1"
      ],
      "receiptSchemas": [
        "simulatte.plugin.amenityRouteAudit.v1"
      ],
      "schema": "simulatte.pluginManifest.v1",
      "sdkVersion": 1,
      "version": "1.0.0"
    },
    "configs": {
      "amenity-router-default-v1": {
        "id": "amenity-router-default-v1",
        "schema": "simulatte.plugin.amenityRouterConfig.v1"
      }
    }
  },
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
        "integrity": "sha384-7e21ea9c7268827eb7463c2820a5f038a22964441e185f4c40f71c04586aae426abcacabb9d7552b9cd27a992d483980",
        "path": "./index.js"
      },
      "extensionPoints": [
        "request",
        "event",
        "settlement",
        "ui"
      ],
      "id": "cable-trader",
      "permissions": [
        "capabilities.invoke.v1",
        "events.propose.v1",
        "receipts.append.v1",
        "state.reduce.v1",
        "ui.inspector.v1",
        "world.query.v1"
      ],
      "provides": [
        "inventory.exchange.v1",
        "settlement.credit.v1"
      ],
      "receiptSchemas": [
        "simulatte.plugin.cableTraderRequestReceipt.v1"
      ],
      "schema": "simulatte.pluginManifest.v1",
      "sdkVersion": 1,
      "version": "1.0.0"
    },
    "configs": {
      "cable-trader-default-v1": {
        "cableTypes": [
          {
            "id": "usb-c-to-a",
            "labels": [
              "usb c to a",
              "usb-c to usb-a",
              "usb c cable"
            ]
          },
          {
            "id": "ethernet-rj45",
            "labels": [
              "ethernet",
              "rj45",
              "network cable"
            ]
          },
          {
            "id": "hdmi",
            "labels": [
              "hdmi",
              "display cable"
            ]
          },
          {
            "id": "displayport",
            "labels": [
              "displayport",
              "display port"
            ]
          },
          {
            "id": "usb-c-to-c",
            "labels": [
              "usb c to c",
              "usb-c to usb-c"
            ]
          }
        ],
        "hubs": [
          {
            "id": "union-square-cable-hub",
            "nodeId": "bike-node-a3f0f4b7e7e3"
          },
          {
            "id": "east-village-cable-hub",
            "nodeId": "bike-node-ffea919f743c"
          }
        ],
        "id": "cable-trader-default-v1",
        "inventory": {
          "east-village-cable-hub:usb-c-to-a": 18,
          "east-village-cable-hub:usb-c-to-c": 20,
          "union-square-cable-hub:ethernet-rj45": 16,
          "union-square-cable-hub:hdmi": 12,
          "union-square-cable-hub:usb-c-to-a": 24
        },
        "schema": "simulatte.plugin.cableTraderConfig.v1"
      }
    }
  },
  {
    "manifest": {
      "configSchema": "./config.schema.json",
      "consumes": [
        {
          "id": "world.snapshot.v1",
          "required": false
        }
      ],
      "datasets": [],
      "defaultConfig": "./default-config.json",
      "entry": {
        "globalFactory": "SimulattePluginCounterfactualLab",
        "integrity": "sha384-31b683d5a356ed9cb80791f59822ee716a9d7198a8cdb51480152d9c0cdd661ae01d98918d04c6dcff03488424df2a4b",
        "path": "./index.js"
      },
      "extensionPoints": [
        "event",
        "ui"
      ],
      "id": "counterfactual-lab",
      "permissions": [
        "capabilities.invoke.v1",
        "events.propose.v1",
        "receipts.append.v1",
        "simulation.run.v1",
        "state.reduce.v1",
        "ui.inspector.v1"
      ],
      "provides": [
        "analysis.counterfactual.v1"
      ],
      "receiptSchemas": [
        "simulatte.plugin.counterfactualLabReceipt.v1"
      ],
      "schema": "simulatte.pluginManifest.v1",
      "sdkVersion": 1,
      "version": "1.0.0"
    },
    "configs": {
      "counterfactual-lab-default-v1": {
        "id": "counterfactual-lab-default-v1",
        "schema": "simulatte.plugin.counterfactualLabConfig.v1"
      }
    }
  },
  {
    "manifest": {
      "configSchema": "./config.schema.json",
      "consumes": [
        {
          "id": "settlement.delivery.v1",
          "required": true
        }
      ],
      "datasets": [],
      "defaultConfig": "./default-config.json",
      "entry": {
        "globalFactory": "SimulattePluginGigWageTruth",
        "integrity": "sha384-f089580c7f9e04909d24981bb51414c91d81af9f6957e492a723316bc50f11d2a251cd4588e10bc23a967b2b5f664dbd",
        "path": "./index.js"
      },
      "extensionPoints": [
        "settlement",
        "ui"
      ],
      "id": "gig-wage-truth",
      "permissions": [
        "capabilities.invoke.v1",
        "events.propose.v1",
        "receipts.append.v1",
        "state.reduce.v1",
        "ui.inspector.v1"
      ],
      "provides": [
        "analysis.gross-work-rate.v1"
      ],
      "receiptSchemas": [
        "simulatte.plugin.gigWageTruthReceipt.v1"
      ],
      "schema": "simulatte.pluginManifest.v1",
      "sdkVersion": 1,
      "version": "1.0.0"
    },
    "configs": {
      "gig-wage-truth-default-v1": {
        "id": "gig-wage-truth-default-v1",
        "includeWaiting": true,
        "schema": "simulatte.plugin.gigWageTruthConfig.v1"
      }
    }
  },
  {
    "manifest": {
      "configSchema": "./config.schema.json",
      "consumes": [],
      "datasets": [
        {
          "id": "nyc-world-snapshot-registry-v1",
          "required": true
        }
      ],
      "defaultConfig": "./default-config.json",
      "entry": {
        "globalFactory": "SimulattePluginHistoricalStreets",
        "integrity": "sha384-22c6fa853fd8f1cdd66e4970148202a3b2a1df6ed059e8b745be468bdac4cd25877992371c9aaa6e2171bd7c082a4ee4",
        "path": "./index.js"
      },
      "extensionPoints": [
        "ui"
      ],
      "id": "historical-streets",
      "permissions": [
        "ui.inspector.v1"
      ],
      "provides": [
        "world.snapshot.v1"
      ],
      "receiptSchemas": [],
      "schema": "simulatte.pluginManifest.v1",
      "sdkVersion": 1,
      "version": "1.0.0"
    },
    "configs": {
      "historical-streets-default-v1": {
        "id": "historical-streets-default-v1",
        "schema": "simulatte.plugin.historicalStreetsConfig.v1"
      }
    }
  },
  {
    "manifest": {
      "configSchema": "./config.schema.json",
      "consumes": [],
      "datasets": [
        {
          "id": "battery-office-east-village-v1",
          "required": true
        }
      ],
      "defaultConfig": "./default-config.json",
      "entry": {
        "globalFactory": "SimulattePluginP2pDelivery",
        "integrity": "sha384-ecb9414e46065a1baac92e8ceb26b693a26d6196179df3474f45e172998cc0acf17c404a48490ce504d9fa246b203622",
        "path": "./index.js"
      },
      "extensionPoints": [
        "request",
        "settlement",
        "ui"
      ],
      "id": "p2p-delivery",
      "permissions": [
        "events.propose.v1",
        "receipts.append.v1",
        "routing.contribute.v1",
        "state.reduce.v1",
        "ui.inspector.v1",
        "world.query.v1"
      ],
      "provides": [
        "fulfillment.delivery.v1",
        "settlement.delivery.v1"
      ],
      "receiptSchemas": [
        "simulatte.plugin.p2pDeliveryMatchReceipt.v1",
        "simulatte.plugin.p2pDeliverySettlement.v1"
      ],
      "schema": "simulatte.pluginManifest.v1",
      "sdkVersion": 1,
      "version": "1.0.0"
    },
    "configs": {
      "p2p-delivery-default-v1": {
        "id": "p2p-delivery-default-v1",
        "schema": "simulatte.plugin.p2pDeliveryConfig.v1"
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
          "required": true
        }
      ],
      "defaultConfig": "./default-config.json",
      "entry": {
        "globalFactory": "SimulattePluginSafetyExplorer",
        "integrity": "sha384-675356b8bed85bdd1ca7f1786c8341a8f3a2c626c0e24cbf0795d51369e47031bb27edabd426f5f40cbda07c6bcb379a",
        "path": "./index.js"
      },
      "extensionPoints": [
        "route",
        "ui"
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
        "routing.dimension.historical-observation.v1"
      ],
      "receiptSchemas": [
        "simulatte.plugin.safetyExplorerRouteAudit.v1"
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
        "integrity": "sha384-cc76ff1413df02b51cfcf897f12d2bc9a5d2bccb33d562919596eb899273e1a452154d122f2c458d5a69eed88375c819",
        "path": "./index.js"
      },
      "extensionPoints": [
        "request",
        "settlement",
        "ui"
      ],
      "id": "sun-walker",
      "permissions": [
        "clock.read.v1",
        "events.propose.v1",
        "receipts.append.v1",
        "routing.contribute.v1",
        "state.reduce.v1",
        "ui.inspector.v1",
        "world.query.v1"
      ],
      "provides": [
        "routing.dimension.sun-exposure.v1"
      ],
      "receiptSchemas": [
        "simulatte.plugin.sunWalkerSelectionReceipt.v1"
      ],
      "schema": "simulatte.pluginManifest.v1",
      "sdkVersion": 1,
      "version": "1.0.0"
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
