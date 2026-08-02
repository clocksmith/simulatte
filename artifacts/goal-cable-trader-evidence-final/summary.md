# Simulatte profile evidence

Status: fail

Captured runs: 5/8 passed

Release coverage: 8/94 runs (incomplete)

| Profile | Passed | Total | Blocking failures |
| --- | ---: | ---: | --- |
| cable-trader-pickup-v1 | 5 | 8 | runtime_path_mismatch (3), platform_clock_receipt_invalid (3), platform_view_receipt_invalid (3), platform_compositor_receipt_missing (3), visual_evidence_missing (3), first_meaningful_frame_invalid (3), frame_pacing_evidence_invalid (3), memory_evidence_invalid (3), deterministic_replay_invalid (3), interaction_coverage_invalid (3), deployment_screenshot_binding_invalid (3), settlement_receipt_missing (3), plugin_playback_reload_not_restored (3), claim_evidence_unresolved (3), receipt_contradictory (3) |

| Profile | Seed | Viewport | Status | Receipt | Failures |
| --- | --- | --- | --- | --- | --- |
| cable-trader-pickup-v1 | everyday-exchange | desktop-1440x1000 | pass | [53f2558fc86e](receipts/sha256/53f2558fc86ed8b4fc8e1ad99a5033d5c7d4404f2f5e807fe1e3e51d9ee34e4b.json) | none |
| cable-trader-pickup-v1 | everyday-exchange | mobile-390x844 | pass | [49c55d1359d0](receipts/sha256/49c55d1359d06ed2bcd5b1a0392792841904eadac8d23685858d4fd337dd13db.json) | none |
| cable-trader-pickup-v1 | device-upgrade-cycle | desktop-1440x1000 | fail | [d18209239215](receipts/sha256/d182092392152d7015ec4ddc6fbb569d61c02ca237bd7d14edf4834c8d4a01e9.json) | runtime_path_mismatch, platform_clock_receipt_invalid, platform_view_receipt_invalid, platform_compositor_receipt_missing, visual_evidence_missing, first_meaningful_frame_invalid, frame_pacing_evidence_invalid, memory_evidence_invalid, deterministic_replay_invalid, interaction_coverage_invalid, deployment_screenshot_binding_invalid, settlement_receipt_missing, plugin_playback_reload_not_restored, claim_evidence_unresolved, receipt_contradictory |
| cable-trader-pickup-v1 | device-upgrade-cycle | mobile-390x844 | fail | [081e92421ec4](receipts/sha256/081e92421ec49a0287ef4616fceb324e81ae101c5a41767950f49cfd7756cee1.json) | runtime_path_mismatch, platform_clock_receipt_invalid, platform_view_receipt_invalid, platform_compositor_receipt_missing, visual_evidence_missing, first_meaningful_frame_invalid, frame_pacing_evidence_invalid, memory_evidence_invalid, deterministic_replay_invalid, interaction_coverage_invalid, deployment_screenshot_binding_invalid, settlement_receipt_missing, plugin_playback_reload_not_restored, claim_evidence_unresolved, receipt_contradictory |
| cable-trader-pickup-v1 | move-in-cycle | desktop-1440x1000 | pass | [5d887acfbd08](receipts/sha256/5d887acfbd0888447695b50e9c153bf135af00564ac45c56dfb0e4a16ad0eaeb.json) | none |
| cable-trader-pickup-v1 | move-in-cycle | mobile-390x844 | pass | [c39582e09304](receipts/sha256/c39582e09304ceba618065a44380d801f2a97205cffce29eb4de6f08b7ed2c9c.json) | none |
| cable-trader-pickup-v1 | office-cleanout-cycle | desktop-1440x1000 | fail | [98518e9e203e](receipts/sha256/98518e9e203ebfa5441fcbb7cbd9fc7757d3265bcac3afcf7469f1e2ed5419da.json) | runtime_path_mismatch, platform_clock_receipt_invalid, platform_view_receipt_invalid, platform_compositor_receipt_missing, visual_evidence_missing, first_meaningful_frame_invalid, frame_pacing_evidence_invalid, memory_evidence_invalid, deterministic_replay_invalid, interaction_coverage_invalid, deployment_screenshot_binding_invalid, settlement_receipt_missing, plugin_playback_reload_not_restored, claim_evidence_unresolved, receipt_contradictory |
| cable-trader-pickup-v1 | office-cleanout-cycle | mobile-390x844 | pass | [3df27fd40de4](receipts/sha256/3df27fd40de42b6c4207343dc02f927d15bf44d7251c7a732de49ebe9cd9dcaf.json) | none |

