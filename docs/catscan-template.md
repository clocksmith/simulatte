# CATSCAN Charter Format

Owner contract: [root CATSCAN](../CATSCAN.md).

Use a `CATSCAN.md` only where a directory owns an independently meaningful
system, contract, policy, promotion boundary, or user outcome. Utility folders
and mechanical subdivisions inherit their nearest ancestor charter.

An agent reads every charter from the repository root to the target directory.
A child narrows its parent and does not repeat or broaden parent authority.
Charters state what remains true, not how it must be implemented.

```markdown
# CATSCAN: <Component>

Parent: [<parent component>](../CATSCAN.md)

## Target

<One sentence describing the outcome this component creates.>

## Authority

- Owns <specific decisions, state, or contracts>.
- Does not own <adjacent authority>.

## Scope

- Applies to <owned files or boundary>.

## Contracts

- Input: [<input contract>](path).
- Output: [<output contract>](path).

## Invariants

- <Condition that must remain true>.
- <Failure that remains explicit or fails closed>.

## Acceptance

- <Observable behavior or check>.
- Evidence: [<test, report, or registry>](path).

## Non-goals

- <Tempting adjacent responsibility this component rejects>.

## Freedom

Any implementation is permitted if it preserves these boundaries and passes the
acceptance evidence.
```

Keep a charter below 250 words when practical. The validator enforces a generous
300-word ceiling, required sections, unique component names, nearest
parent links, local contract and evidence links, and a synchronized generated
component index.

```bash
npm run catscan:sync
npm run catscan:check
node --test tests/catscan.test.cjs
```
