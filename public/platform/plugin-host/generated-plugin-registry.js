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
        "integrity": "sha384-f7a79e224b48b5bc5ee5623a2f6797f19d127c967e06addc00f5846b696abf507eb980bafd0277a02534c805ed15fd21",
        "path": "./index.js"
      },
      "extensionPoints": [
        "request",
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
        "integrity": "sha384-002e3eb80e6ee3a16ef0f4adca13472bbd053e51eef750e26f5712aee14d1adc616e4ea5a062787b04dee713f5e698fc",
        "path": "./index.js"
      },
      "extensionPoints": [
        "request",
        "route",
        "settlement",
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
        "integrity": "sha384-f7a67709f4f22f05c9800b7d69b2b354386bbec3727a8059d369daaf6245a7a3e1ea9fb2c2b176b10f95431aa636358a",
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
      "resources": [
        {
          "integrity": "sha384-4a87baa8ba1f0866d74ef753ae81fd8b800db8e53aa195088ed1f622260bf4aef44cdf2de2338b40d43109ebf9456546",
          "path": "./config.schema.json"
        },
        {
          "integrity": "sha384-9f4205bb10071f5976920d8a48336c13b663a27e8356c210d2e1f2aec5400aaaafd26d175fef3d91da70c056d35ce475",
          "path": "./default-config.json"
        }
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
        "integrity": "sha384-bed885f6be43fa7a7580671954baaf1bbc230f43730bfd0a66e6bc2d4cd0fb909d2a8ba398245d246f98f65cb0ad2166",
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
        "integrity": "sha384-74ea48ad2b93bdc16cf14e4eada86695036f7e0163c86539a2ca2e0439229e4a01c8de9124bd32c6635b0e4207fa39c0",
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
        "integrity": "sha384-b3f57ae1bd22a7eb288e0de6a9cc12a58294d69867e30adde29733aec776109c21ae4a52f942fff7aab49f4e725dd0dd",
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
