---
catscan: 1
path: public
owner: simulatte
contractNode: simulatte.public
status: active
---

# Simulatte browser surface

The static browser surface owns the World simulator, the separate Blank prompt-to-pixels compiler, shared assets, governed data,
and their visible readiness or refusal states.

## API Surface

- World entrypoint and URL-selected experience profiles
- Blank eight-phase compiler entrypoint
- Shared plugin host, assets, manifests, and governed data loaders

## Internal Dependencies

- `public/data/`
- `public/shared/`
- `public/simulatte/`
- `public/blank/`

## External Dependencies

- Browser DOM, Canvas, WebGPU, and static hosting APIs.

## Validation

- `npm run check:runtime-entrypoint`
- `npm run check:world-entrypoint`
- `npm run check:deploy`
- Browser journeys declared in the folder contract.

## Non-Claims

An object present in JavaScript is not proof that its meaning is visible in settled pixels.
