# CTS (Cap Table Simulator) Founder's Compass CTS

## Overview

Cap Table Simulator (CTS) is a vanilla web experience that mirrors Simulatte's aesthetic while delivering a transparent, education-first modeler for startup financing journeys. It follows a three-panel layout—Timeline Builder, Stage Configurator, and Results & Analysis—and keeps every calculation step auditable.

## Naming & Fit

- **CTS** keeps the three-letter motif used across Simulatte (ZQS, SPD, UTP, etc.).
- **Cap Table Simulator** aligns with the mission of demystifying founder dilution while echoing other rigor-driven tools in the collection.

## Architecture Highlights

### App Shell
- Static `index.html` served from `/public/cts`, loading `styles/cts.css` and `boot.js` as ES modules.
- `boot.js` performs capability checks, applies stored preferences, and wires up the application.
- A global `AppBus` (custom `EventTarget`) provides semantic messaging (`scenario:loaded`, `stage:param-change`, `calc:completed`).
- Service worker hook prepared for offline caching and hash-based share link decoding.

### State & Domain Engine
- `store.js` manages immutable snapshots of `Scenario`, `Stage`, `Stakeholder`, and `Security` entities. Commands mutate an internal map and broadcast change events.
- Undo/redo rings preserve inverse commands for interactive time travel.
- `/engine/index.js` exposes `runScenario(scenario, options)` returning cap tables, math ledger entries, warnings, and analytics.
- Stage registry (`engine/stages/*.js`) encapsulates metadata, validation, and lifecycle hooks (`prepare`, `apply`, `finalize`) for each stage type (Founding, SAFE, Convertible Note, Priced Round, Exit).
- Monte Carlo worker (`workers/monte-carlo.js`) receives frozen scenarios, applies stochastic perturbations, and streams histogram summaries back to the UI.

### UI Modules
- `ui/timeline.js` renders draggable stage cards with move/remove controls, quick stage menus, scenario actions (fork, compare, export), and a mobile navigation rail for quick panel jumps.
- `ui/stage-form.js` generates forms from stage metadata with nested repeaters for investors, option refresh, and special rights.
- `ui/results.js` hosts tabbed views: Cap Table grid, Dilution Storyboard, Math Ledger (step-by-step narrative), and Exit Waterfall.
- `ui/modals.js` powers the template gallery, scenario comparison table, and import/export workflows.
- Accessibility and keyboard navigation are first-class: arrow key stage selection, ESC to leave forms, space/enter to toggle options.

### Persistence & Sharing
- `persistence/db.js` persists the entire snapshot to `localStorage`, keeping active scenarios, preferences, and selection state across sessions.
- Autosave is throttled via debounce; snapshots persist after each meaningful change without blocking the UI.
- Export/import supports JSON blobs and base64 share-links embedded in the URL hash for one-click collaboration.

### Validation & Guidance
- `engine/validator.js` enforces structural integrity (non-negative share balances, option pool coverage) and emits advisory objects consumed by the UI.
- Contextual cues highlight the link between form inputs and ledger explanations to reinforce educational goals.

### Extensibility
- Template manifests live in `templates/`, defining typical journeys (YC SAFE path, SaaS bootstrap, Crypto token).
- Term Sheet Builder wizard (planned) will compose multi-stage bundles from user answers, injecting them directly into the timeline.
- Plugin bus allows future importers/exporters to self-register without altering core modules.

### Testing & Quality
- Engine-level specs will land under `tests/engine/*.spec.js` to cover SAFEs, notes, option refresh, and exit math once the pipeline stabilises.
- Planned UI smoke tests will validate drag-and-drop, undo/redo, validation surfaces, and share-link parsing via Web Test Runner.
- Manual accessibility checks recorded per release; theming validated against `simulatte-core.css` tokens.

## Getting Started

1. Open `index.html` in a modern browser.
2. Use the Timeline Builder to add founding, SAFE, note, and priced stages.
3. Adjust parameters in the Stage Configurator; the Results panel updates immediately with math traces and dilution charts.

Template-driven onboarding, shareable URLs, comparison views, and a mobile-first layout arrive out of the box—future iterations will focus on Monte Carlo workers, richer option top-up tooling, and deeper validation.
