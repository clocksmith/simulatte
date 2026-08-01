# Cable Trader

Owner contract: `public/shared/plugins/cable-trader/index.js`.

## Status

- Status: implemented
- Tier and world: City, `nyc-core-autonomy-v1`
- Plugin ID: `cable-trader`
- Profile ID: `cable-trader-pickup-v1`
- Default scenario: `everyday-exchange`
- Contract version: circulation config v6 and plugin v4 contribution
- Last verified source: focused tests plus local desktop and mobile browser audits on 2026-07-28
- Evidence: 256 unique residences, 4 distributed hubs by default, 365 days, real City route geometry, live journeys, and balanced cable accounting

## What is it?

Cable Trader is a continuous community cable exchange. A configurable population of modeled
neighbors use nearby hubs to pass along everyday cables that another neighbor
would otherwise be missing, such as USB, HDMI, Ethernet, audio, display, and
power cables. It is a hub-and-spoke reuse network, not a restoration crisis.

## What does it actually do?

1. Creates a stable identity and a distinct residence coordinate for every modeled person.
2. Distributes the configured number of hubs across the mutually routable City network.
3. Generates daily cable supply and demand for all 365 days of a pseudo-year.
4. Maintains inventory and waiting demand for every cable type at every hub.
5. Matches available stock to pickup requests and future drop-offs to waiting requests.
6. Routes the currently visible fulfilled pickups and drop-offs over governed City segments.
7. Presents tiny, unlabeled traveler nodes carrying named cables to or from their responsible hub.
8. Settles global and per-hub boards with exact cable conservation.

## What can the user control?

| Control | Default | Allowed values | Material effect |
|---|---:|---|---|
| People / unique residences | 256 | 64 to 10,000 | Changes participation, supply, demand, person identities, and one-to-one residence nodes |
| Hubs | 4 | 4 to 64 | Changes distributed inventory boards and spoke topology |
| Cable set | 12 everyday types | One or more declared types | Changes inventories, demand mix, and cable identities |
| Pseudo-year | Everyday exchange | Four governed seeds | Changes the deterministic daily circulation pattern |

## What does the user see?

- Initial view: Tiny residence nodes, distributed hubs, and a concise global exchange board.
- During playback: Tiny people nodes moving over real City routes without flashing map labels.
- Hub boards: Supply, demand, fulfilled pickups, available inventory, and waiting requests for each active hub.
- Global board: Daily supply, daily demand, reused cables, waiting demand, journeys, and cumulative pseudo-year totals.
- Inspection: Person, cable type, action, hub, unique residence, and route-backed journey evidence.

## What is real, derived, modeled, or simulated?

| Item | Origin | Source | Time status | Uncertainty | Used for |
|---|---|---|---|---|---|
| City node and route geometry | observed/derived | Governed NYC world | snapshot | Coverage limits | Hub, residence-anchor, and journey placement |
| Everyday cable taxonomy | scenario | Authored cable catalog | forecast | Not externally calibrated | Cable identities |
| People and unique residences | simulated | Seeded circulation model | forecast | Not population calibrated | Stable one-person/one-home participants |
| Supply, demand, and inventory | simulated | Seeded circulation model | forecast | Not operations calibrated | Exchange boards |
| Pickups and drop-offs | simulated | Hub-and-spoke matching model | forecast | Input-driven | Live journeys |
| Annual outcomes | simulated | Exact modeled accounting | forecast | Seed-dependent | Settlement |

## How does the simulation work?

- State: Stable people, one unique residence per person, active hubs, per-cable inventory, waiting demand, and journeys.
- Governing algorithm: Seeded daily participation with hub-local inventory matching and backlog service.
- Progression: A complete 365-day pseudo-year advances one deterministic daily state at a time.
- Randomness: Seed, people/residence count, hub count, and cable set enter configuration identity.
- Invariants: Starting inventory plus drop-offs equals fulfilled pickups plus ending inventory.
- Settlement: Playback must reach day 365 and cable balance must pass.

## How do comparison and playback work?

- Comparison: Cable Trader has no policy comparison mode because this experience is one continuous exchange.
- Clock: Playback uses 365 daily steps, exposes the current pseudo-day, and defaults to 2.5 seconds per day before playback-rate adjustment.
- Replay: The same seed and controls reconstruct the same people, boards, and journeys.
- Shuffle: Changing the pseudo-year seed produces a different deterministic circulation pattern.
- Controls: Edited people/residences, hubs, and cable types immediately rebuild the ready pseudo-year.

## What can and cannot be claimed?

- Can claim that every displayed traveler references a stable modeled person.
- Can claim that every displayed traveler carries a named modeled cable for pickup or drop-off.
- Can claim that global values equal the sum of the active hub boards.
- Can claim that the settled pseudo-year preserves exact cable balance.
- Cannot claim that people, supply, demand, inventory, or participation are observed.
- Cannot claim that modeled fulfillment predicts a real exchange network.
- Cannot claim that a cable taxonomy establishes electrical compatibility or safety.
- Cannot claim that browser proof extends beyond the checked world, controls, and playback path.

## What is verified?

- Focused tests: deterministic replay, stable people, 365-day progression, and causal controls pass.
- Supply and demand: global values reconcile to every active hub board.
- Cable accounting: starting stock plus supply equals reused cables plus ending stock.
- Journey evidence: every live person has a cable, action, preferred hub, unique residence, and route.
- Semantic contracts: v1 presentation and v4 contribution validation pass.
- Browser audits: visible daily journeys use governed routes, the pseudo-year settles, and desktop/mobile controls apply immediately at the 256-person / 4-hub default.

## Where is it implemented?

- [Plugin entry](../../../public/shared/plugins/cable-trader/index.js)
- [Circulation simulation](../../../public/shared/plugins/cable-trader/circulation-simulation.js)
- [Presentation adapter](../../../public/shared/plugins/cable-trader/circulation-presentation.js)
- [Configuration](../../../public/shared/plugins/cable-trader/default-config.json)
- [v4 contribution](../../../public/shared/plugins/cable-trader/v4-contribution.js)
- [Profile](../../../public/data/application-profiles/cable-trader-pickup-v1.json)
- [Authored cable catalog](../../../public/data/cable-trader/cable-circulation-catalog-v1.json)
- [Focused tests](../../../tests/cable-trader.test.cjs)
