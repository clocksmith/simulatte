(function attachGeneratedPluginRegistry(root, factory) {
  const factories = typeof module === 'object' && module.exports
    ? {
    'cable-trader': require('../../../shared/plugins/cable-trader/index.js'),
    'safety-explorer': require('../../../shared/plugins/safety-explorer/index.js'),
    'sun-walker': require('../../../shared/plugins/sun-walker/index.js'),
      }
    : {
    'cable-trader': root.SimulattePluginCableTrader,
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
          "integrity": "sha384-21e46dbb89d58bd79fc68a9d4aa97a639160f637a3bfcca0946d80a7ee008c5ee077ea57c1265644628216ed58e80f7f",
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
        "receipts.append.v1",
        "routing.contribute.v1",
        "state.reduce.v1",
        "ui.inspector.v1",
        "world.query.v1"
      ],
      "provides": [
        "inventory.exchange.v1",
        "settlement.credit.v1"
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
          "integrity": "sha384-77ff3b5dc7d56cc1364af2427a73d00f4b82617f6edef88912cd07d94b1ecc647ca2835baf537d0ec87788f8e81f07f8",
          "path": "./network-simulation.js"
        }
      ],
      "schema": "simulatte.pluginManifest.v1",
      "sdkVersion": 1,
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
      "consumes": [],
      "datasets": [
        {
          "id": "nyc-crash-history-2025-07-to-2026-07-v1",
          "reference": {
            "id": "nyc-crash-history-2025-07-to-2026-07-v1",
            "path": "../../../data/simulatte/safety-history-index-v1.json",
            "schemaId": "simulatte.autonomySafetyHistoryIndex.v1",
            "sha256": "ecebc76655c7325d0c764056137c56419001afc3a19ba4002aece4f3eb85f715"
          },
          "required": true
        }
      ],
      "defaultConfig": "./default-config.json",
      "entry": {
        "globalFactory": "SimulattePluginSafetyExplorer",
        "integrity": "sha384-f56710217f6b79bea233d7afcc3f9b8723acfd691c6278906eb2f88bd5a35089f3f00aa1627687f2135ad2cd26390314",
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
        "routing.dimension.historical-observation.v1"
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
        "integrity": "sha384-cad94e25c5786f5f7b07452906a3ff0d236b619523f264a708026d468b677f9dcc91d538222a40174eedbf37670f9a0a",
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
