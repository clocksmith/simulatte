# Priority content intake

These five authoring modules preserve the solution agent's original draft, adapted only from ESM to CommonJS. They are not the runtime format and are not loaded by the browser.

`../study-priority-repairs.cjs` owns engineering corrections. `../study-priority-contracts.cjs` and `../study-priority-guides.cjs` supply explicit types, questions and experiments. `../convert-priority-study.cjs` emits the shared v2 contract. `../study-content-priority.cjs` registers its builders with the canonical generator.

Regenerate with `node tools/simulatte/build-study-solutions.cjs` from the repository root. Review the generated contract and focused tests after changing any input. Original source assertions are not automatically qualified engineering claims.
