---
name: simulatte-train-ui
description: Start, check, or stop Simulatte's local human-review UI when the user asks to operate the training interface.
---

# Simulatte Training UI

## Prerequisites

- Run from the Simulatte repository root.
- Confirm whether the request is start, readiness check, or stop.
- The default review log is `artifacts/simulatte-human-reviews/reviews.jsonl`.
- Keep the workflow local; do not use Firebase or deploy it.

## Procedure

Start the app and review servers, opening Chrome unless `--no-open` is requested:

```bash
npm run train
```

Useful bounded modes:

```bash
npm run train -- --no-open
npm run train -- --check --no-open
npm run train -- --stop
```

On start, report the exact app URL, review-server URL, and review JSONL path printed by
the launcher. Reviews are stored in the browser first and synchronized to the reported
review directory when the server is reachable.
Each saved review records the selected checkpoint, pipeline phase, feedback, compact
artifact summary, and canvas diagnostics.

## Validation

For a readiness request, `npm run train -- --check --no-open` must start both services,
verify them, and stop the processes it created. For an active session, both URLs respond
and a saved review reaches the reported `reviews.jsonl` or is explicitly browser-only.

## Stop Conditions

Stop if a requested port is owned by an unrelated process, the session file identifies
another launcher, or the review destination is ambiguous. Do not kill unrelated processes,
compile reviews, open a remote browser, or deploy through this skill.

## Outputs

Operation performed, exact URLs, process/session ownership, review path, and readiness or
stop result.

## Side Effects

Starts or stops local app/review-server processes and may open Chrome. It writes launcher
session state and human reviews; it does not compile or deploy them.
