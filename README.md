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

The prompt resolver expands worlds through six reusable layers:

- Math primitives: fields, particles, bodies, constraints, queues, and ledgers.
- Physics operators: gravity, collisions, fluids, heat, radiation, optics,
  magnetism, reactions, erosion, and growth.
- Materials: water, air, steam, smoke, plasma, ice, oil, sand, soil, clay,
  rock, metal, magnetized metal, glass, wood, rubber, fabric, concrete,
  plastic, fuel, and biomass.
- Components: lamps, flames, rivers, clouds, pipes, pumps, fans, motors,
  generators, lenses, mirrors, prisms, magnets, gears, sensors, and controllers.
- Compositions: forest fires, river erosion, engines, tunnels, optics benches,
  reactors, greenhouses, weather cells, supply chains, traffic, markets, and
  power grids.
- Scenes: lab benches, solar fields, watersheds, factories, cities, forests,
  storms, reactor rooms, warehouses, transit maps, marketplaces, and colonies.

Higher layers are recipes over lower layers. A prompt for a forest fire,
optics bench, or city grid materializes the scene, composition, components,
materials, physics operators, and math primitives into one 2D simulation spec.

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
