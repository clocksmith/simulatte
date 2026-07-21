# Simulatte

[![Live site](https://img.shields.io/website?url=https%3A%2F%2Fsimulatte.world&label=live)](https://simulatte.world)
[![License: private](https://img.shields.io/badge/license-private-lightgrey.svg)](#license)

Browser-native world simulators. Nothing you type or simulate leaves the device.

- **Simulatte** — a multi-scale world explorer at [simulatte.world](https://simulatte.world/).
- **Blank** — *By Language Alone, Nothing Keyframed*: the prompt-to-pixels world compiler at [simulatte.world/blank](https://simulatte.world/blank/).

## Simulatte

Pick a scale on load, then explore. The choice lives in the URL (`?tier=`), so it is shareable and reload-safe.

| Scale | What it is |
| --- | --- |
| **City** | Local-first WebGPU autonomy simulator for NYC — pedestrian, bicycle, scooter, and car journeys with governed routes, safety gates, and exportable receipts. |
| **Country** | US regional transit and highway routing graph. |
| **Planet** | Global country boundaries (Natural Earth). |
| **Solar System** | Heliocentric orbits from NASA JPL Horizons. |
| **Universe** | 3D stellar chart of Hipparcos stars by spectral class. |

City runs the full engine; the other scales are lightweight explorers that load only their own small dataset — no WebGPU, no NYC data.

The City engine answers *"what would happen if?"* — it compiles a natural-language mission into a grounded route, records every autonomous decision, simulates the outcome, and returns a verifiable in-browser SHA-256 receipt chain:

```text
language -> grounded mission -> candidate routes -> action bets -> safety gates
         -> selected action -> reference dynamics -> settlement -> receipt chain
```

Unsupported requests fail with named evidence instead of a guess. Routing and every decision are deterministic. An optional local embedding model (Qwen 3, run through Doppler) only helps resolve place names — it never picks a route, drives the vehicle, or replaces a safety gate, and stays off until you enable it.

## Blank

Blank treats the prompt as source code: it compiles it into an inspectable, moving world model, then checks the pixels against what the prompt actually asked for.

```text
prompt -> evidence -> grounded world -> simulation -> visual program
       -> WebGPU pixels -> scene proof
```

Eight phases — runtime, language, retrieval, grounded intent, simulation, visual, render, scene proof — each consuming the previous phase's exact output. The [pipeline contract](public/blank/pipeline/README.md) owns phase authority; the rules live in [STYLE_GUIDE.md](STYLE_GUIDE.md).

## Pipeline and interchangeable models

Both products run the same shape of pipeline and emit a receipt at every stage:

**NLP language analysis** (tokens, spans, clauses, predicates, quantities, negation) → **evidence retrieval** (inverted-index lexical + optional neural embedding) → **typed-rule reranking** → **lightweight classification** → **typed graph composition** (one semantic node per concept, typed edges) → routing / simulation / render.

The models are pinned but **interchangeable** behind the [model-runtime lock](public/data/simulatte-embedder/model-runtime-lock.json): a zero-download lexical / TF-IDF control lane and a neural lane (Qwen 3 embedding + reranker, run locally through [Doppler](public/vendor/doppler/)) satisfy the same typed contracts, so a lane can be swapped without changing the pipeline or its guarantees. Routing and every autonomous decision stay deterministic regardless of which lane resolves language.

## Run locally

```bash
npm test
npm run serve   # serves public/ on http://localhost:4173
```

## Deploy

Firebase Hosting serves `public/` from project `simulatte-world`. The predeploy hook runs the deploy gate (`npm run check:deploy`) and stamps the build.

```bash
npm run deploy:hosting
```

## License

Private. `package.json` marks the repository private and declares no license; there is no `LICENSE` file.
