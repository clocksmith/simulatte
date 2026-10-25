# Deploy Simulatte

Firebase Hosting serves two public applications from project `simulatte-world`.

| Target | Public URL | Source owner | Packaged output |
| --- | --- | --- | --- |
| `world` | `https://simulatte.world/` | `public/index.html`, `public/simulatte/` | `.firebase-hosting/world/` |
| `create` | `https://create.simulatte.world/` | `public/blank/` | `.firebase-hosting/create/` |

The World target permanently redirects legacy `/blank` requests to
`https://create.simulatte.world`. Create serves Blank at `/` while retaining
`/blank/` as its internal asset base. This preserves the compiler's relative
module and worker paths without duplicating source files in the repository.

## Owner contracts

| Contract | Job |
| --- | --- |
| [`firebase.json`](../firebase.json) | Hosting targets, redirects, and cache headers. |
| [`.firebaserc`](../.firebaserc) | Firebase project plus World and Create deploy-target bindings. |
| [`package.json`](../package.json) | Account checks, packaging, previews, production deploys, and model-lock commands. |
| [`tools/hosting-surface-inputs.mjs`](../tools/hosting-surface-inputs.mjs) | Owns surface input allowlists, exclusions, and stamped entrypoints. |
| [`tools/package-hosting-surfaces.mjs`](../tools/package-hosting-surfaces.mjs) | Incrementally synchronizes isolated Hosting snapshots from canonical `public/` sources. |
| [model-runtime lock](../public/data/simulatte-embedder/model-runtime-lock.json) | Doppler package, model artifacts, hashes, URLs, and integrity values. |

## Hosting site and custom domain

The secondary Hosting site is `simulatte-create`, bound to deploy target
`create`. The default site `simulatte-world` is bound to target `world`.

Firebase custom-domain setup must bind `create.simulatte.world` to
`simulatte-create`. Complete the DNS verification records shown by Firebase
Hosting. Do not point the subdomain at the World site.

To reconstruct target bindings:

```bash
firebase target:apply hosting world simulatte-world --project simulatte-world
firebase target:apply hosting create simulatte-create --project simulatte-world
```

## Storage and consent cutover

Browser storage is origin-scoped. Moving Blank from `simulatte.world/blank/` to
`create.simulatte.world/` intentionally creates fresh localStorage, IndexedDB,
CacheStorage, and OPFS namespaces.

- Do not copy neural-model consent across origins. Create asks for consent again
  before downloading or running local models.
- Do not claim the old OPFS model cache was migrated. The first model-backed run
  on Create verifies and fills a new origin-scoped cache.
- Training review settings and locally stored review rows remain on the old
  origin. Export them before cutover when they must be retained.
- The `/blank` redirect preserves the public route, but browser storage does not
  follow an HTTP redirect.

This fail-closed reset avoids silently transferring consent or treating an
unverified cache as ready.

## Preflight and packaging

Activate a Python environment containing the exact dependencies in
`tools/samer/requirements-compact-classifiers.txt` before running preflight.
The compact-classifier check reproduces its generated data; the Python selected
by `PATH` must have those versions installed.

```bash
npm run prepare:hosting
# Or prepare just the surface being deployed:
npm run prepare:hosting:world
npm run prepare:hosting:create
npm run firebase:whoami
npm run firebase:check
```

`check:deploy` validates the model lock, synced references, vendored Doppler
runtime, governed data, Hosting target/input contracts, and inventory
regressions. `package:hosting` creates ignored deployment collections under
`.firebase-hosting/` and writes a `hosting-surface.json` inventory receipt into
each collection. Create receives only its compiler data: the classifier,
construction substrate, language lexicon, model indexes, and universe indexes.
World-only autonomy datasets are excluded.

All-target `deploy:hosting*` and `deploy:preview*` commands run
`prepare:hosting` once before calling Firebase. Targeted World and Create commands
run `prepare:hosting:world` or `prepare:hosting:create`; the Create preview also
uses Create-only preparation. Each preparation stamps the selected entrypoints,
runs the unchanged full `check:deploy` gate, then packages only its selected
surfaces. It never deploys the omitted output implicitly. `firebase.json`
declares no `predeploy` hook because Firebase runs a hook once per selected
Hosting target, so an all-target deploy would prepare twice. A bare
`firebase deploy` uploads whatever `.firebase-hosting/` already holds; use the
package commands. Restore the pinned dependency with
`npm run restore:doppler:development` when required; do not replace its
integrity pin to bypass a failed check.
The original Doppler archive is retained under `artifacts/pinned-packages/` so a
fresh checkout does not depend on one operator's npm cache. Restoration still
requires both pinned archive hashes and identical uncompressed tar bytes from
the pinned source revision. A different gzip implementation cannot loosen the pin.

## Incremental output and release identity

```bash
# Packaging only; these commands do not stamp, validate a release, or deploy.
npm run package:hosting -- --surface=world
npm run package:hosting -- --surface=create
```

Packaging compares exact source and destination bytes, writes only changed files,
and removes stale files only inside the selected generated surface directory.
It does not reset `.firebase-hosting`, touch an omitted target, or replace
unchanged receipts. Files remain independent snapshots, not hard links to source.
Source and output symlinks are rejected. A failed mutation invalidates that
surface's inventory receipt; rerun preparation before deploying it. Output reports
changed, unchanged, and removed file counts. The receipts retain their v1
content-hash contract and are independent of timestamps.

The build identity remains `SOURCE_SHA-CONTENT_HASH`, with one normalized hash of
all public inputs. It is not a timestamp. Selected preparation changes only that
surface's source HTML and the shared `public/version.json`; it explicitly reports
the omitted surface as not prepared. Packaging rejects selected entrypoints whose
build metadata differs from `version.json`. Do not combine an old omitted snapshot
with a newly prepared snapshot and call them one release. Shared runtime or data input changes
require `prepare:hosting` and deployment of both surfaces. Run preparations
serially; they share `public/version.json` and the source worktree.

The full preparation path still stamps both surfaces to the same exact build.
Repeated stamping of unchanged inputs leaves source bytes and modification times
untouched. Global URL cache keys remain unchanged in design: deferred script and
stylesheet keys still use the exact global build required by the live verifier.
Per-asset URL identities are not implemented; that requires coordinated changes to
the verifier and a complete transitive module, worker, CSS, and fetched-data
invalidation contract, not a direct-file hash substituted into HTML.

## Remaining validation and payload cost

The surface input manifest is a packaging boundary, not a validator dependency
closure. No validation results are cached or checks skipped. A Create-only prepare
still runs all existing deploy checks, and those checks include isolated packaging
fixtures plus real-source input-boundary validation. Production staging directories are not used as test scratch space.

A sound validation receipt needs every validator and transitive helper, dataset,
manifest, schema, configuration, and runtime dependency. Existing checks also use
the sibling Doppler Git object/archive, retained pinned gzip archive or npm cache,
Node/npm/tar behavior, and exact Python package versions. Hashing only `public/`
or a list of direct validator files would incorrectly reuse results when those
inputs change. Full checks remain active until that external and runtime closure
is explicit and testable.

Incremental packaging still reads selected bytes to detect same-size edits and
corruption; it does not trust mtimes or an old receipt. World still ships its
governed offline datasets, and shared assets remain in both surface snapshots.
This change reduces unnecessary writes and unselected staging work, not the
required World payload or guaranteed Firebase upload volume. No datasets move to
another service and no cloud settings, credentials, or cache headers change.

## Select an account

The Firebase CLI may have multiple authenticated accounts:

```bash
firebase login:list
firebase login:use <account-email>
firebase use
```

The repository also provides account-pinned checks. Set
`SIMULATTE_FIREBASE_D4DA_ACCOUNT` and
`SIMULATTE_FIREBASE_PERSONAL_ACCOUNT` in the invoking shell. Their values stay
outside the repository.

| Account | Check |
| --- | --- |
| D4DA | `npm run firebase:check:d4da` |
| Personal | `npm run firebase:check:personal` |

If the selected credential has expired:

```bash
firebase login --reauth
```

## Preview and deploy

Use preview channels before production:

```bash
npm run deploy:preview
npm run deploy:preview:create
```

For the initial production cutover, deploy in this order:

```bash
npm run deploy:hosting:create
curl -I https://simulatte-create.web.app/
curl -I https://create.simulatte.world/
npm run deploy:hosting:world
```

Do not deploy the World redirect until the Create deployment and its custom
domain both serve the compiler successfully. After the initial cutover,
`npm run deploy:hosting` may deploy both targets together.

Account-pinned all-site variants remain available:

| Account | Preview | Production |
| --- | --- | --- |
| D4DA | `npm run deploy:preview:d4da` | `npm run deploy:hosting:d4da` |
| Personal | `npm run deploy:preview:personal` | `npm run deploy:hosting:personal` |

A successful local check or package is not deployment proof. The Firebase
command must complete for each target.

## Verify the hosted surfaces

The production `deploy:hosting` commands run `verify:live` after Firebase returns.
They fail if the intended release cannot be verified. A post-deploy failure means
the upload may already be live; it does not mean rollback occurred. Preview commands
remain separate and do not probe production as if the preview were deployed there.

```bash
npm run verify:live
npm run verify:live -- --surface=create
npm run verify:live -- --surface=create --base-url=https://PREVIEW_HOST/
```

The verifier checks both Firebase sites by default against the exact build in
`public/version.json` and the local packaged snapshots. It verifies the target
inventory, HTML bytes, build metadata, and every same-origin entry script and
stylesheet, including content types and byte hashes. An HTML fallback with status
200 cannot satisfy a missing script. Use `--expected-build=SOURCE-CONTENT` to pin
another prepared release. Matching a source SHA alone is insufficient.

`npm run verify:live:visual` adds Chrome checks of startup, controls, interaction, uncaught errors,
failed same-origin requests, and horizontal fit at desktop and mobile sizes.
Create must compile the fixed prompt `a red ball`, complete its pipeline, and
render a new frame. Clicking Run without reaching completion does not pass.
Screenshots and a report are retained under `artifacts/live-release/`. Set
`CHROME_PATH` or pass `--chrome=PATH` when Chrome is not discoverable. Screenshots
support inspection; this check does not certify simulation correctness, physical
GPU behavior, model quality, or human visual acceptance.

`verify:live`, which the production commands run, passes `--http-only`. Its
report scope excludes browser checks and records `screenshots: false`; run
`verify:live:visual` for browser evidence. The existing broader simulation and
compiler audits remain necessary for their respective capability claims.

```bash
curl -I https://simulatte.world/
curl -I https://simulatte.world/blank/
curl -I https://create.simulatte.world/
curl -I https://simulatte-world.web.app/
curl -I https://simulatte-create.web.app/
```

Expected behavior:

- World serves the autonomy application at `/`.
- World redirects `/blank/` to Create.
- Create serves the prompt-to-pixels compiler at `/`.
- Create loads compiler workers from `/blank/app/workers/`.
- Both targets resolve shared governed data and pinned Doppler assets from their
  own origin.

## Mandate 2038

Former `/mandate-2038/` paths redirect to [Mandate 2038 on m3t4](https://m3t4.ai/mandate-2038/), preserving deep paths. Gamma owns game sources and its public-playtest allowlist; m3t4 owns publication. The World homepage and Create remain separate. Browser saves and optional bridge pairing are scoped to their original origin and do not transfer automatically.
