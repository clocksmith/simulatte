# Simulatte Spec & Verification Specification

Status: working specification. Each section states the schema/equation, the current
code anchor, and the verification criterion. `[done]` items are implemented and
checked in this repo; `[spec]` items are defined here and pending implementation.

Real counts in this document are read from the committed artifacts (not estimated):
visual-card index = **812** docs, primitive vectors = **420**, universe indices as
billed in §6. Where a prior summary said "2048 docs / 322 primitives", that was
inaccurate — the figures below are authoritative.

---

## 1. Integrator metadata schema  `[spec]`

Solvers under `public/js/solvers/*.js` currently declare `stableDt` and run an
inline semi-implicit Euler step against `channels.__t`. To make integration
explicit, auditable, and per-domain selectable, every solver declares an
`integrator` block.

```json
{
  "integrator": {
    "scheme": "semi_implicit_euler_v1 | verlet_v1 | rk4_v1",
    "order": 1,
    "symplectic": false,
    "stableDt": 0.05,
    "cfl": 0.9,
    "stateContract": ["position", "velocity"]
  }
}
```

Scheme registry:

| scheme | order | symplectic | use for |
|---|---|---|---|
| `semi_implicit_euler_v1` | 1 | yes (separable) | default; advection, thermal, reaction-diffusion |
| `verlet_v1` | 2 | yes | rigid-body, rotational, constraints (energy-preserving) |
| `rk4_v1` | 4 | no | wave-field, pressure-flow (accuracy over conservation) |

`verlet_v1` requires `stateContract` to expose both `position` and `velocity`
channels (or `value` + `prevValue`) so the half-step can be formed. `rk4_v1`
requires the solver `step` to be a pure function of `(state, t, dt)` — enforced by
§2 (no wall-clock/entropy reads inside the step).

**Verification:** a registry test asserts every solver exposes a valid `integrator`
with `stableDt > 0`, `scheme` in the registry, and — for `verlet_v1`/`rk4_v1` — the
required state channels present. `dt` actually used at runtime must satisfy
`dt <= stableDt / max(1, cfl)`.

---

## 2. Determinism scanner (parser/lexical AST scan)  `[done]`

Tool: **`tools/scan-nondeterminism.mjs`** — dependency-free (the project carries no
deps and does not add an AST library). It tokenizes each module enough to strip
comments and string/template literals (preserving offsets), then matches
non-deterministic call signatures on the **determinism-critical surface only**.

Critical surface (19 modules): the 7 compute-path cores
(`physics-model`, `physics-ir`, `physics-ir-validator`, `solver-compiler`,
`solver-registry`, `composition-graph`, `render-ir`) plus all 12 `solvers/*.js`.
The render/UI/loop layer is intentionally excluded — `performance.now()` for frame
pacing and `requestAnimationFrame` for the draw loop are legitimate there.

Forbidden signatures: `Math.random`, `Date.now`, argless `new Date()` / `Date()`,
`performance.now`, `crypto.getRandomValues`, `crypto.randomUUID`, `setTimeout`,
`setInterval`, `requestAnimationFrame`. `new Date(<literal>)` (e.g. `new Date(0)`
epoch defaults) is a fixed instant and is allowed.

```
node tools/scan-nondeterminism.mjs          # critical surface, exit 1 on violation
node tools/scan-nondeterminism.mjs --json    # machine-readable, schema simulatte.determinismScan.v1
node tools/scan-nondeterminism.mjs --all     # include render/UI layer (informational)
```

**Current result: clean (0 violations).** The scan found and we fixed one real
hazard: `remixSpec()` seeded parameter drift with `Date.now()`. It now seeds from
an explicit `overrides.seed` or a deterministic FNV-1a hash of the spec identity,
so identical inputs remix identically (verified).

**Verification:** `scan:determinism` is wired as an npm script and must exit 0 in CI.

---

## 3. Physical energy balance & discrepancy accounting  `[spec]`

For each simulation domain `d`, total mechanical-equivalent energy per frame:

```
E_d(t) = E_kinetic + E_potential + E_thermal + E_field
       = Σ ½·m_i·|v_i|²  +  Σ m_i·g·h_i  +  Σ c_i·ρ_i·T_i  +  ½·Σ (κ·|∇φ|²)
```

System energy: `E(t) = Σ_d E_d(t)`. Over a step the balance must close:

```
E(t+dt) = E(t) + W_in(dt) − W_out(dt) − D_dissipated(dt)
```

Discrepancy metric (dimensionless, per step and cumulative):

```
ΔE_step  = | E(t+dt) − E(t) − W_in + W_out + D | / E_ref
ΔE_cum   = | E(t) − E(0) − ∫W_in + ∫W_out + ∫D | / E_ref
E_ref    = max(E(0), Σ E_d(t), ε)
```

Tolerance bands (accept / warn / fail) keyed by integrator symplecticity:

| integrator | warn ΔE_cum | fail ΔE_cum |
|---|---|---|
| symplectic (`verlet_v1`, semi-implicit) | 2e-2 | 1e-1 |
| non-symplectic (`rk4_v1`) | 5e-2 | 2e-1 |

Code anchor: the renderer already exports an `energyLedger`; this section makes it a
typed readout `{ schema, frame, perDomain[], E, dE_step, dE_cum, band }` emitted each
step and surfaced in the debug panel.

**Verification:** a long-run test (≥600 steps) on a closed scene (no sources/sinks)
asserts `ΔE_cum` stays within the `warn` band; an open scene asserts the ledger
accounts every `W_in/W_out` so `ΔE_cum` still closes.

---

## 4. CSR (Checkpoint / Snapshot / Restore) descriptor  `[spec]`

A checkpoint captures everything needed to resume a deterministic run bit-for-bit.

```json
{
  "schema": "simulatte.checkpoint.v1",
  "specHash": "fnv1a-32 of serialized spec",
  "frame": 1234,
  "simTime": 19.744,
  "rngSeed": 7,
  "integratorState": { "<solverId>": { "scheme": "verlet_v1", "carry": {} } },
  "channels": { "<channelId>": <scalar|vector|grid> },
  "readouts": { "energyLedger": { "E": 1.0, "dE_cum": 0.004 } },
  "contentHash": "fnv1a-32 over { frame, channels, integratorState }"
}
```

Restore invariants:
1. `specHash` of the restore target must equal the descriptor's — refuse cross-spec restore.
2. Stepping `N` frames from `frame=0` then checkpointing must produce the **same**
   `contentHash` as restoring a `frame=N` checkpoint and reading it back (round-trip).
3. `rngSeed` rehydrates the deterministic remix/jitter seed (§2) — no wall-clock.

Code anchor: `serializeSpec` / `deserializeSpec` exist for the spec; CSR extends them
with the live `solverState.channels` + integrator carry + seed.

**Verification:** round-trip test — run→checkpoint→serialize→deserialize→restore→step,
assert `contentHash` equality and channel-wise equality within float epsilon.

---

## 5. Spatial-grid transfer boundary calculations  `[spec]`

Field channels on a grid exchange flux across domain boundaries using ghost (halo)
cells so transport is conservative and stable.

- **Ghost layer:** width `g = ceil(stencil/2)` cells mirrored outside each boundary.
- **Boundary kinds:** `reflective` (mirror, `φ_ghost = φ_interior`), `absorbing`
  (`φ_ghost = 0`), `periodic` (`φ_ghost = φ_opposite`), `coupled`
  (`φ_ghost = interp(neighbor domain)`).
- **Flux conservation across a shared face A|B:**

```
F_AB = ½·(u_A·φ_A + u_B·φ_B) − ½·|u_face|·(φ_B − φ_A)      // upwind-stabilized
φ_A += −(dt/Δx)·F_AB        φ_B += +(dt/Δx)·F_AB           // equal-and-opposite ⇒ Σφ conserved
```

- **Interpolation weights** for `coupled` faces at resolution mismatch: bilinear,
  weights sum to 1, clamped to `[0,1]`; transferred quantity clamped to physical range.
- **CFL at boundary:** `|u_face|·dt/Δx ≤ cfl` (shares §1's `cfl`).

**Verification:** inject a tracer on side A of a `coupled` boundary; assert total
tracer mass `Σφ_A + Σφ_B` is conserved to float epsilon over the run, and that a
`reflective` wall produces zero net flux.

---

## 6. Semantic universe index bill  `[done — metrics; expansion spec]`

Authoritative inventory of precomputed semantic artifacts (read from committed JSON):

| index | documents |
|---|---|
| synonym-index-v1 | 4292 |
| concept-index-v1 | 1797 |
| affordance-index-v1 | 1091 |
| visual-card-index-v1 | 812 |
| **primitive-index-v2 (embedding vectors)** | **420** |
| shape-index-v1 | 398 |
| operator-index-v1 | 308 |
| scene-index-v1 | 270 |
| relation-index-v1 | 145 |
| process-index-v1 | 139 |
| material-index-v1 | 126 |

Embedding model: `qwen-3-5-0-8b-q4k-ehaf16` (selected for browser-runtime
reliability, **not** benchmarked as a dedicated retriever — see manifest caveat).

**Honest coverage framing** (do not inflate): the 420 primitive vectors cover
effectively the entire *Simulatte physics* vocabulary, but a vanishingly small
fraction of general/world English. Capability is therefore "deep on physics
primitives, ~0% of open-domain language." The goal is vocabulary breadth, not
prompt-template tuning.

Bill metrics emitted by `tools/benchmark-semantic-coverage.mjs` (extend to report):
`{ index, documents, vectorDims, bytes, coveragePctOfPhysics, coveragePctOfEnglish≈0 }`.

**Expansion targets (spec):** grow visual-card boundary families (cosmology,
geophysics, quantum, biosystems, chaos) and concept/affordance breadth; every added
card must pass `validate:visual-cards` with a procedural recipe signature + receipt.

---

## Implementation checklist

- [x] §2 determinism scanner (`tools/scan-nondeterminism.mjs`) — clean
- [x] §2 fix `remixSpec` wall-clock seed → deterministic
- [x] Semantic-first scene routing (composition-graph) — fast/fallback unified
- [x] §3 anchor: `energyLedger` typed readout (partial — banding pending)
- [ ] §1 `integrator` blocks on all 12 solvers + registry validation test
- [ ] §3 energy-balance ledger banding + closed/open-scene tests
- [ ] §4 CSR descriptor + round-trip test
- [ ] §5 grid boundary flux + conservation test
- [ ] §6 extend coverage benchmark to emit the full bill
