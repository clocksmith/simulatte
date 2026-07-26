# Simulatte profile evidence

Status: fail

Runs: 6/10 passed

| Profile | Passed | Total | Blocking failures |
| --- | ---: | ---: | --- |
| interstellar-relay-network-v1 | 2 | 2 | none |
| maritime-trade-global-v1 | 2 | 2 | none |
| orbital-transfer-planner-v1 | 2 | 2 | none |
| safety-explorer-v1 | 0 | 2 | runtime_path_mismatch (2), platform_clock_receipt_invalid (2), platform_view_receipt_invalid (2), platform_compositor_receipt_missing (2), comparison_execution_receipt_missing (2), settlement_receipt_missing (2), plugin_playback_reload_not_restored (2), claim_evidence_unresolved (2), receipt_contradictory (2) |
| sun-walker-v1 | 0 | 2 | runtime_path_mismatch (2), platform_clock_receipt_invalid (2), platform_view_receipt_invalid (2), platform_compositor_receipt_missing (2), comparison_execution_receipt_missing (2), settlement_receipt_missing (2), plugin_playback_reload_not_restored (2), runtime_dataset_identity_missing:sun-walker:world.buildings.v1 (2), claim_evidence_unresolved (2), receipt_contradictory (2) |

| Profile | Seed | Viewport | Status | Receipt | Failures |
| --- | --- | --- | --- | --- | --- |
| interstellar-relay-network-v1 | sol-proxima-direct | desktop-1440x1000 | pass | [3d9cbda8d6b8](receipts/sha256/3d9cbda8d6b8af3d47b29055a6a8ab688837fa005ddf3eec10fb0fec20794185.json) | none |
| interstellar-relay-network-v1 | sol-proxima-direct | mobile-390x844 | pass | [0e47426baa40](receipts/sha256/0e47426baa4088c5feb09ba95df125796ff97952026c859b18b27a0d48a49fa5.json) | none |
| maritime-trade-global-v1 | asia-europe-mainline | desktop-1440x1000 | pass | [d70a6d0db708](receipts/sha256/d70a6d0db708a71fa219e1040ad03075473e3dc3f636f7031adcaa167f814be0.json) | none |
| maritime-trade-global-v1 | asia-europe-mainline | mobile-390x844 | pass | [a5114fa779fe](receipts/sha256/a5114fa779fed381788f37beac85a3852705432942469f7820d99ea24e810377.json) | none |
| orbital-transfer-planner-v1 | earth-mars-window | desktop-1440x1000 | pass | [8ed2ecb54e5f](receipts/sha256/8ed2ecb54e5f7a6a90f305199807913a4b013a5ddd6abce007cb7979f595cbf7.json) | none |
| orbital-transfer-planner-v1 | earth-mars-window | mobile-390x844 | pass | [82d86c06f8ec](receipts/sha256/82d86c06f8ecc157daaaed3b15439276a9b6152563fcd37f5b0b747780037631.json) | none |
| safety-explorer-v1 | union-mccarren | desktop-1440x1000 | fail | [bdfe9abfb2b2](receipts/sha256/bdfe9abfb2b2e33c7a87154e8b1b080371db527e4d8093622e62c7d9b1a724b0.json) | runtime_path_mismatch, platform_clock_receipt_invalid, platform_view_receipt_invalid, platform_compositor_receipt_missing, comparison_execution_receipt_missing, settlement_receipt_missing, plugin_playback_reload_not_restored, claim_evidence_unresolved, receipt_contradictory |
| safety-explorer-v1 | union-mccarren | mobile-390x844 | fail | [5d11874436af](receipts/sha256/5d11874436af2ef1525d84064a1414e4b7cb857e7ea9d51e96b0830e481722cf.json) | runtime_path_mismatch, platform_clock_receipt_invalid, platform_view_receipt_invalid, platform_compositor_receipt_missing, comparison_execution_receipt_missing, settlement_receipt_missing, plugin_playback_reload_not_restored, claim_evidence_unresolved, receipt_contradictory |
| sun-walker-v1 | village-union-shade | desktop-1440x1000 | fail | [52ec60eed3dc](receipts/sha256/52ec60eed3dc4884bd408cbff912642bd40c988665417206d0d8bb59aa4223a4.json) | runtime_path_mismatch, platform_clock_receipt_invalid, platform_view_receipt_invalid, platform_compositor_receipt_missing, comparison_execution_receipt_missing, settlement_receipt_missing, plugin_playback_reload_not_restored, runtime_dataset_identity_missing:sun-walker:world.buildings.v1, claim_evidence_unresolved, receipt_contradictory |
| sun-walker-v1 | village-union-shade | mobile-390x844 | fail | [09bdec53122e](receipts/sha256/09bdec53122e27091f0ee0de81d6db68d397ffa605c88372f918fbe2f6df2d42.json) | runtime_path_mismatch, platform_clock_receipt_invalid, platform_view_receipt_invalid, platform_compositor_receipt_missing, comparison_execution_receipt_missing, settlement_receipt_missing, plugin_playback_reload_not_restored, runtime_dataset_identity_missing:sun-walker:world.buildings.v1, claim_evidence_unresolved, receipt_contradictory |

