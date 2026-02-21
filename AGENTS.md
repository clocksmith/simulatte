# Simulatte Agent Instructions

`simulatte/` hosts the Simulatte web experience on Firebase Hosting.

## Purpose

- Maintain the static site under `public/`.
- Keep interaction and presentation code simple and browser-first.
- Preserve a fast deploy path through Firebase.

## Routing Rules

- Primary editable surface: `public/`.
- Hosting configuration lives in `firebase.json` and `.firebaserc`.
- If future nested `AGENTS.md` files are added, nearest-file precedence applies.

## Guardrails

- Keep assets and links deploy-safe for static hosting.
- Prefer relative paths for site resources.
- Avoid adding server/runtime assumptions unless explicitly requested.

## Delivery Expectations

- Changes should run directly in a browser from the hosted `public/` output.
- Keep pages functional on desktop and mobile.
