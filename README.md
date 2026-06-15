# Simulatte

Simulatte is a world-model product.

Front-door promise:

> Type a scenario. Run the board.

Simulatte repurposes the existing canvas experience into a browser simulation
board. The front door should not feel like d4da.com or a map portal: one prompt
becomes a board of shocks, actors, resources, signals, and run trace.

## Product Objects

- Scenario: the prompt and editable setup.
- Board: actors, resources, rules, shocks, goals, and signals.
- Run: deterministic steps that change metrics and board pressure.
- Replay: the explanation of what changed at each step.
- Completion room: a saved or exported workspace containing the scenario, world
  model, run, and replay.

## Boundary

Simulatte is not a D4DA archive, Reploid agent room, Grid wrapper, Dream demo,
or new separate product. Grid, Dream, Reploid, D4DA, Doppler, Doe, and Plasma
can later integrate only as packaged dependencies. The first product loop is
owned here:

```text
scenario -> board -> run -> replay -> completion room
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
