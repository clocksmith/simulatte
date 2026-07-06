# Simulatte Agent Instructions

`simulatte/` hosts the Simulatte web experience on Firebase Hosting.

## Purpose

- Maintain the static site under `public/`.
- Keep interaction and presentation code simple and browser-first.
- Preserve a fast deploy path through Firebase.
- Follow [STYLE_GUIDE.md](STYLE_GUIDE.md) for Simulatte phase contracts,
  browser runtime style, receipt design, rendering boundaries, tests, and docs.

## Routing Rules

- Primary editable surface: `public/`.
- Hosting configuration lives in `firebase.json` and `.firebaserc`.
- If future nested `AGENTS.md` files are added, nearest-file precedence applies.

## Guardrails

- Read [STYLE_GUIDE.md](STYLE_GUIDE.md) before non-trivial edits.
- Keep assets and links deploy-safe for static hosting.
- Prefer relative paths for site resources.
- Avoid adding server/runtime assumptions unless explicitly requested.

## Delivery Expectations

- Changes should run directly in a browser from the hosted `public/` output.
- Keep pages functional on desktop and mobile.

## Intent-First Operations

- Treat Simulatte intent as the strict browser simulation pipeline product, not Gamma, Doppler, Reploid, or Poolday.
- If the user asks about app structure, start with the broad boundary: `public/app` is the client UI app, `public/pipeline` is the pipeline, and `public/data` is assets/contracts.
- Do not preserve confusing taxonomy when the user is simplifying. Use plain job names such as start, page, state, controls, and drawing when they match behavior.
- For pipeline work, respect the fixed phase order the user gives. Do not add split phases or reverse traversal unless asked.
- Phase N consumes the exact Phase N-1 output plus allowed runtime context only. Fix loose validators, side channels, audit fallbacks, and compatibility inputs as boundary bugs.
- When visuals look repetitive or semantically wrong, inspect the named phase boundary first and show the concrete artifact mismatch before broad rewrites.
- Training commands are operational commands: start the training workflow, report the server/browser URL or exact blocker, and keep the run state clear.

## No time estimates

- never estimate work in hours, days, weeks, or any other time unit, in code, comments, commit messages, status updates, receipts, or chat replies
- do not say "~30 min", "~2 hr", "multi-day", "quick", "long-running" as size proxies for engineering work
- describe what the work IS — the file to change, the function to add, the schema field to extend, the named blocker to fix — not how long it should take
- if scope must be conveyed, list the concrete deltas (lines/files/symbols touched) instead of a duration

## Pick the real fix

- when you find a correctness bug, the default is to fix it, not to relabel it
- do not use effort or scope framing ("non-trivial", "real engineering effort", "worth its own thread", "we'll address later") as cover for choosing a lesser fix
- do not propose "mark experimental", "add a TODO", or "rewrite the misleading comment" as a substitute for the actual engineering work when the underlying behavior is wrong
- if scope genuinely must be split, describe the concrete deltas and ask the user which path to take, do not pre-decide a smaller version
