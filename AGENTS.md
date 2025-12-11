# Agent Instructions

You are working on **Simulatte**, a browser-based game teaching how LLMs work through token prediction.

## Before Starting

1. Read `README.md` for project overview
2. Read `EMOJI.md` for approved Unicode symbols (strict no-emoji policy)

## Project Structure

```
simulatte/
├── app.js              # Main SimulatteApp class
├── index.html          # Entry point
├── core/               # Config, sampling, model registry
├── engines/            # TransformersEngine (HuggingFace)
├── game/               # Game logic, controller, sessions
├── ui/                 # Panels, visualizations, selectors
├── utils/              # EventBus, MathUtils, Storage
└── styles/             # CSS themes
```

## Key Files

- `core/model-registry.js` - Model catalog and configs
- `core/sampling-utils.js` - Temperature, top-k, top-p logic
- `engines/transformers-engine.js` - HuggingFace Transformers.js integration
- `game/game-logic.js` - Token choice generation
- `ui/game-panel.js` - Main game UI

## Guidelines

- Use only approved Unicode symbols from `EMOJI.md`
- Vanilla JS with ES modules (no frameworks)
- Optimize for WebGPU/WASM browser performance
- Models run client-side via Transformers.js
- Keep code minimal and focused

## Commands

```bash
npm run dev      # Development server
npm run build    # Production build
npm run preview  # Preview build
```
