# Revised direction

The strongest version of this work is **not merely a `food-recall` plugin added to the existing city simulator**. It should be a dedicated **United States food-supply application profile**, backed by a national world model, a temporal lot ledger, a reproducible discrete-event engine, and a plugin that exposes interventions, evidence, uncertainty, and visualizations.

The proposed architecture should support three distinct modes:

1. **Historical replay**, using publicly released recall and outbreak records.
2. **Synthetic scenario simulation**, using statistically generated facilities, lots, shipments, failures, exposures, and response delays.
3. **Private traceability import**, where an organization supplies its own lot-level Critical Tracking Event records.

Public federal data can calibrate and validate the simulator, but it cannot reconstruct complete commercial consignee networks. FDA’s public enforcement API explicitly warns that it is not a recall-lifecycle tracking system, while public NORS data can omit facility details, are voluntarily reported, and generally appear after a substantial close-out delay. Therefore, any inferred national supply network must be visibly labeled **synthetic**, **aggregate**, or **user-supplied**, never presented as an observed real-world chain. ([OpenFDA][1])

The immediate platform priority should be:

> **First build a deterministic discrete-event kernel with named random streams and auditable event receipts. Then add shared environmental fields.**

Weather and traffic are useful inputs, but they do not solve the more fundamental problems of scheduling shipments, splitting lots, managing queues, sequencing recalls, and keeping stochastic runs reproducible.

---

# 1. What should be retained—and what needs to change

The attached design establishes the correct conceptual ingredients: supply-chain flow, contamination mixing, thermal kinetics, dose-response, investigation delay, recall intervention, a national graph schema, and a plugin bundle.  

However, its current engine is a proof of concept rather than a production simulation.

| Current concept                | Retain        | Required improvement                                                                                                                        |
| ------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Directed food-supply graph     | Yes           | Use a **temporal multigraph**. Facility topology may contain cycles, while individual shipment events and lot lineage remain time-directed. |
| Contamination in CFU           | Yes           | Track both **lot mass** and **total organism load**. Concentration alone cannot prove mass balance.                                         |
| Cross-contamination multiplier | Concept only  | Replace with an equipment or environment reservoir that transfers organisms between lots.                                                   |
| Thermal growth model           | Yes           | Actually integrate it over the shipment’s time-temperature history. The current engine defines temperature parameters but never uses them.  |
| Beta-Poisson dose-response     | As one option | Put dose-response models in a versioned pathogen–commodity–population registry. Do not use one universal parameter set.                     |
| Investigation lag              | Yes           | Decompose it into onset, healthcare, sampling, sequencing, cluster detection, interview, traceback, decision, notice, and removal delays.   |
| Recall efficacy                | Yes           | Make it node-, lot-, channel-, and time-dependent rather than one global step function.                                                     |
| U.S. facility graph            | Yes           | Place it in a dedicated national world or add first-class geographic presentation support.                                                  |
| Simulatte plugin               | Yes           | Make the plugin scenario-driven and side-effect-free during request preflight.                                                              |

## Blocking defects in the prototype engine

### Contamination is duplicated

Each simulated day transfers a fraction of contamination from a source to every outgoing destination, but the source is never decremented. The same organisms can therefore be copied repeatedly across days and branches. Retail contamination also remains indefinitely and generates new exposures each day without corresponding inventory consumption. 

A production model needs explicit lot inventories and transfer transactions:

```text
source inventory before shipment
− shipped quantity
− waste or spoilage
= source inventory after shipment
```

The same must hold for organism load, subject to explicitly modeled growth, death, transfer, or processing reductions.

### The thermal model is not connected to the simulation

The draft defines pathogen temperature thresholds and kinetic coefficients, and edges include average temperatures, but the propagation loop never reads the edge temperature or transit duration.  

### The graph is node-level, not lot-level

Despite the design’s lot-level goal, the runtime stores one contamination count per facility node. It cannot represent:

* Two clean lots and one contaminated lot at the same processor.
* Lots transformed into multiple new traceability lots.
* Partial shipment, rework, repacking, or disposal.
* Recall of a specific production window.
* A contaminated lot commingled with clean inputs.
* Different temperature histories for shipments leaving the same site.

### Recall behavior is unrealistically global

At the investigation threshold, every farm and processor is quarantined. That does not test traceback precision, recall scope, consignee notification, retail removal, or home-storage exposure. 

### The current ID construction is nondeterministic

`Date.now()` is used in the outbreak identifier. Two runs with the same seed would therefore produce different receipts and state identities. 

### The national presentation is not geographically valid

The draft assigns the “Salinas” origin marker to the first node in whatever Simulatte world is active and obtains paths from arbitrary slices or fallback segment IDs. 

The existing world model exposes node and segment maps and lookup functions, but no national `segmentIds` property that would make this fallback meaningful.

### Request handling would produce duplicate side effects

Simulatte invokes request contributions once before mission compilation and again afterward. The current draft would run the outbreak model, emit events, and append receipts during both calls—and may call `instantForMission()` with a null mission.

Cable Trader already demonstrates the correct pattern: the first call only recognizes or rewrites the request, and the mission-dependent obligation is added in the second call.

---

# 2. Product scope and claim boundary

The application should be named something like:

```text
food-recall-us-v1
```

with the plugin:

```text
food-recall-us
```

That leaves room for future jurisdictional or regional implementations.

## Supported hazard families

The architecture should not equate “recall” with “bacterial outbreak.” It should separate the recall network from the hazard model.

| Hazard family                    | Runtime behavior                                                              |
| -------------------------------- | ----------------------------------------------------------------------------- |
| Microbial pathogen               | Growth/inactivation, dose, illness, incubation, cluster detection             |
| Undeclared allergen              | Presence by lot, consumer susceptibility, serving exposure, reaction severity |
| Chemical contaminant             | Concentration, cumulative or acute dose, threshold or dose-response           |
| Foreign material                 | Unit prevalence, detection probability, injury probability                    |
| Mislabeling or formulation error | Affected population, usage pattern, consequence classification                |
| Quality-only withdrawal          | Inventory and notification simulation without illness modeling                |

The FDA recall classes should be represented as regulatory outcomes, not inferred directly from a pathogen name. FDA Class I, II, and III classifications indicate decreasing degrees of expected health hazard, and classification can occur after a firm has already initiated a recall. ([U.S. Food and Drug Administration][2])

## Recommended claim boundary

Every run should carry a visible statement similar to:

> This simulation estimates outcomes inside a declared synthetic or historical scenario. It is not a live recall alert, regulatory classification, medical recommendation, epidemiological forecast, or representation of a complete commercial supply chain.

Historical replay should say which values are observed and which are reconstructed.

---

# 3. Regulatory and traceability alignment

The data model should align with the FDA Food Traceability Rule even when the simulator covers commodities outside the Food Traceability List.

The rule centers on **Key Data Elements associated with Critical Tracking Events**, linked through a **Traceability Lot Code**. FDA currently intends not to enforce the rule before **July 20, 2028**, but the underlying lot-level recordkeeping design remains the right architectural foundation. ([U.S. Food and Drug Administration][3])

A Traceability Lot Code is assigned at particular events—such as initial packing, first land-based receiving, or transformation—and generally remains unchanged until another transformation. The TLC source identifies the physical location at which it was assigned. ([U.S. Food and Drug Administration][4])

## Event vocabulary

The simulator should support at least:

```text
harvesting
cooling
initial_packing
first_land_based_receiving
shipping
receiving
transformation
storage
testing
shipment_delay
temperature_excursion
retail_sale
food_service_sale
home_storage
consumption
illness_onset
case_reported
sample_collected
sequence_cluster_detected
traceback_started
recall_decided
recall_notice_sent
consignee_acknowledged
inventory_removed
consumer_notification
product_disposed
recall_terminated
```

The first group maps to traceability; the second group models risk, surveillance, and response.

GS1 EPCIS 2.0 is a useful semantic basis because it standardizes supply-chain visibility events across organizations. Simulatte does not need to reproduce every EPCIS field, but adopting compatible concepts—event time, business step, disposition, read point, business location, source, destination, object identifiers, and transformation lineage—would make future imports substantially easier. ([GS1 Reference][5])

---

# 4. End-to-end architecture

```text
Federal and public data
FDA enforcement + CORE + RFR
USDA-FSIS recalls
CDC NORS + public outbreak summaries
USDA production + DOT freight flows
NOAA historical weather
Census consumer populations
                 │
                 ▼
        Versioned ingestion jobs
 fetch → normalize → validate → deduplicate
 classify provenance → hash → publish manifest
                 │
                 ▼
          Governed artifacts
 facility catalog
 commodity catalog
 freight corridors
 historical recall events
 hazard parameter registry
 consumer zones
 environment snapshots
 scenario packs
                 │
                 ▼
     U.S. food-network application world
 projected national geography
 facility nodes + corridor edges
 state/county/consumer-zone overlays
                 │
                 ▼
       Deterministic simulation kernel
 event queue + named RNG streams
 lot ledger + transformation lineage
 kinetics + transport + consumption
 surveillance + traceback + recall
                 │
                 ▼
          food-recall-us plugin
 scenario lifecycle
 user interventions
 capabilities and receipts
 national visualization
 uncertainty and comparison views
```

---

# 5. Data sources and ingestion plan

## Public-source matrix

| Source                               | Simulator use                                                                                    | Important limitation                                                                                                                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FDA openFDA food enforcement reports | Recall event history, product descriptions, firms, distribution patterns, classifications, dates | Updated weekly and based on publicly releasable Recall Enterprise System records; FDA warns against using it to track a recall’s complete lifecycle. ([OpenFDA][1])                                                     |
| USDA-FSIS Recall API                 | Meat, poultry, and processed egg recalls and public-health alerts                                | Separate jurisdiction and schema from FDA; normalize without erasing the regulator distinction. ([Food Safety and Inspection Service][6])                                                                               |
| FDA CORE investigation table         | Outbreak investigation stages, pathogens, products, case counts, traceback and recall actions    | Covers incidents managed by FDA CORE and is not a complete list of every U.S. foodborne incident. ([U.S. Food and Drug Administration][7])                                                                              |
| FDA Reportable Food Registry         | Hazard–commodity patterns and early warning frequencies                                          | Aggregate public data, not a shipment or facility linkage dataset. ([U.S. Food and Drug Administration][8])                                                                                                             |
| CDC NORS/FDOSS                       | Historical pathogen, food, setting, illness, and outbreak distributions                          | Reporting is voluntary; public final data normally lag the reporting year; specific people or facilities may be suppressed. ([CDC][9])                                                                                  |
| CDC PulseNet documentation           | Calibration of laboratory and cluster-detection stages                                           | Use published timing and process distributions; do not imply access to private genomic surveillance records. CDC reports that modern WGS has reduced average outbreak identification time to about 16 days. ([CDC][10]) |
| USDA NASS Quick Stats                | Geographic production priors by commodity                                                        | Aggregate production estimates, not observed commercial shipment links. ([USDA NASS][11])                                                                                                                               |
| DOT/FHWA Freight Analysis Framework  | Commodity origin–destination and transport-mode priors                                           | Aggregate freight flows among regions; use to synthesize corridors, not individual company shipments. ([FHWA Operations][12])                                                                                           |
| NOAA NCEI                            | Historical temperature, precipitation, wind, and climate snapshots                               | Data should be downloaded, pinned, interpolated, and hashed before a reproducible run. ([NCEI][13])                                                                                                                     |
| Census ACS                           | Consumer-zone population and demographic strata                                                  | Aggregate population estimates; high-risk health status must not be inferred at individual level. ([Census.gov][14])                                                                                                    |
| FDA Food Traceability List           | Commodity coverage flags and traceability scenarios                                              | The FTL is not a ranking of every food hazard; retain an explicit `isFtlFood` field rather than excluding other products. ([U.S. Food and Drug Administration][15])                                                     |

## Ingestion directory

```text
tools/food-recall-us/
  fetch-openfda-enforcement.mjs
  fetch-fsis-recalls.mjs
  fetch-fda-core.mjs
  fetch-fda-rfr.mjs
  fetch-cdc-nors.mjs
  fetch-usda-nass.mjs
  fetch-faf5.mjs
  fetch-noaa-snapshot.mjs
  fetch-census-consumer-zones.mjs
  normalize-recall-events.mjs
  build-synthetic-facility-network.mjs
  build-freight-corridors.mjs
  build-scenario-packs.mjs
  validate-food-artifacts.mjs
  write-food-manifest.mjs
```

Each downloaded artifact should record:

```json
{
  "sourceId": "fda-openfda-food-enforcement",
  "retrievedAt": "2026-07-21T...",
  "sourceUpdatedThrough": "2026-07-01",
  "license": "public-domain-us-government",
  "contentSha256": "...",
  "query": { "...": "..." },
  "transformVersion": "food-recall-ingest-1.0.0",
  "recordCount": 0,
  "warnings": [],
  "claimBoundary": "..."
}
```

Live network requests should not happen during a normal simulation. The build pipeline should create immutable snapshots first.

---

# 6. Canonical data contracts

## Facility

```json
{
  "schema": "simulatte.usFoodFacility.v1",
  "id": "facility:synthetic:ca:produce-packer:0042",
  "label": "Synthetic California Produce Packer 0042",
  "provenanceKind": "synthetic",
  "facilityKind": "initial_packer",
  "jurisdiction": "FDA",
  "location": {
    "longitude": -121.6,
    "latitude": 36.7,
    "state": "CA",
    "countyFips": "06053"
  },
  "capabilities": [
    "cooling",
    "initial_packing",
    "fresh_cut_transformation"
  ],
  "traceability": {
    "supportedCtes": ["cooling", "initial_packing", "shipping"],
    "recordCompletenessPrior": 0.94,
    "notificationDelayHours": {
      "distribution": "lognormal",
      "parameters": { "mu": 0, "sigma": 0 }
    }
  },
  "coldStorage": {
    "capacityKg": 400000,
    "setpointC": 3.5,
    "thermalTimeConstantHours": 5.0
  }
}
```

Named real facilities should only appear when they are explicitly present in a public historical record or supplied by the user. Otherwise, use synthetic identifiers.

## Product

```json
{
  "schema": "simulatte.usFoodProduct.v1",
  "id": "product:fresh-romaine",
  "commodity": "leafy_greens",
  "form": "fresh",
  "isFtlFood": true,
  "defaultUnitMassKg": 0.34,
  "shelfLifeDays": {
    "distribution": "lognormal",
    "parameters": {}
  },
  "preparationProfiles": [
    {
      "id": "raw-no-kill-step",
      "probability": 1.0,
      "logReduction": 0
    }
  ]
}
```

## Traceability event

```json
{
  "schema": "simulatte.foodTraceEvent.v1",
  "id": "event:scenario-01:00001834",
  "eventTime": "2026-07-01T14:30:00Z",
  "recordTime": "2026-07-01T14:36:00Z",
  "cte": "transformation",
  "action": "ADD",
  "facilityId": "facility:synthetic:ca:processor:009",
  "inputTlcIds": [
    "tlc:grower-a:2026-181-01",
    "tlc:grower-b:2026-181-07"
  ],
  "outputTlcIds": [
    "tlc:processor-009:2026-181-shift-2"
  ],
  "quantity": {
    "value": 18400,
    "unit": "kg"
  },
  "traceabilityLotCodeSourceId": "facility:synthetic:ca:processor:009",
  "shipmentId": null,
  "dataQuality": {
    "observed": false,
    "completeness": 1,
    "confidence": 1
  }
}
```

## Runtime lot state

```json
{
  "schema": "simulatte.foodLotState.v1",
  "tlcId": "tlc:processor-009:2026-181-shift-2",
  "productId": "product:fresh-romaine",
  "massKg": 18400,
  "units": 54117,
  "parentTlcIds": [
    "tlc:grower-a:2026-181-01",
    "tlc:grower-b:2026-181-07"
  ],
  "hazards": {
    "ecoli-o157": {
      "totalLoadCfu": 0,
      "log10CfuPerG": null,
      "prevalence": 0,
      "epistemicParameterSetId": "ecoli-romaine-qmra-v1"
    }
  },
  "temperatureState": {
    "cargoTempC": 3.8,
    "lastUpdatedAt": "2026-07-01T14:30:00Z"
  },
  "status": "available",
  "currentLocationId": "facility:synthetic:ca:processor:009"
}
```

---

# 7. Scientific simulation model

## 7.1 Lot mass and organism-load accounting

For a transformation receiving input lots (i):

[
M_{\mathrm{in}}=\sum_i M_i
]

[
M_{\mathrm{out}}=y,M_{\mathrm{in}}
]

[
M_{\mathrm{waste}}=(1-y)M_{\mathrm{in}}
]

where (y) is the process yield.

Let (L_i) be the total viable organism load in input lot (i). Cross-contamination should be an explicit transfer (X) from the process environment, not a percentage multiplier on the input:

[
L_{\mathrm{prekill}}=\sum_i L_i+X
]

For a process intervention with log reduction (R):

[
L_{\mathrm{out}}=L_{\mathrm{prekill}}10^{-R}
]

Concentration is derived:

[
C_{\mathrm{out}}=\frac{L_{\mathrm{out}}}{M_{\mathrm{out}}}
]

Every transformation receipt should report input mass, output mass, waste mass, input load, environmental transfer, process reduction, and output load.

## 7.2 Splitting lots

For output fractions (s_k):

[
\sum_k s_k=1,\qquad M_k=s_kM
]

At high organism counts, load can be partitioned proportionally. At low counts or when modeling heterogeneous contamination, partitioning should be stochastic:

[
(L_1,\ldots,L_n)
\sim
\operatorname{Multinomial}(L;s_1,\ldots,s_n)
]

For clumped contamination, use an overdispersed distribution rather than a simple multinomial.

This distinction matters because a low-load contaminated batch may produce several clean child lots and one highly contaminated child lot rather than evenly diluting contamination everywhere.

## 7.3 Equipment and environmental reservoir

For each processing line, track an environmental reservoir (E_t):

[
E_{t+\Delta t}
==============

E_t
+
S_t
---

## X_t

K_t
]

where:

* (S_t) is shedding from contaminated inputs.
* (X_t) is transfer from the environment into the current lot.
* (K_t) is die-off or sanitation removal.

Sanitation events should have declared log reductions and uncertainty. This supports persistent contamination across production runs without creating organisms from nothing.

## 7.4 Temperature-dependent growth

The square-root model in the draft can remain as a secondary model for maximum growth rate:

[
\mu_{\max}(T)
=============

\left[b(T-T_{\min})\right]^2_+
]

where ([x]_+=\max(x,0)).

For a short constant-temperature interval:

[
N(t+\Delta t)
=============

\min
\left(
N_{\max},
N(t)e^{\mu_{\mathrm{eff}}\Delta t}
\right)
]

A production implementation should also include:

* Lag state.
* Maximum population density.
* Commodity effects.
* pH and water-activity modifiers where relevant.
* Growth/no-growth boundaries.
* Processing inactivation.
* Parameter uncertainty.

For variable temperature, integrate over each temperature interval rather than applying the route average once.

FDA’s risk-assessment framework separates hazard identification, exposure assessment, dose-response assessment, and risk characterization. The plugin should preserve that separation and expose uncertainty at each stage. ([U.S. Food and Drug Administration][16])

## 7.5 Thermal inactivation and kill steps

For validated heating or processing interventions:

[
D(T)=D_{\mathrm{ref}}10^{(T_{\mathrm{ref}}-T)/z}
]

[
R=\frac{\Delta t}{D(T)}
]

[
\log_{10}N_{\mathrm{out}}
=========================

\log_{10}N_{\mathrm{in}}-R
]

The model parameters must be product- and process-specific. A generic “pathogen kill” constant would overstate scientific validity.

## 7.6 Cold-chain dynamics

Instead of a fixed 1.5% reefer-failure probability, define a hazard rate by vehicle class, route, equipment age, and scenario:

[
P(\text{failure during }\Delta t)
=================================

1-e^{-\lambda \Delta t}
]

Cargo temperature can use a first-order response:

[
T_{t+\Delta t}
==============

T_{\mathrm{target}}
+
\left(T_t-T_{\mathrm{target}}\right)
e^{-\Delta t/\tau}
]

During normal operation, (T_{\mathrm{target}}) is the refrigeration setpoint. During failure, it changes toward ambient temperature. Door openings, loading delays, repair times, and partial cooling recovery become scheduled events.

Every failure should produce a receipt containing:

```text
failure time
failure type
random stream
ambient-temperature source
cargo-temperature trajectory
repair time
additional growth or inactivation
affected shipment and TLCs
```

## 7.7 Consumer handling and exposure

For serving (j):

[
D_j
===

C_{\mathrm{lot}}
\cdot m_{\mathrm{serving}}
\cdot f_{\mathrm{consumed}}
\cdot 10^{-R_{\mathrm{preparation}}}
]

Consumer behavior should include:

* Purchase-to-consumption delay.
* Fraction consumed versus discarded.
* Home refrigeration.
* Cooking or washing.
* Repeated servings from the same package.
* Recall-awareness and response.
* Commodity-specific shelf-life distributions.

The current hard-coded `contaminationCFU / 10000` dose calculation should be removed because it has no declared mass, serving-size, or unit basis. 

## 7.8 Dose-response registry

A model record should identify:

```json
{
  "hazardId": "listeria-monocytogenes",
  "foodCategory": "ready-to-eat-soft-cheese",
  "populationStratum": "older-or-immunocompromised",
  "endpoint": "invasive-listeriosis",
  "modelFamily": "exponential",
  "parameters": {},
  "sourceCitationIds": [],
  "validDoseRangeCfu": {},
  "uncertainty": {},
  "claimBoundary": ""
}
```

The attached constants should be treated as illustrative. Dose-response model selection differs by pathogen, endpoint, dataset, food matrix, and susceptible population. Listeria in particular needs population stratification rather than a single generic illness curve. FDA’s Listeria assessment explicitly distinguishes high-risk groups and food categories. ([U.S. Food and Drug Administration][17])

## 7.9 Surveillance and detection pipeline

Replace `investigationLagDays` with scheduled stages:

```text
consumption
→ incubation
→ symptom onset
→ healthcare seeking
→ specimen collection
→ laboratory confirmation
→ WGS completion
→ cluster detection
→ exposure interview
→ common-product hypothesis
→ traceback
→ regulatory or firm decision
→ notice
```

Each stage gets a distribution and data source. A scenario may choose accelerated, baseline, or delayed detection.

Observed cases should be a subset of true cases:

[
N_{\mathrm{observed}}
\sim
\operatorname{Binomial}
\left(
N_{\mathrm{true}},
p_{\mathrm{care}}
p_{\mathrm{sample}}
p_{\mathrm{report}}
\right)
]

This allows the simulator to distinguish:

* Actual illness incidence.
* Reported cases.
* Sequenced cases.
* Cases linked into a detected cluster.

## 7.10 Traceback

Traceback should operate on imperfect observations rather than immediately knowing the index node.

A first implementation can score candidate lots:

[
S(\ell)
=======

\sum_c
w_c
\mathbf 1
{\ell\text{ could have reached case }c}
---------------------------------------

\gamma,\text{missingness}(\ell)
]

A later probabilistic version can estimate:

[
P(\ell\mid\text{cases})
\propto
P(\text{cases}\mid\ell)P(\ell)
]

The simulator should report:

* True source rank.
* Time to top-five source.
* Time to top-one source.
* Number of facilities examined.
* Percentage of required trace records available.
* Effect of missing or erroneous TLC links.

## 7.11 Recall propagation

A recall is a network intervention, not a Heaviside multiplier.

For every targeted TLC:

1. Find all descendants created through transformations.
2. Find all shipments and consignees that received those descendants.
3. Schedule notices by consignee channel.
4. Model acknowledgement and action probability.
5. Remove remaining inventory.
6. Determine whether inventory was already sold or consumed.
7. Schedule consumer notices.
8. Model household response before consumption.
9. Record recovered, destroyed, consumed, and unaccounted quantities.

Core metrics:

[
\text{Recall sensitivity}
=========================

\frac{\text{contaminated units removed}}
{\text{contaminated units distributed}}
]

[
\text{Recall precision}
=======================

\frac{\text{contaminated units removed}}
{\text{all units removed}}
]

[
\text{Safe-food waste}
======================

\text{clean units removed}
]

[
\text{Cases averted}
====================

## \text{baseline cases}

\text{intervention cases}
]

Additional outputs should include time to notice, time to 50% removal, time to 90% removal, consignee response rate, consumer-level recovery, and unaccounted inventory.

---

# 8. Deterministic stochastic simulation

## Named random streams

A single global `sdk.random()` would be fragile: adding one random draw to Sun Walker could change every Cable Trader or Food Recall result.

Use named, splittable streams:

```javascript
const shipmentRng = sdk.random.stream('food-recall:shipment');
const reeferRng = sdk.random.stream('food-recall:reefer');
const contaminationRng = sdk.random.stream('food-recall:contamination');
const consumerRng = sdk.random.stream('food-recall:consumer');
const surveillanceRng = sdk.random.stream('food-recall:surveillance');
const recallRng = sdk.random.stream('food-recall:recall');
```

The stream identity should derive from:

```text
application seed
plugin ID
scenario ID
stream name
entity ID or replicate ID
algorithm version
```

Every receipt should contain the RNG algorithm, root seed hash, stream identifier, and draw count.

Cable Trader already has a private seedable generator, but it should migrate to the shared service so its randomness participates in platform-wide receipts.

## Event scheduler

The shared scheduler should order events by:

```text
event timestamp
event priority
stable event ID
```

It should support:

* Immutable events.
* Cancellation and supersession.
* Checkpoint snapshots.
* Cooperative yields.
* Worker execution.
* Stable replay.
* Event receipts.
* Maximum-event budgets.
* Deterministic failure on budget exhaustion.

A counterfactual comparison should use **common random numbers**: baseline and intervention runs share the same underlying contamination, demand, weather, and consumer draws until the intervention changes the path. That reduces Monte Carlo noise when measuring cases averted.

## Aleatory versus epistemic uncertainty

Keep separate:

* **Aleatory uncertainty:** which reefer fails, which unit is contaminated, which consumer purchases a lot.
* **Epistemic uncertainty:** uncertainty in growth rate, dose-response parameters, underreporting, or recall response.

Outputs should show:

```text
median
5th–95th percentile
parameter set
replicate count
Monte Carlo standard error
```

A single exact-looking case total should not be the default presentation.

---

# 9. Required Simulatte platform additions

The current SDK exposes capabilities, clock, events, language, receipts, routing, simulation, state, UI, and world-query ports. It has no environment, random, worker, or geospatial projection port.

The runtime already supports versioned capability providers and consumers, so cross-plugin interoperability should build on that system rather than allowing plugins to inspect one another’s state.

## SDK v2 additions

| Port or capability   | Proposed permission      | Purpose                                                  |
| -------------------- | ------------------------ | -------------------------------------------------------- |
| `sdk.random`         | `random.stream.v1`       | Named deterministic random streams                       |
| `sdk.scheduler`      | `simulation.schedule.v1` | Timestamped event queue                                  |
| `sdk.compute`        | `compute.worker.v1`      | Run ensembles off the UI thread                          |
| `sdk.environment`    | `environment.read.v1`    | Spatial and temporal weather, light, and traffic samples |
| `sdk.geography`      | `geography.project.v1`   | WGS84-to-world projection                                |
| Presentation v3      | `ui.geospatial.v1`       | Geographic markers, paths, polygons, and choropleths     |
| Uncertainty contract | no direct port           | Standard distribution and interval representation        |

## Improved environment sample

A global scalar weather object is insufficient for a country-scale model. The API should be queried by time and location:

```javascript
const sample = sdk.environment.sample({
  instant: shipment.departureAt,
  longitude: shipment.position.longitude,
  latitude: shipment.position.latitude,
  fields: [
    'airTemperatureC',
    'precipitationMmHr',
    'windSpeedMps',
    'solarElevationDegrees',
    'trafficMultiplier'
  ]
});
```

Response:

```json
{
  "schema": "simulatte.environmentSample.v1",
  "instant": "2026-07-21T17:45:00Z",
  "location": {
    "longitude": -98.4,
    "latitude": 39.2
  },
  "values": {
    "airTemperatureC": 31.5,
    "precipitationMmHr": 2.4,
    "windSpeedMps": 7.2,
    "solarElevationDegrees": 42.1,
    "trafficMultiplier": 1.45
  },
  "quality": {
    "spatialResolutionKm": 25,
    "temporalResolutionMinutes": 60,
    "interpolation": "bilinear-time-linear"
  },
  "sourceSnapshotIds": [
    "noaa-environment-2026-07-21-v1",
    "traffic-scenario-baseline-v1"
  ]
}
```

For reproducible simulations, this must query a pinned snapshot. A live-data mode can exist only if the host captures and hashes all returned observations.

## National presentation

Two implementation paths are possible:

### Recommended MVP: dedicated national world

Create a simplified United States world with:

* Projected state boundaries.
* Facility and consumer-zone nodes.
* Major freight corridor segments.
* Aggregate city and distribution-hub nodes.
* National camera bounds.
* Regional world tiles.

### Longer-term platform solution: geospatial presentation v3

Permit plugins to present:

```json
{
  "longitude": -121.655,
  "latitude": 36.677
}
```

and GeoJSON-like line strings or polygons without requiring fake world node IDs.

---

# 10. Food Recall application profile

The plugin is not fundamentally an autonomy journey. Forcing it to create an arbitrary bicycle mission, as Cable Trader currently does for playback integration, would obscure its actual simulation semantics.

A better `applicationProfile.v3` should support plugin-owned simulation:

```json
{
  "schema": "simulatte.applicationProfile.v3",
  "id": "food-recall-us-v1",
  "interaction": {
    "mode": "scenario",
    "simulationOwnerPluginId": "food-recall-us",
    "startLabel": "Run scenario",
    "shuffleLabel": "Change seed",
    "missionRequired": false
  },
  "defaultSeedId": "leafy-green-baseline",
  "seeds": [
    {
      "id": "leafy-green-baseline",
      "label": "Leafy green traceback",
      "description": "Synthetic California production lots distributed to multiple U.S. regions.",
      "seed": "food-recall-leafy-green-001",
      "scenarioId": "scenario:leafy-green-baseline"
    },
    {
      "id": "egg-cold-chain",
      "label": "Egg cold-chain disruption",
      "description": "Synthetic processing and distribution delay with targeted recall.",
      "seed": "food-recall-eggs-002",
      "scenarioId": "scenario:egg-cold-chain"
    },
    {
      "id": "listeria-rte",
      "label": "Listeria in ready-to-eat food",
      "description": "Long shelf-life exposure and high-risk population scenario.",
      "seed": "food-recall-listeria-003",
      "scenarioId": "scenario:listeria-rte"
    },
    {
      "id": "allergen-label",
      "label": "Undeclared allergen",
      "description": "Lot-specific labeling failure without microbial kinetics.",
      "seed": "food-recall-allergen-004",
      "scenarioId": "scenario:allergen-label"
    }
  ],
  "camera": {
    "initialMode": "top",
    "runMode": "top",
    "pluginId": "food-recall-us",
    "targetId": "us-food-network"
  },
  "plugins": [
    {
      "id": "food-recall-us",
      "configId": "food-recall-us-default-v2"
    }
  ],
  "routeObjective": {}
}
```

A temporary SDK v1 compatibility path could use `playback` mode, but the long-term architecture should not invent an unrelated journey.

---

# 11. Plugin bundle

```text
public/shared/plugins/food-recall-us/
  plugin.json
  config.schema.json
  default-config.json
  index.js

  engine/
    event-queue.js
    lot-ledger.js
    transformation-engine.js
    contamination-reservoir.js
    predictive-microbiology.js
    cold-chain.js
    consumer-exposure.js
    dose-response.js
    surveillance.js
    traceback.js
    recall-response.js
    intervention-comparison.js
    metrics.js
    receipts.js

  presentation/
    national-layers.js
    lot-lineage-view.js
    epidemic-curve-view.js
    uncertainty-view.js
```

For the initial implementation, bundling the engine into fewer verified resources may simplify browser loading. Every shipped resource must receive its actual generated SHA-384 integrity value; the repeated placeholder hashes in the draft must never be treated as deployable values. The existing registry synchronization step should remain the source of those generated hashes.  

## Proposed manifest after SDK v2

```json
{
  "schema": "simulatte.pluginManifest.v1",
  "id": "food-recall-us",
  "version": "2.0.0",
  "sdkVersion": 2,

  "configSchema": "./config.schema.json",
  "defaultConfig": "./default-config.json",

  "entry": {
    "globalFactory": "SimulattePluginFoodRecallUs",
    "path": "./index.js",
    "integrity": "GENERATED"
  },

  "datasets": [
    { "id": "us.food.facilities.synthetic.v1", "required": true },
    { "id": "us.food.freight-corridors.v1", "required": true },
    { "id": "us.food.commodity-profiles.v1", "required": true },
    { "id": "us.food.hazard-model-registry.v1", "required": true },
    { "id": "us.food.consumer-zones.v1", "required": true },
    { "id": "us.food.historical-recalls.v1", "required": false },
    { "id": "us.environment.snapshot.v1", "required": false }
  ],

  "permissions": [
    "capabilities.invoke.v1",
    "clock.read.v1",
    "random.stream.v1",
    "simulation.schedule.v1",
    "compute.worker.v1",
    "environment.read.v1",
    "events.propose.v1",
    "receipts.append.v1",
    "state.reduce.v1",
    "ui.inspector.v1",
    "ui.geospatial.v1",
    "world.query.v1"
  ],

  "provides": [
    "simulation.food-recall.v2",
    "traceability.lookup.v1",
    "field.food-contamination.v1"
  ],

  "consumes": [
    { "id": "field.weather.v1", "required": false },
    { "id": "field.logistics-service.v1", "required": false }
  ],

  "extensionPoints": [
    "request",
    "event",
    "settlement",
    "ui",
    "presentation"
  ],

  "receiptSchemas": [
    "simulatte.plugin.foodRecallScenarioReceipt.v2",
    "simulatte.plugin.foodRecallEventChainReceipt.v1",
    "simulatte.plugin.foodRecallInterventionReceipt.v1",
    "simulatte.plugin.foodRecallTracebackReceipt.v1",
    "simulatte.plugin.foodRecallOutcomeReceipt.v1"
  ]
}
```

---

# 12. Correct plugin lifecycle

## `activate()`

`activate()` should:

1. Require and validate immutable datasets.
2. Compile facility, corridor, product, and consumer indices.
3. Register initial state.
4. Create named random streams.
5. Prepare the event scheduler.
6. Run or load the profile’s initial scenario.
7. Append one scenario receipt.
8. Avoid loading large ensembles until requested.

```javascript
async function activate({ sdk, config, scenario }) {
  const data = loadAndValidateDatasets(sdk.datasets);
  const compiled = compileStaticModel(data, config);

  sdk.state.register(reduce, initialState());

  const simulation = await runScenario({
    compiled,
    scenario,
    random: sdk.random,
    scheduler: sdk.scheduler,
    environment: sdk.environment,
    compute: sdk.compute
  });

  publishScenario(simulation);

  return Object.freeze({
    id: 'food-recall-us',
    contributeRequest,
    setScenario,
    handleAction,
    settle,
    view,
    present,
    capabilities,
    dispose
  });
}
```

## `setScenario()`

Scenario switching should use `scenario.seed`, just as Cable Trader currently changes its deterministic seed through `setScenario`.

It should cancel or supersede the old simulation, run the new scenario, and emit a single state event.

## `contributeRequest()`

Request contribution should only recognize commands and attach obligations. It should not execute the simulation.

Example commands:

```text
simulate a leafy-green outbreak
issue a recall on day 12
compare facility-level and lot-level recall
show contaminated descendants of lot 1842
increase consignee response to 90 percent
replay with a cold-chain failure
compare 7-day and 14-day investigation delays
```

During preflight, return recognition or a structured command. During the post-mission phase—or in a mission-free profile—attach the selected scenario obligation.

## `handleAction()`

Actions should include:

```text
scenario.run
scenario.pause
scenario.resume
timeline.seek
recall.issue
recall.expand_scope
recall.narrow_scope
facility.inspect
lot.focus
shipment.focus
counterfactual.compare
ensemble.run
parameter.toggle
```

Commands should emit declared events, not mutate plugin state directly.

## `settle()`

Settlement must test meaningful obligations, not merely whether any node was quarantined.

Example obligation results:

```json
{
  "obligationId": "recall:containment",
  "status": "settled",
  "evidence": {
    "contaminatedUnitRecallSensitivity": 0.91,
    "maximumAllowedResidualExposure": 0.1,
    "residualExposure": 0.07
  }
}
```

Other obligations:

* Identify the true source within a declared rank.
* Recall at least a target fraction of contaminated units.
* Keep safe-food waste below a threshold.
* Complete notification within a target time.
* Preserve complete event and lot lineage.
* Avoid false claims when traceability evidence is incomplete.

---

# 13. Visualization and interaction design

## National map layers

The map should distinguish:

* Farms, harvesters, packers, processors, distributors, retailers, restaurants, and consumer zones.
* Observed facilities versus synthetic facilities.
* Shipments currently in transit.
* Lots with confirmed contamination, suspected contamination, or no evidence.
* Temperature excursions.
* Traceback candidate likelihood.
* Recall scope.
* Removed, consumed, and unaccounted inventory.
* Reported cases versus model-estimated cases.

Do not use the same color for “simulated high risk” and “confirmed contaminated.”

## Timeline

A bottom timeline should display:

```text
production
shipping
retail availability
consumption
illness onset
reported cases
WGS cluster
traceback
recall notice
inventory removal
recall termination
```

The user should be able to pause and inspect any event.

## Lot lineage panel

For a selected lot:

```text
parent lots
transformations
child lots
shipments
consignees
temperature history
hazard history
test results
recall status
remaining mass
consumed mass
disposed mass
```

## Epidemic and intervention panels

Show:

* True infections or illnesses.
* Reported cases.
* Sequenced cases.
* Detected cluster count.
* Baseline versus intervention.
* Median and uncertainty interval.
* Cases averted.
* Recall sensitivity and precision.
* Safe-food waste.
* Time-to-source.
* Data completeness.

## Provenance panel

Every view should expose:

```text
scenario kind
public/synthetic/user-supplied status
dataset versions and hashes
model versions
seed
replicate count
uncertainty method
known missing data
claim boundary
```

---

# 14. Receipt design

## Scenario receipt

```json
{
  "schema": "simulatte.plugin.foodRecallScenarioReceipt.v2",
  "scenarioId": "scenario:leafy-green-baseline",
  "scenarioKind": "synthetic",
  "seed": "food-recall-leafy-green-001",
  "engineVersion": "food-recall-engine-2.0.0",
  "datasetIdentities": {},
  "parameterSetIds": [],
  "eventCount": 0,
  "lotCount": 0,
  "claimBoundary": ""
}
```

## Event-chain receipt

Each event should be hash-linked using Simulatte’s canonical receipt mechanism. The existing platform already provides canonical SHA-256 chains and verification.

## Intervention receipt

```json
{
  "schema": "simulatte.plugin.foodRecallInterventionReceipt.v1",
  "interventionId": "recall:scenario-01:day-12",
  "issuedAt": "...",
  "targetTlcIds": [],
  "descendantTlcIds": [],
  "recallDepth": "consumer",
  "notificationPolicyId": "baseline-v1",
  "baselineRunId": "...",
  "counterfactualRunId": "...",
  "metrics": {
    "contaminatedUnitsRemoved": 0,
    "cleanUnitsRemoved": 0,
    "casesAvertedMedian": 0,
    "casesAvertedInterval": [0, 0]
  }
}
```

## Traceback receipt

Include the evidence available at the time of the inference, not knowledge from the hidden true scenario.

That prevents hindsight leakage.

---

# 15. Validation and testing

## Deterministic unit tests

The following must hold exactly or within declared numerical tolerance:

```text
input mass = output mass + waste
no negative inventory
no lot exists at two facilities simultaneously
all transformed lots identify parent lots
lot lineage has no time-reversing edge
all event timestamps are nondecreasing within an entity
same seed + same artifacts = same terminal hash
different named streams do not affect one another
zero contamination = zero pathogen-attributable cases
no consumption occurs after complete disposal
no recalled quantity exceeds available quantity
```

## Scientific property tests

Examples:

* A colder profile must not produce greater modeled growth than a warmer profile within a model’s declared monotonic range.
* A larger validated log reduction must not increase surviving load.
* Earlier recall should not increase exposure when compared using common random numbers.
* Increasing notification success should not reduce recovered inventory.
* Missing traceability records should not improve traceback accuracy.
* A narrower lot definition should reduce safe-food waste in an otherwise identical scenario.

## Canonical scenarios

1. **One contaminated lot, three clean descendants.**
2. **One contaminated and nine clean inputs commingled.**
3. **Cross-contamination persisting across shifts.**
4. **Reefer failure followed by delayed repair.**
5. **Recall before retail distribution.**
6. **Recall after most product has entered homes.**
7. **Missing shipping KDEs.**
8. **Incorrect TLC propagated by one distributor.**
9. **Allergen mislabeling with no microbial kinetics.**
10. **Historical replay where only aggregate public facts are known.**

## Backtesting

Historical data should validate aggregate properties such as:

* Distribution of recall classes.
* Commodity–hazard frequencies.
* Investigation and recall timing.
* State counts.
* Reported illnesses and hospitalizations.
* Recall depth and distribution language.

It cannot validate unobserved facility-level shipment paths unless private records are provided.

---

# 16. Delivery roadmap

| Phase | Deliverable                                                          | Exit gate                                                                        |
| ----- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 0     | Simulation context: scheduler, named RNG, receipts, worker execution | Cross-browser deterministic hash tests pass                                      |
| 1     | National world/profile and geospatial projection                     | CA-to-IL-to-NY scenario renders at correct geographic locations                  |
| 2     | Governed data ingestion and provenance                               | Every artifact has schema, source, version, transformation receipt, and hash     |
| 3     | Lot ledger, shipping, transformation, inventory, mass balance        | Canonical lot tests have zero unexplained mass or load                           |
| 4     | Cold chain, processing, microbial kinetics                           | Parameter-domain and monotonicity tests pass                                     |
| 5     | Consumer storage, dose, illness, observation                         | True, reported, sequenced, and linked cases are distinct                         |
| 6     | Traceback and recall network                                         | Recall sensitivity, precision, waste, and cases-averted metrics settle correctly |
| 7     | Ensemble uncertainty and sensitivity analysis                        | Stable percentile outputs with declared Monte Carlo error                        |
| 8     | UI, timeline, lot lineage, national layers                           | Every visual element traces to a receipt or governed artifact                    |
| 9     | Historical replay packs                                              | Observed versus reconstructed fields are explicitly distinguished                |
| 10    | Cross-plugin integration                                             | Capability graph has no cycles or domain-specific hidden dependencies            |

---

# 17. Improvements for the other plugins

## Sun Walker

### Current strengths

Sun Walker already uses building geometry, solar position, route alternatives, route contributions, receipts, and an explicit claim boundary of clear-sky direct sunlight. Its segment contributor currently evaluates sun position at a single mission instant, while its richer route evaluation has a departure-time-aware path.

### Recommended v2

Separate two products:

```text
direct-sun routing
thermal-comfort routing
```

Do not silently relabel direct-sun exposure as heat comfort.

Add:

* Segment-entry-time solar position.
* Time-varying sun during waiting and walking.
* Cloud attenuation from a pinned environment snapshot.
* Tree-canopy transmittance.
* Sky-view factor.
* Surface albedo and long-wave radiation.
* Ground and wall surface temperature.
* Air temperature, humidity, and wind.
* Mean Radiant Temperature or another declared thermal metric.
* Coverage and uncertainty masks.
* Separate direct-sun, thermal-load, and comfort objectives.

Proposed outputs:

```text
routing.dimension.direct-sun-seconds.v2
routing.dimension.mean-radiant-temperature-dose.v1
field.thermal-comfort.v1
```

The plugin should continue to show the fastest route versus the selected route, but add:

```text
peak thermal exposure
thermal dose
minutes above declared threshold
canopy-covered distance
unknown-data distance
```

## Cable Trader

### Current strengths

Cable Trader already contains a seedable stochastic event generator and an exact daily min-cost maximum-flow allocation. It proves optimality over its modeled complete candidate graph.

### Recommended v3

Retain exact min-cost flow as the **allocation policy**, but embed it in a finer-grained event simulation.

Replace uniform daily event placement with:

* Time-varying demand intensity by hour, hub, and item family.
* Correlated demand shocks.
* Scheduled returns rather than immediate same-day aggregates.
* Inventory in transit.
* Lost, damaged, incompatible, or late returns.
* Hub shelf and staging capacity.
* Worker shifts.
* Queue service time.
* Customer abandonment or substitution.
* Route-dependent travel time.
* Weather and congestion.
* Rebalancing decisions made at declared intervals.

Use an **M/G/c or explicit discrete-event queue** as the primary model. M/M/c can remain an analytic benchmark, but real swap and service times are unlikely to be memoryless.

New metrics:

```text
request wait time
95th-percentile fulfillment time
queue length
abandonment rate
worker utilization
stockout minutes
inventory dwell time
in-transit inventory
late-return rate
cost versus omniscient oracle
```

Proposed generic capabilities:

```text
field.logistics-service.v1
field.inventory-availability.v1
simulation.exchange-network.v2
```

Food Recall should consume the generic logistics capability, not a Cable Trader-specific internal state.

## Safety Explorer

### Current strengths

Safety Explorer is intentionally simple: it loads a pinned one-year NYC crash-history index and adds a static historical-observation score to route segments.

### Recommended v2

The highest-value corrections are:

1. **Exposure denominators.** Use crashes per vehicle, bicycle, or pedestrian exposure rather than raw counts when suitable exposure data exist.
2. **Recency weighting.** Apply an explicit temporal decay rather than treating every event in the observation period identically.
3. **Intersection entities.** Allocate turning, crossing, and signal-related risk to nodes and movement pairs.
4. **Temporal context.** Time of day, day of week, solar state, precipitation, visibility, and surface condition.
5. **Severity separation.** Model fatal, serious injury, minor injury, and property-only observations separately.
6. **Empirical shrinkage.** Prevent a single crash on a low-volume segment from automatically dominating a route.
7. **Uncertainty.** Report confidence or evidence coverage, not just one score.
8. **Observed versus simulated risk.** Preserve a strict distinction between historical records and predictive multipliers.

Surrogate measures such as time-to-collision or post-encroachment time should only be shown when the simulator has sufficiently detailed trajectories. Otherwise, label them synthetic interaction measures.

Proposed outputs:

```text
routing.dimension.historical-observation.v2
routing.dimension.contextual-conflict-risk.v1
field.mobility-risk.v1
```

## Food Recall

Food Recall should ultimately provide:

```text
simulation.food-recall.v2
traceability.lookup.v1
field.food-contamination.v1
field.recall-status.v1
```

Its most important advancement over the other plugins is not merely another risk score; it is an auditable **lot genealogy and intervention system**.

---

# 18. Cross-plugin interoperability

Direct dependencies such as:

```text
food-recall → cable-trader internals
cable-trader → safety-explorer internals
safety-explorer → sun-walker internals
```

would make the plugins brittle and can create capability cycles.

Instead, extract neutral field contracts:

```text
host.environment.weather.v1
host.environment.solar.v1
field.mobility-risk.v1
field.logistics-service.v1
field.thermal-comfort.v1
field.food-contamination.v1
```

A consuming plugin queries a versioned capability and receives:

```text
value
units
time and location
provider ID
data source IDs
uncertainty
claim boundary
receipt
```

Recommended dependency direction:

```text
host time + environment + random + scheduler
                 │
        ┌────────┼─────────┐
        ▼        ▼         ▼
   Sun Walker  Safety   Logistics service
        │        │         │
        └────────┴────┬────┘
                      ▼
                Food Recall
```

Food Recall may use logistics delay and environmental temperature, but those providers must not depend back on Food Recall.

---

# Final priority decision

The most urgent gap is the **seeded temporal event engine**, not shared environmental data by itself.

The correct sequence is:

1. Named deterministic RNG streams.
2. Stable discrete-event scheduling.
3. Event and state receipts.
4. Worker-backed ensemble execution.
5. Spatially and temporally queryable environment snapshots.
6. Generic capability-based cross-plugin fields.
7. National geospatial presentation.

That ordering immediately improves Food Recall and Cable Trader, fixes reproducibility across the platform, and gives Sun Walker and Safety Explorer the temporal substrate they need. Environmental coupling then becomes a governed input to a sound simulation engine rather than another collection of static multipliers.

[1]: https://open.fda.gov/apis/food/enforcement/ "https://open.fda.gov/apis/food/enforcement/"
[2]: https://www.fda.gov/safety/enforcement-reports/enforcement-report-information-and-definitions "https://www.fda.gov/safety/enforcement-reports/enforcement-report-information-and-definitions"
[3]: https://www.fda.gov/food/food-safety-modernization-act-fsma/fsma-final-rule-requirements-additional-traceability-records-certain-foods "https://www.fda.gov/food/food-safety-modernization-act-fsma/fsma-final-rule-requirements-additional-traceability-records-certain-foods"
[4]: https://www.fda.gov/food/food-safety-modernization-act-fsma/traceability-lot-code "https://www.fda.gov/food/food-safety-modernization-act-fsma/traceability-lot-code"
[5]: https://ref.gs1.org/standards/ "https://ref.gs1.org/standards/"
[6]: https://www.fsis.usda.gov/science-data/developer-resources/recall-api "https://www.fsis.usda.gov/science-data/developer-resources/recall-api"
[7]: https://www.fda.gov/food/outbreaks-foodborne-illness/core-2024-annual-report "https://www.fda.gov/food/outbreaks-foodborne-illness/core-2024-annual-report"
[8]: https://www.fda.gov/food/reportable-food-registry-industry/reportable-food-registry-annual-report "https://www.fda.gov/food/reportable-food-registry-industry/reportable-food-registry-annual-report"
[9]: https://www.cdc.gov/nors/data/ "https://www.cdc.gov/nors/data/"
[10]: https://www.cdc.gov/pulsenet/php/wgs/index.html "https://www.cdc.gov/pulsenet/php/wgs/index.html"
[11]: https://data.nass.usda.gov/Quick_Stats/ "https://data.nass.usda.gov/Quick_Stats/"
[12]: https://ops.fhwa.dot.gov/freight/freight_analysis/faf/index.htm "https://ops.fhwa.dot.gov/freight/freight_analysis/faf/index.htm"
[13]: https://www.ncei.noaa.gov/cdo-web/webservices "https://www.ncei.noaa.gov/cdo-web/webservices"
[14]: https://www.census.gov/programs-surveys/acs/data/data-via-api.html "https://www.census.gov/programs-surveys/acs/data/data-via-api.html"
[15]: https://www.fda.gov/food/food-safety-modernization-act-fsma/food-traceability-list "https://www.fda.gov/food/food-safety-modernization-act-fsma/food-traceability-list"
[16]: https://www.fda.gov/food/risk-and-safety-assessments-food/initiation-and-conduct-all-major-risk-assessments-within-risk-analysis-framework "https://www.fda.gov/food/risk-and-safety-assessments-food/initiation-and-conduct-all-major-risk-assessments-within-risk-analysis-framework"
[17]: https://www.fda.gov/food/risk-and-safety-assessments-food/quantitative-assessment-relative-risk-public-health-foodborne-listeria-monocytogenes-among-selected "https://www.fda.gov/food/risk-and-safety-assessments-food/quantitative-assessment-relative-risk-public-health-foodborne-listeria-monocytogenes-among-selected"
