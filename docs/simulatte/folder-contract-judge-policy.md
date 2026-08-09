# Simulatte folder-contract judge policy

The local judge is a semantic review lane after deterministic folder-contract
validation. It reads the selected node intent, changed diff, inspected source,
tests, and receipts. It may report only:

- `semantic-drift`: implementation behavior no longer matches the node intent;
- `unsupported-claim`: prose or UI claims more than the bound evidence proves;
- `ownership-conflict`: behavior is implemented outside its declared owner;
- `missing-evidence`: the selected deterministic commands or browser journeys
  do not establish the claimed outcome.

The judge cannot waive, reinterpret, downgrade, or override a deterministic
failure. A deterministic failure makes the judge receipt `blocked` and no
semantic verdict is accepted.

Every receipt binds the model identity, exact prompt text and hash, this policy
and its hash, Git commit, working diff hash, folder-contract hash, deterministic
validation receipt hash, and every inspected file hash. A response that is not
valid JSON in the declared finding envelope is a failed judge run, not a pass.

The default local runner emits a fully bound review bundle and a `pending`
semantic status. A model adapter may consume that bundle through an explicit
command supplied by the caller. The adapter receives the bundle on standard
input and must return the declared JSON envelope on standard output. No network
model, credential, or provider is selected implicitly.
