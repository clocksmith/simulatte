# Simulatte profile evidence

Status: fail

Runs: 2/6 passed

| Profile | Passed | Total | Blocking failures |
| --- | ---: | ---: | --- |
| cable-trader-pickup-v1 | 0 | 2 | runtime_path_mismatch (2), platform_clock_receipt_invalid (2), platform_view_receipt_invalid (2), platform_compositor_receipt_missing (2), comparison_execution_receipt_missing (2), settlement_receipt_missing (2), plugin_playback_reload_not_restored (2), claim_evidence_unresolved (2), receipt_contradictory (2) |
| safety-explorer-v1 | 0 | 2 | claim_evidence_unresolved (2) |
| sun-walker-v1 | 2 | 2 | none |

| Profile | Seed | Viewport | Status | Receipt | Failures |
| --- | --- | --- | --- | --- | --- |
| cable-trader-pickup-v1 | july-baseline | desktop-1440x1000 | fail | [2eb864d277cc](receipts/sha256/2eb864d277cc9dfab69592f62dc16d2759deebb9c8e3d00dbb989e5c509a39c0.json) | runtime_path_mismatch, platform_clock_receipt_invalid, platform_view_receipt_invalid, platform_compositor_receipt_missing, comparison_execution_receipt_missing, settlement_receipt_missing, plugin_playback_reload_not_restored, claim_evidence_unresolved, receipt_contradictory |
| cable-trader-pickup-v1 | july-baseline | mobile-390x844 | fail | [033b962a2db0](receipts/sha256/033b962a2db0a5625c419ebbc2a5ae15ed14434d81f606d54d8590adfe4aeea7.json) | runtime_path_mismatch, platform_clock_receipt_invalid, platform_view_receipt_invalid, platform_compositor_receipt_missing, comparison_execution_receipt_missing, settlement_receipt_missing, plugin_playback_reload_not_restored, claim_evidence_unresolved, receipt_contradictory |
| safety-explorer-v1 | union-mccarren | desktop-1440x1000 | fail | [e90921498aef](receipts/sha256/e90921498aef87067a340e560fe6867c9f099846711a9a6b78a2b279cc725436.json) | claim_evidence_unresolved |
| safety-explorer-v1 | union-mccarren | mobile-390x844 | fail | [ec479985b491](receipts/sha256/ec479985b491ddd2a995514c2350f6f6b14eeb1921237216f3e3a325f67d6d88.json) | claim_evidence_unresolved |
| sun-walker-v1 | village-union-shade | desktop-1440x1000 | pass | [6548adcc04dd](receipts/sha256/6548adcc04dd154c68993f256e2ab9695be06386210026844daca8ad1e6e1412.json) | none |
| sun-walker-v1 | village-union-shade | mobile-390x844 | pass | [d5486788230a](receipts/sha256/d5486788230a90fa3acd5f120a9492067ca9a6591b4fd0dc3b0d519557b7ecf0.json) | none |

