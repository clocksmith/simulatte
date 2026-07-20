(function attachGeneratedPluginRegistry(root, factory) {
  const factories = typeof module === 'object' && module.exports
    ? {
    'accessible-journey': require('../../plugins/accessible-journey/index.js'),
    'amenity-router': require('../../plugins/amenity-router/index.js'),
    'cable-trader': require('../../plugins/cable-trader/index.js'),
    'counterfactual-lab': require('../../plugins/counterfactual-lab/index.js'),
    'gig-wage-truth': require('../../plugins/gig-wage-truth/index.js'),
    'historical-streets': require('../../plugins/historical-streets/index.js'),
    'p2p-delivery': require('../../plugins/p2p-delivery/index.js'),
    'safety-explorer': require('../../plugins/safety-explorer/index.js'),
    'sun-walker': require('../../plugins/sun-walker/index.js'),
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
          "reference": {
            "id": "nyc-pedestrian-ramp-accessibility-v1",
            "path": "../../data/autonomy/accessibility-index-v1.json",
            "schemaId": "simulatte.autonomyAccessibilityIndex.v1",
            "sha256": "5a2ff2ea110f51b5d276c5c5c58c197da935b1e08a33da29aaeaeac9d5303017"
          },
          "required": true
        }
      ],
      "defaultConfig": "./default-config.json",
      "entry": {
        "globalFactory": "SimulattePluginAccessibleJourney",
        "integrity": "sha384-a52146e07472248810fcd6d737cd09ce75d311ebe889ec0d9ca083ebc53735223c671ecbb497e953127f44a604093da4",
        "path": "./index.js"
      },
      "extensionPoints": [
        "request",
        "route",
        "settlement",
        "ui",
        "presentation"
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
      "resources": [
        {
          "integrity": "sha384-a652e10c44c17fa6027ed1610d9aa3b406fce4827b5d539b353b547eda21cd72fbc282b4138de17e82a2f0488385580f",
          "path": "./accessibility-audit.js"
        },
        {
          "integrity": "sha384-d326044c1bb9bacde63f7e4076003203a2cf774ac6db60f26231d919ab6c86464d6d18009387366ebaf14357ae067069",
          "path": "./config.schema.json"
        },
        {
          "integrity": "sha384-9e9c2806ec1cfd6003a813291bbee5ea66cce94303c5c38a27ed154285d448d009824b8a68ef7b53e849b7d3e3d842b3",
          "path": "./default-config.json"
        }
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
          "reference": {
            "id": "nyc-bicycle-parking-route-amenity-v1",
            "path": "../../data/autonomy/route-amenity-index-v1.json",
            "schemaId": "simulatte.autonomyRouteAmenityIndex.v1",
            "sha256": "0a34318351d9d3e98b8d86b6ae8d3da69e9d67a59e572c1cf50f3809009634be"
          },
          "required": true
        }
      ],
      "defaultConfig": "./default-config.json",
      "entry": {
        "globalFactory": "SimulattePluginAmenityRouter",
        "integrity": "sha384-28fd7eb9d8e5ff1589be51f4923e27deaf70ae318b94141084bac75b078d7318245d154a4a983d051d2975913f37d599",
        "path": "./index.js"
      },
      "extensionPoints": [
        "request",
        "route",
        "settlement",
        "ui",
        "presentation"
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
      "resources": [
        {
          "integrity": "sha384-e8340848c29a3fc775e0c48a871d424121803cfb1793a6235fbe1ffca528756bc52ce6a50bf5a2298017417fe494d11b",
          "path": "./config.schema.json"
        },
        {
          "integrity": "sha384-b53401866ccd6d182652a1f7e4bc62419ef3a28214fbf72cfe9a757ab6da320819c08a11ea5e70e892cfb88bad7aaa27",
          "path": "./default-config.json"
        }
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
        "integrity": "sha384-f0dfedf4bc5c259247db627ea20fed952caeaeece87f8ecd3dd134a57a51434565f14636bb813bf795bcd48838cb2e84",
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
          "integrity": "sha384-868234e3acf6755df1b640e4b67f55b9e577c670d6713210dc87dbff423d85243146ffee1d3e9f4ae9798fa899eb8790",
          "path": "./config.schema.json"
        },
        {
          "integrity": "sha384-68f86d68b72a9a0116a2f33e1830acb6a60c026d675f6b5a9b9565d2b396fa8d1ceaedd63c962f610725047d5f83df5d",
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
          "renderedActorCount": 48,
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
          "id": "world.snapshot.v1",
          "required": false
        }
      ],
      "datasets": [],
      "defaultConfig": "./default-config.json",
      "entry": {
        "globalFactory": "SimulattePluginCounterfactualLab",
        "integrity": "sha384-b91bb1822f34888a0ed5f7cf410c2a5c940dbe0d4c4511920781bf10f970bfd234f2906e0b54a3fabb167b584d1c3948",
        "path": "./index.js"
      },
      "extensionPoints": [
        "event",
        "ui",
        "presentation"
      ],
      "id": "counterfactual-lab",
      "permissions": [
        "capabilities.invoke.v1",
        "events.propose.v1",
        "receipts.append.v1",
        "simulation.run.v1",
        "state.reduce.v1",
        "ui.inspector.v1",
        "world.query.v1"
      ],
      "provides": [
        "analysis.counterfactual.v1"
      ],
      "receiptSchemas": [
        "simulatte.plugin.counterfactualLabReceipt.v1"
      ],
      "resources": [
        {
          "integrity": "sha384-4145fffa03bb822c915b228f3ef11118eba5de0cb0ae818cf6be2c31698b8a09c2a171fd8a5495767451074d04c43063",
          "path": "./comparison-runner.js"
        },
        {
          "integrity": "sha384-1177b8c0fcdd6cf1155d3335ce3c8117b819b796799ac4ecbfebae9e273845b28f220ea44251b00bf6cf9b8d26a32208",
          "path": "./config.schema.json"
        },
        {
          "integrity": "sha384-14a4064aa6205fb29cfa995c99491ddfd6a0fb9f15f0d7df6313283e8b1eca312f47730a8b0f1346a8b7e83367ffb962",
          "path": "./default-config.json"
        }
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
        "integrity": "sha384-c71827f1368a2534c9da05e9ab071d630ef5ed693812c36ae1a20986eb9cbc7054851c4e4d1cc9c4093310eab08e78a3",
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
      "resources": [
        {
          "integrity": "sha384-e83eb729b90f57024a49bfc73adc245122129665430e3944637ac7ea6c26230a1ca59b658b8ef28edb136d0fa1f70f4a",
          "path": "./config.schema.json"
        },
        {
          "integrity": "sha384-65ffa6f31a46019410bf0b5433ced995640862afc033ab1dccf405b11167376acfa92c1760570a2812862ef0e9b8842f",
          "path": "./default-config.json"
        }
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
          "reference": {
            "id": "nyc-world-snapshot-registry-v1",
            "path": "../../data/autonomy/world-snapshot-registry-v1.json",
            "schemaId": "simulatte.autonomyWorldSnapshotRegistry.v1",
            "sha256": "9d0c4d450d5a29b313ce1b3474413c9e6cca3595a13afb76997eb1119aa80038"
          },
          "required": true
        }
      ],
      "defaultConfig": "./default-config.json",
      "entry": {
        "globalFactory": "SimulattePluginHistoricalStreets",
        "integrity": "sha384-ad9d933ca2b1373e59becd3155fe0e8f9615ea2441ae5aca2ad5d4155a39ef80f9a03996613c15058aaea28e5a72b2ce",
        "path": "./index.js"
      },
      "extensionPoints": [
        "ui"
      ],
      "id": "historical-streets",
      "permissions": [
        "events.propose.v1",
        "state.reduce.v1",
        "ui.inspector.v1"
      ],
      "provides": [
        "world.snapshot.v1"
      ],
      "receiptSchemas": [],
      "resources": [
        {
          "integrity": "sha384-f58a9b8a62ed3161990fca87c94c661156d61ecf96165fed0273453f89057c031a0d5a3619954695060c0409e22f71f8",
          "path": "./config.schema.json"
        },
        {
          "integrity": "sha384-d7f900111f2f6f363fcc0d74efb88e8557cf7be6890737b631b19a1418573fd1a0c0e237d17c4d8047ee9b827e9a9ff7",
          "path": "./default-config.json"
        }
      ],
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
          "reference": {
            "id": "battery-office-east-village-v1",
            "path": "../../data/autonomy/cooperation/battery-office-v1.json",
            "schemaId": "simulatte.cooperativeScenario.v1",
            "sha256": "5eb12f2a1c53a8630246c53f16b96218945e1becf611c7a53fee2c24c5625416"
          },
          "required": true
        }
      ],
      "defaultConfig": "./default-config.json",
      "entry": {
        "globalFactory": "SimulattePluginP2pDelivery",
        "integrity": "sha384-8b18c94671b0e85169c85cc0cd10c5638cba298e3efa53238a1a380ae0794af8b9ced5f9d6df7cd68ed00aaa61f2477f",
        "path": "./index.js"
      },
      "extensionPoints": [
        "request",
        "settlement",
        "ui",
        "presentation"
      ],
      "id": "p2p-delivery",
      "permissions": [
        "events.propose.v1",
        "language.parse.v1",
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
      "resources": [
        {
          "integrity": "sha384-1f567fc532d56fea266a46ba561522d6f6f6ab40abf0d0a7b4ba70408ea93b83146fcb7c5195dd7ae7d4c7acde8f3284",
          "path": "./config.schema.json"
        },
        {
          "integrity": "sha384-f6eb547c956e4e0426c8a4b6e2efce0722a619a1eddfeab0469e501b16122978b8ace2f4d02ebece0c792ecad245da16",
          "path": "./contracts.js"
        },
        {
          "integrity": "sha384-d19d4793f852c7f0d48f705e0cf55a5d0319be9e32f20009b6a6b6ed6a11643224a9bb13c3406f8807c8b5d36591a7ab",
          "path": "./cooperative-engine.js"
        },
        {
          "integrity": "sha384-396f3c7241185c00f9b138528f99c742fc3171d75cf17ea6fe468907b10318e2594e36f235cbb2a03846bb6c927a4535",
          "path": "./default-config.json"
        },
        {
          "integrity": "sha384-cda0ec4208d5d4037c1305cb79d38083d1a140257696cbea8685ed3e41e83ad62fd472541abffcafa46e63fabd878924",
          "path": "./gpu-compute.js"
        },
        {
          "integrity": "sha384-f3e3e512341635415d4d0dad3f4890dac481a2062bfaf9fdffacee8025d52cd290bf5f935bc8d2bbe75fd425f6998ef1",
          "path": "./language-compiler.js"
        },
        {
          "integrity": "sha384-a76df8e0cedd29d7bb20bc1ff0752d1304776885f569d144f024cc883da6bfccdb9047ee0a5e7e9ea5bec4e7c7666046",
          "path": "./relay-planner.js"
        }
      ],
      "schema": "simulatte.pluginManifest.v1",
      "sdkVersion": 1,
      "version": "1.0.0"
    },
    "configs": {
      "p2p-delivery-default-v1": {
        "id": "p2p-delivery-default-v1",
        "routeCostModel": {
          "costModelId": "cooperative-window-handoff-cost",
          "fifo": false
        },
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
          "reference": {
            "id": "nyc-crash-history-2025-07-to-2026-07-v1",
            "path": "../../data/autonomy/safety-history-index-v1.json",
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
        "integrity": "sha384-fc286c09950129b66e55b61e957e72cae809dde1f534ff693894555ebd6f247a950e4e17fbc02bc7b49b018121a22ef4",
        "path": "./index.js"
      },
      "extensionPoints": [
        "request",
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
          "integrity": "sha384-e625a29d6518138487f47bdf3629d56f6d9a94227f59cc36c94d9eefcc0315c3d714629ecfb0e3f20219b8a736cb2c27",
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
