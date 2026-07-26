# Experience name

Owner contract: `path/to/runtime-owner.js`.

Use 650 to 850 authored words, excluding tables and links. Use terse,
present-tense prose. Keep the headings below in this order.

## Status

Provide exactly eight line items:

- Status: proposed, scaffolding, implemented, verified, or deployed
- Tier and world
- Plugin ID
- Profile ID
- Default scenario
- Contract version
- Last verified source
- Evidence

## What is it?

Use 40 to 60 words. State the user role, problem, honest outcome, and primary
claim boundary.

## What does it actually do?

Use five to seven numbered steps and no more than 140 words. Describe the
loaded inputs, initialization, progression, decision, comparison, settlement,
and receipts that execute today. Prefix unimplemented behavior with
`Proposed:`.

## What can the user control?

Use three to ten rows. Group closely related controls when the runtime exposes
more than ten.

| Control | Default | Allowed values | Material effect |
|---|---:|---|---|
| Example | Example default | Bounded values | Behavior that changes |

Every visible control must have a material effect. Do not document decorative
or deferred controls as executable.

## What does the user see?

Provide exactly five line items:

- Initial view
- During playback
- Selection and inspection
- Comparison view
- Final settlement

Use no more than 25 words per line.

## What is real, derived, modeled, or simulated?

Use five to fifteen rows. Classify fields, not the experience as a whole.

| Item | Origin | Source | Time status | Uncertainty | Used for |
|---|---|---|---|---|---|
| Example | observed | Governed source row | historical | Source limitation | Runtime use |

Allowed origins are `observed`, `derived`, `modeled`, `simulated`, and
`scenario`. Origin, temporal status, and uncertainty remain independent.

## How does the simulation work?

Provide exactly six line items:

- State
- Governing algorithm
- Progression
- Randomness
- Invariants
- Settlement

Use no more than 180 words total.

## How do comparison and playback work?

Provide exactly five line items:

- Baseline branch
- Intervention branch
- Shared inputs
- Clock and replay
- Invalid comparison

## What can and cannot be claimed?

Provide exactly four `Can claim` bullets and four `Cannot claim` bullets.

## What is verified?

Provide exactly six line items:

- Unit tests
- Deterministic replay
- Comparison execution
- Desktop browser
- Mobile browser
- Known unresolved failures

Use `not tested`, `not implemented`, or `failed` instead of omitting evidence.

## Where is it implemented?

Provide no more than eight links. Prefer plugin entry, configuration, main
model, v4 contribution, profile, governed data, focused tests, and evidence.
