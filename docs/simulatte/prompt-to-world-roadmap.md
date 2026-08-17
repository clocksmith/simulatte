# Simulatte Strategic & Performance Consolidation Roadmap

## Authority and Purpose

This document records the strategic consolidation and performance optimization roadmap for Simulatte. It translates the core principles in [GOALS.md](../../GOALS.md) and [STYLE_GUIDE.md](../../STYLE_GUIDE.md) into concrete architectural milestones, demo portfolio curation, and payload reduction targets.

---

## Part 1: Strategic Reframing

### The Problem Today
Simulatte has expanded as a multi-tier "demo museum" with 5 scale tiers (City, Country, Planet, Solar System, Universe) and 12+ fragmented simulations. This structure introduces significant liabilities:
- **Diluted Product Identity**: Focus is split across disparate domains (neighborhood logistics, power grid dispatch, orbital mechanics, interstellar routing) instead of the core compiler workflow.
- **Massive Static Payloads**: The browser runtime loads monolithic unindexed datasets (such as a 51MB+ raw NYC JSON geometry file and multi-megabyte index catalogs) on boot.
- **Hidden Core Value**: The primary innovation—compiling natural language into an inspectable, editable, executable `WorldSpec` with deterministic WebGPU `WorldProof`—is buried behind museum selection cards.

### The Target Architecture: Prompt-to-World Simulation & Visual Proof Surface
1. **Anchor on Blank / Create ([`public/blank/`](../../public/blank/))**:
   - Establish Simulatte Create as the primary product surface.
   - The eight-phase prompt-to-WebGPU world compilation pipeline is the core differentiator, proving model execution, deterministic Lowering, and bound visual scene proofs.
2. **Reposition World Profiles as Conformance Packs**:
   - World profiles are not standalone products; they are domain conformance packs that prove the same compiler, runtime, and verification contracts.
   - Consolidate active investment around two high-impact hero simulators (City and Planet) that prove local-scale and global-scale simulation.
3. **Decouple from Bloated Static Datasets**:
   - Replace upfront full-city and global GIS dumps with spatial corridor and tile-based streaming.

---

## Part 2: Curated Surface & Demo Strategy

To deliver a sharp, inspectable product experience, Simulatte focuses development and performance budgets on three primary surfaces:

| Rank | Surface / Profile | Role & Primary Objective | Key Value |
|---|---|---|---|
| **1** | **Blank / Create (`/blank`)** | **Flagship Product**: Prompt-to-World Compiler | Compiles natural-language briefs into an inspectable, editable, executable `WorldSpec` with deterministic WebGPU scene proof (`WorldProof`). |
| **2** | **Sun Walker (`/city/sun-walker-v1`)** | **Hero City Simulator**: Local Urban Dynamics | Real-time solar azimuth calculations, building shadow projections, tree canopy occlusion, and shade-aware routing across NYC on a native WebGPU canvas. |
| **3** | **Maritime Trade (`/world/maritime-trade-global-v1`)** | **Hero Planetary Simulator**: Global Logistics & Cascades | Global shipping chokepoint simulation (Suez, Panama, Malacca), container port queues, disruption cascades, emissions tracking, and voyage counterfactuals. |
| **4** | **Orbital Transfer Planner (`/solar-system/orbital-transfer-planner-v1`)** | **Hero Orbital Simulator**: Interplanetary Missions | Grounded Lambert two-point boundary-value solver, Keplerian orbital mechanics, and $\Delta v$ porkchop plot trajectory optimization. |
| **5** | **Interstellar Relay (`/star-chart/interstellar-relay-network-v1`)** | **Hero Interstellar Simulator**: Relativistic Optical Comms | 3D Planck blackbody spectral stellar coronas (O, B, A, F, G, K, M), parsec galactic plane depth drop-lines, Gaussian laser beam divergence ($1.22 \lambda / D$), and moving-target light time. |

### Archival & Deprecation Plan
The following text-heavy, low-visual, or redundant profile experiments are candidates for archival from the primary user journey into historical reference packs:
- **Cable Trader**: High text density and narrow exchange mechanics.
- **Neighborhood Bulk Pool**: Low spatial visualization; primarily tabular pooling logic.
- **Food Recall**: Country-tier state grid with limited dynamic interaction.
- **Grid Resilience**: Tabular dispatch without rich 3D spatial dynamics.

---

## Part 3: Performance, Latency & Payload Reduction

### 1. Eliminate Monolithic 70MB+ JSON Payloads
* **Current Culprits**:
  - `public/data/simulatte/worlds/nyc-core-autonomy-v1.json` (~51 MB uncompressed)
  - `public/data/simulatte/feature-cards-v1.json` (~13.9 MB)
  - `public/data/simulatte/route-amenity-index-v1.json` (~4.7 MB)
  - `public/data/simulatte/accessibility-index-v1.json` (~1.4 MB)
* **Engineering Architecture**:
  - **Spatial Corridor / Tile Sharding**: Switch from eager full-city GIS ingestion to lazy corridor loading. The existing `nyc-training-corridor-v1.json` (5.5 KB) proves that bounding-box corridor bundles reduce initial payload size by >99%.
  - **Compact Binary Encoding**: Transition geometry and node arrays from raw verbose JSON into FlatBuffers or Geobuf to achieve an additional 70–80% size reduction and eliminate JSON parsing bottlenecks on the main thread.

### 2. Replace the 16-Script Cascade with Dynamic Imports
* **Current Bottleneck**:
  `public/index.html` loads 16 deferred `<script>` tags synchronously during the boot cycle (`tier-data-loader.js`, `tier-renderers.js`, `multi-tier-visualizer.js`, `experience-presentation.js`, `profile-program.js`, `main.js`, etc.).
* **Target Architecture**:
  Convert the application entrypoint to native ES module dynamic imports (`await import(...)`). The initial landing shell loads only the minimal DOM harness and router; heavy WebGPU pipelines, tier renderers, and domain datasets are fetched asynchronously on profile activation.

### 3. Prune Unused Asset Folders
* Exclude datasets, scenario tables, and historical raw assets for archived/unmounted profiles from the production hosting bundle (`public/data/subsea-network-global/`, `public/data/cable-trader/`, etc.).

### 4. Hosting & Caching Optimization
* Configure `firebase.json` headers to serve static JSON manifests and JS/WASM modules with Brotli (`br`) compression.
* Apply immutable long-term caching (`Cache-Control: public, max-age=31536000, immutable`) for content-hashed assets and sharded corridor data chunks.

---

## Verification & Execution Gates

All architectural changes must pass:
1. **Contract Integrity**: `npm run catscan:check` and `npm run folder-contracts:ci`.
2. **WorldProof & Replay**: `npm run check:blank` and `npm run check:world`.
3. **Payload Budget Audit**: `npm run check:source-size` and hosting packaging verification.
