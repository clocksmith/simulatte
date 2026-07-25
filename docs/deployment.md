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
| [`firebase.json`](../firebase.json) | Hosting targets, redirects, cache headers, predeploy gate, and build stamp. |
| [`.firebaserc`](../.firebaserc) | Firebase project plus World and Create deploy-target bindings. |
| [`package.json`](../package.json) | Account checks, packaging, previews, production deploys, and model-lock commands. |
| [`tools/package-hosting-surfaces.mjs`](../tools/package-hosting-surfaces.mjs) | Builds isolated Hosting collections from canonical `public/` sources. |
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

```bash
npm run check:deploy
npm run package:hosting
npm run firebase:whoami
npm run firebase:check
```

`check:deploy` validates the model lock, synced references, vendored Doppler
runtime, governed data, Hosting target contracts, and isolated surface
inventories. `package:hosting` creates ignored deployment collections under
`.firebase-hosting/` and writes a `hosting-surface.json` inventory receipt into
each collection. Create receives only its compiler data: the classifier,
construction substrate, language lexicon, model indexes, and universe indexes.
World-only autonomy datasets are excluded.

The predeploy hook runs `prepare:hosting`, which restores the pinned Doppler
package, runs the deploy checks, stamps the build, and packages the stamped
files.

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
