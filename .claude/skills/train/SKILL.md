---
name: train
description: Launch Simulatte local training mode for human prompt/result review. Use when the user asks to train Simulatte, open training mode, run local training servers, start the human review loop, capture prompt critiques, or get the training UI running in Chrome.
---

# Train

Run this skill from the Simulatte repository root.

Use:

```bash
npm run train
```

This starts or reuses:

- The local app server from `tools/serve-local.mjs`
- The local review server from `tools/simulatte-review-server.mjs`

It opens Chrome to the app with `training=1` and a `trainingServer` URL. Reviews are saved locally in the browser first, then synced to `artifacts/simulatte-human-reviews/reviews.jsonl` when the review server is reachable. The Training panel also has `Export reviews` for browser-only capture.

Useful variants:

```bash
npm run train -- --no-open
npm run train -- --stop
npm run train -- --check --no-open
```

Training mode keys in the app:

- `T`: toggle Training
- `1`: Looks right
- `2`: Wrong scene
- `3`: Missing object
- `4`: Wrong material
- `5`: Too generic
- `6`: Bad motion

Use the phase row to judge `Final`, `1->2`, `1->3`, `1->4`, `1->5`, `1->6`, `1->7`, or `1->8`. Each saved record includes the selected checkpoint, current pipeline phase, compact artifact summary, and canvas diagnostics.

Do not deploy for this workflow. Do not use Firebase. Keep the loop local and receipt-backed through the review server.
