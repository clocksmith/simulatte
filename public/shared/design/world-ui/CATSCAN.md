# CATSCAN: World UI components

Parent: [Shared browser runtime](../../CATSCAN.md)

## Target

Provide one instrument language: restrained neutral controls, technical typography,
and green for live or selected state.

## Authority

- Owns control geometry, typography, states, focus, menus, sheets, inspector
  structure, metric presentation and responsive component behavior.
- Consumers supply content, callbacks, measurement metadata and scene composition.
- Does not own simulation execution, domain calculations or evidence validity.

## Scope

`public/shared/design/world-ui/`.

## Contracts

- Input: [product goals](../../../../GOALS.md).
- Output: [constructors](components.js), [tokens](tokens.css), [catalog](catalog.html).
- Output: [CSS ownership guard](../../../../tools/check-world-ui-ownership.mjs).

## Invariants

- SimButton variants are primary, secondary, quiet, danger and icon. One primary
  action per context; state does not introduce a new variant.
- Touch targets remain at least 44px. Menus share keyboard navigation, Escape,
  focus return and mobile sheet behavior. Reduced motion remains supported.
- Metrics retain subject, value, unit, time basis, freshness and validity;
  components do not invent missing measurement semantics.
- Selection and inspection cannot change simulation state or camera framing.
- Legacy CSS exceptions freeze existing rules, never permit new control designs.

## Acceptance

- Evidence: [ownership tests](../../../../tests/world-ui-ownership.test.cjs).
- Browser catalog and GPU journeys verify interactions, states and responsive
  presentation. Human comprehension remains a separate study.

## Non-goals

Page-owned control variants, glass styling or plugin-specific calculations.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.
