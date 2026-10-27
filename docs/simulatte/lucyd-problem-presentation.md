# Lucyd problem presentation and component library

Owners: [problem model](../../public/simulatte/system-diagram/problem-model.js),
[structured details](../../public/simulatte/system-diagram/problem-details.js),
[palette](../../public/simulatte/system-diagram/palette.js), and
[compatibility generator](../../tools/simulatte/build-lucyd-compat.cjs).

Collection v5 retains v4's approaches, stages and runnable acceptance thresholds.
Published problems add `details` using `simulatte.problemDetails.v1`:

```json
{
  "schema": "simulatte.problemDetails.v1",
  "exerciseType": "systems-coding",
  "interfaces": [{"language": "java", "code": "interface Example {}"}],
  "requirements": ["State the memory bound."],
  "hints": ["Consider shared pending work."],
  "references": [{
    "id": "reference",
    "title": "Technical documentation",
    "url": "https://example.com/docs",
    "scope": "background",
    "note": "Explains the technique; does not confirm this interview question."
  }]
}
```

`description` remains the canonical brief. `followups` contains ordered interviewer
questions. Code belongs in interfaces, not in prose strings. The chooser and task
bar show the exercise type; Details renders the full brief, interface, requirements,
collapsed hints and sources. Existing v2, v3 and v4 collections remain importable.

`provenance.source` retains question provenance for company-published exercises
and candidate reports. References scoped `background` or `interview-format` do
not upgrade authored practice into either category. Authored prompts explicitly
state that their exact interview-question provenance is unverified.

All fifteen previously private prompts are now published alongside the other
31 problems, retaining their stable IDs, structured details and unverified
provenance labels. The public catalogue contains 46 problems, 92 approaches and
736 stages. Personal notes remain encrypted with the existing password and salt.
Older encrypted study edits restore through a hidden private alias and never
become public saved state merely because their base problem was published.
All solution diagrams are unchanged by this migration.

The component rail separates Individual components from Expandable subsystems.
Seven reusable public subsystem definitions are generated from the canonical
public collection into `subsystem-library.json`. Loading the library does not add
instances to a blank diagram. Insertion imports only required subsystem versions
and inserts the instance in one undoable command; conflicts refuse atomically.
Expand opens the connected internal graph. Cancel definition edits returns to the
parent; Publish creates a new version. This is navigation into a definition, not
an inline flattening of the parent architecture.
