# Simulatte

Simulatte is a browser creator for remixable physics simulations.

Front-door promise:

> Build plausible worlds. Remix them. Watch the physics account for itself.

Simulatte uses browser-native simulation surfaces for physical systems: forces,
fields, motion, energy accounting, losses, and visible state evolution. The
front door is a builder that turns prompts into editable composed simulation
specs, then runs those specs continuously on canvas.

## Product Objects

- Physical system: bodies, fields, constraints, inputs, loads, and losses.
- Integrator: deterministic state updates over small time steps.
- Ledger: tracked input energy, actuator work, useful output, stored motion, and
  losses.
- Canvas surface: continuous rendering of forces, geometry, motion, and readouts.
- Experiment controls: sliders that change physical parameters while the model
  keeps accounting.
- Simulation spec: exportable JSON that can be imported, remixed, and run again.
- Prompt builder: creates a simulation spec from terms like solar magnetic wheel,
  fluid vortex tank, or reaction diffusion chemistry.
- Modules: mechanics, electromagnetism, solar, fluid, turbulence, chemistry,
  diffusion, thermal, gravity, control, and energy-ledger pieces that can be
  composed into one world.
- Objects: bodies, fields, materials, sources, sinks, actuators, and constraints
  generated from the prompt.

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
prompt or template -> simulation spec -> editable controls -> continuous render -> ledger/export/remix
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

When deploying from one of the known local accounts, use the account-pinned
scripts instead of relying on global CLI state:

```bash
npm run firebase:check:d4da
npm run deploy:preview:d4da
npm run deploy:hosting:d4da

npm run firebase:check:personal
npm run deploy:preview:personal
npm run deploy:hosting:personal
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
