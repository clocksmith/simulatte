# Simulatte

Simulatte is a prompt-first browser creator for remixable 2D simulations.

Front-door promise:

> Prompt a world. Resolve intent into components. Run the 2D simulation.

Simulatte uses browser-native simulation surfaces for physical systems: forces,
fields, motion, materials, energy accounting, losses, and visible state
evolution. The front door is a single prompt. Example chips fill that prompt,
then the same intent compiler resolves primitives, components, and simulation
parameters before the canvas runs.

## Product Objects

- Physical system: bodies, fields, constraints, inputs, loads, and losses.
- Integrator: deterministic state updates over small time steps.
- Ledger: tracked input energy, actuator work, useful output, stored motion, and
  losses.
- Canvas surface: continuous rendering of forces, geometry, motion, and readouts.
- Experiment controls: sliders that change physical parameters while the model
  keeps accounting.
- Intent: prompt text resolved into domains, components, and a 2D simulation
  resolution.
- Simulation spec: exportable JSON that can be imported, remixed, and run again.
- Prompt builder: creates intent from terms like solar magnetic wheel, fluid
  vortex tank, blank world, or reaction diffusion chemistry.
- Modules: mechanics, electromagnetism, solar, fluid, turbulence, chemistry,
  diffusion, thermal, gravity, control, optics, acoustics, waves, elasticity,
  collision, buoyancy, granular media, electricity, plasma, pressure, and
  energy-ledger pieces that can be composed into one world.
- Objects: bodies, fields, materials, sources, sinks, actuators, and constraints
  generated from the prompt.

## Browser Modules

- `public/js/simulatte-physics-catalog.js`: templates, controls, primitive
  catalog, and local semantic scoring helpers.
- `public/js/simulatte-physics-model.js`: intent resolution, specs, simulation
  state, integrators, readouts, and energy accounting.
- `public/js/simulatte-intent-embedder.js`: model-backed retrieval over
  precomputed primitive, surface-card, and universe indexes. The current pinned
  EmbeddingGemma runtime uses normalized 768-dimensional sentence embeddings
  with cosine-normalized query and index vectors; it owns retrieval because that
  is the embedding model role.
- `public/js/simulatte-physics-renderer.js`: browser controls, canvas drawing,
  continuous animation, and WebGPU particle-field sync.
- `public/js/simulatte-physics-lab.js`: small public API coordinator.

## Current Seeds

- Solar magnetic wheel with powered stator slider, magnetic torque, motor load,
  bearing friction, and energy balance.
- Fluid vortex tank with inlet flow, obstacle wake, viscosity, turbulence, and
  pressure.
- Reaction diffusion chemistry with feed, kill, diffusion, catalyst, cooling,
  fronts, and heat.
- Blank construction plane with no modules or objects until the builder prompt
  creates them.

These are seeds, not product boundaries. Prompt-built worlds use the
`custom-world` spec and can combine modules from multiple seeds.

## Layered Builder

Simulatte uses a strict adjacent layer stack. Each layer can only build from
the layer immediately below it:

1. Math primitives: scalars, vectors, tensors, fields, grids, meshes, particle
  sets, graphs, curves, boundaries, distance fields, distributions, units,
  transforms, state machines, event queues, kernels, differential operators,
  interpolation, sampling, constraints, queues, and ledgers.
2. Physics operators: gravity, contact, impulses, joints, fluids, turbulence,
  surface tension, heat, radiation, optics, charge transport, ionization,
  magnetism, bonding, fracture, crystallization, reactions, erosion, growth,
  osmosis, acoustics, waves, and orbital dynamics.
3. Materials: water, air, steam, smoke, plasma, ice, oil, sand, soil, clay,
  rock, metals and alloys, glass, quartz, minerals, ceramics, wood, rubber,
  fabrics, polymers, fuels, gases, acids, bases, salts, sugars, DNA, RNA,
  lipids, enzymes, biomass, membranes, and cells.
4. Components: lamps, flames, rivers, clouds, pipes, pumps, fans, motors,
  generators, lenses, mirrors, prisms, magnets, gears, sensors, controllers,
  atomic samples, molecular chains, crystal slabs, electrolyte cells, gases,
  droplets, powder beds, polymer sheets, membranes, cells, soils, beams, panes,
  tiles, and adhesive joints.
5. Compositions: forest fires, river erosion, engines, tunnels, optics benches,
  reactors, greenhouses, weather cells, supply chains, traffic, markets, power
  grids, materials labs, molecular benches, electrolysis demos, crystal growth,
  polymer lines, soil hydrology, and aerosol chambers.
6. Scenes: lab benches, solar fields, watersheds, factories, cities, forests,
  storms, reactor rooms, warehouses, transit maps, marketplaces, colonies,
  materials studios, molecular studios, wet labs, geology tables, and atmosphere
  chambers.

Layer 1 stays neutral: it describes numeric containers and operators, not
physical meanings. Temperature is a physics-layer scalar field; velocity is a
physics-layer vector field; pressure is a physics-layer scalar field; erosion
uses a height field plus flow; queues use graph and buffer primitives.

Higher layers are recipes over only the adjacent lower layer: scenes reference
compositions, compositions reference components, components reference
materials, materials reference physics, and physics references math. A prompt
for a forest fire, optics bench, or city grid materializes that ladder into one
simulation spec by recursive expansion.

Natural language and ML do not live inside the stack. They are a compiler
input plane above it: prompt text, embeddings, semantic retrieval, and local
model hints choose target layers, rank primitives, fill slots, and propose
physical graph deltas. The committed world still has to compile through the
adjacent layer rules.

Retrieval and reasoning are separate model roles. EmbeddingGemma owns
retrieval: prompt embeddings, primitive matching, surface-card matching, and
semantic-universe matching. A separate local text model may provide optional
JSON graph hints, but it must not replace the embedding model for retrieval.
Retrieval model swaps should be decided by benchmarked index candidates.

Layer recipes now compile into contracts, not only dependency lists:

- Material profiles normalize density, hardness, heat capacity, conductivity,
  combustibility, moisture, opacity, refractive index, magnetization,
  viscosity, and phase point.
- Interaction rules encode pair behavior such as water suppressing combustion,
  dry wood feeding flame spread, glass refracting light, magnetized metal
  responding to fields, and water carrying erosion.
- Geometry profiles declare point, field, particle cloud, rigid body,
  boundary, volume, graph, terrain, and scene-plane shapes.
- Ports declare accepted and emitted flows: energy, matter, force, signal,
  flow, light, heat, pressure, motion, loss, and trace.
- Recipe slots give higher layers roles, so forest fire has fuel, ignition,
  oxygen, moisture, and spread-front slots instead of only child ids.
- Scene layouts set spatial grammar and readouts for bench, watershed, forest,
  city-grid, warehouse, market, and colony worlds.

## Graph IR

Resolved worlds now compile into `simulatte.graphIR.v1` before rendering or
stepping. The graph is the runtime shape for composition:

- Nodes own geometry, ports, material profile, layer identity, and component
  state such as temperature, moisture, pressure, backlog, fuel, mass, velocity,
  health, and inventory.
- Edges connect recipe dependencies and compatible ports for energy, matter,
  force, signal, flow, light, heat, pressure, motion, loss, and trace.
- Units attach dimensions to simulation parameters, including length, mass,
  time, energy, heat, pressure, opacity, probability, rate, charge, force, and
  inventory.
- Operators declare physics behavior such as advection, combustion, refraction,
  queue service, erosion, phase change, magnetism, heat transfer, buoyancy,
  collision, diffusion, and growth/decay.
- Conservation rules declare what a world tracks, supplies, loses, or externally
  injects for energy, mass, momentum, charge, inventory, and population.
- Temporal events describe triggers such as ignition, overload, rainfall, phase
  threshold crossing, controller response, and failure/recovery.
- Validity checks repair impossible or underspecified prompts before simulation,
  such as adding missing fuel or warning that raw rock cannot be served by a
  queue without logistics context.
- Prompt explanations expose the top identity, expanded primitives,
  interactions, operators, conservation rules, and validation status.

## World Plan

Prompt-built worlds also compile into `simulatte.worldPlan.v1`, a concrete 2D
scene plan inspired by Grid's intent-to-scene pipeline:

- `intentState` records the resolved layer focus, layout mode, and top-level
  identity.
- `stageTrace` records lexical evidence, primitive resolution, contract graph,
  spatial solve, simulation program, and renderer plan stages.
- `objects` are physical bodies with material, role, shape, normalized pose,
  and dynamics. A forest fire uses a fuel bed, burn front, smoke plume, water
  line, wind field, and rock wall. An optics bench uses lamp, lens, prism,
  mirror, rail, and sensor. A city grid uses network nodes, queues, power, and
  service links. A magnetic machine uses solar panel, rotor, magnets, stator,
  motor load, and energy ledger.
- `relations` connect objects through force, heat, fuel, flow, light, signal,
  work, energy, and receipt channels.
- `fields` and `emitters` drive visible radiation, magnetic field lines, heat,
  smoke, sediment, optical rays, gravity, and network flow.
- `fidelity` summarizes whether the prompt materialized into a distinct,
  inspectable simulation instead of a generic component graph.

The builder can recreate the solar magnetic perpetual-motion-machine idea as a
solar-powered magnetic wheel with explicit accounting. It can spin when slider
work times the magnetic field correctly, but it cannot create net energy; the
ledger exposes input, useful output, stored motion, and losses.

## Boundary

Simulatte is not a D4DA archive, Reploid agent room, Grid wrapper, Dream demo,
or new separate product. Grid, Dream, Reploid, D4DA, Doppler, Doe, and Plasma
can later integrate only as packaged dependencies. The first product loop is
owned here:

```text
prompt -> intent -> components -> 2d simulation spec -> continuous render -> export/remix
```

## Local Check

```bash
npm test
npm run serve
```

`npm run serve` serves `public/` and mounts the sibling Doppler repo at
same-origin `/doppler/`. The intent manifest defaults to the pinned
EmbeddingGemma artifact URL. For local artifact testing, pass an override such
as
`?embeddingModelBase=/doppler/models/local/google-embeddinggemma-300m-q4k-ehf16-af32`.

## Deployment

This repo deploys static Firebase Hosting to project `simulatte-world`.

The machine has multiple Firebase accounts, so always check the active account
before deploying:

```bash
firebase login:list
firebase login:use <account-email>
firebase use
```

The deploy commands pin the project explicitly:

```bash
npm run deploy:preview
npm run deploy:hosting
```


If the CLI reports expired credentials, reauthenticate the selected account:

```bash
firebase login --reauth
```

`https://simulatte.world` and `https://simulatte-world.web.app` should both
serve the `simulatte-world` Firebase Hosting site when the custom domain is
attached to this project. Verify the active domain target with:

```bash
curl -I https://simulatte.world
curl -I https://simulatte-world.web.app
```
